// One product name. The app began as a template and was renamed twice before it became
// AeroTrade; the rename reached the code on 2026-09-16, but the old name lived on in an Inngest app
// id, a Vercel project, a domain and the emails' links for weeks after. This keeps the repo itself
// from ever carrying one of the old names again.

import {readdirSync, readFileSync, statSync} from 'node:fs';
import path from 'node:path';
import {describe, expect, it} from 'vitest';

const ROOT = path.resolve(__dirname, '../..');
const DIRS = ['app', 'components', 'lib', 'database', 'scripts', 'docs', 'public', 'hooks', '.github'];
const ROOT_FILES = ['README.md', 'AGENTS.md', 'CLAUDE.md', 'package.json', '.env.example', 'proxy.ts', 'next.config.ts'];
const TEXT = /\.(ts|tsx|mts|mjs|js|json|md|css|sh|ya?ml|svg|txt|html|example)$/;
const SKIP = new Set(['node_modules', '.next', '.git', 'test-results', 'playwright-report']);

const OLD_NAMES = new RegExp([['algo', 'test'].join('[-_ ]?'), ['signal', 'ist'].join(''), ['stock-market', 'dev'].join('-')].join('|'), 'i');

const walk = (dir: string): string[] => {
    let entries: string[];
    try {
        entries = readdirSync(dir);
    } catch {
        return [];
    }
    return entries.flatMap((name) => {
        if (SKIP.has(name)) return [];
        const full = path.join(dir, name);
        if (statSync(full).isDirectory()) return walk(full);
        return TEXT.test(name) ? [full] : [];
    });
};

describe('the product name', () => {
    it('would catch every spelling of an old name', () => {
        for (const old of ['AlgoTest', 'algo-test', 'algo_test', 'Algo Test', 'Signalist', 'stock-market-dev.vercel.app']) {
            expect(OLD_NAMES.test(old), old).toBe(true);
        }
        expect(OLD_NAMES.test('AeroTrade, an algorithm test suite')).toBe(false);
    });

    it('appears in no file under any of its old names', () => {
        const files = [...DIRS.flatMap((dir) => walk(path.join(ROOT, dir))), ...ROOT_FILES.map((f) => path.join(ROOT, f))]
            .filter((file) => {
                try {
                    return statSync(file).isFile();
                } catch {
                    return false;
                }
            });
        expect(files.length).toBeGreaterThan(300);
        // This file names the old spellings on purpose, to prove the pattern catches them, and the
        // specs are history, written as they were (the email redesign's spec tells how the old name
        // lingered).
        const specs = path.join(ROOT, 'docs', 'specs') + path.sep;
        const hits = files
            .filter((file) => file !== __filename && !file.startsWith(specs) && OLD_NAMES.test(readFileSync(file, 'utf8')))
            .map((file) => path.relative(ROOT, file));
        expect(hits).toEqual([]);
    });
});
