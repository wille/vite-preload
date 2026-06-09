import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ChunkCollector, createChunkCollector } from '../src/collector';
import { testManifest } from './fixtures/manifest';

describe('ChunkCollector', () => {
    it('preloads entry chunks on construction', () => {
        const collector = new ChunkCollector(
            testManifest as never,
            'index.html'
        );

        const chunks = collector.getChunks();
        const hrefs = chunks.map((chunk) => chunk.href);

        expect(hrefs).toContain('assets/index-abc123.js');
        expect(hrefs).toContain('assets/index-def456.css');
        expect(hrefs).toContain('assets/App-ghi789.js');
    });

    it('collects lazy module chunks when a component is rendered', () => {
        const collector = new ChunkCollector(
            testManifest as never,
            'index.html'
        );

        collector.__context_collectModuleId('src/Card.tsx');

        const hrefs = collector.getChunks().map((chunk) => chunk.href);

        expect(hrefs).toContain('assets/Card-jkl012.js');
        expect(hrefs).toContain('assets/Card-mno345.css');
        expect(hrefs).toContain('assets/vendor-shared.js');
    });

    it('does not duplicate chunks when the same module is collected twice', () => {
        const collector = new ChunkCollector(
            testManifest as never,
            'index.html'
        );

        collector.__context_collectModuleId('src/Card.tsx');
        collector.__context_collectModuleId('src/Card.tsx');

        const cardJs = collector
            .getChunks()
            .filter((chunk) => chunk.href === 'assets/Card-jkl012.js');

        expect(cardJs).toHaveLength(1);
    });

    it('excludes entry chunks from getTags by default', () => {
        const collector = new ChunkCollector(
            testManifest as never,
            'index.html'
        );
        collector.__context_collectModuleId('src/Card.tsx');

        const tags = collector.getTags();

        expect(tags).toContain('assets/Card-jkl012.js');
        expect(tags).toContain('assets/Card-mno345.css');
        expect(tags).not.toContain('assets/index-abc123.js');
        expect(tags).not.toContain('<script type="module"');
    });

    it('includes entry chunks in getTags when requested', () => {
        const collector = new ChunkCollector(
            testManifest as never,
            'index.html'
        );

        const tags = collector.getTags({ includeEntry: true });

        expect(tags).toContain('<script type="module"');
        expect(tags).toContain('assets/index-abc123.js');
    });

    it('returns link headers for all collected chunks', () => {
        const collector = new ChunkCollector(
            testManifest as never,
            'index.html'
        );
        collector.__context_collectModuleId('src/Card.tsx');

        const headers = collector.getLinkHeaders();

        expect(headers).toContain(
            '</assets/Card-jkl012.js>; rel=modulepreload; crossorigin'
        );
        expect(headers).toContain(
            '</assets/Card-mno345.css>; rel=preload; as=style; crossorigin'
        );
    });

    it('returns a combined link header string', () => {
        const collector = new ChunkCollector(
            testManifest as never,
            'index.html'
        );
        collector.__context_collectModuleId('src/Card.tsx');

        const header = collector.getLinkHeader();

        expect(header).toContain('rel=modulepreload');
        expect(header).toContain('rel=preload; as=style');
    });

    it('preloads fonts by default but not other assets', () => {
        const collector = new ChunkCollector(
            testManifest as never,
            'index.html'
        );
        collector.__context_collectModuleId('src/WithAssets.tsx');

        const hrefs = collector.getChunks().map((chunk) => chunk.href);

        expect(hrefs).toContain('assets/font-def.woff2');
        expect(hrefs).not.toContain('assets/logo-abc.png');
    });

    it('preloads images when preloadAssets is enabled', () => {
        const collector = new ChunkCollector(
            testManifest as never,
            'index.html',
            true,
            true
        );
        collector.__context_collectModuleId('src/WithAssets.tsx');

        const hrefs = collector.getChunks().map((chunk) => chunk.href);

        expect(hrefs).toContain('assets/logo-abc.png');
        expect(hrefs).toContain('assets/font-def.woff2');
    });

    it('skips font preloads when preloadFonts is disabled', () => {
        const collector = new ChunkCollector(
            testManifest as never,
            'index.html',
            false,
            true
        );
        collector.__context_collectModuleId('src/WithAssets.tsx');

        const hrefs = collector.getChunks().map((chunk) => chunk.href);

        expect(hrefs).toContain('assets/logo-abc.png');
        expect(hrefs).not.toContain('assets/font-def.woff2');
    });

    it('includes nonce in generated tags', () => {
        const collector = new ChunkCollector(
            testManifest as never,
            'index.html',
            true,
            false,
            'test-nonce'
        );
        collector.__context_collectModuleId('src/Card.tsx');

        const tags = collector.getTags();

        expect(tags).toContain('nonce="test-nonce"');
    });
});

describe('createChunkCollector', () => {
    const originalNodeEnv = process.env.NODE_ENV;

    beforeEach(() => {
        process.env.NODE_ENV = 'production';
    });

    afterEach(() => {
        process.env.NODE_ENV = originalNodeEnv;
    });

    it('creates a collector from a manifest object in production', () => {
        const collector = createChunkCollector({
            manifest: testManifest as never,
            entry: 'index.html',
        });

        expect(collector.getChunks().length).toBeGreaterThan(0);
    });

    it('throws when manifest is missing in production', () => {
        expect(() => createChunkCollector({ entry: 'index.html' })).toThrow(
            'options.manifest must be provided in production'
        );
    });

    it('throws when the entry key is missing from the manifest', () => {
        expect(() =>
            createChunkCollector({
                manifest: testManifest as never,
                entry: 'missing.html',
            })
        ).toThrow('Vite manifest.json does not contain key "missing.html"');
    });

    it('throws when the entry is not marked as an entry module', () => {
        expect(() =>
            createChunkCollector({
                manifest: {
                    ...testManifest,
                    'index.html': {
                        ...testManifest['index.html'],
                        isEntry: false,
                    },
                } as never,
                entry: 'index.html',
            })
        ).toThrow('Module "index.html" is not an entry module');
    });

    it('skips manifest validation outside production', () => {
        process.env.NODE_ENV = 'development';

        const collector = createChunkCollector({});

        expect(collector.getChunks()).toEqual([]);
    });
});
