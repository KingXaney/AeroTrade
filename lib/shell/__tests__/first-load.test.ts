// What every signed-in page sends the browser stays small. The (root) layout mounts the shell —
// the header with ⌘K, the rail, the tabs, the chat's launcher — on every page, so whatever a
// client file there imports statically is downloaded and parsed before any page is used. Measured
// on production on 2026-11-17 that was about 470 KB compressed, with three things in it no page
// needs until someone asks: the chat panel and its markdown stack, and the whole glossary (120 KB
// of definitions, there for ⌘K's Learn rows).
//
// This walks the layouts' static imports — `import … from`, `export … from` and bare imports;
// an `import()` is the way a heavy module is put off, so it is not followed — into the client
// files they reach, and from there through everything those import. A type-only import is erased.

import {describe, expect, it} from 'vitest';
import {existsSync, readFileSync, statSync} from 'node:fs';
import {dirname, join, relative} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = fileURLToPath(new URL('../../..', import.meta.url));
const LAYOUTS = ['app/layout.tsx', 'app/(root)/layout.tsx'];
// Modules and packages a page must ask for before they load.
const DEFERRED_FILES = ['lib/learn/glossary.ts', 'components/chat/ChatPanel.tsx'];
const DEFERRED_PACKAGES = ['react-markdown', 'remark-gfm', 'three'];

const posix = (path: string) => path.replace(/\\/g, '/');
const repoPath = (file: string) => posix(relative(root, file));
const withoutComments = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1');
const isClient = (text: string) => /^\s*['"]use client['"]/.test(withoutComments(text));
const isServerAction = (text: string) => /^\s*['"]use server['"]/.test(withoutComments(text));
// `import {type A, type B} from …` names types only and is erased like `import type`.
const typesOnly = (clause: string) => /^\{\s*(type\s+[\w$]+(\s+as\s+[\w$]+)?\s*,?\s*)+\}$/.test(clause.trim());

const staticImports = (text: string): string[] => {
    const code = withoutComments(text);
    const out: string[] = [];
    for (const [, clause, spec] of code.matchAll(/\b(?:import|export)\s+(?!type\s)([\w$*{}\s,]+?)\s+from\s*['"]([^'"]+)['"]/g)) {
        if (!typesOnly(clause)) out.push(spec);
    }
    for (const [, spec] of code.matchAll(/\bimport\s*['"]([^'"]+)['"]/g)) out.push(spec);
    return out;
};

const resolve = (from: string, spec: string): string | null => {
    const base = spec.startsWith('@/') ? join(root, spec.slice(2)) : spec.startsWith('.') ? join(dirname(from), spec) : null;
    if (base === null) return null;
    for (const candidate of [base, `${base}.ts`, `${base}.tsx`, join(base, 'index.ts'), join(base, 'index.tsx')]) {
        if (/\.(ts|tsx)$/.test(candidate) && existsSync(candidate) && statSync(candidate).isFile()) return candidate;
    }
    return null;
};

type Reached = {files: Map<string, string>; packages: Map<string, string>};

// Every file and package the browser gets with the layouts, each with the chain that brings it.
const firstLoad = (layouts: readonly string[]): Reached => {
    const files = new Map<string, string>();
    const packages = new Map<string, string>();
    const seen = new Set<string>();
    const queue = layouts.map((layout) => ({file: join(root, layout), client: false, chain: layout}));
    while (queue.length > 0) {
        const {file, client: inherited, chain} = queue.shift()!;
        const text = readFileSync(file, 'utf8');
        // A server action is called across the network: the browser gets a reference, not its imports.
        if (isServerAction(text)) continue;
        const client = inherited || isClient(text);
        const key = `${client ? 'c' : 's'}:${file}`;
        if (seen.has(key)) continue;
        seen.add(key);
        if (client && !files.has(repoPath(file))) files.set(repoPath(file), chain);
        for (const spec of staticImports(text)) {
            const target = resolve(file, spec);
            if (target) queue.push({file: target, client, chain: `${chain} → ${repoPath(target)}`});
            else if (client && !spec.startsWith('.') && !spec.startsWith('@/') && !packages.has(spec)) packages.set(spec, `${chain} → ${spec}`);
        }
    }
    return {files, packages};
};

describe('what every signed-in page loads first', {timeout: 30_000}, () => {
    const reached = firstLoad(LAYOUTS);

    it('reaches the shell, so the walk is reading the layouts', () => {
        expect(reached.files.has('components/shell/SearchCommand.tsx')).toBe(true);
        expect(reached.files.has('components/chat/ChatWidget.tsx')).toBe(true);
        expect(reached.files.size).toBeGreaterThan(30);
        expect(reached.packages.has('react')).toBe(true);
    });

    it.each(DEFERRED_FILES)('leaves %s to be asked for', (file) => {
        expect(existsSync(join(root, file))).toBe(true);
        expect(reached.files.get(file) ?? null).toBeNull();
    });

    it.each(DEFERRED_PACKAGES)('leaves the %s package to be asked for', (name) => {
        const chains = [...reached.packages].filter(([spec]) => spec === name || spec.startsWith(`${name}/`)).map(([, chain]) => chain);
        expect(chains).toEqual([]);
    });
});
