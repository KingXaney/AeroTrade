// The culture brain keeps its own collections (invariant 3, extended): nothing under
// lib/culture or its job may import the news brain's entity or article model, or the modules
// that write and read them. Its decay maths is the pure lib/brain/decay, which it may share.

import {describe, expect, it} from 'vitest';
import {readdirSync, readFileSync, statSync} from 'node:fs';
import {join, relative} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = fileURLToPath(new URL('../../..', import.meta.url));
const FORBIDDEN = [
    '@/database/models/brain-entity.model',
    '@/database/models/news-item.model',
    '@/lib/brain/update',
    '@/lib/brain/store',
    '@/lib/brain/ingest',
];

const sources = (dir: string): string[] => readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (name.startsWith('.') || name === '__tests__') return [];
    if (statSync(path).isDirectory()) return sources(path);
    return /\.(ts|tsx)$/.test(name) ? [path] : [];
});

const imports = (text: string): string[] =>
    [...text.matchAll(/^import\s+[^;]*?from\s+["']([^"']+)["']/gm)].map((match) => match[1]);

describe('the culture brain writes only its own collections', () => {
    const files = [...sources(join(root, 'lib/culture')), join(root, 'lib/jobs/functions/culture.ts')];

    it('never imports the news brain’s models, fold, store or ingest', () => {
        const offenders = files.flatMap((file) =>
            imports(readFileSync(file, 'utf8'))
                .filter((spec) => FORBIDDEN.some((guarded) => spec === guarded || spec.startsWith(`${guarded}/`)))
                .map((spec) => `${relative(root, file)} → ${spec}`));
        expect(offenders).toEqual([]);
        expect(files.length).toBeGreaterThan(15);
    });

    it('sees the imports it guards', () => {
        expect(imports("import BrainEntity from '@/database/models/brain-entity.model';\nimport {x} from '@/lib/culture/store';"))
            .toEqual(['@/database/models/brain-entity.model', '@/lib/culture/store']);
    });
});
