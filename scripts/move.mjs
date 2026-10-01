#!/usr/bin/env node
// Move files or folders and rewrite every reference to them, in one step.
//
//   node scripts/move.mjs moves.json          apply
//   node scripts/move.mjs moves.json --dry    print what would change, touch nothing
//
// moves.json maps old paths to new ones, relative to the repo root:
//   {"lib/nodemailer/": "lib/email/", "lib/trading/income.ts": "lib/income/accrual.ts"}
// A key ending in "/" moves a whole folder; a file listed on its own wins over its folder's move.
//
// Each move is a `git mv`. Then every tracked text file is rewritten wherever it names a moved
// path: "@/lib/old/thing" specifiers in imports, vi.mock and import() calls; root-relative paths in
// scripts ("${ROOT}lib/old/thing.ts", "../lib/old/thing.ts"); and mentions in docs and comments,
// with or without the extension. This is exact because the app imports only through the "@/"
// alias (AGENTS.md) — a relative "./x" import would not be followed, so the script refuses to run
// while any source file has one. Afterwards run `npm run check` and `npm run build:check`.

import {execFileSync} from 'node:child_process';
import {existsSync, mkdirSync, readFileSync, readdirSync, rmdirSync, writeFileSync} from 'node:fs';
import {dirname, extname} from 'node:path';

const [mapPath, flag] = process.argv.slice(2);
if (!mapPath) {
    console.error('usage: node scripts/move.mjs moves.json [--dry]');
    process.exit(2);
}
const dry = flag === '--dry';
const git = (...args) => execFileSync('git', args, {encoding: 'utf8'});
const tracked = git('ls-files').split('\n').filter(Boolean);
const trackedSet = new Set(tracked);

const SOURCE = /\.(ts|tsx|mjs|js|cjs|mts)$/;
const TEXT = /\.(ts|tsx|mjs|js|cjs|mts|md|json|css|yml|yaml|sh)$/;
const SKIP = new Set(['package-lock.json', 'scripts/qa/package-lock.json']);

const relative = tracked.filter((file) => SOURCE.test(file) && existsSync(file))
    .filter((file) => /(?:from\s+|import\(\s*)['"]\.\.?\//.test(readFileSync(file, 'utf8')));
const relativeOutsideScripts = relative.filter((file) => !file.startsWith('scripts/'));
if (relativeOutsideScripts.length > 0) {
    console.error(`relative imports would not be rewritten — switch these to "@/" first:\n  ${relativeOutsideScripts.join('\n  ')}`);
    process.exit(1);
}

// ---- expand the map into file moves -------------------------------------------------------
const raw = JSON.parse(readFileSync(mapPath, 'utf8'));
const fileMoves = new Map();
const dirMoves = [];
for (const [from, to] of Object.entries(raw)) {
    if (from.endsWith('/')) {
        if (!to.endsWith('/')) throw new Error(`folder move needs a folder target: ${from} → ${to}`);
        dirMoves.push([from.slice(0, -1), to.slice(0, -1)]);
        for (const file of tracked.filter((f) => f.startsWith(from))) {
            if (!(file in raw)) fileMoves.set(file, to + file.slice(from.length));
        }
    }
}
for (const [from, to] of Object.entries(raw)) {
    if (from.endsWith('/')) continue;
    if (!trackedSet.has(from)) throw new Error(`not a tracked file: ${from}`);
    fileMoves.set(from, to);
}
const targets = new Set();
for (const [from, to] of fileMoves) {
    if (targets.has(to)) throw new Error(`two files move to ${to}`);
    if (trackedSet.has(to) && !fileMoves.has(to)) throw new Error(`target exists: ${to} (from ${from})`);
    targets.add(to);
}

// ---- the rewrite: one pass, longest old path first, so nothing is rewritten twice ----------
const stripExt = (path) => path.slice(0, path.length - extname(path).length);
const replacements = new Map(); // old text → new text
for (const [from, to] of fileMoves) {
    replacements.set(from, to);
    // "@/lib/x/thing" and prose without the extension. An index file is named by its folder.
    const fromBase = stripExt(from).replace(/\/index$/, '');
    const toBase = stripExt(to).replace(/\/index$/, '');
    if (!replacements.has(fromBase)) replacements.set(fromBase, toBase);
}
for (const [from, to] of dirMoves) if (!replacements.has(from)) replacements.set(from, to);

const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const olds = [...replacements.keys()].sort((a, b) => b.length - a.length);
// Starts at a path boundary: line start, a non-path character, or right after "@/", "./",
// "../" or "}" (the "${ROOT}" prefix the QA suites use). Ends where the path ends: never in the
// middle of a longer name such as "feed" inside "feed-store".
const pattern = new RegExp(`(?<=^|[^\\w.\\-/]|@/|\\./|\\.\\./|\\})(${olds.map(escape).join('|')})(?![\\w\\-])`, 'gm');

const rewrite = (text) => text.replace(pattern, (match) => replacements.get(match) ?? match);

// ---- apply ------------------------------------------------------------------------------------
const changed = [];
for (const file of tracked) {
    if (SKIP.has(file) || !TEXT.test(file) || !existsSync(file)) continue;
    const before = readFileSync(file, 'utf8');
    const after = rewrite(before);
    if (after !== before) {
        changed.push([file, (before.match(pattern) ?? []).length]);
        if (!dry) writeFileSync(file, after);
    }
}
for (const [from, to] of fileMoves) {
    if (dry) continue;
    mkdirSync(dirname(to), {recursive: true});
    git('mv', from, to);
}
// git does not track folders: drop the ones the moves emptied.
const pruneEmpty = (dir) => {
    if (!existsSync(dir) || dir === '.' || dir === '') return;
    if (readdirSync(dir).length === 0) {
        rmdirSync(dir);
        pruneEmpty(dirname(dir));
    }
};
if (!dry) for (const from of fileMoves.keys()) pruneEmpty(dirname(from));

console.log(`${dry ? 'would move' : 'moved'} ${fileMoves.size} file(s); ${dry ? 'would rewrite' : 'rewrote'} references in ${changed.length} file(s):`);
for (const [file, count] of changed) console.log(`  ${file} (${count})`);
if (relative.length > 0) console.log(`\nnote: relative imports in ${relative.join(', ')} were matched only by their root-relative tail; check them.`);
console.log(dry ? '\n(dry run — nothing written)' : '\nnext: npm run check && npm run build:check');
