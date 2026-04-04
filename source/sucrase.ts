import sucrase from 'sucrase'
import ts from 'typescript'
import type { TransformerFactory } from './util.js'

export default (function sucraseFactory() {

    let transformOptions: sucrase.Options

    return {
        applyCompilerOptions(compilerOptions) {
            const { jsx = ts.JsxEmit.None, target = ts.ScriptTarget.Latest } = compilerOptions

            // Sucrase does not have a concept of 'target' language
            if (target !== ts.ScriptTarget.Latest)
                this.warn("Sucrase does not downlevel JavaScript, 'target' compiler option is ignored.")

            transformOptions = {
                transforms: [ "typescript" ],
                disableESTransforms: true,
                preserveDynamicImport: true,
                keepUnusedImports: compilerOptions.verbatimModuleSyntax,
                injectCreateRequireForImportRequire: false,
                enableLegacyTypeScriptModuleInterop: compilerOptions.esModuleInterop === false,
                enableLegacyBabel5ModuleInterop: false,
            }

            if (jsx !== ts.JsxEmit.None && jsx !== ts.JsxEmit.Preserve && jsx !== ts.JsxEmit.ReactNative) {
                transformOptions.transforms.push('jsx')
                transformOptions.jsxRuntime = jsx === ts.JsxEmit.React ? 'classic' : 'automatic'
                transformOptions.production = jsx !== ts.JsxEmit.ReactJSXDev
                transformOptions.jsxPragma = compilerOptions.jsxFactory
                transformOptions.jsxFragmentPragma = compilerOptions.jsxFragmentFactory
                transformOptions.jsxImportSource = compilerOptions.jsxImportSource
            }
        },

        transform(source, filePath) {
            try {
                const { code, sourceMap } = sucrase.transform(source, {
                    ...transformOptions,
                    filePath,
                    sourceMapOptions: {
                        compiledFilename: filePath.replace(/\.([cm])?tsx?$/, '$1js')
                    }
                })
                return { code, map: sourceMap }
            }
            catch (err) {
                return this.error({ message: Error.isError(err) ? err.message : String(err), cause: err, stack: undefined })
            }
        }
    }
}) satisfies TransformerFactory
