import { createRequire } from 'node:module'
import path from 'node:path'
import type { Plugin, MaybePromise } from 'rollup'
import ts from 'typescript'
import { isTsSourceFile, isTsDeclarationFile, type Transformer } from './transformers/_lib.js'

export interface TsConfigJson {

    /**
     * Path to base configuration file to inherit from (requires TypeScript version 2.1 or later),
     * or array of base files, with the rightmost files having the greater priority (requires TypeScript version 5.0 or later).
     */
    extends?: string | string[];

    /**
     * Specifies a list of glob patterns that match files to be included in compilation.
     * If no 'files' or 'include' property is present in a tsconfig.json,
     * the compiler defaults to including all files in the containing directory and subdirectories
     * except those specified by 'exclude'. Requires TypeScript version 2.0 or later.
    */
    include?: string[];

    /**
     * Specifies a list of files to be excluded from compilation.
     * The 'exclude' property only affects the files included via the 'include' property and not the 'files' property.
     * Glob patterns require TypeScript version 2.0 or later.
    */
    exclude?: string[];

    /**
     * If no 'files' or 'include' property is present in a tsconfig.json,
     * the compiler defaults to including all files in the containing directory and subdirectories
     * except those specified by 'exclude'. When a 'files' property is specified,
     * only those files and those specified by 'include' are included.
    */
    files?: string[];

    /** Instructs the TypeScript compiler how to compile `.ts` files. */
    compilerOptions?: ts.CompilerOptions;

    /** Settings for the watch mode in TypeScript. */
    watchOptions?: ts.WatchOptions;

    /** Auto type (.d.ts) acquisition options for this project. Requires TypeScript version 2.1 or later. */
    typeAcquisition?: ts.TypeAcquisition;

    /** Enable Compile-on-Save for this project. */
    compileOnSave?: boolean;

    /** Referenced projects. Requires TypeScript version 3.0 or later. */
    references?: ts.ProjectReference[]
}

type TransformerModule = {
    default: Transformer
}

/**
 * A plugin that uses esbuild, swc or sucrase for blazing fast TypeScript transforms,
 * leaving the bundling task to Rollup.
 */
export function fastTypescript(
    transformerName: 'esbuild' | 'swc' | 'sucrase',
    tsConfigJson: boolean | string | TsConfigJson | (() => MaybePromise<boolean | string | TsConfigJson>) = true
): Plugin {

    function tsDiagnosticAsText(diagnostic: ts.Diagnostic): string {
        const { messageText } = diagnostic
        return typeof messageText === 'string'
            ? messageText
            : ts.flattenDiagnosticMessageText(messageText, ts.sys.newLine)
    }

    const { version, homepage } = createRequire(import.meta.url)('../package.json') as Record<string, string>

    let transformer: Transformer
    let tsCompilerOptions: ts.CompilerOptions
    let tsModuleResolutionCache: ts.ModuleResolutionCache | undefined
    let resolveIdCache: Map<string, string | null>

    return {
        name: 'fast-typescript',
        version: version,

        async buildStart() {

            // Check the transformer name.
            if (transformerName !== 'esbuild' && transformerName !== 'swc' && transformerName !== 'sucrase') {
                this.error({
                        message: transformerName
                            ? `Unknown transformer ${JSON.stringify(transformerName)}`
                            : 'Missing transformer name in plugin options.',
                        stack: undefined
                })
            }

            // Resolve the tsconfig option.
            if (typeof tsConfigJson === 'function')
                tsConfigJson = await tsConfigJson() ?? true

            if (tsConfigJson === true)
                tsConfigJson = './tsconfig.json'
            else if (tsConfigJson === false || tsConfigJson === '')
                tsConfigJson = { compilerOptions: {} }
            else if (typeof tsConfigJson !== 'string' && typeof tsConfigJson !== 'object')
                this.error({ message: `Invalid value '${JSON.stringify(tsConfigJson)}' for tsconfig parameter.`, stack: undefined })

            // Use the TypeScript API to load and parse the full tsconfig.json chain,
            // including extended configs, paths resolution, etc.
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

            let tsConfigBasePath: string
            let tsConfig: ts.ParsedCommandLine
            let tsDiagnostics: readonly ts.Diagnostic[]

            if (typeof tsConfigJson === 'string') {
                tsConfigJson = path.resolve(tsConfigJson)
                tsConfigBasePath = path.dirname(tsConfigJson)

                configFileChain.push(tsConfigJson)

                const { config, error } = ts.readConfigFile(tsConfigJson, ts.sys.readFile)
                if (error)
                    tsDiagnostics = [ error ]
                tsConfig = ts.parseJsonConfigFileContent(config, parseConfigHost, tsConfigBasePath)
            }
            else {
                tsConfigBasePath = process.cwd()
                tsConfig = ts.parseJsonConfigFileContent(tsConfigJson, parseConfigHost, tsConfigBasePath, /* existingOptions */undefined, /* configFileName */'<configObject>')
            }

            tsDiagnostics ??= ts.getConfigFileParsingDiagnostics(tsConfig)
            if (tsDiagnostics.length) {
                const error = tsDiagnostics.find(diag => diag.category === ts.DiagnosticCategory.Error)
                if (error)
                    this.error({ message: tsDiagnosticAsText(error), stack: undefined })
                else {
                    tsDiagnostics.filter(diag => diag.category === ts.DiagnosticCategory.Warning).forEach(diag => {
                        this.warn(tsDiagnosticAsText(diag))
                    })
                }
            }

            // Add our own "diagnostics"
            tsCompilerOptions = tsConfig.options
            if (!tsCompilerOptions.isolatedModules) {
                tsCompilerOptions.isolatedModules = true
                this.warn(`'compilerOptions.isolatedModules' should be set to true in tsconfig. See ${new URL('#isolatedmodules', homepage).href} for details.`)
            }

            // Lazy-load the transformer then hand off the tsconfig.
            transformer = await (import(`./transformers/${transformerName}.js`) as Promise<TransformerModule>)
                .then(plugin => plugin.default)
                .catch(({ code, message }: NodeJS.ErrnoException) => {
                    this.error({
                        message: code === 'ERR_MODULE_NOT_FOUND'
                            ? `Transformer '${transformerName}' could not be loaded, reinstalling this plugin might fix the error.`
                            : message,
                        stack: undefined
                    })
                })

            transformer.applyCompilerOptions(this, tsCompilerOptions)

            // Initialize both TypeScript's and our own resolution cache.
            resolveIdCache = new Map()
            tsModuleResolutionCache = ts.createModuleResolutionCache(tsConfigBasePath, _ => _, tsCompilerOptions)

            // And finally, watch the whole config chain.
            if (this.meta.watchMode) {
                for (const file of configFileChain) {
                    this.addWatchFile(file)
                }
            }
        },

        async resolveId(id, importer, { isEntry }) {
            if (!importer || isEntry || !isTsSourceFile(importer) || id.startsWith('\0'))
                return null

            // Some plugins sometimes cause the resolver to be called multiple times for the same id,
            // so we cache our results for faster response when this happens.
            // (undefined = not seen before, null = not handled by us, string = resolved)
            let resolved = resolveIdCache.get(id)
            if (resolved !== undefined)
                return resolved

            const { resolvedModule } = ts.resolveModuleName(id, importer, tsCompilerOptions, ts.sys, tsModuleResolutionCache)
            if (resolvedModule) {
                const { resolvedFileName } = resolvedModule
                resolved = isTsDeclarationFile(resolvedFileName)
                    ? null
                    : resolvedFileName
            }

            resolveIdCache.set(id, resolved!)
            return resolved
        },

        async transform(code, id) {
            return isTsSourceFile(id)
                ? transformer.transform(this, code, id)
                : null
        }
    }
}

export default fastTypescript
