import path from 'node:path';
import type { PluginContext, TransformHook } from 'rollup'
import type { CompilerOptions } from 'typescript'

// Taken from rollup.d.ts, too bad it's not exported.
type MaybeAsync<Function_> = Function_ extends (
	this: infer This,
	...parameters: infer Arguments
) => infer Return
	? (this: This, ...parameters: Arguments) => Return | Promise<Return>
	: never;

export interface Transformer {
    applyCompilerOptions(this: PluginContext, compilerOptions: CompilerOptions): void
    transform: MaybeAsync<TransformHook>
}

export type TransformerFactory = () => Transformer | Promise<Transformer>
export type TransformerModule = { default: Transformer | TransformerFactory }

const tsExtensions = new Set([ '.ts', '.tsx', '.mts', '.cts' ])
export function isTsSourceFile(name: string) {
    return tsExtensions.has(path.extname(name))
}
