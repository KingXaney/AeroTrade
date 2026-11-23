import {describe, expect, it} from 'vitest';
import {existsSync, readdirSync, readFileSync, statSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

// docs/MAP.md, AGENTS.md and the feature contracts in .claude/rules/ tell people and agents where
// to look. A file moved without them leaves a map that points at nothing — and nobody notices,
// because nothing reads it. This reads them all and checks every backticked repo path against the
// tree.
//
// What counts as a path: a token inside backticks that starts with one of ROOTS. It may leave
// off its extension (`lib/trading/ledger`), name a symbol after a dot
// (`lib/trading/ledger.getTradeLedger` — then the file must mention that symbol), use a
// <placeholder> segment (`lib/<feature>/types.ts` — then at least one file must match), or a
// literal Next segment (`app/(root)/stocks/[symbol]`). Globs (`lib/**/__tests__`) are skipped.
const root = fileURLToPath(new URL('../..', import.meta.url));
// The contracts a map cannot show, one path-scoped file per feature (AGENTS.md, "Where things live").
const RULES_DIR = '.claude/rules';
const RULE_FILES = readdirSync(`${root}${RULES_DIR}`).filter((name) => name.endsWith('.md')).sort().map((name) => `${RULES_DIR}/${name}`);
const DOCS = ['docs/MAP.md', 'AGENTS.md', 'docs/research/log.md', ...RULE_FILES];
// Fewer paths than this and a doc's paths have stopped being read (a broken matcher, a moved file).
// A rule file names at least one.
const MIN_PATHS: Record<string, number> = {'docs/MAP.md': 40, 'AGENTS.md': 25, 'docs/research/log.md': 10};
// A rule file loads when a file its `paths:` name is opened, and Claude Code then reads at most
// this many characters of it (https://code.claude.com/docs/en/memory, the 200K-context limit);
// AGENTS.md loads whole into every session, so it is held shorter still.
const RULE_CHARS_MAX = 40_000;
const AGENTS_CHARS_MAX = 30_000;
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

// A rule file's globs: the quoted entries of the `paths:` list in its frontmatter.
const globsOf = (markdown: string): string[] => {
    const frontmatter = markdown.match(/^---\n([\s\S]*?)\n---\n/)?.[1] ?? '';
    const list = frontmatter.match(/^paths:\n((?:[ \t]+- .*\n?)+)/m)?.[1] ?? '';
    return [...list.matchAll(/^[ \t]+- ["']?([^"'\n]+)["']?[ \t]*$/gm)].map(([, glob]) => glob);
};

// The globs the rule files use: `**` crosses folders, `*` stays inside one name, the rest is literal.
const globPattern = (glob: string): RegExp =>
    new RegExp(`^${glob.split('**').map((part) => part.split('*').map(escape).join('[^/]*')).join('.*')}$`);

// Every file in the repo, for the globs: they also name root files and folders outside ROOTS.
const repoFiles = (dir = ''): string[] => readdirSync(`${root}${dir}`, {withFileTypes: true}).flatMap((entry) => {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) return [];
    const path = dir ? `${dir}/${entry.name}` : entry.name;
    return entry.isDirectory() ? repoFiles(path) : [path];
});

// Why `path` does not resolve, or null when it does.
const problemWith = (path: string): string | null => {
    if (/<[a-z]+>/.test(path)) {
        const pattern = new RegExp(`^${escape(path.replace(/\/$/, '')).replace(/<[a-z]+>/g, '[^/]+')}(\\.(ts|tsx|mjs))?$`);
        return tree.some((file) => pattern.test(file)) ? null : 'no file matches';
    }
    let candidate = path.replace(/\/$/, '');
    const symbols: string[] = [];
    // A path may carry up to two dotted names (`lib/actions/learn.actions.markLessonSeen`).
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
        expect(paths.length).toBeGreaterThan(MIN_PATHS[doc] ?? 0);
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
        expect(problemWith('lib/actions/learn.actions.markLessonSeen')).toBeNull();
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

describe('the feature contracts load beside the files they are about', () => {
    const agents = readFileSync(`${root}AGENTS.md`, 'utf8');
    const files = repoFiles();

    it('names every rule file in AGENTS.md, and no file that is not there', () => {
        const indexed = [...agents.matchAll(/\]\((\.claude\/rules\/[\w-]+\.md)\)/g)].map(([, file]) => file).sort();
        expect(indexed).toEqual(RULE_FILES);
        expect(RULE_FILES.length).toBeGreaterThan(20);
    });

    it.each(RULE_FILES)('%s opens with globs, each matching a file', (file) => {
        const globs = globsOf(readFileSync(`${root}${file}`, 'utf8'));
        expect(globs.length).toBeGreaterThan(0);
        expect(globs.filter((glob) => !files.some((path) => globPattern(glob).test(path)))).toEqual([]);
    });

    it.each(RULE_FILES)('%s is no longer than what loads on demand', (file) => {
        expect(readFileSync(`${root}${file}`, 'utf8').length).toBeLessThanOrEqual(RULE_CHARS_MAX);
    });

    it('keeps AGENTS.md short: every session reads all of it', () => {
        expect(agents.length).toBeLessThanOrEqual(AGENTS_CHARS_MAX);
    });

    it("reads a rule file's globs and matches them as written", () => {
        expect(globsOf('---\npaths:\n  - "lib/a/**"\n  - "app/(root)/b/**"\n---\n\n# a\n')).toEqual(['lib/a/**', 'app/(root)/b/**']);
        expect(globsOf('# no frontmatter\n\npaths:\n  - "lib/a/**"\n')).toEqual([]);
        expect(globPattern('lib/a/**').test('lib/a/b/c.ts')).toBe(true);
        expect(globPattern('lib/a/**').test('lib/ab/c.ts')).toBe(false);
        expect(globPattern('app/(root)/trade/**').test('app/(root)/trade/page.tsx')).toBe(true);
        expect(globPattern('database/models/culture-*.model.ts').test('database/models/culture-item.model.ts')).toBe(true);
        expect(globPattern('database/models/culture-*.model.ts').test('database/models/old/culture-item.model.ts')).toBe(false);
        expect(globPattern('proxy.ts').test('proxy.ts')).toBe(true);
    });
});
