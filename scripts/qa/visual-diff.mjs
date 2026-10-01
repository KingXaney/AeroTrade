// Compare two folders of screenshots (e.g. visual-sweep.mjs or the suites' ./output run on a base
// and on a change), image by image: same path in both, pixel-compared with a small colour
// tolerance. Prints the share of pixels that differ per image, worst first, writes a red-on-grey
// diff image beside each changed one in <out>, and exits 1 when any image differs by more than
// --max (default 0.1 %) or changed size. Images only in one folder are listed, not failed.
//
//   node visual-diff.mjs <before-dir> <after-dir> [--out diffs/] [--max 0.1]
import {existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync} from 'node:fs';
import {dirname, join, relative} from 'node:path';
import pixelmatch from 'pixelmatch';
import {PNG} from 'pngjs';

const args = process.argv.slice(2);
const [before, after] = args.filter((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--'));
const opt = (name, fallback) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : fallback; };
const outDir = opt('out', join(after ?? '.', '..', 'diffs'));
const maxPct = Number(opt('max', '0.1'));
if (!before || !after) {
    console.error('usage: node visual-diff.mjs <before-dir> <after-dir> [--out dir] [--max pct]');
    process.exit(2);
}

const pngs = (root) => {
    const found = [];
    const walk = (dir) => {
        for (const name of readdirSync(dir)) {
            const path = join(dir, name);
            if (statSync(path).isDirectory()) walk(path);
            else if (name.endsWith('.png')) found.push(relative(root, path));
        }
    };
    walk(root);
    return found;
};

const a = new Set(pngs(before));
const b = new Set(pngs(after));
const rows = [];
for (const rel of [...a].filter((p) => b.has(p)).sort()) {
    const x = PNG.sync.read(readFileSync(join(before, rel)));
    const y = PNG.sync.read(readFileSync(join(after, rel)));
    if (x.width !== y.width || x.height !== y.height) {
        rows.push({rel, pct: 100, note: `size ${x.width}×${x.height} → ${y.width}×${y.height}`});
        continue;
    }
    const diff = new PNG({width: x.width, height: x.height});
    const changed = pixelmatch(x.data, y.data, diff.data, x.width, x.height, {threshold: 0.1});
    const pct = (changed / (x.width * x.height)) * 100;
    if (changed > 0) {
        const path = join(outDir, rel);
        mkdirSync(dirname(path), {recursive: true});
        writeFileSync(path, PNG.sync.write(diff));
    }
    rows.push({rel, pct, note: changed ? `${changed} px` : ''});
}
rows.sort((p, q) => q.pct - p.pct);
for (const r of rows) console.log(`${r.pct.toFixed(3).padStart(8)} %  ${r.rel}${r.note ? `  (${r.note})` : ''}`);
const onlyBefore = [...a].filter((p) => !b.has(p));
const onlyAfter = [...b].filter((p) => !a.has(p));
if (onlyBefore.length) console.log(`\nonly in before: ${onlyBefore.join(', ')}`);
if (onlyAfter.length) console.log(`only in after: ${onlyAfter.join(', ')}`);
const over = rows.filter((r) => r.pct > maxPct);
console.log(`\n${rows.length} compared, ${rows.filter((r) => r.pct > 0).length} differ, ${over.length} over ${maxPct} %${existsSync(outDir) ? ` — diff images in ${outDir}` : ''}`);
process.exit(over.length ? 1 : 0);
