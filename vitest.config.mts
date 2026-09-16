import {defineConfig} from 'vitest/config';
import path from 'node:path';

// Unit tests cover the pure modules only (analytics math, news feed parsing,
// aggregation) — no component or E2E testing.
export default defineConfig({
    resolve: {
        alias: {
            '@': path.resolve(__dirname, '.'),
        },
    },
    test: {
        environment: 'node',
        include: ['lib/**/__tests__/**/*.test.ts'],
    },
});
