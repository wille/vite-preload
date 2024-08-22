import React from 'react';
import { Context } from './__internal';
import { ChunkCollector } from './collector';

/**
 * React context to collect used modules
 *
 * Usage:
 *
 * ```
 * const manifest = fs.readFile('.vite/dist', 'utf8');
 * const collector = new ChunkCollector({ manifest });
 *
 * render(
 *  <ChunkCollectorContext collector={collector}>
 *      <App />
 *  </ChunkCollectorContext>
 * )
 * ```
 */
export default function ChunkCollectorContext({
    collector,
    children,
}: {
    collector: ChunkCollector;
    children: any;
}) {
    // React 19 support
    const ContextComponent =
        'Provider' in Context
            ? Context.Provider
            : Context;

    return React.createElement(
        ContextComponent,
        {
            value: collector.__context_collectModuleId,
        },
        children
    );
}
