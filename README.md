# rollup-plugin-fast-typescript
A plugin that uses esbuild, swc or sucrase (you decide!) for blazing fast TypeScript transpilation, leaving the tree-shaking and bundling tasks to Rollup (see [why](#considerations)).

>⚠ Important notice
>- This plugin requires rollup version 3.2.0 or higher.
>- This package is ESM-only and can only be used from an ESM configuration file (`rollup.config.mjs` or `rollup.config.js` with `type="module"` in `package.json`. See [Rollup docs](https://rollupjs.org/guide/en/#configuration-files) for more detail).

## Features
- You choose which one of the three supported transpilers to use.
- Zero config: your project's `tsconfig.json` is all you need go get started.
- Uses TypeScript API for full `tsconfig.json` compatibility:
  - `tsconfig.json#extends`:
    - Supports extending configs from npm packages, e.g., [@tsconfig/base](https://github.com/tsconfig/bases).
    - In watch mode, all files in the config chain are watched and trigger a rebuild if modified.
  - Full TypeScript-like module resolution, including `compilerOptions#baseUrl`, `compilerOptions#paths`, `compilerOptions#rootDirs` and even `compilerOptions#moduleSuffixes`!
- No "magic" that happens behind your back. Everything is under *your* control.

## Installation
Use your favorite package manager. Mine is [npm](https://www.npmjs.com).

You must also make sure that the transpiler you plan to use is installed - the plugin does not install it for you.

```sh
# for esbuild:
npm install --save-dev rollup rollup-plugin-fast-typescript esbuild

# for swc:
npm install --save-dev rollup rollup-plugin-fast-typescript @swc/core

# for sucrase:
npm install --save-dev rollup rollup-plugin-fast-typescript sucrase
```

## Usage
The simpler, the better.

```js
// rollup.config.mjs
import fastTypescript from 'rollup-plugin-fast-typescript'

export default {
  ...
  plugins: [
    fastTypescript()
  ]
}
```

This will load your project's `tsconfig.json` and use `esbuild` to transpile your code to Javascript.

## Options
`rollup-plugin-fast-typescript`'s *parti pris* is to mimic the behavior of the real TypeScript compiler as closely as possible (two obvious exceptions here are type checking and declaration files generation, since none of the supported transpilers support these features), so the plugin doest not offer any option to play with other than the choice of which transpiler to use and which tsconfig file to load.

There are basically four ways to instantiate the plugin:

```js
// Use the project's tsconfig.json and the default transpiler (esbuild):
fastTypescript()

// Use the specified tsconfig and the default transpiler (esbuild):
fastTypescript(tsconfig)

// Use the project's tsconfig.json and the specified transpiler:
fastTypescript(transpiler)

// Use the specified tsconfig and transpiler:
fastTypescript(tsconfig, transpiler)
```

### Option: `tsconfig`
Type: `boolean | string | TsConfigJson | (() => MaybePromise<boolean | string | TsConfigJson>)`<br>
Optional: yes<br>
Default: `true`

Specifies how to resolve TypeScript options:
- `true` (default) loads your project's `tsconfig.json` file.
  - _Note: The file is assumed to live in the current working directory._
- `false` or `''` (empty string) will use an empty tsconfig, causing the selected transpiler to use its own default settings.
- a non-empty string is assumed to be the path to the tsconfig file to use (e.g., `'./tsconfig.prod.json'`), or the name of an installed npm package exposing a tsconfig file (e.g., `'@tsconfig/node16/tsconfig.json'`).
- an object is assumed to be a [`TsConfigJson`](https://github.com/sindresorhus/type-fest/blob/main/source/tsconfig-json.d.ts) object.
- finally, if this parameter is a function, it must return any of the above, or a promise to a any of the above.

### Option: `transpiler`
Type: `'esbuild' | 'swc' | 'sucrase'`<br>
Optional: yes<br>
Default: `'esbuild'`

The name of the transpiler to use.

> Remember that this plugin does not ship with, nor will it install for you, any of these transpilers; it is your responsibility to install the tool you plan to use.

## Things you should know
- The plugin aims to emit the same code TypeScript's `tsc` would have given the passed tsconfig, no more, no less. Therefore, none of the supported transpilers specificities/unique features are exposed. In the simplest case, the transpiler is just a *"get rid of type annotations"* tool -- and a very fast one, for that matter.<br />
To achieve its goal, the plugin does its best to call the selected transpiler's `transform` API with settings derived from the passed `tsconfig.json`. For example, TypeScript's `target` setting is mapped to the transpiler's corresponding setting.<br />
There are a few cases where this mapping is not 100% accurate. To continue with the `target` example above, TypeScript defaults to `ES3` if the setting is not specified. This is fine with `swc` and `sucrase`, but not with `esbuild`, who supports ES5+ only. In such cases, a warning is emitted and the nearest setting is selected instead.
- Because Rollup internally works with ESM source files, the transpiler's output is always set to `'esm'`. Still, CommonJS features like `require()`, `__filename` and `__dirname` are left untouched, so you will want to ensure that either `output.format` is set to `'cjs'` in `rollup.config.mjs`, or that appropriate shims are used.<br />
Likewise, dynamics imports are always left untouched.
- The plugin will only resolve modules with a `.json` extension when `resolveJsonModule` is true and the `module` and `moduleResolution` settings pair resolves to either `node`, `node16` or `nodeNext`.<br />
Note, that you sill need `@rollup/plugin-json` to bundle json files!


## About warnings
The plugin may issue a few warnings during the build phase; here are their meaning.

### isolatedModules
Because none of the third-party transpilers the plugin uses under the hood is type-aware, some techniques or features often used in TypeScript are not properly checked and can cause mis-compilation or even runtime errors.

To mitigate this, you should [set the `isolatedModules` option to true in tsconfig](https://www.typescriptlang.org/tsconfig#isolatedModules) and let your IDE warn you when such incompatible constructs are used.

You should also run `tsc --noEmit` sometime in your build steps to double check.

### (other warning: TODO)


## Considerations
Why let Rollup do the tree-shaking and bundling?, you may ask.

IMHO, Rollup is still the best at tree-shaking and bundling: it offers the more control on what can be done and, when configured properly, emits the best code possible with very little if no bloat.

So the choice here is to trade some speed in the bundling phase in exchange for power and precision. I believe this is a reasonable choice.

Also, if you want to have `esbuild` do the bundling... Why use Rollup in the first place?


## License
MIT
