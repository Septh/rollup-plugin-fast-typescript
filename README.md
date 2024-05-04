# rollup-plugin-fast-typescript
A plugin that uses esbuild, swc or Sucrase (you decide!) for blazing fast TypeScript transpilation.

>- This plugin requires Rollup version 4.0.0 or higher.
>- This package is ESM-only and can only be used from an ESM configuration file (either `rollup.config.mjs` or `rollup.config.js` with `type="module"` in `package.json`. See [Rollup docs](https://rollupjs.org/guide/en/#configuration-files) for more detail).

## Features
- You choose which one of the three supported transpilers to use.
- Zero config: your project's `tsconfig.json` is all you need.
- Uses TypeScript API for full `tsconfig.json` compatibility:
  - `tsconfig.json#extends`:
    - Supports extending configs from npm packages, e.g., [@tsconfig/base](https://github.com/tsconfig/bases).
    - In watch mode, all files in the config chain are watched and trigger a rebuild if modified.
  - Full TypeScript-like module resolution, including `compilerOptions#baseUrl`, `compilerOptions#paths`, `compilerOptions#rootDirs` and even `compilerOptions#moduleSuffixes`!
- No hidden "magic" that happens behind your back.

## Installation
Use your favorite package manager. Mine is [npm](https://www.npmjs.com).

You must also make sure that the transpiler you plan to use is installed - the plugin does not install it for you.

For esbuild:
```sh
npm install --save-dev rollup-plugin-fast-typescript esbuild
```

For swc:
```sh
npm install --save-dev rollup-plugin-fast-typescript @swc/core
```

For Sucrase:
```sh
npm install --save-dev rollup-plugin-fast-typescript sucrase
```

## Usage
The simpler, the better.

```js
// rollup.config.js
import fastTypescript from 'rollup-plugin-fast-typescript'

export default {
  ...
  plugins: [
    fastTypescript('esbuild') // or 'swc' or 'sucrase'
  ]
}
```

This will load your project's `tsconfig.json` and use the specified transformer to transpile your code to Javascript.

Starting with version 2.1.0, the plugin also exports these three convenience functions:

* `esbuild(tsconfig)` is an alias for `fastTypescript('esbuild', tsconfig)`
* `swc(tsconfig)` is an alias for `fastTypescript('swc', tsconfig)`
* `sucrase(tsconfig)` is an alias for `fastTypescript('sucrase', tsconfig)`

For example:
```js
// rollup.config.js
import { swc } from 'rollup-plugin-fast-typescript'

export default {
  ...
  plugins: [
    swc()   // Use swc to transpile TypeScript
  ]
}
```

## Options
`rollup-plugin-fast-typescript`'s *parti pris* is to mimic the behavior of the real TypeScript compiler as closely as possible (two obvious exceptions here are type checking and declaration files generation, since none of the supported transpilers support these features), so the plugin doest not offer any option to play with other than the choice of the transpiler to use and the `tsconfig.json` settings to use.

```js
fastTypescript(
  transpiler : 'esbuild' | 'swc' | 'sucrase',
  tsconfig?: boolean | string | TsConfigJson | (() => MaybePromise<boolean | string | TsConfigJson>)
)
```

```js
esbuild(
  tsconfig?: boolean | string | TsConfigJson | (() => MaybePromise<boolean | string | TsConfigJson>)
)
```

```js
swc(
  tsconfig?: boolean | string | TsConfigJson | (() => MaybePromise<boolean | string | TsConfigJson>)
)
```

```js
sucrase(
  tsconfig?: boolean | string | TsConfigJson | (() => MaybePromise<boolean | string | TsConfigJson>)
)
```

### Option: `transpiler`
Type: `'esbuild' | 'swc' | 'sucrase'`<br>
Optional: no

When using the generic `fastTypescript` export, you must specify the name of the transpiler to use.

> Again, remember that this plugin does not ship with, nor will it install for you, any of these transpilers; it is your responsibility to install the tool you plan to use.

### Option: `tsconfig`
Type: `boolean | string | TsConfigJson | (() => MaybePromise<boolean | string | TsConfigJson>)`<br>
Optional: yes<br>
Default: `true`

Specifies how to resolve TypeScript options:
- `true` (the default) will load your project's `tsconfig.json` file.
  - _Note: The file is assumed to live in the current working directory._
- a non-empty string is assumed to be the path to the `tsconfig.json` file to load (e.g., `'./tsconfig.prod.json'`) or the name of an installed npm package exposing a `tsconfig.json` file (e.g., `'@tsconfig/node16/tsconfig.json'`).
- an object is assumed to be a [`TsConfigJson`](https://www.typescriptlang.org/tsconfig/) object (note: the `TsConfigJson` interface is re-exported from [type-fest](https://github.com/sindresorhus/type-fest?tab=readme-ov-file#miscellaneous)).
- `false` or an empty string will cause the selected transpiler to use its own default settings.
- finally, if this parameter is a function, it must return any of the above, or a promise to a any of the above.


## Things you should know
- The plugin aims to emit the same code TypeScript's `tsc` would have given the passed `tsconfig.json`, no more, no less. Therefore, none of the supported transpilers specificities/unique features are exposed. In the simplest case, the transpiler is just a *"get rid of type annotations"* tool -- and a very fast one, for that matter.<br>
To achieve its goal, the plugin does its best to call the selected transpiler's `transform` API with settings derived from the passed `tsconfig.json`. For example, TypeScript's `target` setting is mapped to the transpiler's corresponding setting.<br>
- Because Rollup internally works with ESM source files, the transpiler's output is always set to `'esm'`.
  - `swc` does not handle [Typescript's import assignments](https://www.typescriptlang.org/docs/handbook/modules/reference.html#export--and-import--require) when targetting esm and will error out when it encounters one.


## Generated warnings
The plugin may issue a few warnings during the build phase; here are their meaning.

### isolatedModules
Because none of the third-party transpilers the plugin uses under the hood is type-aware, some techniques or features often used in TypeScript are not properly checked and can cause mis-compilation or even runtime errors.

To mitigate this, you should [set the `isolatedModules` option to true in tsconfig](https://www.typescriptlang.org/tsconfig#isolatedModules) and let your editor warn you when such incompatible constructs are used.

You should also run `tsc --noEmit` sometime in your build steps to double check.

## License
MIT
