import swc from '@swc/core'
import ts from 'typescript'
import type { TransformerFactory } from './util.js'

// `target` defaults to 'ESNext' in swc while it defaults to 'ES2015' in TypeScript < 6
// and to 'ES2023' in later versions.
const defaultTarget = parseFloat(ts.version) < 6.0
    ? ts.ScriptTarget.ES2015
    : ts.ScriptTarget.ES2023

export default (async function swcFactory() {

    let transformConfig: swc.TransformConfig
    let parserConfig: swc.TsParserConfig
    let swcOptions: swc.Options

    return {
        applyCompilerOptions(compilerOptions) {
            const {
                target = defaultTarget,
                jsx = ts.JsxEmit.None
            } = compilerOptions

            // swcOptions.jsc.transform
            transformConfig = {
                decoratorMetadata: compilerOptions.emitDecoratorMetadata,
                legacyDecorator: true,
                useDefineForClassFields: compilerOptions.useDefineForClassFields
            }

            // swcOptions.jsc.transform.react
            if (jsx !== ts.JsxEmit.None) {
                transformConfig.react = {
                    runtime: (
                        jsx === ts.JsxEmit.Preserve || jsx === ts.JsxEmit.ReactNative ? 'preserve'
                            : jsx === ts.JsxEmit.ReactJSX || jsx === ts.JsxEmit.ReactJSXDev ? 'automatic'
                            : 'classic'
                    ),
                    development: jsx === ts.JsxEmit.ReactJSXDev,
                    pragma: compilerOptions.jsxFactory,
                    pragmaFrag: compilerOptions.jsxFragmentFactory,
                    throwIfNamespace: true,
                    useBuiltins: true
                }
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
                    strict: true,       // no __esModule
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
                    preserveAllComments: !compilerOptions.removeComments,
                    experimental: {
                        keepImportAttributes: true
                    }
                }
            }
        },

        async transform(source) {
            try {
                return await swc.transform(source, swcOptions)
            }
            catch (err) {
                return this.error({ message: Error.isError(err) ? err.message : String(err), cause: err, stack: undefined })
            }
        }
    }
}) satisfies TransformerFactory
