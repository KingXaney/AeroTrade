import {describe, expect, it} from 'vitest';
import {readdirSync, readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

// The app's faces are declared in one file, the root layout (next/font/local over app/fonts), and
// used through another, the stylesheet, whose type tokens read the variables the declarations
// write. Nothing ties the two together when the app is built. A token that reads a variable no
// declaration writes is no error: its text falls back to another face (its parent's, or the
// system's) and nothing says so. A face no token reads is none either: it is still sent to every
// reader — preloaded, on every page — who never sees it, which is how the body face once arrived
// late while an unused one arrived first. This reads both files and the fonts folder, and holds
// them to each other.
const path = (relative: string): string => fileURLToPath(new URL(`../../../${relative}`, import.meta.url));
const layout = readFileSync(path('app/layout.tsx'), 'utf8');
// The stylesheet without its comments: a variable named in one is read by nothing.
const css = readFileSync(path('app/globals.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

// A face as the layout declares it: the constant it is kept in, the CSS variable it writes, the
// files it names in app/fonts (a variable face names its one file once per weight) and the
// declaration's own text.
type Face = {name: string; variable: string; files: string[]; body: string};
const FACES: Face[] = [...layout.matchAll(/const (\w+) = localFont\(\{([\s\S]*?)\n\}\);/g)].map(([, name, body]) => ({
    name,
    variable: body.match(/variable:\s*"(--font-[a-z-]+)"/)?.[1] ?? '',
    files: [...new Set([...body.matchAll(/path:\s*"\.\/fonts\/([^"]+)"/g)].map((match) => match[1]))],
    body,
}));
const sorted = (values: Iterable<string>): string[] => [...new Set(values)].sort();

describe("the app's faces (app/layout.tsx, app/fonts and the type tokens in app/globals.css)", () => {
    // A declaration written in another shape would hide from every check below.
    it('are all read here: every localFont call, with its variable and its files', () => {
        expect(FACES.length).toBe(layout.split('localFont(').length - 1);
        for (const face of FACES) {
            expect(face.variable, face.name).not.toBe('');
            expect(face.files.length, face.name).toBeGreaterThan(0);
        }
    });

    it('are three: Sora for headings, Inter for the body, JetBrains Mono for figures', () => {
        const tokens = [...css.matchAll(/(--type-[a-z]+):\s*var\((--font-[a-z-]+)\)/g)].map((match) => `${match[1]}: ${match[2]}`);
        expect(sorted(tokens)).toEqual(['--type-body: --font-inter', '--type-display: --font-sora', '--type-mono: --font-jetbrains']);
        expect(sorted(FACES.map((face) => face.variable))).toEqual(['--font-inter', '--font-jetbrains', '--font-sora']);
    });

    // Tailwind's own three font tokens — the ones behind the font-sans, font-mono and font-heading
    // utilities, in the stylesheet's @theme inline block — share the faces' prefix. The stylesheet
    // defines those itself, from the type tokens, so they are no face's to write; every other
    // variable of that prefix it reads must be one a declaration writes, and the other way round.
    // (They are not spelled out here on purpose. Tailwind scans this file like any other, and a
    // theme variable named anywhere in a scanned file, a comment included, counts as used: it is
    // then written into the compiled sheet's :root.)
    it('write every variable the stylesheet reads, and none it does not read', () => {
        const defined = new Set([...css.matchAll(/(--font-[a-z-]+)\s*:/g)].map((match) => match[1]));
        const read = [...css.matchAll(/var\(\s*(--font-[a-z-]+)/g)].map((match) => match[1]).filter((variable) => !defined.has(variable));
        expect(sorted(read)).toEqual(sorted(FACES.map((face) => face.variable)));
    });

    // The type tokens are :root's, so a face's variable is of use only on <html> itself.
    it('each put their variable on <html>', () => {
        const stamped = layout.match(/const fontClasses = \[([^\]]*)\]/)?.[1].split(',').map((name) => name.trim()).filter(Boolean) ?? [];
        expect(sorted(stamped)).toEqual(sorted(FACES.map((face) => face.name)));
    });

    // next/font preloads a face unless its declaration says otherwise. The three draw the app's
    // headings, body text and figures, so none should wait for the stylesheet to be read: with the
    // body face left out, a page's text was drawn in the fallback and then again in Inter.
    it('are all preloaded', () => {
        for (const face of FACES) expect(face.body, face.name).not.toMatch(/\bpreload\s*:\s*false\b/);
    });

    // The SIL Open Font License asks that its text travel with every copy of a font: one licence a
    // family, named for it (inter-latin.woff2, inter-OFL.txt). A file no face names is dead weight
    // in the repository, and a licence without its font says the app ships what it does not.
    it('ship exactly the files they name, each family beside its licence', () => {
        // What a folder holds for the repository: a dot file (the Finder's .DS_Store) is not in it.
        const entries = (folder: string): string[] => readdirSync(path(folder)).filter((entry) => !entry.startsWith('.'));
        const files = entries('app/fonts').filter((entry) => entry !== 'licenses');
        expect(sorted(files)).toEqual(sorted(FACES.flatMap((face) => face.files)));
        const licences = files.map((file) => `${file.replace(/-latin(-\d+)?\.woff2$/, '')}-OFL.txt`);
        expect(sorted(entries('app/fonts/licenses'))).toEqual(sorted(licences));
    });
});
