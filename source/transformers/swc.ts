import type swc from '@swc/core'
import ts from 'typescript'
import { extname, isTsSourceFile } from '../lib.js'
import { simpleError, type TransformerPlugin } from '../plugins.js'

type swcInstance = typeof swc

export default async function swcTransformer(): Promise<TransformerPlugin> {

    // Load swc instance.
    let startupError: string | undefined
    let swcInstance: swcInstance
    try {
        swcInstance = (await import('@swc/core')).default
    }
    catch(e) {
        let { code, message } = e as NodeJS.ErrnoException
        startupError = code === 'ERR_MODULE_NOT_FOUND'
            ? "Package '@swc/core' could not be loaded, did you install it as a dependency of your projet?"
            : message
    }

    // Set in api
    let parserConfig: swc.TsParserConfig
    let transformConfig: swc.TransformConfig
    let reactConfig: swc.ReactConfig
    let swcOptions: swc.Options
    let preserveJsx: boolean

    return {
        name: 'fast-typescript:swc',

        api: {
            applyCompilerOptions(compilerOptions) {
                // Prepare options.
                const { target = ts.ScriptTarget.ES3, jsx = ts.JsxEmit.None } = compilerOptions

                preserveJsx = jsx === ts.JsxEmit.None ||
                              jsx === ts.JsxEmit.Preserve ||
                              jsx === ts.JsxEmit.ReactNative

                // swcOptions.jsc.transform.react
                reactConfig = {
                    runtime: ts.JsxEmit.ReactJSX ? 'automatic' : 'classic',
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
                            keepImportAssertions: true
                        }
                    }
                }
            },
        },

        async buildStart() {
            if (startupError)
                simpleError(this, startupError)
        },

        async transform(code, filename) {
            if (!isTsSourceFile(filename))
                return null

            const isTsx = extname(filename) === '.tsx'
            parserConfig.tsx = isTsx
            transformConfig.react = isTsx && !preserveJsx
                ? reactConfig
                : undefined
            try {
                return await swcInstance.transform(code, { ...swcOptions, filename })
            }
            catch(e) {
                simpleError(this, e)
            }
        }
    }
}
