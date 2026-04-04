import path from 'node:path'
import esbuild from 'esbuild'
import ts from 'typescript'
import type { TransformerFactory } from './util.js'

const loadersMap: ReadonlyMap<string, esbuild.Loader> = new Map([
    [ '.ts',  'ts'  ],
    [ '.tsx', 'tsx' ],
    [ '.cts', 'ts'  ],
    [ '.mts', 'ts'  ],
])

const jsxMap: Readonly<Record<ts.JsxEmit, esbuild.CommonOptions['jsx']>> = {
    [ ts.JsxEmit.None ]:        undefined,
    [ ts.JsxEmit.Preserve ]:    'preserve',
    [ ts.JsxEmit.React ]:       'transform',
    [ ts.JsxEmit.ReactJSX ]:    'automatic',
    [ ts.JsxEmit.ReactJSXDev ]: 'automatic',
    [ ts.JsxEmit.ReactNative ]: 'preserve',     // https://www.typescriptlang.org/docs/handbook/jsx.html#basic-usage
}

// `target` defaults to 'ESNext' in esbuild while it defaults to 'ES2015' in TypeScript < 6
// and to 'ES2023' in later versions.
const defaultTarget = parseFloat(ts.version) < 6.0
    ? ts.ScriptTarget.ES2015
    : ts.ScriptTarget.ES2023

export default (function esbuildFactory() {

    let transformOptions: esbuild.TransformOptions

    return {
        applyCompilerOptions(compilerOptions) {
            const {
                target = defaultTarget,
                verbatimModuleSyntax = true,
                useDefineForClassFields = true,
                jsx = ts.JsxEmit.None,
            } = compilerOptions

            transformOptions = {
                format: 'esm',
                charset: 'utf8',
                sourcemap: true,
                sourcesContent: false,
                minify: false,
                treeShaking: false,     // Leave it to Rollup
                ignoreAnnotations: false,
                logLevel: 'silent',
                target: target === ts.ScriptTarget.ESNext ? 'esnext' : ts.ScriptTarget[target],
                tsconfigRaw: {
                    compilerOptions: {
                        verbatimModuleSyntax,
                        useDefineForClassFields
                    }
                }
            }

            if (jsx !== ts.JsxEmit.None) {
                transformOptions.jsx = jsxMap[jsx]
                transformOptions.jsxDev = jsx === ts.JsxEmit.ReactJSXDev
                transformOptions.jsxFactory = compilerOptions.jsxFactory
                transformOptions.jsxFragment = compilerOptions.jsxFragmentFactory
                transformOptions.jsxImportSource = compilerOptions.jsxImportSource
            }
        },

        async transform(source, id) {
            const loader = loadersMap.get(path.extname(id))
            if (!loader)
                return

            try {
                const { code, map, warnings } = await esbuild.transform(source, { ...transformOptions, loader, sourcefile: id })
                warnings.forEach(({ text: message, location }) => {
                    // Because we're transforming to ESM, esbuild will emit this warning
                    // if the source code contains require() calls. Silent it.
                    if (message.startsWith('Converting "require" to "esm"'))
                        return
                    this.warn({ message, loc: location ?? undefined })
                })
                return { code, map }
            }
            catch (err) {
                return this.error({ message: Error.isError(err) ? err.message : String(err), cause: err, stack: undefined })
            }
        }
    }
}) satisfies TransformerFactory
