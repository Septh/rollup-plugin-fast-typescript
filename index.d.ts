import { Plugin, MaybePromise } from 'rollup'
import { TsConfigJson as TsConfigJson_ } from 'type-fest'

// As of 3.5.0, type-fest is still missing the `ES2022` value for the `target` option.
export type TsConfigJson = Omit<TsConfigJson_, 'target'> & {
    target?: TsConfigJson_.CompilerOptions.Target | 'ES2022' | 'es2022'
}

export type TransformerName = 'esbuild' | 'swc' | 'sucrase'
export type TsConfigGetter  = () => MaybePromise<boolean | string | TsConfigJson>

/**
 * A plugin that uses esbuild, swc or sucrase for blazing fast TypeScript transforms,
 * leaving the bundling task to Rollup.
 * @param transformer The name of the transformer to use. One of 'esbuild' (default), 'swc' or 'sucrase'.
 */
export default function fastTypescript(transformer?: TransformerName): Promise<Plugin[]>;
/**
 * A plugin that uses esbuild, swc or sucrase for blazing fast TypeScript transforms,
 * leaving the bundling task to Rollup.
 * @param useProjectConfig `true` to load your project's `tsconfig.json`, `false` to use the transformer's builtin defaults.
 * @param transformer The name of the transformer to use. One of 'esbuild' (default), 'swc' or 'sucrase'.
 */
export default function fastTypescript(useProjectConfig: boolean, transformer?: TransformerName): Promise<Plugin[]>;
/**
 * A plugin that uses esbuild, swc or sucrase for blazing fast TypeScript transforms,
 * leaving the bundling task to Rollup.
 * @param tsConfigFilename The path to the `tsconfig.json` file to use.
 * @param transformer The name of the transformer to use. One of 'esbuild' (default), 'swc' or 'sucrase'.
 */
export default function fastTypescript(tsConfigFilename: string, transformer?: TransformerName): Promise<Plugin[]>;
/**
 * A plugin that uses esbuild, swc or sucrase for blazing fast TypeScript transforms,
 * leaving the bundling task to Rollup.
 * @param tsConfigObject A `TsConfigJson` object.
 * @param transformer The name of the transformer to use. One of 'esbuild' (default), 'swc' or 'sucrase'.
 */
export default function fastTypescript(tsConfigObject: TsConfigJson, transformer?: TransformerName): Promise<Plugin[]>;
/**
 * A plugin that uses esbuild, swc or sucrase for blazing fast TypeScript transforms,
 * leaving the bundling task to Rollup.
 * @param tsConfigGetter A function that returns a `TsConfigJson` object, or a Promise to a `TsConfigJson` object.
 * @param transformer The name of the transformer to use. One of 'esbuild' (default), 'swc' or 'sucrase'.
 */
export default function fastTypescript(tsConfigGetter: TsConfigGetter, transformer?: TransformerName): Promise<Plugin[]>;
