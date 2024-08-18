import fs from 'node:fs/promises'
import express from 'express'
import { Transform, Writable } from 'node:stream'
import { ChunkCollector, createHtmlTag, createLinkHeader } from '../dist/index.js'

// Constants
const isProduction = process.env.NODE_ENV === 'production'
const port = process.env.PORT || 5173
const base = process.env.BASE || '/'

// Cached production assets
const templateHtml = isProduction
  ? await fs.readFile('./dist/client/index.html', 'utf-8')
  : ''
const manifest = isProduction
  ? JSON.parse(await fs.readFile('./dist/client/.vite/manifest.json', 'utf-8'))
  : undefined

// Create http server
const app = express()

// Add Vite or respective production middlewares
let vite
if (!isProduction) {
  const { createServer } = await import('vite')
  vite = await createServer({
    server: { middlewareMode: true },
    appType: 'custom',
    base,
   })
  app.use(vite.middlewares)
} else {
  const compression = (await import('compression')).default
  const sirv = (await import('sirv')).default
  app.use(compression())
  app.use(base, sirv('./dist/client', { extensions: [] }))
}

// Serve HTML
app.use('*', async (req, res) => {
  try {
    const url = req.originalUrl.replace(base, '')

    let template
    let render
    if (!isProduction) {
      // Always read fresh template in development
      template = await fs.readFile('./index.html', 'utf-8')
      template = await vite.transformIndexHtml(url, template)
      render = (await vite.ssrLoadModule('/src/entry-server.tsx')).render
    } else {
      template = templateHtml
      render = (await import('./dist/server/entry-server.js')).render
    }

    let didError = false

    // const { pipe, abort } = render(url, ssrManifest, {
    //   onShellError() {
    //     res.status(500)
    //     res.set({ 'Content-Type': 'text/html' })
    //     res.send('<h1>Something went wrong</h1>')
    //   },
    //   onShellReady() {
    //     res.status(didError ? 500 : 200)
    //     res.set({ 'Content-Type': 'text/html' })

    //     const transformStream = new Transform({
    //       transform(chunk, encoding, callback) {
    //         res.write(chunk, encoding)
    //         callback()
    //       }
    //     })

    //     const [htmlStart, htmlEnd] = template.split(`<!--app-html-->`)

    //     res.write(htmlStart)

    //     transformStream.on('finish', () => {
    //       res.end(htmlEnd)
    //     })

    //     pipe(transformStream)
    //   },
    //   onError(error) {
    //     didError = true
    //     console.error(error)
    //   }
    // })
    const collector = new ChunkCollector({ manifest });

    const html = await renderStream(render, collector);

    const modules = collector.getModules();

    const DISABLE_PRELOADING = false;

    if (!DISABLE_PRELOADING) {
      console.log('Modules used', modules);
      res.append('link', modules.map(createLinkHeader));
    }

    const tags = DISABLE_PRELOADING ? '' : modules.map(createHtmlTag);

    res.write(template
      .replace('</head>', `${tags}\n</head>`)
      .replace('<!--app-html-->', html)
    )
    res.end()
  } catch (e) {
    vite?.ssrFixStacktrace(e)
    console.log(e.stack)
    res.status(500).end(e.stack)
  }
})

// Start http server
app.listen(port, () => {
  console.log(`Server started at http://localhost:${port}`)
})

async function renderStream(render, collector) {
  const start = performance.now();
  let html = '';
  const stream = new Writable({
    write(chunk, encoding, callback) {
      html += chunk.toString();
      console.log('chunk', chunk.toString().length, performance.now() - start);
      callback();
    },
  });

  const renderPromise = new Promise((resolve, reject) => {
    stream.on('finish', () => {
      resolve();
    });
    stream.on('error', e => {
      reject(e);
    });

    const { pipe } = render('', collector, {
      onShellReady() {
        console.log('shellready', performance.now() - start);
      },
      onShellError(error) {
        console.error('error', error);
        reject(error);
      },
      onAllReady() {
        console.log('allready', performance.now() - start);
      },
      onError(error) {
        console.error('error', error);
        reject(error);
      },
    });

    pipe(stream);
  });

  await renderPromise;
  return html;
}
