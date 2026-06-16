import fs from 'node:fs';
import path from 'node:path';

import {
    createHtmlTag,
    createLinkHeader,
    createSingleLinkHeader,
    Preload,
    sortPreloads,
} from './utils';

interface ManifestChunk {
    src: string;
    name: string;
    file: string;
    isEntry?: boolean;
    imports?: string[];
    dynamicImports?: string[];
    css?: string[];
    assets?: string[];
}

type Manifest = Record<string, ManifestChunk>;

export class ChunkCollector {
    modulesIds = new Set<string>();
    preloads = new Map<string, Preload>();

    constructor(
        public manifest: Manifest,
        public entry: string,
        public preloadFonts = true,
        public preloadAssets = false,
        public nonce = '',
        public asyncScript = false
    ) {
        this.__context_collectModuleId =
            this.__context_collectModuleId.bind(this);
        this.getChunks = this.getChunks.bind(this);
        this.getSortedModules = this.getSortedModules.bind(this);
        this.getTags = this.getTags.bind(this);
        this.getLinkHeader = this.getLinkHeader.bind(this);
        this.getLinkHeaders = this.getLinkHeaders.bind(this);

        // Load the entry modules
        collectModules('vite/legacy-polyfills', this);
        collectModules(entry, this);
    }

    /**
     * Function is called by `ChunkCollectorContext`
     */
    __context_collectModuleId(moduleId: string) {
        this.modulesIds.add(moduleId);
        collectModules(moduleId, this);
    }

    /**
     * @deprecated - use getChunks instead
     */
    getSortedModules() {
        const modules = Array.from(this.preloads.values());
        return sortPreloads(modules);
    }

    getChunks() {
        const modules = Array.from(this.preloads.values());
        return sortPreloads(modules);
    }

    /**
     * Returns all HTML tags for preload hints and stylesheets.
     *
     * See https://vitejs.dev/guide/backend-integration for using your own template
     */
    getTags({
        includeEntry,
    }: {
        /**
         * Will include the entry <script module=""> and entry stylesheets tags.
         *
         * If you are using the default Vite settings and having vite transform your index.html
         * as build time, then the entry tags are already included in the template.
         */
        includeEntry?: boolean;
    } = {}): string {
        const modules = this.getChunks();

        return modules
            .filter((m) => includeEntry || !m.isEntry)
            .map(createHtmlTag)
            .filter((x) => x != null)
            .join('\n');
    }

    /**
     * Returns a `Link` header with all chunks to preload,
     * including entry chunks.
     *
     * @example res.setHeader('link', collector.getLinkHeader());
     */
    getLinkHeader(): string {
        const modules = this.getChunks();
        return createLinkHeader(modules);
    }

    /**
     * Returns an array of `Link` header values
     *
     * @example res.append('link', collector.getLinkHeaders());
     */
    getLinkHeaders(): string[] {
        return this.getChunks()
            .map(createSingleLinkHeader)
            .filter((x) => x != null);
    }
}

interface CollectorOptions {
    /**
     * The Vite manifest or a path to it.
     *
     * Set build.manifest: true in your vite config to generate it.
     *
     * May be missing in development mode since vite-preload has no effect there
     *
     * This is not the ssr-manifest.json.
     */
    manifest?: Manifest | string;

    /**
     * The entry module. Defaults to `index.html`
     */
    entry?: string;

    /**
     * Preload fonts.
     *
     * @default true
     */
    preloadFonts?: boolean;

    /**
     * Preload any static imported asset such as image, svgs
     *
     * @default false
     */
    preloadAssets?: boolean;

    /**
     * Nonce for scripts and stylesheets
     */
    nonce?: string;

    /**
     * Set the `async` attribute on the entry <script module=""> tag.
     *
     * This requires you to control template generation and add the <script module async> tag to the end of the <body>
     * or only hydrate React when DOMContentLoaded has fired.
     *
     * The polyfill entry script will not be async.
     */
    asyncScript?: boolean;
}

let manifestFromFile: Manifest;

/**
 * Create a chunk collector.
 * This function will throw if not configured correctly
 */
export function createChunkCollector(options: CollectorOptions) {
    let manifest: Manifest = {};
    const entry = options.entry || 'index.html';

    const enabled = process.env.NODE_ENV === 'production';

    if (enabled) {
        if (typeof options.manifest === 'string') {
            if (manifestFromFile) {
                manifest = manifestFromFile;
            } else {
                const data = fs.readFileSync(options.manifest, 'utf8');
                const json = JSON.parse(data);
                manifestFromFile = manifest = json;
            }
        } else {
            manifest = options.manifest!;
        }

        if (!options.manifest) {
            throw new Error(
                'options.manifest must be provided in production either as a path or object'
            );
        }

        if (!manifest[entry]) {
            throw new Error(
                `Vite manifest.json does not contain key "${entry}"`
            );
        }

        if (!manifest[entry].isEntry) {
            throw new Error(`Module "${entry}" is not an entry module`);
        }
    }

    const collector = new ChunkCollector(
        manifest,
        entry,
        options.preloadFonts,
        options.preloadAssets,
        options.nonce,
        options.asyncScript
    );
    return collector;
}

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
function collectModules(
    moduleId: string,
    {
        entry,
        manifest,
        preloadAssets,
        preloadFonts,
        preloads,
        nonce,
        asyncScript,
    }: ChunkCollector
) {
    // The reported module ID is not in it's own chunk
    // Possible cause for the missing module in the manifest is build.rollupOptions.output.experimentalMinChunkSize
    if (!manifest[moduleId] || preloads.has(moduleId)) {
        return preloads;
    }

    const built = getBuiltChunks(
        manifest,
        moduleId,
        entry,
        preloadFonts,
        preloadAssets,
        nonce,
        asyncScript
    );

    for (const c of built) {
        // Skip the whole chunk if its script file is already collected — mirrors the original
        // `if (preloads.has(chunk.file)) continue;`, which dropped that chunk's css + assets too.
        if (preloads.has(c.file)) {
            continue;
        }

        preloads.set(c.file, c.script);

        for (const [cssFile, cssPreload] of c.css) {
            if (preloads.has(cssFile)) continue;
            preloads.set(cssFile, cssPreload);
        }

        // Assets were set unconditionally in the original (last-write-wins, no has() guard).
        for (const [assetFile, assetPreload] of c.assets) {
            preloads.set(assetFile, assetPreload);
        }
    }

    return preloads;
}

/**
 * A chunk's preload descriptors, pre-built: the `<script>` / `<link modulepreload>` descriptor
 * plus the ordered css and asset `[href, Preload]` entries — exactly what `collectModules`
 * would otherwise construct for one chunk on every render.
 */
interface BuiltChunk {
    file: string;
    script: Preload;
    css: Array<[string, Preload]>;
    assets: Array<[string, Preload]>;
}

/**
 * Per-manifest cache of pre-built per-module descriptors, keyed by
 * `${entry}\0${flags}\0${moduleId}`.
 *
 * Only used when `nonce` is empty. The `Preload` descriptor objects (and their `comment`
 * template strings) are otherwise a pure function of
 * `(manifest, moduleId, entry, preloadFonts, preloadAssets, asyncScript)` — all stable at
 * runtime — so the closure-memo (`collectChunks`) left descriptor construction as the largest
 * remaining per-render allocation in this module. Building each module's descriptors once per
 * process removes it. A non-empty per-request CSP `nonce` bypasses the cache and builds fresh,
 * so cached objects never carry the wrong nonce and the cache cannot grow per request.
 * WeakMap-keyed on the manifest object so a replaced manifest (rebuild / dev HMR) drops the
 * stale cache.
 *
 * The cached `Preload` objects are SHARED across renders — callers must treat them as
 * immutable (vite-preload only reads them in getChunks/getTags/getLinkHeader/sortPreloads).
 */
const descriptorCache = new WeakMap<Manifest, Map<string, BuiltChunk[]>>();

function buildChunksForModule(
    manifest: Manifest,
    moduleId: string,
    entry: string,
    preloadFonts: boolean,
    preloadAssets: boolean,
    nonce: string,
    asyncScript: boolean
): BuiltChunk[] {
    const chunks = collectChunks(manifest, moduleId);
    const built: BuiltChunk[] = [];

    for (const chunk of chunks.values()) {
        const isPolyfill = chunk.src === 'vite/legacy-polyfills';
        const isPrimaryModule = chunk.src === entry;

        const script: Preload = {
            // Only the entrypoint module is used as <script module>, everything else is <link rel=modulepreload>
            rel: isPrimaryModule || isPolyfill ? 'module' : 'modulepreload',
            href: chunk.file,
            comment: `chunk: ${chunk.name}, isEntry: ${chunk.isEntry}`,
            isEntry: chunk.isEntry,
            nonce,

            // The polyfill chunk should not be async and it should run before the entry chunk
            asyncScript: asyncScript && !isPolyfill,
        };

        const css: Array<[string, Preload]> = [];
        for (const cssFile of chunk.css || []) {
            css.push([
                cssFile,
                {
                    rel: 'stylesheet',
                    href: cssFile,
                    comment: `chunk: ${chunk.name}, isEntry: ${chunk.isEntry}`,
                    isEntry: chunk.isEntry,
                    nonce,
                },
            ]);
        }

        const assets: Array<[string, Preload]> = [];
        if (preloadFonts || preloadAssets) {
            // Assets such as svg, png imports
            for (const asset of chunk.assets || []) {
                const ext = path.extname(asset).substring(1);
                let as;
                let mimeType;
                let skip = false;

                switch (ext) {
                    case 'png':
                    case 'jpg':
                    case 'webp':
                    case 'svg':
                        as = 'image';
                        mimeType =
                            ext === 'svg' ? 'image/svg+xml' : `image/${ext}`;
                        if (!preloadAssets) skip = true;
                        break;
                    case 'woff2':
                    case 'woff':
                    case 'ttf':
                        as = 'font';
                        mimeType = `font/${ext}`;
                        if (!preloadFonts) skip = true;
                        break;
                    default:
                        // Unknown asset type: a <link rel="preload"> without a valid `as` is
                        // ignored by browsers (and Chrome logs a console warning), so emitting
                        // one is just wasted bytes. Skip it.
                        skip = true;
                        break;
                }
                if (skip) continue;

                assets.push([
                    asset,
                    {
                        rel: 'preload',
                        href: asset,
                        as,
                        type: mimeType,
                        comment: `Asset from chunk ${chunk.name}: ${chunk.file}`,
                    },
                ]);
            }
        }

        built.push({ file: chunk.file, script, css, assets });
    }

    return built;
}

/**
 * Returns the pre-built per-module chunk descriptors, memoized per process when `nonce` is
 * empty (see {@link descriptorCache}); built fresh otherwise.
 */
function getBuiltChunks(
    manifest: Manifest,
    moduleId: string,
    entry: string,
    preloadFonts: boolean,
    preloadAssets: boolean,
    nonce: string,
    asyncScript: boolean
): BuiltChunk[] {
    // A per-request nonce makes the descriptors request-specific: build fresh, never cache.
    if (nonce) {
        return buildChunksForModule(
            manifest,
            moduleId,
            entry,
            preloadFonts,
            preloadAssets,
            nonce,
            asyncScript
        );
    }

    let perManifest = descriptorCache.get(manifest);
    if (!perManifest) {
        perManifest = new Map();
        descriptorCache.set(manifest, perManifest);
    }

    const key = `${entry}\0${preloadFonts ? 1 : 0}${preloadAssets ? 1 : 0}${asyncScript ? 1 : 0}\0${moduleId}`;
    let built = perManifest.get(key);
    if (!built) {
        built = buildChunksForModule(
            manifest,
            moduleId,
            entry,
            preloadFonts,
            preloadAssets,
            nonce,
            asyncScript
        );
        perManifest.set(key, built);
    }
    return built;
}

/**
 * Per-manifest cache of each module's fully-resolved chunk closure.
 *
 * `collectChunksRecursively` is a pure function of `(manifest, moduleId)` — the manifest is
 * immutable at runtime — yet `collectModules` re-runs it for every rendered module on every
 * request. For SSR apps that render many modules with deep, heavily-shared closures this is the
 * single largest source of work and allocation in this module: it re-walks the import graph and
 * re-clones every `{ ...chunk }` on each render. Memoizing makes each module's walk happen once
 * per process. The cache is keyed on the manifest object (WeakMap) so a replaced manifest
 * (production rebuild / dev HMR) transparently gets a fresh cache and the old one is GC'd.
 *
 * The returned map is shared — callers (only `collectModules`) read it and must not mutate it.
 */
const closureCache = new WeakMap<
    Manifest,
    Map<string, Map<string, ManifestChunk>>
>();

function collectChunks(
    manifest: Manifest,
    moduleId: string
): Map<string, ManifestChunk> {
    let perManifest = closureCache.get(manifest);
    if (!perManifest) {
        perManifest = new Map();
        closureCache.set(manifest, perManifest);
    }

    let chunks = perManifest.get(moduleId);
    if (!chunks) {
        chunks = new Map<string, ManifestChunk>();
        collectChunksRecursively(manifest, moduleId, chunks);
        perManifest.set(moduleId, chunks);
    }

    return chunks;
}

function collectChunksRecursively(
    manifest: Manifest,
    moduleId: string,
    chunks: Map<string, ManifestChunk>,
    isEntry?: boolean
) {
    const chunk = manifest[moduleId];

    if (!chunk) {
        throw new Error(`Missing chunk '${moduleId}'`);
    }

    if (chunks.has(moduleId)) {
        return;
    }

    chunks.set(moduleId, {
        ...chunk,

        // Any static import in the entry chunk is considered an entry chunk
        // and inlined by Vite in the generated HTML template but it's not
        // marked with isEntry: true in the manifest
        isEntry: isEntry || chunk.isEntry,
    });

    for (const importName of chunk.imports || []) {
        collectChunksRecursively(
            manifest,
            importName,
            chunks,
            isEntry || chunk.isEntry
        );
    }
}
