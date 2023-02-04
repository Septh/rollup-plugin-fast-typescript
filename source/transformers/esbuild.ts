import type esbuild from 'esbuild'
import ts from 'typescript'
import { simpleError, type TransformerPlugin } from '../plugins.js'
import { extname } from '../lib.js'

type esbuildInstance = typeof esbuild
type esbuildJsx = esbuild.CommonOptions['jsx']

const loadersMap: Map<string, esbuild.Loader> = new Map([
    [ '.ts',  'ts'  ],
    [ '.tsx', 'tsx' ],
    [ '.cts', 'ts'  ],
    [ '.mts', 'ts'  ],
])

const jsxMap: Record<ts.JsxEmit, esbuildJsx> = {
    [ ts.JsxEmit.None ]:        undefined,
    [ ts.JsxEmit.Preserve ]:    'preserve',
    [ ts.JsxEmit.React ]:       'transform',
    [ ts.JsxEmit.ReactJSX ]:    'automatic',
    [ ts.JsxEmit.ReactJSXDev ]: 'automatic',
    [ ts.JsxEmit.ReactNative ]: 'preserve',
}

export default async function esbuildTransformer(): Promise<TransformerPlugin> {

    // Load esbuild instance.
    let startupError: string | undefined
    let esbuildInstance: esbuildInstance
    try {
        esbuildInstance = (await import('esbuild')).default
    }
    catch(e) {
        let { code, message } = e as NodeJS.ErrnoException
        startupError = code === 'ERR_MODULE_NOT_FOUND'
            ? "Package 'esbuild' could not be loaded, did you install it as a dependency of your projet?"
            : message
    }

    // Set in api
    let transformOptions: esbuild.TransformOptions

    return {
        name: 'fast-typescript:esbuild',

        api: {
            applyCompilerOptions(compilerOptions) {
                let { target, jsx = ts.JsxEmit.None } = compilerOptions

                // In esbuild, target defaults to 'esnext' if not given while it defaults to 'es3" in TypeScript.
                // Therefore, to get TypeScript's behavior, we must set the option explicitly if not present.
                let es3Warning = ''
                if (target === undefined) {
                    es3Warning = "'target' property is not set in tsconfig and so it defaults to ES3 in TypeScript. " +
                                 "However, "
                    target = ts.ScriptTarget.ES3
                }
                if (target === ts.ScriptTarget.ES3) {
                    this.warn(es3Warning + [
                        "ES3 target is not supported by esbuild, so ES5 will be used instead.",
                        "Please set 'target' option in tsconfig to at least ES5 to disable this warning or,",
                        "if you really need ES3 output, use either swc or sucrase rather than esbuild."
                    ].join(' '))
                    target = ts.ScriptTarget.ES5
                }

                // Prepare options.
                transformOptions = {
                    // We first set some sensible defaults,
                    // then let transformOptions#tsconfigRaw override them.
                    format: 'esm',
                    charset: 'utf8',
                    sourcemap: true,
                    sourcesContent: false,
                    target: target === ts.ScriptTarget.Latest ? 'esnext' : ts.ScriptTarget[target],
                    jsx: jsxMap[jsx],
                    jsxDev: jsx === ts.JsxEmit.ReactJSXDev,
                    jsxFactory: compilerOptions.jsxFactory,
                    jsxFragment: compilerOptions.jsxFragmentFactory,
                    jsxImportSource: compilerOptions.jsxImportSource,
                    jsxSideEffects: true,
                    minify: false,
                    treeShaking: false,
                    ignoreAnnotations: true,
                    logLevel: 'silent',

                    tsconfigRaw: {
                        compilerOptions: {
                            alwaysStrict: compilerOptions.alwaysStrict,
                            importsNotUsedAsValues: 'preserve',
                            preserveValueImports: true,
                            useDefineForClassFields: compilerOptions.useDefineForClassFields
                        }
                    }
                }
            },
        },

        async buildStart() {
            if (startupError)
                simpleError(this, startupError)
        },

        async transform(code, sourcefile) {
            const loader = loadersMap.get(extname(sourcefile))
            if (!loader)
                return null

            try {
                const result = await esbuildInstance.transform(code, {
                    ...transformOptions,
                    loader,
                    sourcefile
                })

                for (const warning of result.warnings) {
                    // Because we're transforming to ESM, esbuild will emit this warning
                    // if the source code contains require() calls. Silent them.
                    if (warning.text.startsWith('Converting "require" to "esm"'))
                        continue

                    this.warn({
                        message: warning.text,
                        loc: warning.location
                            ? { column: warning.location.column, line: warning.location.line }
                            : undefined
                    })
                }

                return result
            }
            catch(e) {
                simpleError(this, e)
            }
        }
    }
}
