import path from 'node:path'
import ts from 'typescript'
import type { MaybePromise, Plugin } from 'rollup'
import type { TsConfigJson } from 'type-fest'
import { isTsSourceFile, type Transformer, type TransformerModule } from './util.js'

import self from '#package.json' with { type: 'json' }

export type { TsConfigJson }

/**
 * A plugin that uses `esbuild`, `swc` or `sucrase` for blazing fast TypeScript builds.
 */
export function fastTypeScript(
    transpilerName: 'esbuild' | 'swc' | 'sucrase',
    tsConfig?: boolean | string | TsConfigJson | (() => MaybePromise<boolean | string | TsConfigJson> | undefined)
): Plugin {

    // Our dynamically loaded transformer.
    let transformer: Transformer | undefined = undefined

    // TypeScript stuff.
    const configFilesChain = new Set<string>()
    let compilerOptions: ts.CompilerOptions | undefined
    let compilerHost: ts.CompilerHost
    let resolutionCache: ts.ModuleResolutionCache

    return {
        name: self.name.replace(/^rollup-plugin-/, ''),
        version: self.version,

        async buildStart() {

            // Lazy-load the transformer.
            if (transformer === undefined) {
                if (![ 'esbuild', 'swc', 'sucrase' ].includes(transpilerName))
                    return this.error({ message: "Unknown or missing transpiler name, must be one of 'esbuild', 'swc' or 'sucrase'.", stack: undefined })
                try {
                    const module = await import(`./${transpilerName}.js`) as TransformerModule
                    transformer = typeof module.default === 'function' ? await module.default() : module.default
                }
                catch (err) {
                    return this.error({
                        message: `Error while loading transformer '${transpilerName}', reinstalling this plugin might help.`,
                        cause: err,
                        stack: undefined
                    })
                }
            }

            // Resolve the project's tsconfig then hand off the compilerOptions to the transformer.
            if (compilerOptions === undefined) {

                if (typeof tsConfig === 'function') {
                    // Note: no try/catch here, this is user code and we want the user
                    // to see the full error stack if the function throws.
                    tsConfig = await tsConfig()
                }

                if (tsConfig === true || tsConfig === undefined) {
                    tsConfig = ts.findConfigFile(process.cwd(), ts.sys.fileExists)
                    if (!tsConfig)
                        return this.error({ message: "Couldn't find tsconfig.json", stack: undefined })
                }
                else if (typeof tsConfig === 'string' && tsConfig.length > 0)
                    tsConfig = path.resolve(tsConfig)
                else if (!tsConfig)
                    tsConfig = {}
                else if (typeof tsConfig !== 'string' && typeof tsConfig !== 'object')
                    return this.error({ message: `Invalid value ${JSON.stringify(tsConfig)} for tsConfig parameter.`, stack: undefined })

                // Create a ParseConfigHost that stores the full tsconfig.json files chain.
                configFilesChain.clear()
                const parseConfigHost: ts.ParseConfigHost = {
                    useCaseSensitiveFileNames: ts.sys.useCaseSensitiveFileNames,
                    fileExists: ts.sys.fileExists.bind(ts.sys),
                    readDirectory: ts.sys.readDirectory.bind(ts.sys),
                    readFile: file => {
                        if (path.basename(file) !== 'package.json')
                            configFilesChain.add(path.normalize(file))
                        return ts.sys.readFile(file)
                    }
                }

                let configBasePath: string
                if (typeof tsConfig === 'string') {
                    configBasePath = path.dirname(tsConfig)
                    const { config, error } = ts.readConfigFile(tsConfig, parseConfigHost.readFile)
                    if (error)
                        return this.error({ message: tsDiagnosticAsText(error), stack: undefined })
                    tsConfig = config as TsConfigJson
                }
                else configBasePath = process.cwd()

                const parsed = ts.parseJsonConfigFileContent(tsConfig, parseConfigHost, configBasePath)
                const diags = ts.getConfigFileParsingDiagnostics(parsed)
                if (diags.length > 0) {
                    const error = diags.find(diag => diag.category === ts.DiagnosticCategory.Error)
                    if (error)
                        return this.error({ message: tsDiagnosticAsText(error), stack: undefined })
                    diags.forEach(diag => this.warn({ message: tsDiagnosticAsText(diag) }))
                }

                compilerOptions = parsed.options
                if (!compilerOptions.isolatedModules)
                    this.warn(`'compilerOptions.isolatedModules' should be set to true in tsconfig. See ${new URL('#isolatedmodules', self.homepage).href} for details.`)

                compilerHost = ts.createCompilerHost(compilerOptions)
                resolutionCache = ts.createModuleResolutionCache(configBasePath, compilerHost.getCanonicalFileName, compilerOptions)

                transformer.applyCompilerOptions.call(this, compilerOptions)
            }

            // Watch all files in the tsconfig.json files chain.
            configFilesChain.forEach(file => this.addWatchFile(file))
        },

        watchChange(id) {
            if (configFilesChain.has(id))
                compilerOptions = undefined
        },

        resolveId(id, importer, { isEntry }) {
            if (!importer || isEntry || !isTsSourceFile(importer) || id.startsWith('\0') || path.isAbsolute(id))
                return

            const { resolvedModule } = ts.resolveModuleName(id, importer, compilerOptions!, ts.sys, resolutionCache)
            if (resolvedModule?.isExternalLibraryImport)
                return
            return resolvedModule?.resolvedFileName
        },

        async transform(code, id, options) {
            if (!isTsSourceFile(id))
                return
            return await transformer?.transform.call(this, code, id, options)
        },
    }

    function tsDiagnosticAsText(diagnostic: ts.Diagnostic): string {
        const { messageText } = diagnostic
        return typeof messageText === 'string'
            ? messageText
            : ts.flattenDiagnosticMessageText(messageText, ts.sys.newLine)
    }
}

/** A plugin that uses `esbuild` for blazing fast TypeScript transforms. */
export function esbuild(tsConfig: boolean | string | TsConfigJson | (() => MaybePromise<boolean | string | TsConfigJson>) = true): Plugin {
    return fastTypeScript('esbuild', tsConfig)
}

/** A plugin that uses `swc` for blazing fast TypeScript transforms. */
export function swc(tsConfig: boolean | string | TsConfigJson | (() => MaybePromise<boolean | string | TsConfigJson>) = true): Plugin {
    return fastTypeScript('swc', tsConfig)
}

/** A plugin that uses `sucrase` for blazing fast TypeScript transforms. */
export function sucrase(tsConfig: boolean | string | TsConfigJson | (() => MaybePromise<boolean | string | TsConfigJson>) = true): Plugin {
    return fastTypeScript('sucrase', tsConfig)
}

export default fastTypeScript
