// A quote reaches the app through the quote sheet (lib/prices/quote-store.ts) and nowhere
// else: a page that asked Finnhub itself would bring back a price per render, per account and
// per server instance — the wobble the sheet exists to end — and a burst per navigation. So the
// raw call, fetchQuote, has exactly one importer, and a fill or a job that needs this moment's
// price asks the store for a fresh read.

import {describe, expect, it} from 'vitest';
import {readdirSync, readFileSync, statSync} from 'node:fs';
import {join, relative} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = fileURLToPath(new URL('../../..', import.meta.url));
const FINNHUB = '@/lib/prices/finnhub';
const ALLOWED = ['lib/prices/quote-store.ts'];

const sources = (dir: string): string[] => readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (name.startsWith('.') || name === '__tests__' || name === 'node_modules') return [];
    if (statSync(path).isDirectory()) return sources(path);
    return /\.(ts|tsx)$/.test(name) ? [path] : [];
});

// The names each `import {...} from '<finnhub>'` statement binds, type-only ones included.
const finnhubImports = (text: string): string[] =>
    [...text.matchAll(/^import\s+(?:type\s+)?\{([^}]*)\}\s+from\s+["']([^"']+)["']/gm)]
        .filter((match) => match[2] === FINNHUB)
        .flatMap((match) => match[1].split(',').map((name) => name.trim().replace(/^type\s+/, '').split(/\s+as\s+/)[0]).filter(Boolean));

describe('the raw Finnhub quote call', () => {
    const files = ['app', 'components', 'hooks', 'lib'].flatMap((dir) => sources(join(root, dir)));

    it('is imported by the quote store alone', () => {
        const offenders = files
            .filter((file) => finnhubImports(readFileSync(file, 'utf8')).includes('fetchQuote'))
            .map((file) => relative(root, file))
            .filter((file) => !ALLOWED.includes(file));
        expect(offenders).toEqual([]);
        expect(files.length).toBeGreaterThan(500);
    });

    it('has no other spelling: the client exports no cached quote read', () => {
        const client = readFileSync(join(root, 'lib/prices/finnhub.ts'), 'utf8');
        expect(client).not.toMatch(/export const getQuote\b/);
        expect(client).not.toMatch(/\/quote\?[^`]*`,\s*\d+\)/);     // no revalidate seconds on a quote URL
        expect(client).toMatch(/cache: 'no-store'/);
    });

    it('sees the imports it guards', () => {
        expect(finnhubImports("import {searchStocks, fetchQuote as raw} from '@/lib/prices/finnhub';\nimport {x} from '@/lib/prices/store';"))
            .toEqual(['searchStocks', 'fetchQuote']);
        expect(finnhubImports("import type {QuoteAnswer} from \"@/lib/prices/finnhub\";")).toEqual(['QuoteAnswer']);
    });
});
