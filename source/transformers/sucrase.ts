import sucrase from 'sucrase'
import ts from 'typescript'
import { type Transformer } from './_lib.js'

let transformOptions: sucrase.Options

export default {
    applyCompilerOptions(context, compilerOptions) {
        let { jsx = ts.JsxEmit.None } = compilerOptions

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

    async transform(context, sourcecode, filePath) {
        try {
            const { code, sourceMap: map } = sucrase.transform(sourcecode, {
                ...transformOptions,
                filePath,
                sourceMapOptions: {
                    compiledFilename: filePath
                }
            })
            return { code, map }
        }
        catch(err) {
            const message = (
                err instanceof Error
                    ? err.message
                    : typeof err === 'string'
                        ? err
                        : 'Unexpected error'
            )
            context.error({ message, stack: undefined })
        }
        return null
    }
} satisfies Transformer
