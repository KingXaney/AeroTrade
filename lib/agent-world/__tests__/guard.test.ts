// What the trading agent world may reach. Its modules stand apart from the other brains (they read
// and write only their own collections and the paper account through lib/trading), copy what they
// need of poker night rather than import it, and never import an action or the session read. The
// page's components never reach a store, the Paperclip client, the env readers or process.env: what
// a browser runs is the page's own props and the live route's answers.

import {readdirSync, readFileSync, statSync} from 'node:fs';
import path from 'node:path';
import {describe, expect, it} from 'vitest';

const ROOT = path.resolve(__dirname, '../../..');

const sourcesUnder = (dir: string): string[] => readdirSync(path.join(ROOT, dir)).flatMap((name) => {
    if (name.startsWith('.') || name === '__tests__') return [];
    const rel = path.join(dir, name);
    if (statSync(path.join(ROOT, rel)).isDirectory()) return sourcesUnder(rel);
    return /\.(ts|tsx)$/.test(name) ? [rel] : [];
});

const importsOf = (file: string): string[] => {
    const text = readFileSync(path.join(ROOT, file), 'utf8');
    return [...text.matchAll(/^import\s+[^;]*?from\s+["']([^"']+)["']/gm), ...text.matchAll(/^export\s+[^;]*?from\s+["']([^"']+)["']/gm)].map((m) => m[1]);
};

const forbidden = (target: string, prefixes: readonly string[]): boolean => prefixes.some((prefix) => target === prefix || target.startsWith(`${prefix}/`));

describe('the trading agent world\'s imports', () => {
    const libFiles = [...sourcesUnder('lib/agent-world'), 'lib/jobs/functions/agent-world.ts'];
    const componentFiles = sourcesUnder('components/agent-world');

    it('finds its files', () => {
        expect(libFiles.length).toBeGreaterThan(15);
        expect(componentFiles.length).toBeGreaterThan(8);
    });

    it('keeps the logic apart from the other brains, poker night, the actions and the session', () => {
        const banned = ['@/lib/culture', '@/lib/brain', '@/lib/poker-night', '@/lib/actions', '@/lib/auth/session', '@/database/models/culture-entity.model', '@/database/models/brain-entity.model'];
        for (const file of libFiles) {
            for (const target of importsOf(file)) expect(forbidden(target, banned), `${file} imports ${target}`).toBe(false);
        }
    });

    it('keeps the page\'s components off the stores, the Paperclip client, the env readers and process.env', () => {
        const banned = ['@/lib/agent-world/store', '@/lib/agent-world/company', '@/lib/agent-world/paperclip', '@/lib/agent-world/env', '@/lib/agent-world/page-store', '@/lib/agent-world/signing', '@/database'];
        for (const file of componentFiles) {
            const text = readFileSync(path.join(ROOT, file), 'utf8');
            expect(text, file).not.toMatch(/process\.env/);
            for (const target of importsOf(file)) {
                // A type import of the page's view shapes is no reach into the server.
                const typeOnly = new RegExp(`^import\\s+type\\s+[^;]*?from\\s+["']${target.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}["']`, 'm').test(text);
                if (typeOnly) continue;
                expect(forbidden(target, banned), `${file} imports ${target}`).toBe(false);
            }
        }
    });
});
