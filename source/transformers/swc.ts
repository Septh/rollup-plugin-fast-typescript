import swc from '@swc/core'
import ts from 'typescript'
import { extname, type Transformer } from './_lib.js'

let preserveJsx: boolean
let reactConfig: swc.ReactConfig
let transformConfig: swc.TransformConfig
let parserConfig: swc.TsParserConfig
let swcOptions: swc.Options

export default {
    applyCompilerOptions(context, compilerOptions) {
        const {
            target = parseFloat(ts.version) >= 5.0 ? ts.ScriptTarget.ES5 : ts.ScriptTarget.ES3,
            jsx = ts.JsxEmit.None
        } = compilerOptions

        preserveJsx = jsx === ts.JsxEmit.None ||
                      jsx === ts.JsxEmit.Preserve ||
                      jsx === ts.JsxEmit.ReactNative

        // swcOptions.jsc.transform.react
        reactConfig = {
            runtime: jsx === ts.JsxEmit.React ? 'classic' : 'automatic',
            development: jsx === ts.JsxEmit.ReactJSXDev,
            pragma: compilerOptions.jsxFactory,
            pragmaFrag: compilerOptions.jsxFragmentFactory,
            throwIfNamespace: true,
            useBuiltins: true
        }

        // swcOptions.jsc.transform
        transformConfig = {
            decoratorMetadata: compilerOptions.emitDecoratorMetadata,
            legacyDecorator: true,
            react: reactConfig
        }

        // swcOptions.jsc.parser
        parserConfig = {
            syntax: 'typescript',
            dynamicImport: true,
            decorators: compilerOptions.experimentalDecorators
        }

        // swcOptions
        swcOptions = {
            configFile: false,
            swcrc: false,

            isModule: true,
            module: {
                type: 'es6',
                strict: false,      // no __esModule
                strictMode: false,  // no 'use strict';
                importInterop: 'none',
                ignoreDynamic: true,
                preserveImportMeta: true
            },

            sourceMaps: true,
            inputSourceMap: false,
            inlineSourcesContent: false,

            minify: false,

            jsc: {
                target: (
                    target === ts.ScriptTarget.ES2015   // swc doest not have 'es6' as a target
                        ? 'es2015'
                        : target === ts.ScriptTarget.ESNext
                            ? 'es2022'
                            : ts.ScriptTarget[target]
                ).toLowerCase() as swc.JscTarget,
                loose: false,
                keepClassNames: true,
                externalHelpers: compilerOptions.importHelpers,
                parser: parserConfig,
                transform: transformConfig,
                experimental: {
                    keepImportAttributes: true
                }
            }
        }
    },

    async transform(context, sourcecode, sourcefile) {
        parserConfig.tsx = extname(sourcefile) === '.tsx'
        if (parserConfig.tsx) {
            transformConfig.react = reactConfig

            if (preserveJsx) {
                context.error({
                    message: "swc cannot preserve JSX syntax. Please set the 'jsx' setting in tsconfig.json to either 'react', 'react-jsx' or 'react-jsxdev'.",
                    stack: undefined })
            }
        }
        else transformConfig.react = undefined

        return swc.transform(sourcecode, swcOptions)
            .catch(err => {
                const message = (
                    err instanceof Error
                        ? err.message
                        : typeof err === 'string'
                            ? err
                            : 'Unexpected error'
                )
                context.error({ message, stack: undefined })
                return null
            })
    }
} satisfies Transformer
