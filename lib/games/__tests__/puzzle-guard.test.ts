// The puzzle bank's answers stay on the server. A client component — or any file under
// components/, which a client component may import and so pull into the browser — must not
// import the bank or the modules that read it; a type-only import is erased and is fine.

import {describe, expect, it} from 'vitest';
import {readdirSync, readFileSync, statSync} from 'node:fs';
import {join, relative} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = fileURLToPath(new URL('../../..', import.meta.url));
const SERVER_ONLY = ['@/lib/learn/copy/puzzles', '@/lib/games/puzzles', '@/lib/games/store'];

const sources = (dir: string): string[] => readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (name === 'node_modules' || name.startsWith('.')) return [];
    if (statSync(path).isDirectory()) return sources(path);
    return /\.(ts|tsx)$/.test(name) ? [path] : [];
});

// The `from` specifiers of value imports: `import type` lines are erased at compile time.
const valueImports = (text: string): string[] =>
    [...text.matchAll(/^import\s+(?!type\b)[^;]*?from\s+["']([^"']+)["']/gm)].map((match) => match[1]);

const isClientFile = (text: string) => /^\s*['"]use client['"]/.test(text);

describe('the puzzle bank stays on the server', () => {
    const files = ['app', 'components', 'lib'].flatMap((dir) => sources(join(root, dir)));

    it('is never imported by a client component or anything under components/', () => {
        const offenders = files.flatMap((file) => {
            const text = readFileSync(file, 'utf8');
            const where = relative(root, file);
            if (!isClientFile(text) && !where.startsWith('components')) return [];
            return valueImports(text)
                .filter((spec) => SERVER_ONLY.some((guarded) => spec === guarded || spec.startsWith(`${guarded}/`)))
                .map((spec) => `${where} → ${spec}`);
        });
        expect(offenders).toEqual([]);
    });

    it('sees the imports it guards', () => {
        expect(valueImports("import {PUZZLE_BANK} from '@/lib/learn/copy/puzzles';\nimport type {X} from '@/lib/games/puzzles';"))
            .toEqual(['@/lib/learn/copy/puzzles']);
        expect(files.length).toBeGreaterThan(200);
    });
});
