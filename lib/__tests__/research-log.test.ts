import {describe, expect, it} from 'vitest';
import {readdirSync, readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

// docs/research/log.md is the record of the ideas behind the brains and the research each rests
// on. The code names an entry beside what it built (`Research log R<n>`), so whoever edits a
// constant finds the reason. This holds the log and the code to each other: every entry the code
// names exists, every live or measuring entry is named somewhere in the code, and every entry
// keeps the fields the log promises. Its backticked paths are checked by docs-map.test.ts.
const root = fileURLToPath(new URL('../..', import.meta.url));
const log = readFileSync(`${root}docs/research/log.md`, 'utf8');
const STATUSES = ['live', 'measuring', 'proposed', 'rejected'] as const;

type Entry = {id: number; title: string; body: string; statuses: string[]};

const entries: Entry[] = [...log.matchAll(/^## R(\d+) — (.+)$/gm)].map((match, index, all) => {
    const start = (match.index ?? 0) + match[0].length;
    const end = all[index + 1]?.index ?? log.indexOf('\n## Sources');
    const body = log.slice(start, end);
    const status = /\*\*Status:\*\* ([^·\n]+)/.exec(body)?.[1] ?? '';
    return {id: Number(match[1]), title: match[2], body, statuses: status.split(',').map((s) => s.trim()).filter(Boolean)};
});

const codeFiles = ['lib', 'components', 'database', 'app', 'scripts'].flatMap((dir) =>
    readdirSync(`${root}${dir}`, {recursive: true, encoding: 'utf8'})
        .map((file) => `${dir}/${file.replace(/\\/g, '/')}`)
        .filter((file) => /\.(ts|tsx|mjs)$/.test(file) && !file.includes('node_modules') && !file.includes('__tests__')));
const named = new Map<number, string[]>();
for (const file of codeFiles) {
    for (const match of readFileSync(`${root}${file}`, 'utf8').matchAll(/research log R(\d+)/gi)) {
        const id = Number(match[1]);
        named.set(id, [...(named.get(id) ?? []), file]);
    }
}

describe('the research log', () => {
    it('numbers its entries R1, R2, … with none skipped or repeated', () => {
        expect(entries.length).toBeGreaterThanOrEqual(1);
        expect(entries.map((entry) => entry.id)).toEqual(entries.map((_, index) => index + 1));
    });

    it('gives every entry a known status, a date, its evidence and what decides it', () => {
        for (const entry of entries) {
            const where = `R${entry.id} ${entry.title}`;
            expect(entry.statuses.length, where).toBeGreaterThan(0);
            for (const status of entry.statuses) expect(STATUSES as readonly string[], where).toContain(status);
            expect(entry.body, where).toMatch(/\*\*Logged:\*\* \d{4}-\d{2}-\d{2}/);
            expect(entry.body, where).toMatch(/\*\*Idea\.\*\*/);
            expect(entry.body, where).toMatch(/\*\*Evidence\.\*\*/);
            expect(entry.body, where).toMatch(/\*\*(Measured by|Decision rule|Would build it|Changes it)\.\*\*/);
        }
    });

    it('lists every entry in its index, with the same status', () => {
        for (const entry of entries) {
            const row = new RegExp(`^\\| R${entry.id} \\|.*\\| ([^|]+) \\|$`, 'm').exec(log);
            expect(row, `R${entry.id}`).not.toBeNull();
            expect(row?.[1].split(',').map((s) => s.trim()), `R${entry.id}`).toEqual(entry.statuses);
        }
    });

    it('has an entry for every one the code names', () => {
        const ids = new Set(entries.map((entry) => entry.id));
        for (const [id, files] of named) expect(ids.has(id), `R${id} named in ${files.join(', ')}`).toBe(true);
    });

    it('is named in the code for every idea that is live or being measured', () => {
        for (const entry of entries.filter((e) => e.statuses.some((s) => s === 'live' || s === 'measuring'))) {
            expect(named.has(entry.id), `R${entry.id} ${entry.title}`).toBe(true);
        }
    });

    it('cites every source with a link, or says it could not confirm one', () => {
        const sources = log.slice(log.indexOf('\n## Sources')).split('\n').filter((line) => /^\d+\. /.test(line));
        expect(sources.length).toBeGreaterThan(0);
        const blocks = log.slice(log.indexOf('\n## Sources')).split(/\n(?=\d+\. )/).slice(1);
        for (const block of blocks) expect(block, block.slice(0, 60)).toMatch(/https:\/\/|not confirmed by this\s+log|McGraw-Hill/);
    });
});
