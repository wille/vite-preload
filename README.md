[![NPM package](https://img.shields.io/npm/v/vite-preload.svg?style=flat-square)](https://www.npmjs.com/package/vite-preload)

# vite-preload

This plugin will significantly speed up your server rendered vite application by preloading async modules and stylesheets as early as possible and help you avoiding Flash Of Unstyled Content (FOUC) by including stylesheets from async modules in the initial HTML.

Similar to [loadable-components](https://loadable-components.com/) but built for Vite.

#### See [./playground](./playground/) for a basic setup with preloading

## Explainer

Vite supports dynamic imports just fine but any lazy imported modules and its CSS imports will only be loaded once the parent module has been loaded and executed. This can lead to a Flash Of Unstyled Content (FOUC) if the async module is rendered on the server and the browser has not yet loaded the CSS.

This plugin will collect which modules are rendered on the server and help you inject `<link>` tags in the HTML `<head>` and `Link` preload headers for [103 Early Hints](https://developer.mozilla.org/en-US/docs/Web/HTTP/Status/103)

## Without preloading

You can see the async chunks being loaded after the JS started executing (indicated by the red line)
![Before](./doc/before.png)

## With preloading

You can see that the async chunks are loaded directly and instantly available once the JS starts executing
![After](./doc/after.png)

## Installation

```
$ npm install vite-preload
```

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
> Preloading does not apply in development mode but any function is safe to use. In development mode, Vite will load CSS using style tags on demand, which will always come with some Flash Of Unstyled Content (FOUC)

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
link: </assets/index-CG7aErjv.js>; rel=modulepreload; crossorigin
link: </assets/index-Be6T33si.css>; rel=preload; as=style; crossorigin
link: </assets/Card.tsx>; rel=modulepreload; crossorigin
link: </assets/Card.css>; rel=preload; as=style; crossorigin

<html>
    <head>
        ...
        <script type="module" crossorigin src="/assets/index-CG7aErjv.js"></script>
        <link rel=modulepreload href="/assets/Card.tsx" crossorigin nonce="">
        <link rel="stylesheet" crossorigin href="/assets/index-Be6T33si.css">
        <link rel=stylesheet href="/assets/Card.css" crossorigin nonce="">
        ...
    </head>
    <body>
        ...
    </body>
</html>
```

## Migrating from `loadable-components`

...

## Usage with `React.lazy`

React.lazy works with Server Rendering using the React Streaming APIs like [renderToPipeableStream](https://react.dev/reference/react-dom/server/renderToPipeableStream)

```tsx
import { lazy, Suspense } from 'react';

const Card = lazy(() => import('./Card'));

function App() {
    return (
        <div>
            <Suspense fallback={<p>Suspending...</p>}>
                <Card />
            </Suspense>
        </div>
    )
}
```

> [!NOTE]
> React.lazy has some undesirable behaviour in server rendering.
>
> - The first render on the server will always trigger the suspense fallback. One solution to fix this is to use something similar to [react-lazy-with-preload](https://npmjs.com/packages/react-lazy-with-preload) and .preload() every single lazy import on the server
> - Larger components in large projects that takes time to load will trigger the suspense fallback on the client side, even if the component is already loaded on the server. This can be fixed by using [react-lazy-with-preload](https://npmjs.com/packages/react-lazy-with-preload) and .preload() every single lazy import on the server
> 

## Usage with `react-router`

React Router v6 supports lazy routes using the `lazy` prop on the `Route` component.

When navigating on the client side to a lazy route, the document will not repaint until the lazy route has been loaded, avoding a flash of white like when using loadable-components.

When hydrating a lazy route, the server render HTML will be thrown away, cause a hydration mismatch error, then load and render again.
To prevent this so you will need preload all the lazy routes rendered by the server like in the example below.

> [!NOTE]
> 

```tsx
import { Route } from 'react-router'
import { hydrateRoot } from 'react-dom/server'

function lazyRoute(dynamicImportFn: () => Promise<any>) {
  return async () => {
    const { default: Component } = await dynamicImportFn();
    return { Component };
  };
}

const routes = (
    <Route lazy={lazyRoute(() => import('./Card'))} />
)

function loadLazyRoutes() {
    const matches = matchRoutes(routes, window.location);

    if (!matches) {
        return;
    }

    const promises = matches.map(match => {
        if (!m.route.lazy) {
            return;
        }
        const routeModule = await m.route.lazy!();

        m.route.Component = routeModule.Component;
        delete m.route.lazy;
        Object.assign(m.route, {
            ...routeModule,
            lazy: undefined,
        });
    });

    await Promise.all(promises);
}

async function main() {
    await loadLazyRoutes();

    ReactDOM.hydrateRoot(
        <RouterProvider router={router} />,
        document.getElementById('root')
    );
}
```

See https://reactrouter.com/en/main/guides/ssr#lazy-routes

### Read more in the Vite documentation

- [Backend Integration](https://vitejs.dev/guide/backend-integration.html)
- [Server Side Rendering](https://vitejs.dev/guide/ssr.html)
