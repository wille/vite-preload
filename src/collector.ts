import fs from 'node:fs/promises';
import fs1 from 'node:fs';
import type { ModuleNode, ViteDevServer } from 'vite';
import { Module, sortPreloadModules } from './utils';
import React from 'react';
import debug from 'debug';
import { ModuleCollectorContext } from './context';

const log = debug('vite-preload');

interface Chunk {
    src: string;
    name: string;
    file: string;
    isEntry?: boolean;
    imports?: string[];
    dynamicImports?: string[];
    css?: string[];
}

type Manifest = Record<string, Chunk>;

interface ChunkCollectorOptions {
    /**
     * The manifest.json, NOT ssr-manifest.json as it does not include dynamic imports!
     *
     * Optional, not used in dev
     */
    manifest?: Manifest;

    /**
     * If you are rendering your own HTML and not relying on the generated index.html
     * that includes the entrypoint <script module> and stylesheet, set this to true to
     * include the primary stylesheet and primary <script module>
     */
    includeEntrypoint?: boolean;
}

export class ChunkCollector {
    /**
     * Detected module IDs
     */
    modulesIds = new Set<string>();

    constructor(private options: ChunkCollectorOptions = {}) {
        this.collectModuleId = this.collectModuleId.bind(this);
        this.getModules = this.getModules.bind(this);
    }

    /**
     * Function is called by `ChunkCollectorContext`
     */
    collectModuleId(moduleId: string) {
        this.modulesIds.add(moduleId);
    }

    getModules() {
        const m = new Map<string, Module>();
        for (const moduleId of this.modulesIds) {
            const modules = getChunks(moduleId, this.options);
            for (const module of modules) {
                m.set(module.href, module);
            }
        }

        return sortPreloadModules(Array.from(m.values()));
    }
}

/**
 * Usage:
 *
 * ```
 * const manifest = fs.readFile('.vite/dist', 'utf8');
 * const collector = new ChunkCollector({ manifest });
 *
 * renderToPipeableStream(
 *  <ChunkCollectorContext collector={collector}>
 *      <App />
 *  </ChunkCollectorContext>
 * )
 * ```
 */
export function ChunkCollectorContext({
    collector,
    children,
}: {
    collector: ChunkCollector;
    children: any;
}) {
    // React 19 support
    const ContextComponent =
        'Provider' in ModuleCollectorContext
            ? ModuleCollectorContext.Provider
            : ModuleCollectorContext;

    return React.createElement(
        ContextComponent,
        {
            value: collector.collectModuleId,
        },
        children
    );
}

// async function recursive(urls: any, mod: ModuleNode, depth = 0) {
//     if (depth > 5) {
//         return;
//     }
//     urls[mod.url] = mod;
//     if (mod.staticImportedUrls?.size > 0) {
//         for (const s of mod.staticImportedUrls.values()) {
//             await recursive(
//                 urls,
//                 await vite.moduleGraph.getModuleByUrl(s),
//                 depth + 1
//             );
//         }
//     }
// }

/*
  url: '/src/pages/Browse/index.ts',
  id: '/<absolute>/src/pages/Browse/index.ts',
  file: '/<absolute>/src/pages/Browse/index.ts',
*/
/**
 * https://vitejs.dev/guide/backend-integration
 * https://github.com/vitejs/vite-plugin-react/tree/main/packages/plugin-react#consistent-components-exports
 * https://github.com/vitejs/vite-plugin-vue/blob/main/playground/ssr-vue/src/entry-server.js
 */

/**
 * This function figures out what modules are used based on the modules rendered by React.
 *
 * It follows https://vitejs.dev/guide/backend-integration
 */
function getChunks(
    moduleId: string,
    { manifest, includeEntrypoint }: ChunkCollectorOptions
) {
    const vite: ViteDevServer = globalThis.vite;

    if (vite) {
        return [];
        let m: ModuleNode;

        const urls = {};

        const i1 = vite.moduleGraph.idToModuleMap.get(moduleId);
        const i2 = vite.moduleGraph.urlToModuleMap.get(moduleId);

        console.log('i1', i1);
        console.log('i2', i2);

        // const first = await vite.moduleGraph.getModuleByUrl(moduleId);
        // console.log('first', first);
        // await recursive(urls, first);
        // console.log('id', urls);

        const tags = [];
        // Object.values(urls).forEach(v => {
        //   tags.push(getTag(v));
        // });
        return [];
    } else {
        if (!manifest) {
            throw new Error('No manifest.json provided');
        }
        // const manifestServer = await fs.readFile('./dist/server/.vite/ssr-manifest.json', 'utf8');

        const chunkId = moduleId.startsWith('/')
            ? moduleId.substring(1)
            : moduleId;

        // for (const cssFile of manifest[chunkId]?.css || []) {
        //    assets.set(cssFile, {
        //     type: 'stylesheet',
        //     href: cssFile,
        //     comment: 'PRIMARY CSS'
        //   })
        // }

        const chunks = collectChunksFromManifest(manifest, chunkId);

        if (!includeEntrypoint) {
            chunks.delete('index.html');
            // TODO properly include <script module>
        }

        const assets = new Map<string, Module>();

        for (const chunk of chunks.values()) {
            for (const cssFile of chunk.css || []) {
                if (assets.has(cssFile)) continue;
                assets.set(cssFile, {
                    type: 'stylesheet',
                    href: cssFile,
                    comment: `Stylesheed imported by ${moduleId}`,
                });
            }
        }

        // assets.set(manifest[chunkId].file, {
        //   type: 'module',
        //   href: manifest[chunkId].file,
        //   comment: 'PRIMARY FILE',
        // });

        for (const chunk of chunks.values()) {
            if (assets.has(chunk.file)) continue;
            assets.set(chunk.file, {
                type: 'modulepreload',
                href: chunk.file,
                comment: `Chunk imported by ${moduleId}`,
            });
        }

        return Array.from(assets.values());
    }
}

function collectChunksFromManifest(
    manifest: Manifest,
    chunkId: string,
    chunks = new Map<string, Chunk>()
): Map<string, Chunk> {
    const chunk = manifest[chunkId];

    if (!chunk) {
        log('Missing chunk', chunkId);
        return chunks;
    }

    chunks.set(chunkId, chunk);

    for (const importName of chunk.imports || []) {
        collectChunksFromManifest(manifest, importName, chunks);
    }

    return chunks;
}

function collectChunksFromModuleGraph() {}
