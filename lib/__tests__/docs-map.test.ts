import {describe, expect, it} from 'vitest';
import {existsSync, readdirSync, readFileSync, statSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

// docs/MAP.md and AGENTS.md tell people and agents where to look. A file moved without them
// leaves a map that points at nothing — and nobody notices, because nothing reads it. This reads
// both and checks every backticked repo path against the tree.
//
// What counts as a path: a token inside backticks that starts with one of ROOTS. It may leave
// off its extension (`lib/trading/ledger`), name a symbol after a dot
// (`lib/trading/ledger.getTradeLedger` — then the file must mention that symbol), use a
// <placeholder> segment (`lib/<feature>/types.ts` — then at least one file must match), or a
// literal Next segment (`app/(root)/stocks/[symbol]`). Globs (`lib/**/__tests__`) are skipped.
const root = fileURLToPath(new URL('../..', import.meta.url));
const DOCS = ['docs/MAP.md', 'AGENTS.md'];
const ROOTS = ['app', 'components', 'lib', 'database', 'scripts', 'docs'];
const EXTENSIONS = ['', '.ts', '.tsx', '.mjs'];
const PATH = new RegExp(`^(${ROOTS.join('|')})/`);
const IDENTIFIER = /^(.*)\.([A-Za-z_$][\w$]*)$/;

const tree = ROOTS.flatMap((dir) =>
    readdirSync(`${root}${dir}`, {recursive: true, encoding: 'utf8'})
        // Windows lists nested entries with backslashes; the docs write forward slashes.
        .map((f) => `${dir}/${f.replace(/\\/g, '/')}`)
        .filter((f) => !f.includes('node_modules')));

const pathsIn = (markdown: string): string[] =>
    [...markdown.matchAll(/`([^`\n]+)`/g)]
        .flatMap(([, span]) => span.split(/\s+/))
        .map((token) => token.replace(/[,;:)]+$/, ''))
        .filter((token) => PATH.test(token) && !token.includes('*'));

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Why `path` does not resolve, or null when it does.
const problemWith = (path: string): string | null => {
    if (/<[a-z]+>/.test(path)) {
        const pattern = new RegExp(`^${escape(path.replace(/\/$/, '')).replace(/<[a-z]+>/g, '[^/]+')}(\\.(ts|tsx|mjs))?$`);
        return tree.some((file) => pattern.test(file)) ? null : 'no file matches';
    }
    let candidate = path.replace(/\/$/, '');
    const symbols: string[] = [];
    // A path may carry up to two dotted names (`lib/actions/learn.actions.recordQuizAnswer`).
    for (let attempt = 0; attempt < 3; attempt++) {
        const file = EXTENSIONS.map((ext) => `${root}${candidate}${ext}`).find((full) => existsSync(full));
        if (file) {
            if (symbols.length === 0 || !statSync(file).isFile()) return null;
            const text = readFileSync(file, 'utf8');
            const missing = symbols.filter((symbol) => !new RegExp(`\\b${escape(symbol)}\\b`).test(text));
            return missing.length === 0 ? null : `does not mention ${missing.join(', ')}`;
        }
        const dotted = candidate.match(IDENTIFIER);
        if (!dotted) break;
        candidate = dotted[1];
        symbols.unshift(dotted[2]);
    }
    return 'does not exist';
};

describe('the repo map points at files that exist', () => {
    it.each(DOCS)('every path in %s resolves', (doc) => {
        const paths = pathsIn(readFileSync(`${root}${doc}`, 'utf8'));
        expect(paths.length).toBeGreaterThan(40);
        const broken = paths.flatMap((path) => {
            const problem = problemWith(path);
            return problem ? [`${path} — ${problem}`] : [];
        });
        expect(broken).toEqual([]);
    });

    it('reads paths the way the docs write them', () => {
        expect(pathsIn('see `lib/trading/ledger.getTradeLedger`, `npm run qa` and `node scripts/move.mjs moves.json`'))
            .toEqual(['lib/trading/ledger.getTradeLedger', 'scripts/move.mjs']);
        expect(pathsIn('`lib/**/__tests__` only')).toEqual([]);
    });

    it('resolves extensions, symbols, placeholders and Next segments', () => {
        expect(problemWith('lib/trading/ledger')).toBeNull();
        expect(problemWith('lib/trading/ledger.getTradeLedger')).toBeNull();
        expect(problemWith('lib/actions/learn.actions.recordQuizAnswer')).toBeNull();
        expect(problemWith('lib/<feature>/types.ts')).toBeNull();
        expect(problemWith('scripts/qa/qa-<feature>.mjs')).toBeNull();
        expect(problemWith('app/(root)/stocks/[symbol]/page.tsx')).toBeNull();
        expect(problemWith('components/primitives/')).toBeNull();
    });

    it('still catches a moved file, a renamed symbol and a placeholder that matches nothing', () => {
        expect(problemWith('lib/learn/quiz-read')).toBe('does not exist');
        expect(problemWith('lib/strategies/queries.getLatestRun')).toBe('does not exist');
        expect(problemWith('lib/trading/ledger.getTradeLedgr')).toBe('does not mention getTradeLedgr');
        expect(problemWith('lib/<feature>/no-such-module.ts')).toBe('no file matches');
    });
});
