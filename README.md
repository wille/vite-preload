# vite-preload

This plugin will significantly speed up your server rendered vite application by preloading async modules as early as possible and it will avoid Flash Of Unstyled Content (FOUC) by including stylesheets from async modules in the initial HTML.

## Explainer

Vite supports `React.lazy()` just fine but any lazy imported modules and its CSS imports will not be injected into html or DOM until the entrypoint module has imported them.

It's a common pattern to have each page/route in your application lazy loaded especially if you are migrating to Vite from something else like webpack with loadable-components.

This plugin will collect which modules are rendered on the server and help you inject `<link>` tags and `Link` preload headers for early hints.

Read more:
- [Backend Integration](https://vitejs.dev/guide/backend-integration.html)
- [Server Side Rendering](https://vitejs.dev/guide/ssr.html)

## Without preloading

You can see the async chunks being loaded after the JS started executing (indicated by the red line)
![Before](./doc/before.png)

## With preloading
You can see that the async chunks are loaded directly and instantly available once the JS starts executing
![After](./doc/after.png)

> [!CAUTION]
> This library is experimental and not guaranteed to work in your custom setup. 


## Install

```
$ npm install vite-preload
```

***

### See [./playground](./playground/) for a basic setup with preloading

## Psuedo example highlighting the important parts

### `vite.config.ts`

```ts
import preloadPlugin from 'vite-preload/plugin';
export default defineConfig({
    plugins: [
        preloadPlugin()
    ]
})
```

### `App.tsx`
```tsx
import React from 'react';

// Normally the Card module will not be loaded by the browser at all until the module has loaded and rendered it
const LazyComponent = React.lazy(() => import('./Card'));

function App() {
    return (
        <div>
            <React.Suspense loading={<p>Suspending...</p>}>
                <Card />
            </React.Suspense>
        </div>
    )
}
export default App
```

### `render.tsx`
```tsx
import fs from 'node:fs/promises';
import { renderToPipeableStream } from 'React';
import { createHtmlTag, ChunkCollector, ChunkCollectorContext } from 'vite-preload';

function render(req, res) {
    const template = await fs.readFile('./dist/client/index.html', 'utf8');

    const collector = new ChunkCollector();
    renderToPipeableStream(
        <ChunkCollectorContext collector={collector}>
            <App />
        </ChunkCollectorContext>
    );

    const modules = collector.getModules();

    // <link rel=modulepreload href="/assets/Card.tsx" crossorigin nonce="">
    // <link rel=stylesheet href="/assets/Card.css" nonce="">
    const htmlTags = modules
        .filter(m => !m.isEntry) // Skip entry modules as they are already present in the HTML by the client build
        .map(createHtmlTag)
        .join('\n');

    template = template
        .replace('</head>', `${htmlTags}\n</head>`)
        .replace('<!--html-->', html);
        .replaceAll('%NONCE%', 'Your csp nonce');

    // Link: </assets/Card.tsx>; rel=modulepreload; crossorigin
    // Link: </assets/Card.css>; rel=preload; as=style; crossorigin
    res.append('link', modules.map(createLinkHeader));

    // Services like cloudflare will automatically setup HTTP 103 Early Hints but you can also do it yourself...
    // res.writeEarlyHints...

    res.end(template);
}
```

> [!WARN]
> There is CURRENTLY no support for preloading JS in the development environment, while not as important as CSS, not preloading CSS
> will still give you a unpleasant experience with Flash Of Unstyled Content in the development environment

## Further optimizations

If your app knows what pages or components that should be preloaded, like the next obvious path the user will make in your user flow, it's recommended to lazy load them with something like `lazyWithPreload`.

Even if you would use a `import()` call to preload the chunk, React will still suspend 
```tsx
import lazyWithPreload from 'react-lazy-with-preload';

const Card = lazyWithPreload(() => import('./Card'));
Card.preload();
```