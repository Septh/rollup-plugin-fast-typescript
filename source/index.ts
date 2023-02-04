import { EOL } from 'node:os'
import path from 'node:path'
import type { Plugin, ResolveIdResult } from 'rollup'
import ts from 'typescript'
import type {
    default as DefaultExport,
    TransformerName, TsConfigJson, TsConfigGetter
} from '#self'
import {
    isTransformerName, defaultTransformer,
    simpleError,
    type TransformerPlugin,
} from './plugins.js'
import { README, version, isPlainObject, isTsSourceFile, tsDeclarationExtensions } from './lib.js'

function tsDiagnosticAsText(diagnostic: ts.Diagnostic): string {
    const { messageText } = diagnostic
    return typeof messageText === 'string'
        ? messageText
        : ts.flattenDiagnosticMessageText(messageText, EOL)
}

const fastTypescript: typeof DefaultExport = async (
    configOption: boolean | string | TsConfigJson | TsConfigGetter = true,
    transformerName: TransformerName = defaultTransformer
): Promise<(Plugin)[]> => {
    let startupError: string | undefined
    let transformerPlugin: TransformerPlugin
    let tsCompilerOptions: ts.CompilerOptions
    let tsModuleResolutionCache: ts.ModuleResolutionCache | undefined
    let resolveIdCache: Map<string, ResolveIdResult>

    // Resolve transformer option.
    if (isTransformerName(configOption)) {
        transformerName = configOption
        configOption = true
    }

    if (!isTransformerName(transformerName))
        startupError = `Unknown transformer name ${JSON.stringify(transformerName)}`
    else {
        // Reduce configOption to either a filename or a TsConfigJson object.
        if (typeof configOption === 'function') {
            configOption = await configOption()
            if (typeof configOption !== 'boolean' && typeof configOption !== 'string' && !isPlainObject(configOption)) {
                startupError = 'Wrong return type from function parameter: ' +
                               `expected a TsConfigJson object, got '${typeof configOption}'.`
            }
        }

        if (configOption === true)
            configOption = './tsconfig.json'
        else if (configOption === false || configOption === '')
            configOption = {}
        else if (typeof configOption !== 'string' && !isPlainObject(configOption))
            startupError = `Invalid value '${JSON.stringify(configOption)}' for tsconfig parameter.`

        // Lazy-load the transformer plugin.
        try {
            const { default: plugin } = await import(`./lib/${transformerName}.js`) as { default: () => Promise<TransformerPlugin> }
            transformerPlugin = await plugin()
        }
        catch(e) {
            let { code, message } = e as NodeJS.ErrnoException
            startupError = code === 'ERR_MODULE_NOT_FOUND'
                ? `Transformer '${transformerName}' could not be loaded, reinstalling this plugin might fix the error.`
                : message
        }
    }

    // Return the two plugins as one.
    return [
        {
            name: 'fast-typescript',
            version,

            buildStart() {
                if (parseFloat(this.meta.rollupVersion) < 3.2)
                    simpleError(this, 'This plugin requires Rollup >= 3.2.0.')

                if (startupError)
                    simpleError(this, startupError)

                // Load tsconfig chain.
                const configFileChain: string[] = []
                const parseConfigHost: ts.ParseConfigHost = {
                    useCaseSensitiveFileNames: ts.sys.useCaseSensitiveFileNames,
                    fileExists: ts.sys.fileExists,
                    readDirectory: ts.sys.readDirectory,
                    readFile: file => (
                        !file.endsWith('package.json') && configFileChain.push(path.normalize(file)),
                        ts.sys.readFile(file)
                    )
                }

                let basePath: string
                let tsConfig: ts.ParsedCommandLine
                let diagnostics: readonly ts.Diagnostic[]

                if (typeof configOption === 'string') {
                    configOption = path.resolve(configOption)
                    basePath = path.dirname(configOption)

                    configFileChain.push(configOption)

                    const { error, config } = ts.readConfigFile(configOption, ts.sys.readFile)
                    if (error)
                        diagnostics = [ error ]
                    tsConfig = ts.parseJsonConfigFileContent(config, parseConfigHost, basePath)
                }
                else {
                    basePath = process.cwd()
                    tsConfig = ts.parseJsonConfigFileContent(configOption, parseConfigHost, basePath,
                        /* existingOptions */undefined, '<configObject>'
                    )
                }

                diagnostics ??= ts.getConfigFileParsingDiagnostics(tsConfig)
                if (diagnostics.length) {
                    const error = diagnostics.find(diag => diag.category === ts.DiagnosticCategory.Error)
                    if (error)
                        simpleError(this, tsDiagnosticAsText(error))
                    else {
                        diagnostics.filter(diag => diag.category === ts.DiagnosticCategory.Warning).forEach(diag => {
                            this.warn(tsDiagnosticAsText(diag))
                        })
                    }
                }

                // Perform some common checks first.
                tsCompilerOptions = tsConfig.options
                if (tsCompilerOptions.isolatedModules !== true) {
                    this.warn([
                        "'isolatedModules' option should bet to true in tsconfig.",
                        README('#isolatedmodules')
                    ].join(' '))
                }

                // Then hand off to the transformer.
                transformerPlugin.api.applyCompilerOptions.call(this, tsCompilerOptions)

                // Initialize resolution cache.
                resolveIdCache = new Map()
                tsModuleResolutionCache = ts.createModuleResolutionCache(
                    basePath, _ => _, tsCompilerOptions
                )

                // And finally, watch the whole config chain.
                if (this.meta.watchMode) {
                    for (const file of configFileChain) {
                        this.addWatchFile(file)
                    }
                }
            },

            resolveId(id, importer, { isEntry }) {
                if (!importer || isEntry || !isTsSourceFile(importer) || id.startsWith('\0'))
                    return null

                // Some plugins like @rollup/plugin-node-resolve sometimes cause the resolver to be called
                // multiple times for the same id, so we cache our results for faster response when this happens.
                // (undefined=not seen before, null=seen but not found, string=seen and resolved)
                let resolved = resolveIdCache.get(id)
                if (resolved !== undefined)
                    return resolved

                const { resolvedModule } = ts.resolveModuleName(
                    id, importer, tsCompilerOptions,
                    ts.sys, tsModuleResolutionCache
                )

                if (resolvedModule) {
                    const { resolvedFileName, extension } = resolvedModule
                    resolved = tsDeclarationExtensions.has(extension)
                        ? null
                        : resolvedFileName
                }

                resolveIdCache.set(id, resolved)
                return resolved
            },
        },
        transformerPlugin!
    ]
}

export default fastTypescript
