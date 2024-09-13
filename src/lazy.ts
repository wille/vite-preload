import { ComponentType } from 'react';
import { lazyWithPreload } from 'react-lazy-with-preload';

let preloads: (() => Promise<any>)[] = [];

/**
 * Drop in replacement for React.lazy that also supports preloading.
 *
 * Must be used to be able to call `preloadAll()` on the server.
 *
 * @example const LazyComponent = lazyWithPreload(() => import('./Component'));
 */
export function lazy<T extends ComponentType<any>>(
    factory: () => Promise<{
        default: T;
    }>
) {
    const z = lazyWithPreload(factory);
    preloads.push(z.preload);
    return z;
}

/**
 * Preload all detected lazy() components.
 *
 * Should be used on the server to resolve all lazy imports before rendering to avoid the Suspense loading state to be triggered on the first render.
 */
export async function preloadAll() {
    // Preload all lazy components up to a depth of 3
    for (let i = 0; i < 3 && preloads.length > 0; i++) {
        const _preloads = preloads;
        preloads = [];

        if (_preloads.length === 0) {
            return;
        }
        await Promise.all(_preloads.map((preload) => preload()));
    }
}
