import fs from 'node:fs/promises';
import express from 'express';
import { Transform } from 'node:stream';
import { setTimeout } from 'node:timers/promises';
import crypto from 'node:crypto';

import { createChunkCollector } from '../dist/collector.js';

// Constants
const isProduction = process.env.NODE_ENV === 'production';
const port = process.env.PORT || 5173;
const base = process.env.BASE || '/';

// Cached production assets
const templateHtml = isProduction
    ? await fs.readFile('./dist/client/index.html', 'utf-8')
    : '';
const manifest = isProduction
    ? JSON.parse(
          await fs.readFile('./dist/client/.vite/manifest.json', 'utf-8')
      )
    : undefined;

// Create http server
const app = express();

// Add Vite or respective production middlewares
let vite;
if (!isProduction) {
    const { createServer } = await import('vite');
    vite = await createServer({
        server: { middlewareMode: true },
        appType: 'custom',
        base,
    });
    app.use(vite.middlewares);
} else {
    const compression = (await import('compression')).default;
    const sirv = (await import('sirv')).default;
    app.use(compression());
    app.use(base, sirv('./dist/client', { extensions: [] }));
}

// Serve HTML
app.use('*', async (req, res) => {
    try {
        const url = req.originalUrl.replace(base, '');

        let template;
        let render;
        if (!isProduction) {
            // Always read fresh template in development
            template = await fs.readFile('./index.html', 'utf-8');
            template = await vite.transformIndexHtml(url, template);
            render = (await vite.ssrLoadModule('/src/entry-server.tsx')).render;
        } else {
            template = templateHtml;
            render = (await import('./dist/server/entry-server.js')).render;
        }

        const nonce = crypto.randomBytes(16).toString('base64');
        res.setHeader(
            'Content-Security-Policy',
            `script-src 'self' 'nonce-${nonce}'; style-src 'self' 'nonce-${nonce}';`
        );

        let didError = false;

        const collector = createChunkCollector({
            manifest,
            preloadAssets: true,
            preloadFonts: true,
            nonce,
        });

        // Not gonna work locally in Chrome unless you have a HTTP/2 supported proxy in front, use Firefox to pick up 103 Early Hints over HTTP/1.1 without TLS
        // https://developer.chrome.com/docs/web-platform/early-hints
        // Also services like cloudflare already handles this for you
        // https://developers.cloudflare.com/cache/advanced-configuration/early-hints/
        if (req.headers['sec-fetch-mode'] === 'navigate') {
            res.writeEarlyHints({
                link: collector.getLinkHeaders(),
            });
            await setTimeout(2000);
        }

        const [head, rest] = template.split(`<!--app-html-->`);

        const { pipe } = render(url, collector, {
            nonce,
            onShellError() {
                res.status(500);
                res.set({ 'Content-Type': 'text/html' });
                res.send('<h1>Something went wrong</h1>');
            },
            onShellReady() {
                console.log('onShellReady');

                res.status(didError ? 500 : 200);
                res.set('Content-Type', 'text/html');
                res.append('link', collector.getLinkHeaders());

                const modules = collector.getSortedModules();

                console.log('Modules used', modules);

                const tags = collector.getTags();

                res.write(
                    head
                        .replaceAll('%NONCE%', nonce)
                        .replace('</head>', `${tags}\n</head>`)
                );

                const transformStream = new Transform({
                    transform(chunk, encoding, callback) {
                        res.write(chunk, encoding);
                        console.log('Chunk', chunk.length);
                        callback();
                    },
                });

                transformStream.on('finish', () => {
                    res.end(rest);
                });

                pipe(transformStream);
            },
            onError(error) {
                didError = true;
                console.error(error);
            },
            onAllReady() {
                console.log('onAllReady');
            },
        });
    } catch (e) {
        vite?.ssrFixStacktrace(e);
        console.log(e.stack);
        res.status(500).end(e.stack);
    }
});

// Start http server
app.listen(port, () => {
    console.log(`Server started at http://localhost:${port}`);
});
