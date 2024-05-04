import { createRequire } from 'node:module'
import path from 'node:path'
import type { Plugin, MaybePromise } from 'rollup'
import ts from 'typescript'
import type { TsConfigJson } from 'type-fest'
import { isTsSourceFile, isTsDeclarationFile, type Transformer } from './transformers/_lib.js'

export { TsConfigJson }

type TransformerModule = {
    default: Transformer
}

// Get our own package.json
const self = createRequire(import.meta.url)('../package.json') as {
    name: string
    version: string
    homepage: string
}

/**
 * A plugin that uses esbuild, swc or sucrase for blazing fast TypeScript transforms.
 */
export function fastTypescript(
    transpiler: 'esbuild' | 'swc' | 'sucrase',
    tsConfig: boolean | string | TsConfigJson | (() => MaybePromise<boolean | string | TsConfigJson>) = true
): Plugin {

    function tsDiagnosticAsText(diagnostic: ts.Diagnostic): string {
        const { messageText } = diagnostic
        return typeof messageText === 'string'
            ? messageText
            : ts.flattenDiagnosticMessageText(messageText, ts.sys.newLine)
    }

    let tsCompilerOptions: ts.CompilerOptions
    let tsModuleResolutionCache: ts.ModuleResolutionCache | undefined
    let resolveIdCache: Map<string, string | null>
    let transformer: Transformer

    return {
        name: self.name.replace(/^rollup-plugin-/, ''),
        version: self.version,

        async buildStart() {

            // Check the transpiler name.
            if (typeof transpiler !== 'string' || !transpiler)
                this.error({ message: 'Missing or invalid transpiler name in plugin options.', stack: undefined })
            else if (transpiler !== 'esbuild' && transpiler !== 'swc' && transpiler !== 'sucrase')
                this.error({ message: `Unknown transpiler ${JSON.stringify(transpiler)}`, stack: undefined })

            // Resolve the tsconfig option.
            if (typeof tsConfig === 'function')
                tsConfig = await tsConfig()

            if (tsConfig === true)
                tsConfig = './tsconfig.json'
            else if (!tsConfig)
                tsConfig = {}
            else if (typeof tsConfig !== 'string' && typeof tsConfig !== 'object')
                this.error({ message: `Invalid value '${JSON.stringify(tsConfig)}' for tsConfig parameter.`, stack: undefined })

            // Use the TypeScript API to load and parse the full tsconfig.json chain,
            // including extended configs, paths resolution, etc.
            const configFileChain: string[] = []
            const parseConfigHost: ts.ParseConfigHost = {
                useCaseSensitiveFileNames: ts.sys.useCaseSensitiveFileNames,
                fileExists: ts.sys.fileExists,
                readDirectory: ts.sys.readDirectory,
                readFile(file) {
                    if (path.basename(file) !== 'package.json')
                        configFileChain.push(path.normalize(file))
                    return ts.sys.readFile(file)
                }
            }

            let tsConfigBasePath: string,
                tsConfigParsed: ts.ParsedCommandLine,
                tsDiagnostics: ts.Diagnostic[] = []

            if (typeof tsConfig === 'string') {
                tsConfig = path.resolve(tsConfig)
                tsConfigBasePath = path.dirname(tsConfig)

                configFileChain.push(tsConfig)

                const { config, error } = ts.readConfigFile(tsConfig, ts.sys.readFile)
                if (error) {
                    tsDiagnostics.push(error)
                    tsConfigParsed = {
                        options: {},
                        fileNames: [],
                        errors: [ error ]
                    }
                }
                else tsConfigParsed = ts.parseJsonConfigFileContent(config, parseConfigHost, tsConfigBasePath, undefined, path.basename(tsConfig))
            }
            else {
                tsConfigBasePath = process.cwd()
                tsConfigParsed = ts.parseJsonConfigFileContent(tsConfig, parseConfigHost, tsConfigBasePath, undefined, '<configObject>')
            }

            tsDiagnostics.push(...ts.getConfigFileParsingDiagnostics(tsConfigParsed))
            if (tsDiagnostics.length) {
                const error = tsDiagnostics.find(diag => diag.category === ts.DiagnosticCategory.Error)
                if (error)
                    this.error({ message: tsDiagnosticAsText(error), stack: undefined })
                else {
                    tsDiagnostics.forEach(diag => {
                        if (diag.category === ts.DiagnosticCategory.Warning)
                            this.warn(tsDiagnosticAsText(diag))
                    })
                }
            }

            // Add our own "diagnostics"
            tsCompilerOptions = tsConfigParsed.options
            if (!tsCompilerOptions.isolatedModules) {
                tsCompilerOptions.isolatedModules = true
                this.warn(`'compilerOptions.isolatedModules' should be set to true in tsconfig. See ${new URL('#isolatedmodules', self.homepage).href} for details.`)
            }

            // Lazy-load the transpiler then hand off the tsconfig.
            transformer = await (import(`./transformers/${transpiler}.js`) as Promise<TransformerModule>)
                .then(plugin => plugin.default)
                .catch(({ code, message }: NodeJS.ErrnoException) => {
                    this.error({
                        message: code === 'ERR_MODULE_NOT_FOUND'
                            ? `Transformer '${transpiler}' could not be loaded, reinstalling this plugin might fix the error.`
                            : message,
                        stack: undefined
                    })
                })
            transformer.applyCompilerOptions(this, tsCompilerOptions)

            // Initialize both TypeScript's and our own resolution cache.
            resolveIdCache = new Map()
            tsModuleResolutionCache = ts.createModuleResolutionCache(tsConfigBasePath, _ => _, tsCompilerOptions)

            // And finally, watch the whole config chain.
            for (const file of configFileChain) {
                this.addWatchFile(file)
            }
        },

        async resolveId(id, importer) {
            if (
                !importer                       // Let Rollup resolve the program's entry point
                || !isTsSourceFile(importer)    // Consider only what's imported by TypeScript code
                || id.startsWith('\0')          // Ignore other plugins stuff
            ) {
                return null
            }

            // Some plugins sometimes cause the resolver to be called multiple times for the same id,
            // so we cache our results for faster response when this happens.
            // (undefined = not seen before, null = not handled by us, string = resolved)
            let resolved = resolveIdCache.get(id)
            if (resolved !== undefined)
                return resolved

            // Use TypeScript API to resolve the import
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

/** A plugin that uses esbuild for blazing fast TypeScript transforms. */
export function esbuild(tsConfig: boolean | string | TsConfigJson | (() => MaybePromise<boolean | string | TsConfigJson>) = true): Plugin {
    return fastTypescript('esbuild', tsConfig)
}

/** A plugin that uses swc for blazing fast TypeScript transforms. */
export function swc(tsConfig: boolean | string | TsConfigJson | (() => MaybePromise<boolean | string | TsConfigJson>) = true): Plugin {
    return fastTypescript('swc', tsConfig)
}

/** A plugin that uses sucrase for blazing fast TypeScript transforms. */
export function sucrase(tsConfig: boolean | string | TsConfigJson | (() => MaybePromise<boolean | string | TsConfigJson>) = true): Plugin {
    return fastTypescript('sucrase', tsConfig)
}

export default fastTypescript
