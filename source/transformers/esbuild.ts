import esbuild from 'esbuild'
import ts from 'typescript'
import { extname, type Transformer } from './_lib.js'

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

let transformOptions: esbuild.TransformOptions

export default {
    applyCompilerOptions(context, compilerOptions) {
        let { target, jsx = ts.JsxEmit.None } = compilerOptions

        // In esbuild, `target` defaults to 'ESNext' if not given while it defaults to 'ES3' in TypeScript < 5.0
        // and to 'ES5' in later versions.
        // Therefore, to get TypeScript's behavior, we must set the option explicitly if not present.
        const es3Warning: string[] = []
        if (target === undefined) {
            if (parseFloat(ts.version) < 5.0) {
                es3Warning.push(
                    "When the 'target' property is not set in tsconfig.json, ",
                    `it defaults to ES3 in TypeScript ${ts.version}. `,
                    "However, "
                )
                target = ts.ScriptTarget.ES3
            }
            else target = ts.ScriptTarget.ES5
        }
        if (target === ts.ScriptTarget.ES3) {
            es3Warning.push(
                "ES3 target is not supported by esbuild, so ES5 will be used instead.\n",
                "Please set the 'target' option in tsconfig.json to at least ES5 to disable this warning or, ",
                "if you really need ES3 output, use either swc or sucrase rather than esbuild."
            )
            context.warn(es3Warning.join(''))
            target = ts.ScriptTarget.ES5
        }

        // Prepare options.
        transformOptions = {
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
                    verbatimModuleSyntax: compilerOptions.verbatimModuleSyntax,
                    useDefineForClassFields: compilerOptions.useDefineForClassFields
                }
            }
        }
    },

    async transform(context, sourcecode, sourcefile) {
        const loader = loadersMap.get(extname(sourcefile))
        if (!loader)
            return null

        return (esbuild.transform(sourcecode, { ...transformOptions, loader, sourcefile })
            .then(({ code, map, warnings }) => {
                for (const warning of warnings) {
                    // Because we're transforming to ESM, esbuild will emit this warning
                    // if the source code contains require() calls. Silent them.
                    if (warning.text.startsWith('Converting "require" to "esm"'))
                        continue

                    context.warn({
                        message: warning.text,
                        loc: warning.location
                            ? { column: warning.location.column, line: warning.location.line }
                            : undefined
                    })
                }

                return { code, map }
            })
            .catch(err => {
                context.error({
                    message: (
                        err instanceof Error
                            ? err.message
                            : typeof err === 'string'
                                ? err
                                : 'Unexpected error'
                    ),
                    stack: undefined
                })
                return null
            })
        )
    }
} satisfies Transformer
