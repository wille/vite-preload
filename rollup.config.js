import typescript from '@rollup/plugin-typescript';

export default {
    input: ['src/index.ts', 'src/__internal.ts', 'src/plugin.ts'],
    output: [
        {
            dir: 'dist',
            format: 'cjs',
            preserveModules: true,
            sourcemap: true,
            entryFileNames: '[name].cjs',
        },
        {
            dir: 'dist',
            format: 'module',
            preserveModules: true,
            sourcemap: true,
            entryFileNames: '[name].js',
        },
    ],
    plugins: [typescript()],
};
