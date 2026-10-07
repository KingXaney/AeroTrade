// Poker night's secrets stay on the server: the deck's randomness, the room stores, the identity
// and guest-token keys, the seat pass and the realtime key. A 'use client' module, wherever it lives
// (app/, components/, hooks/ or lib/), or any file under components/, which a client component may
// import and so pull into the browser, must not reach any of them, directly or through any chain of
// imports. A server page is not a root: a (play) page reads the room and the session by design, and
// what it must not import is route-guard's to say. Unlike lib/games/__tests__/puzzle-guard this
// follows the imports: every '@/…' and relative import, re-export and import() through the .ts and
// .tsx files they name. A type-only import is erased and is not followed; a 'use server' module is
// a boundary the browser only calls across, so the walk stops there. A module named here that does
// not exist yet simply never matches.

import {describe, expect, it} from 'vitest';
import {existsSync, readdirSync, readFileSync, statSync} from 'node:fs';
import {dirname, join, relative} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = fileURLToPath(new URL('../../..', import.meta.url));

// Poker night's server-only modules: no browser file may reach them, whatever the feature.
const POKER_NIGHT_SERVER = [
    '@/lib/poker-night/shuffle', '@/lib/poker-night/store', '@/lib/poker-night/hands-store', '@/lib/poker-night/results-store',
    '@/lib/poker-night/lobby-store', '@/lib/poker-night/prefs-store', '@/lib/poker-night/identity', '@/lib/poker-night/route-kit',
    '@/lib/poker-night/realtime', '@/lib/poker-night/guest-token', '@/lib/poker-night/pass',
];
// The server's own machinery: crypto, the database, the session. A server component may read the
// database (the dashboard's widget registry runs the widget loaders; a (play) page reads the room),
// so these are held against what really runs in the browser — every 'use client' file — and against
// everything in poker night's own components.
const SERVER_MACHINERY = ['node:crypto', 'crypto', 'mongoose', '@/database/', '@/lib/auth/session', '@/lib/auth/server'];
const POKER_NIGHT_COMPONENTS = 'components/poker-night/';
// Every source tree the app imports from: a 'use client' module in any of them is a browser root.
const SOURCE_DIRS = ['app', 'components', 'hooks', 'lib'];

const sources = (dir: string): string[] => readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (name === 'node_modules' || name.startsWith('.')) return [];
    if (statSync(path).isDirectory()) return sources(path);
    return /\.(ts|tsx)$/.test(name) ? [path] : [];
});

const posix = (path: string) => path.replace(/\\/g, '/');
const repoPath = (file: string) => posix(relative(root, file));

const withoutComments = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1');

const directive = (text: string): string | null => withoutComments(text).match(/^\s*['"](use client|use server)['"]/)?.[1] ?? null;

// `import {type A, type B} from …` names types only and is erased like `import type`.
const typesOnly = (clause: string) => /^\{\s*(type\s+[\w$]+(\s+as\s+[\w$]+)?\s*,?\s*)+\}$/.test(clause.trim());

// The specifiers a module loads at run time: value imports, side-effect imports, re-exports and
// import().
const runtimeImports = (text: string): string[] => {
    const code = withoutComments(text);
    const out: string[] = [];
    for (const [, clause, spec] of code.matchAll(/\b(?:import|export)\s+(?!type\s)([\w$*{}\s,]+?)\s+from\s*['"]([^'"]+)['"]/g)) {
        if (!typesOnly(clause)) out.push(spec);
    }
    for (const [, spec] of code.matchAll(/\bimport\s*['"]([^'"]+)['"]/g)) out.push(spec);
    for (const [, spec] of code.matchAll(/\bimport\(\s*['"]([^'"]+)['"]\s*\)/g)) out.push(spec);
    return out;
};

// The .ts/.tsx file a specifier names, or null for a package or anything else.
const resolve = (from: string, spec: string): string | null => {
    const base = spec.startsWith('@/') ? join(root, spec.slice(2)) : spec.startsWith('.') ? join(dirname(from), spec) : null;
    if (base === null) return null;
    for (const candidate of [base, `${base}.ts`, `${base}.tsx`, join(base, 'index.ts'), join(base, 'index.tsx')]) {
        if (/\.(ts|tsx)$/.test(candidate) && existsSync(candidate) && statSync(candidate).isFile()) return candidate;
    }
    return null;
};

// Which of the entries an import is (by its specifier, or the file it resolves to), if any.
const forbidden = (spec: string, file: string | null, entries: readonly string[]): string | null => {
    const path = file ? `@/${repoPath(file).replace(/\.(ts|tsx)$/, '').replace(/\/index$/, '')}` : spec;
    return entries.find((entry) => (entry.endsWith('/') ? path.startsWith(entry) || spec.startsWith(entry) : path === entry || spec === entry)) ?? null;
};

// Walks every chain of runtime imports from the roots, and reports each of the entries reached with
// the chain that reaches it.
const reach = (roots: readonly string[], entries: readonly string[]): string[] => {
    const via = new Map<string, string | null>(roots.map((file) => [file, null]));
    const queue = [...roots];
    const found: string[] = [];
    const chain = (file: string): string => {
        const steps: string[] = [];
        for (let at: string | null = file; at !== null; at = via.get(at) ?? null) steps.unshift(repoPath(at));
        return steps.join(' → ');
    };
    while (queue.length > 0) {
        const file = queue.shift()!;
        const text = readFileSync(file, 'utf8');
        if (directive(text) === 'use server' && via.get(file) !== null) continue;
        for (const spec of runtimeImports(text)) {
            const target = resolve(file, spec);
            const hit = forbidden(spec, target, entries);
            if (hit) found.push(`${chain(file)} → ${spec}`);
            if (target && !via.has(target)) {
                via.set(target, file);
                queue.push(target);
            }
        }
    }
    return found;
};

describe('poker night keeps its server side off the browser', () => {
    const files = SOURCE_DIRS.filter((dir) => existsSync(join(root, dir))).flatMap((dir) => sources(join(root, dir)));
    const isClient = (file: string) => directive(readFileSync(file, 'utf8')) === 'use client';
    const roots = files.filter((file) => repoPath(file).startsWith('components/') || isClient(file));
    const browser = files.filter((file) => isClient(file) || repoPath(file).startsWith(POKER_NIGHT_COMPONENTS));

    it('reaches none of its server modules from a client file or anything under components/', () => {
        expect(reach(roots, POKER_NIGHT_SERVER)).toEqual([]);
    });

    it('reaches no crypto, database or session from a client file, or from poker night\'s components', () => {
        expect(reach(browser, SERVER_MACHINERY)).toEqual([]);
    });

    it('reads the imports a bundler follows, and skips the ones it erases', () => {
        expect(runtimeImports([
            "import {a} from '@/lib/one';",
            "import type {B} from '@/lib/two';",
            "import {type C, type D as E} from '@/lib/three';",
            "import {type F, g} from '@/lib/four';",
            "export {h} from './five';",
            "export type {I} from './six';",
            "import './seven.css';",
            "const j = await import('@/lib/eight');",
            "// import {k} from '@/lib/nine';",
            "import Default, * as all from 'mongoose';",
        ].join('\n'))).toEqual(['@/lib/one', '@/lib/four', './five', 'mongoose', './seven.css', '@/lib/eight']);
        expect(forbidden('@/lib/poker-night/shuffle', null, POKER_NIGHT_SERVER)).toBe('@/lib/poker-night/shuffle');
        expect(forbidden('@/lib/poker-night/shuffle-view', null, POKER_NIGHT_SERVER)).toBeNull();
        expect(forbidden('@/database/models/poker-room.model', null, SERVER_MACHINERY)).toBe('@/database/');
        expect(forbidden('node:crypto', null, SERVER_MACHINERY)).toBe('node:crypto');
    });

    it('follows chains through the files it resolves', () => {
        const shuffle = join(root, 'lib/poker-night/shuffle.ts');
        expect(resolve(join(root, 'lib/poker-night/engine.ts'), './deck')).toBe(join(root, 'lib/poker-night/deck.ts'));
        expect(resolve(join(root, 'lib/poker-night/engine.ts'), '@/lib/poker-night/shuffle')).toBe(shuffle);
        expect(reach([shuffle], SERVER_MACHINERY)).toEqual(['lib/poker-night/shuffle.ts → node:crypto']);
        // A chain is followed past the files in between.
        expect(reach([join(root, 'lib/poker-night/clock.ts')], ['@/lib/poker-night/deck']))
            .toEqual(['lib/poker-night/clock.ts → lib/poker-night/engine.ts → @/lib/poker-night/deck']);
        // The engine a page may load reaches nothing server-only.
        expect(reach([join(root, 'lib/poker-night/views.ts'), join(root, 'lib/poker-night/clock.ts')], [...POKER_NIGHT_SERVER, ...SERVER_MACHINERY])).toEqual([]);
        expect(roots.length).toBeGreaterThan(100);
        expect(browser.length).toBeGreaterThan(50);
        // A client module outside app/ and components/ is a root too, so the walk cannot quietly shrink back.
        expect(roots.map(repoPath)).toContain('hooks/useDebounce.ts');
        expect(browser.map(repoPath)).toContain('hooks/useDebounce.ts');
        // A server module is not: a (play) page or anything else server-side may read the database.
        expect(browser.map(repoPath)).not.toContain('lib/poker-night/shuffle.ts');
    });
});
