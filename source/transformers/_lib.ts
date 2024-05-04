import type { PluginContext, TransformPluginContext, TransformResult, MaybePromise } from 'rollup'
import type { CompilerOptions } from 'typescript'

export interface Transformer {
    applyCompilerOptions(context: PluginContext, compilerOptions: CompilerOptions): void
    transform(context: TransformPluginContext, source: string, sourcefile: string): MaybePromise<TransformResult>
}

const tsExtensions = new Set([ '.ts', '.tsx', '.mts', '.cts' ])
export function isTsSourceFile(name: string) {
    return tsExtensions.has(extname(name))
}

const tsDeclarationExtensions = new Set([ '.d.ts', '.d.mts', '.d.cts' ])
export function isTsDeclarationFile(name: string) {
    return tsDeclarationExtensions.has(extname(name))
}

// Like path.extname() but accounts for multiple extensions (ie., `extname('index.d.ts') -> '.d.ts')`.
export function extname(pathname: string) {
    pathname = pathname.split(/[\\/]/)                      // Split path parts
        .pop()!                                             // Get basename
        .replace(/^\.+/, dots => '-'.repeat(dots.length))   // Ignore starting dot(s): extname('.config.rc') -> '.rc'
    const dot = pathname.indexOf('.')
    return dot >= 0 ? pathname.slice(dot) : ''
}
