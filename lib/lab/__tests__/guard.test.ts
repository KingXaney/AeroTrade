// The lab's bank stays on the server: a problem's worked solution reaches the page only once the
// owner reveals it. A client component — or any file under components/, which a client component
// may import and so pull into the browser — must not import the bank or the modules that read it;
// a type-only import is erased and is fine. Mirrors lib/games/__tests__/puzzle-guard.test.ts.

import {describe, expect, it} from 'vitest';
import {readdirSync, readFileSync, statSync} from 'node:fs';
import {join, relative} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = fileURLToPath(new URL('../../..', import.meta.url));
// The chrome's sentences (@/lib/learn/copy/lab) and the syllabus rows (…/lab/plan) hold no solution and may reach a client.
const SERVER_ONLY = ['@/lib/learn/copy/lab/bank', '@/lib/learn/copy/lab/units', '@/lib/lab/registry', '@/lib/lab/schedule', '@/lib/lab/store', '@/lib/lab/page-store', '@/lib/lab/papers/store', '@/lib/lab/papers/job'];

const sources = (dir: string): string[] => readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (name === 'node_modules' || name.startsWith('.')) return [];
    if (statSync(path).isDirectory()) return sources(path);
    return /\.(ts|tsx)$/.test(name) ? [path] : [];
});

const valueImports = (text: string): string[] =>
    [...text.matchAll(/^import\s+(?!type\b)[^;]*?from\s+["']([^"']+)["']/gm)].map((match) => match[1]);

const isClientFile = (text: string) => /^\s*['"]use client['"]/.test(text);

describe('the lab bank stays on the server', () => {
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
        expect(files.length).toBeGreaterThan(200);
    });
});
