[![NPM package](https://img.shields.io/npm/v/vite-preload.svg?style=flat-square)](https://www.npmjs.com/package/vite-preload)

# vite-preload

This plugin will significantly speed up your server rendered vite application by preloading async modules and stylesheets as early as possible and help you avoiding Flash Of Unstyled Content (FOUC) by including stylesheets from async modules in the initial HTML.

## Explainer

Vite supports `React.lazy()` and dynamic imports just fine but any lazy imported modules and its CSS imports will not be injected into html or DOM until the entrypoint module has imported them.

It's a common pattern to have each page/route in your application lazy loaded especially if you are migrating to Vite from something else like webpack with loadable-components.

This plugin will collect which modules are rendered on the server and help you inject `<link>` tags in the HTML `<head>` and `Link` preload headers for [103 Early Hints](https://developer.mozilla.org/en-US/docs/Web/HTTP/Status/103)

## Without preloading

You can see the async chunks being loaded after the JS started executing (indicated by the red line)
![Before](./doc/before.png)

## With preloading

You can see that the async chunks are loaded directly and instantly available once the JS starts executing
![After](./doc/after.png)

## Install

```
$ npm install vite-preload
```

---

### See [./playground](./playground/) for a basic setup with preloading

## Psuedo example highlighting the important parts

### `vite.config.ts`

Setup the vite plugin to collect rendered async chunks.

The plugin checks if any `import()` call refers to a module with a React Component as the default export and if so injects a hook `__collectModule('path/to/module')` that uses the ChunkCollector React Context to report that it was rendered.

Without this plugin, we will only be able to connect scripts and CSS from the entrypoint and its static imports because we simply don't know which client chunk we render on the server.

```ts
import preloadPlugin from 'vite-preload/plugin';
export default defineConfig({
    plugins: [
        preloadPlugin(),
        react(),
        // ...
    ],
});
```

> [!IMPORTANT]
> Preloading does not apply in development mode and does not make sense to do either, but any function is safe to use. In development mode, Vite will load CSS using <style> tags on demand, which will always come with some Flash Of Unstyled Content (FOUC)

---

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
    );
}
export default App;
```

> [!TIP]
> If your component props changes while it's suspending/hydrating, React might [crash](https://react.dev/errors/421) or flash the suspense boundary to the user. (the `loading` prop).
>
> It's recommended to look into other solutions like [react-lazy-with-preload](https://npmjs.com/packages/react-lazy-with-preload) or react-router [Lazy Routes](https://reactrouter.com/en/main/guides/ssr#lazy-routes) to ensure that the async component is available during hydration.

---

### `render.tsx`

```tsx
import fs from 'node:fs/promises';
import { renderToString } from 'react';
import { createChunkCollector, ChunkCollectorContext } from 'vite-preload';

async function render(req, res) {
    // No template in dev
    const template = process.env.NODE_ENV === 'production'
        ? await fs.readFile('./dist/client/index.html', 'utf8')
        : undefined;

    const collector = createChunkCollector({
        nonce: './dist/client/.vite/manifest.json',
        manifest: 
    });
    const html = renderToString(
        <ChunkCollectorContext collector={collector}>
            <App />
        </ChunkCollectorContext>
    );

    const modules = collector.getModules();

    // <link rel=modulepreload href="/assets/Card.tsx" crossorigin nonce="">
    // <link rel=stylesheet href="/assets/Card.css" nonce="">
    const linkTags = collector.getTags();

    template = template
        .replace('</head>', `${linkTags}\n</head>`) // Injecting in the bottom to ensure CSS ordering, entry chunk CSS should always come first in the <head>.
        .replace('<!--html-->', html);
        .replaceAll('%NONCE%', 'Your csp nonce');

    const linkHeaders = collector.getLinkHeaders();
    // Link: </assets/Card.tsx>; rel=modulepreload; crossorigin
    // Link: </assets/Card.css>; rel=preload; as=style; crossorigin
    res.append('link', linkHeaders);

    // Services like cloudflare will automatically setup HTTP 103 Early Hints but you can also do it yourself...
    // res.writeEarlyHints...

    res.end(template);
}
```

### Example HTTP response with `Link` headers and HTML stylesheets/preloads

```html
HTTP/1.1 200
content-type: text/html; charset=utf-8
link: </assets/Card.tsx>; rel=modulepreload; crossorigin
link: </assets/Card.css>; rel=preload; as=style; crossorigin

<html>
    <head>
        ...
        <link rel=modulepreload href="/assets/Card.tsx" crossorigin nonce="">
        <link rel=stylesheet href="/assets/Card.css" crossorigin nonce="">
        ...
    </head>
    <body>
        ...
    </body>
</html>
```

## Further optimizations

### Preloading `React.lazy`

If your app knows what pages or components that should be preloaded, like the next obvious path the user will make in your user flow, it's recommended to lazy load them with something like `lazyWithPreload`.

Even if you would use a `import()` call to preload the chunk, React will still suspend

```tsx
import lazyWithPreload from 'react-lazy-with-preload';

const Card = lazyWithPreload(() => import('./Card'));
Card.preload();
```

### Using dynamic imports with react-router Lazy Routes

See https://reactrouter.com/en/main/guides/ssr#lazy-routes


### Read more:

- [Backend Integration](https://vitejs.dev/guide/backend-integration.html)
- [Server Side Rendering](https://vitejs.dev/guide/ssr.html)
