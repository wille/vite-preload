import typescript from '@rollup/plugin-typescript';

/**
 * Rewrites the emitted .d.ts files to .d.cts in the CommonJS output.
 *
 * The package is `"type": "module"`, so TypeScript treats .d.ts files as ES modules
 * and does not allow them to be used for the .cjs files.
 */
function commonjsDeclarations() {
    return {
        name: 'commonjs-declarations',
        generateBundle(_, bundle) {
            for (const [fileName, file] of Object.entries(bundle)) {
                if (!fileName.endsWith('.d.ts')) continue;

                let source = String(file.source).replace(
                    /(from '\.\/[^']+)\.js'/g,
                    "$1.cjs'"
                );

                // Rollup emits `module.exports = x` for modules with only a default export
                if (fileName === 'plugin.d.ts') {
                    source = source
                        .replace(
                            'export default function preloadPlugin',
                            'declare function preloadPlugin'
                        )
                        // Vite 7+ only ships ES module types
                        .replace(
                            "import { Plugin } from 'vite'",
                            "import type { Plugin } from 'vite' with { 'resolution-mode': 'import' }"
                        )
                        .replace('export {};', 'export = preloadPlugin;');
                }

                delete bundle[fileName];
                this.emitFile({
                    type: 'asset',
                    fileName: fileName.replace(/\.d\.ts$/, '.d.cts'),
                    source,
                });
            }
        },
    };
}

export default {
    input: ['src/index.ts', 'src/__internal.ts', 'src/plugin.ts'],
    output: [
        {
            dir: 'dist',
            format: 'cjs',
            preserveModules: true,
            sourcemap: true,
            entryFileNames: '[name].cjs',
            plugins: [commonjsDeclarations()],
        },
        {
            dir: 'dist',
            format: 'module',
            preserveModules: true,
            sourcemap: true,
            entryFileNames: '[name].js',
        },
    ],
    plugins: [typescript({ tsconfig: './tsconfig.build.json' })],
};
