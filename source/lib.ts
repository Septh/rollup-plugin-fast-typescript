import { paramCase as kebabCase } from 'param-case'
import {
    version,
    homepage
} from '../package.json'

export { version }
const home = new /* @__PURE__ */URL(homepage)
export function README(anchor: string = '') {
    return `See ${(anchor
        ? new URL('#' + kebabCase(anchor.replace(/^#/, '')), home)
        : home
    ).href} for details.`
}

export const tsExtensions = new Set([ '.ts', '.tsx', '.mts', '.cts' ])
export function isTsSourceFile(name: string) {
    return tsExtensions.has(extname(name))
}

export const tsDeclarationExtensions = new Set([ '.d.ts', '.d.mts', '.d.cts' ])
export function isTsDeclarationSourceFile(name: string) {
    return tsDeclarationExtensions.has(extname(name))
}

const toString = Object.prototype.toString
export function isPlainObject<T = object>(value: unknown): value is T {
    return toString.call(value) === '[object Object]'
}

// Like path.extname() but accounts for multiple extensions (ie., `extname('index.d.ts') -> '.d.ts')`.
export function extname(pathname: string) {
    pathname = pathname.split(/[\\/]/)                      // Split path parts
        .pop()!                                             // Get basename
        .replace(/^\.+/, dots => '-'.repeat(dots.length))   // Ignore starting dot(s): extname('.config.rc') -> '.rc'
    const dot = pathname.indexOf('.')
    return dot >= 0 ? pathname.slice(dot) : ''
}

// Based on https://github.com/sindresorhus/escape-string-regexp
export function escapeRegExpSource(source: string, group: boolean = false, nonCapturing: boolean = false): string {
    source = source.replace(/[|\\{}()[\]^$+?.]/g, '\\$&').replace(/-/g, '\\x2d')
    return group
        ? nonCapturing
            ? '(?:' + source + ')'
            : '(' + source + ')'
        : source
}

export function normalizeSlashes(path: string) {
    return path.replace(/[/\\]+/g, '/')
}
