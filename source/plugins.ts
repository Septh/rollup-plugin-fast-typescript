import type { Plugin, PluginContext } from 'rollup'
import type { CompilerOptions } from 'typescript'
import type { TransformerName } from '#self'

type PluginWithApi<ApiType> = Omit<Plugin, 'api'> & {
    api: ApiType
}

// Transformers
export type TransformerPlugin = PluginWithApi<{
    applyCompilerOptions(this: PluginContext, compilerOptions: CompilerOptions): void
}>

export const defaultTransformer: TransformerName = 'esbuild'

export const knownTransformers: Record<TransformerName, 1> = {
    esbuild: 1,
    swc: 1,
    sucrase: 1
}

export function isTransformerName(value: unknown): value is TransformerName {
    return typeof value === 'string' && knownTransformers[value as TransformerName] === 1
}

// Utilities
export function simpleError(context: PluginContext, error: unknown): never {
    context.error({
        message: (
            error instanceof Error
                ? error.message
                : typeof error === 'string'
                    ? error
                    : 'Unexpected error'
        ),
        stack: undefined
    })
}
