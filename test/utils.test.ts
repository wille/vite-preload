import { describe, expect, it } from 'vitest';
import {
    createHtmlTag,
    createLinkHeader,
    createSingleLinkHeader,
    sortPreloads,
    type Preload,
} from '../src/utils';

describe('createHtmlTag', () => {
    it('creates a stylesheet link tag', () => {
        expect(
            createHtmlTag({
                rel: 'stylesheet',
                href: 'assets/index.css',
            })
        ).toBe(
            '<link rel="stylesheet" href="/assets/index.css" crossorigin />\n'
        );
    });

    it('creates a modulepreload link tag', () => {
        expect(
            createHtmlTag({
                rel: 'modulepreload',
                href: 'assets/Card.js',
            })
        ).toBe(
            '<link rel="modulepreload" href="/assets/Card.js" crossorigin />\n'
        );
    });

    it('creates an entry script tag', () => {
        expect(
            createHtmlTag({
                rel: 'module',
                href: 'assets/index.js',
            })
        ).toBe(
            '<script type="module" src="/assets/index.js" crossorigin></script>\n'
        );
    });

    it('creates an async entry script tag', () => {
        expect(
            createHtmlTag({
                rel: 'module',
                href: 'assets/index.js',
                asyncScript: true,
            })
        ).toBe(
            '<script type="module" async src="/assets/index.js" crossorigin></script>\n'
        );
    });

    it('creates a preload tag for fonts with crossorigin', () => {
        expect(
            createHtmlTag({
                rel: 'preload',
                href: 'assets/font.woff2',
                as: 'font',
                type: 'font/woff2',
            })
        ).toBe(
            '<link rel="preload" href="/assets/font.woff2" as="font" type="font/woff2" crossorigin />\n'
        );
    });

    it('creates a preload tag for images without crossorigin', () => {
        expect(
            createHtmlTag({
                rel: 'preload',
                href: 'assets/logo.png',
                as: 'image',
                type: 'image/png',
            })
        ).toBe(
            '<link rel="preload" href="/assets/logo.png" as="image" type="image/png" />\n'
        );
    });

    it('includes a comment and nonce when provided', () => {
        expect(
            createHtmlTag({
                rel: 'stylesheet',
                href: 'assets/index.css',
                comment: 'chunk: index',
                nonce: 'abc123',
            })
        ).toBe(
            '<!-- chunk: index -->\n<link rel="stylesheet" href="/assets/index.css" crossorigin nonce="abc123" />\n'
        );
    });
});

describe('createSingleLinkHeader', () => {
    it('creates modulepreload link headers', () => {
        expect(
            createSingleLinkHeader({
                rel: 'modulepreload',
                href: 'assets/Card.js',
            })
        ).toBe('</assets/Card.js>; rel=modulepreload; crossorigin');
    });

    it('creates module link headers as modulepreload', () => {
        expect(
            createSingleLinkHeader({
                rel: 'module',
                href: 'assets/index.js',
            })
        ).toBe('</assets/index.js>; rel=modulepreload; crossorigin');
    });

    it('creates stylesheet link headers', () => {
        expect(
            createSingleLinkHeader({
                rel: 'stylesheet',
                href: 'assets/index.css',
            })
        ).toBe('</assets/index.css>; rel=preload; as=style; crossorigin');
    });

    it('creates font preload link headers with crossorigin', () => {
        expect(
            createSingleLinkHeader({
                rel: 'preload',
                href: 'assets/font.woff2',
                as: 'font',
                type: 'font/woff2',
            })
        ).toBe(
            '</assets/font.woff2>; rel=preload; as=font; type=font/woff2; crossorigin'
        );
    });
});

describe('createLinkHeader', () => {
    it('joins multiple link headers', () => {
        const modules: Preload[] = [
            { rel: 'stylesheet', href: 'assets/index.css' },
            { rel: 'modulepreload', href: 'assets/Card.js' },
        ];

        expect(createLinkHeader(modules)).toBe(
            '</assets/index.css>; rel=preload; as=style; crossorigin, </assets/Card.js>; rel=modulepreload; crossorigin'
        );
    });
});

describe('sortPreloads', () => {
    it('sorts stylesheets before scripts and modulepreloads', () => {
        const modules: Preload[] = [
            { rel: 'modulepreload', href: 'assets/Card.js' },
            { rel: 'module', href: 'assets/index.js' },
            { rel: 'stylesheet', href: 'assets/index.css' },
        ];

        const sorted = sortPreloads(modules);

        expect(sorted.map((m) => m.rel)).toEqual([
            'stylesheet',
            'module',
            'modulepreload',
        ]);
    });

    it('sorts fonts above generic preloads', () => {
        const modules: Preload[] = [
            { rel: 'preload', href: 'assets/logo.png', as: 'image' },
            { rel: 'preload', href: 'assets/font.woff2', as: 'font' },
        ];

        const sorted = sortPreloads(modules);

        expect(sorted.map((m) => m.as)).toEqual(['font', 'image']);
    });

    it('sorts blocking scripts before async scripts', () => {
        const modules: Preload[] = [
            { rel: 'module', href: 'assets/index.js', asyncScript: true },
            { rel: 'module', href: 'assets/polyfill.js' },
        ];

        const sorted = sortPreloads(modules);

        expect(sorted.map((m) => m.asyncScript)).toEqual([undefined, true]);
    });
});
