import path from 'node:path';
import { describe, expect, it } from 'vitest';
import preloadPlugin from '../src/plugin';

function createTransformContext(resolutions: Record<string, string>) {
    return {
        resolve(importee: string, importer: string) {
            const key = `${importer}:${importee}`;
            const resolved = resolutions[key];
            return resolved ? Promise.resolve({ id: resolved }) : null;
        },
        info() {},
        warn() {},
    };
}

type TransformFn = (
    code: string,
    id: string
) => Promise<{ code: string; map: unknown } | null | undefined>;

function getTransform(
    plugin: ReturnType<typeof preloadPlugin>,
    context: ReturnType<typeof createTransformContext>
): TransformFn {
    const transform = plugin.transform as TransformFn;
    return transform.bind(context);
}

describe('preloadPlugin', () => {
    it('only applies to SSR builds', () => {
        const plugin = preloadPlugin();
        const apply = plugin.apply as (config: {
            build?: { ssr?: boolean };
        }) => boolean;

        expect(apply({ build: { ssr: true } })).toBe(true);
        expect(apply({ build: { ssr: false } })).toBe(false);
        expect(apply({})).toBe(false);
    });

    it('injects __collectModule into lazily imported React components', async () => {
        const plugin = preloadPlugin({
            __internal_importHelperModuleName: 'vite-preload/__internal',
        });

        const appPath = path.join(process.cwd(), 'test/fixtures/App.tsx');
        const cardPath = path.join(process.cwd(), 'test/fixtures/Card.tsx');
        const expectedModuleId = 'test/fixtures/Card.tsx';

        const context = createTransformContext({
            [`${appPath}:./Card`]: cardPath,
        });
        const transform = getTransform(plugin, context);

        await transform(
            `import { lazy } from 'react';\nconst Card = lazy(() => import('./Card'));\nexport default function App() {\n  return <Card />;\n}\n`,
            appPath
        );

        const result = await transform(
            `export default function Card() {\n  return <div>Card</div>;\n}\n`,
            cardPath
        );

        expect(result?.code).toContain('vite-preload/__internal');
        expect(result?.code).toContain('__collectModule');
        expect(result?.code).toContain(expectedModuleId);
    });

    it('injects __collectModule into arrow function default exports', async () => {
        const plugin = preloadPlugin({
            __internal_importHelperModuleName: 'vite-preload/__internal',
        });

        const appPath = path.join(process.cwd(), 'test/fixtures/App.tsx');
        const cardPath = path.join(process.cwd(), 'test/fixtures/Card.tsx');
        const expectedModuleId = 'test/fixtures/Card.tsx';

        const context = createTransformContext({
            [`${appPath}:./Card`]: cardPath,
        });
        const transform = getTransform(plugin, context);

        await transform(
            `import { lazy } from 'react';\nconst Card = lazy(() => import('./Card'));\nexport default function App() {\n  return <Card />;\n}\n`,
            appPath
        );

        const result = await transform(
            `const Card = () => <div>Card</div>;\nexport default Card;\n`,
            cardPath
        );

        expect(result?.code).toContain('__collectModule');
        expect(result?.code).toContain(expectedModuleId);
    });

    it('skips non-JSX dynamically imported modules', async () => {
        const plugin = preloadPlugin();
        const appPath = path.join(process.cwd(), 'test/fixtures/App.tsx');
        const utilPath = path.join(process.cwd(), 'test/fixtures/util.ts');

        const context = createTransformContext({
            [`${appPath}:./util`]: utilPath,
        });
        const transform = getTransform(plugin, context);

        await transform(
            `const loadUtil = () => import('./util');\nexport default function App() {\n  return null;\n}\n`,
            appPath
        );

        const result = await transform(
            `export default function util() {\n  return 'util';\n}\n`,
            utilPath
        );

        expect(result).toBeNull();
    });

    it('returns null for modules without dynamic imports', async () => {
        const plugin = preloadPlugin();
        const context = createTransformContext({});
        const transform = getTransform(plugin, context);

        const result = await transform(
            `export default function App() {\n  return <div>App</div>;\n}\n`,
            path.join(process.cwd(), 'test/fixtures/App.tsx')
        );

        expect(result).toBeNull();
    });
});
