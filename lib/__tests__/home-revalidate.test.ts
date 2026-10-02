import {describe, expect, it} from 'vitest';
import {readdirSync, readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

// Home (/) and the widget dashboard (/dashboard) draw the same rows — accounts, topics, the
// first-week list. A Server Action's revalidatePath refreshes only the path it names, so an
// action that refreshes one and not the other leaves the other showing what was true before
// the click. This keeps the two together.
describe('an action that revalidates Home revalidates the dashboard', () => {
    const dir = fileURLToPath(new URL('../actions/', import.meta.url));
    const files = readdirSync(dir).filter((f) => f.endsWith('.actions.ts'));

    it.each(files)('%s', (file) => {
        const lines = readFileSync(`${dir}${file}`, 'utf8').split(/\r?\n/).map((l) => l.trim());
        lines.forEach((line, i) => {
            if (line === "revalidatePath('/');") expect(lines[i + 1], `${file}:${i + 1}`).toBe("revalidatePath('/dashboard');");
        });
    });

    it('still sees the pair where it is written', () => {
        expect(files.length).toBeGreaterThan(5);
        const all = files.map((f) => readFileSync(`${dir}${f}`, 'utf8')).join('\n');
        expect(all).toContain("revalidatePath('/dashboard');");
    });
});
