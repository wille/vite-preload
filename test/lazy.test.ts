import { describe, expect, it, vi } from 'vitest';
import { lazy, preloadAll } from '../src/lazy';

describe('lazy', () => {
    it('registers components for preloadAll', async () => {
        const factory = vi.fn(() => Promise.resolve({ default: () => null }));

        const Component = lazy(factory);
        await preloadAll();

        expect(factory).toHaveBeenCalledTimes(1);
        expect(Component.preload).toBeTypeOf('function');
    });

    it('preloads nested lazy components up to three levels deep', async () => {
        const outerFactory = vi.fn(() =>
            Promise.resolve({ default: () => null })
        );
        const innerFactory = vi.fn(() =>
            Promise.resolve({ default: () => null })
        );

        lazy(outerFactory);
        lazy(innerFactory);

        await preloadAll();

        expect(outerFactory).toHaveBeenCalledTimes(1);
        expect(innerFactory).toHaveBeenCalledTimes(1);
    });
});
