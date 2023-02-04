import type sucrase from 'sucrase'
import ts from 'typescript'
import { simpleError, type TransformerPlugin } from '../plugins.js'
import { isTsSourceFile } from '../lib.js'

type sucraseInstance = typeof sucrase

export default async function sucraseTransformer(): Promise<TransformerPlugin> {

    // Load sucrase instance.
    let startupError: string | undefined
    let sucrase: sucraseInstance
    try {
        sucrase = (await import('sucrase')).default
    }
    catch(e) {
        let { code, message } = e as NodeJS.ErrnoException
        startupError = code === 'ERR_MODULE_NOT_FOUND'
            ? "Package 'sucrase' could not be loaded, did you install it as a dependency of your projet?"
            : message
    }

    // Set in api
    let transformOptions: sucrase.Options

    return {
        name: 'fast-typescript:sucrase',

        api: {
            applyCompilerOptions(compilerOptions) {
                let { jsx = ts.JsxEmit.None } = compilerOptions

                // Prepare options.
                transformOptions = {
                    transforms: [ "typescript" ],
                    disableESTransforms: true,
                    preserveDynamicImport: true,
                    injectCreateRequireForImportRequire: false,
                    enableLegacyTypeScriptModuleInterop: compilerOptions.esModuleInterop === false,
                    enableLegacyBabel5ModuleInterop: false,
                }

                if (jsx !== ts.JsxEmit.None && jsx !== ts.JsxEmit.Preserve && jsx !== ts.JsxEmit.ReactNative) {
                    transformOptions.transforms.push('jsx')
                    transformOptions.jsxRuntime = jsx === ts.JsxEmit.React ? 'classic' : 'automatic'
                    transformOptions.production = jsx === ts.JsxEmit.ReactJSX || jsx === ts.JsxEmit.React
                    transformOptions.jsxPragma = compilerOptions.jsxFactory
                    transformOptions.jsxFragmentPragma = compilerOptions.jsxFragmentFactory
                    transformOptions.jsxImportSource = compilerOptions.jsxImportSource
                }
            },
        },

        async buildStart() {
            if (startupError)
                simpleError(this, startupError)
        },

        async transform(tscode, filePath) {
            if (!isTsSourceFile(filePath))
                return null

            try {
                const { code, sourceMap: map } = sucrase.transform(tscode, {
                    ...transformOptions,
                    filePath,
                    sourceMapOptions: {
                        compiledFilename: filePath
                    }
                })
                return { code, map }
            }
            catch(e) {
                return simpleError(this, e)
            }
        }
    }
}
