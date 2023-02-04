// @ts-check
import externals from 'rollup-plugin-node-externals'
import resolve from '@rollup/plugin-node-resolve'
import commonjs from '@rollup/plugin-commonjs'
import json from '@rollup/plugin-json'
import replace from '@rollup/plugin-replace'
import { transform } from 'esbuild'
import { defineConfig } from 'rollup'

/**
 * A *very* simplified version of esbuildTransformer
 * @type { import('rollup').PluginImpl }
 */
function typescript() {

    /** @type { import('esbuild').TransformOptions } */
    const transformOpts = {
        format: 'esm',
        target: 'esnext',
        loader: 'ts',
        charset: 'utf8',
        ignoreAnnotations: true,
        treeShaking: false,
        minify: false,
        sourcemap: 'external',
        sourcesContent: false,
        logLevel: 'silent',
        tsconfigRaw: {
            compilerOptions: {
                alwaysStrict: false,
                preserveValueImports: true,
                importsNotUsedAsValues: 'preserve'
            }
        }
    }

    return {
        name: 'ts',

        async transform(tscode, sourcefile) {
            if (!sourcefile.endsWith('.ts'))
                return null

            const { code, map, warnings } = await transform(tscode, {
                ...transformOpts,
                sourcefile
            })

            for (const warning of warnings) {
                // Because we're transforming to ESM, esbuild will emit this warning
                // if the source code contains require() calls. Silent it.
                if (warning.text.startsWith('Converting "require" to "esm"'))
                    continue

                this.warn({
                    message: warning.text,
                    loc: warning.location
                        ? { column: warning.location.column, line: warning.location.line }
                        : undefined
                })
            }

            return { code, map }
        }
    }
}

// Remember to sync import in source/index.ts if changing output names!
const entries = [
    [ './source/index.ts',                 './index.js'       ],
    [ './source/transformers/esbuild.ts',  './lib/esbuild.js' ],
    [ './source/transformers/swc.ts',      './lib/swc.js'     ],
    [ './source/transformers/sucrase.ts',  './lib/sucrase.js' ],
]

export default defineConfig(args => {
    const isDist = args.configDist

    return entries.map(([ input, output ]) => defineConfig({
        input,
        output: {
            file: output,
            format: 'esm',
            exports: 'named',
            generatedCode: 'es2015',
            sourcemap: !isDist,
            sourcemapExcludeSources: true,
            minifyInternalExports: false,
        },
        treeshake: isDist,
        strictDeprecations: true,
        plugins: [
            externals({
                // Nb: typescript is a peer, it won't be bundled no matter what devDeps says
                devDeps: !isDist,
            }),
            resolve({
                extensions: [ '.ts' ]
            }),
            commonjs(),
            json({
                preferConst: true
            }),
            isDist && replace({
                preventAssignment: true,
                include: [ /param-case/, /dot-case/ ],
                delimiters: [ '\\b', '\\b(?=\\()' ],
                values: {
                    '__assign': 'Object.assign'
                }
            }),
            typescript(),
            {
                name: 'additional-watches',
                buildStart() {
                    if (this.meta.watchMode) {
                        this.addWatchFile('./index.d.ts')
                        // this.addWatchFile('./package.json')
                    }
                }
            }
        ]
    }))
})
