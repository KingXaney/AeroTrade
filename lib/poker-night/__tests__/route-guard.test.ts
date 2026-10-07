// Poker night's route handlers keep to the rules nothing else enforces. Every route under
// app/api/poker-night/ runs playerRequest (lib/poker-night/route-kit) — the protocol header, the
// same-origin and body checks, the in-memory bucket, the identity and the player — and declares
// the Node runtime and its ten-second budget. A GET never writes: no GET handler, no file of the
// (play) route group (a page, a layout, a boundary) and not the shared request path imports or
// calls mutateRoom, so a link preview, a prefetch or a loop
// of polls cannot deal a hand. Every (play) page lives under app/(play)/play/, and no (root) page
// takes /play. No route sends an Access-Control-Allow-* header. And the server modules never hand
// a room, a state or a document to console.* — the logs carry codes, seqs and messages only.

import {describe, expect, it} from 'vitest';
import {existsSync, readdirSync, readFileSync, statSync} from 'node:fs';
import {join, relative} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = fileURLToPath(new URL('../../..', import.meta.url));
const posix = (path: string) => path.replace(/\\/g, '/');

const filesUnder = (dir: string, name: RegExp): string[] => {
    const full = join(root, dir);
    if (!existsSync(full)) return [];
    return readdirSync(full).flatMap((entry) => {
        const path = join(full, entry);
        if (statSync(path).isDirectory()) return filesUnder(posix(relative(root, path)), name);
        return name.test(entry) ? [posix(relative(root, path))] : [];
    });
};

const read = (file: string) => readFileSync(join(root, file), 'utf8');
const withoutComments = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1');
const withoutStrings = (text: string) => text.replace(/'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/g, "''");

const ROUTES = filesUnder('app/api/poker-night', /^route\.ts$/);
const PLAY_PAGES = filesUnder('app/(play)', /^page\.tsx$/);
// Every file a (play) render runs: a page, a layout (it runs for a link preview and a prefetch too),
// a loading or error boundary, a not-found page.
const PLAY_FILES = filesUnder('app/(play)', /\.(ts|tsx)$/);
const SERVER_MODULES = ['store', 'hands-store', 'results-store', 'identity', 'route-kit', 'realtime', 'page-gate'].map((name) => `lib/poker-night/${name}.ts`);

const exportsMethod = (code: string, method: string) => new RegExp(`export\\s+(async\\s+)?function\\s+${method}\\b|export\\s+const\\s+${method}\\b`).test(code);

// Whether a file brings mutateRoom in by name or calls it.
const reachesMutate = (code: string) => /\bimport\b[^;]*\bmutateRoom\b[^;]*\bfrom\b/.test(code) || /\bmutateRoom\s*\(/.test(code);

// The argument text of every console.* call, strings blanked, so a label may say "state".
const consoleArguments = (text: string): string[] => {
    const code = withoutStrings(withoutComments(text));
    const out: string[] = [];
    for (const match of code.matchAll(/\bconsole\.(log|info|warn|error|debug)\s*\(/g)) {
        let depth = 1;
        let i = match.index! + match[0].length;
        const start = i;
        for (; i < code.length && depth > 0; i++) {
            if (code[i] === '(') depth++;
            else if (code[i] === ')') depth--;
        }
        out.push(code.slice(start, i - 1));
    }
    return out;
};
const PRIVATE_ARGUMENT = /\b(state|room|doc)\b/;

describe('the poker night routes', () => {
    it('are where the design puts them', () => {
        expect(ROUTES.sort()).toEqual(['action', 'detail', 'emote', 'join', 'state', 'tick', 'token'].map((name) => `app/api/poker-night/[code]/${name}/route.ts`));
    });

    it('all run playerRequest, on Node, within ten seconds', () => {
        for (const file of ROUTES) {
            const code = withoutComments(read(file));
            expect(code, file).toMatch(/\bawait\s+playerRequest\s*\(/);
            expect(code, file).toMatch(/export\s+const\s+runtime\s*=\s*'nodejs'/);
            expect(code, file).toMatch(/export\s+const\s+maxDuration\s*=\s*10\b/);
        }
    });

    it('let the seat pass stand in for the identity on the reads, the ticks and an emote, never on a join or a move', () => {
        const takesPass = ROUTES.filter((file) => /allowPass:\s*true/.test(withoutComments(read(file)))).map((file) => file.split('/').at(-2)).sort();
        expect(takesPass).toEqual(['detail', 'emote', 'state', 'tick', 'token']);
    });

    it('stamp an emote, and the cooldown its write is filtered on, with the time the request arrived', () => {
        const code = withoutComments(read('app/api/poker-night/[code]/emote/route.ts'));
        expect(code).toMatch(/const now = ctx\.receivedAt;/);
        expect(code).not.toMatch(/Date\.now\(\)/);
    });

    it('never write from a GET, a (play) page or the request checks they share', () => {
        const readers = [...ROUTES.filter((file) => exportsMethod(read(file), 'GET')), ...PLAY_FILES];
        expect(readers.length).toBeGreaterThanOrEqual(2);
        expect(PLAY_FILES).toEqual(expect.arrayContaining(['app/(play)/layout.tsx', 'app/(play)/play/[code]/layout.tsx', 'app/(play)/play/[code]/page.tsx']));
        for (const file of readers) expect(reachesMutate(withoutComments(read(file))), file).toBe(false);
        expect(reachesMutate(withoutComments(read('lib/poker-night/route-kit.ts')))).toBe(false);
        // A route file answers one method: a GET beside a POST would share the POST's imports.
        for (const file of ROUTES) {
            const methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].filter((m) => exportsMethod(read(file), m));
            expect(methods, file).toHaveLength(1);
        }
    });

    it('send no cross-origin permission', () => {
        for (const file of [...ROUTES, 'lib/poker-night/route-kit.ts']) expect(read(file), file).not.toMatch(/access-control-allow/i);
    });
});

describe('the (play) pages', () => {
    it('live under app/(play)/play/, and no (root) page takes /play', () => {
        for (const file of PLAY_PAGES) expect(file).toMatch(/^app\/\(play\)\/play\//);
        expect(existsSync(join(root, 'app/(root)/play'))).toBe(false);
    });

    it('read a room only through the page gate: a miss spent on an unknown code, every code gone past the counter', () => {
        // The layout, the page and its metadata, each through readTablePage, never the store's reads.
        expect(withoutComments(read('app/(play)/play/[code]/layout.tsx'))).toMatch(/\bawait\s+readTablePage\s*\(/);
        expect(withoutComments(read('app/(play)/play/[code]/page.tsx')).match(/\bawait\s+readTablePage\s*\(/g)).toHaveLength(2);
        for (const file of PLAY_FILES) expect(withoutComments(read(file)), file).not.toMatch(/\bgetRoomBy(Code|Id)\b/);
        const gate = withoutComments(read('lib/poker-night/page-gate.ts'));
        for (const call of [/pnKey\.miss\(/, /\btakeRateLimit\s*\(/, /\bpeekRateLimit\s*\(/, /\bcounterSpent\s*\(/]) expect(gate).toMatch(call);
        expect(reachesMutate(gate)).toBe(false);
    });

    it('show an open table with the feature switched off as the lobby\'s note: after a closed table\'s summary, before the room', () => {
        const page = withoutComments(read('app/(play)/play/[code]/page.tsx'));
        const summary = page.indexOf('<NightSummary');
        const off = page.search(/if\s*\(\s*!pokerNightEnabled\(\)\s*\)/);
        const room = page.indexOf('<PokerNightRoom');
        expect(summary).toBeGreaterThan(-1);
        expect(off).toBeGreaterThan(summary);
        expect(room).toBeGreaterThan(off);
        expect(page.slice(off, room)).toMatch(/POKER_NIGHT_COPY\.off/);
    });
});

describe('the server modules\' logs', () => {
    it('never receive a room, a state or a document', () => {
        for (const file of SERVER_MODULES) {
            expect(existsSync(join(root, file)), file).toBe(true);
            for (const args of consoleArguments(read(file))) expect(args, file).not.toMatch(PRIVATE_ARGUMENT);
        }
    });

    it('reads the arguments of every console call, labels aside', () => {
        const calls = consoleArguments([
            "console.error('a stored state could not be read', fields);",
            'console.log(room);',
            'console.warn(`poker night: ${label}`, {code: doc.code, seq});',
            'console.error("x", fn(a, (b)), state.hand);',
            '// console.error(room);',
        ].join('\n'));
        expect(calls.map((args) => PRIVATE_ARGUMENT.test(args))).toEqual([false, true, true, true]);
        expect(reachesMutate("import {afterCommit, mutateRoom} from '@/lib/poker-night/store';")).toBe(true);
        expect(reachesMutate("import {getRoomById} from '@/lib/poker-night/store';")).toBe(false);
        expect(exportsMethod('export async function GET(request) {}', 'GET')).toBe(true);
        expect(exportsMethod('export async function POST(request) {}', 'GET')).toBe(false);
    });
});
