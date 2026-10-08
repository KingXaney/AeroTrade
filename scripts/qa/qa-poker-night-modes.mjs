// Poker night modes, batch A (P1–P3), the way players meet it — on phones first.
//
// Home's way in: a new account's Home has the poker night chip and no panel; once it has a table
// the panel lists it with Rejoin, which opens the table, and after the host leaves their seat the
// row is an Open. The lobby's Hands tab (?tab=hands) and the table's Hands drawer (the menu, and H).
//
// The way out: the top bar's "Back to AeroTrade" — a plain link to "/" for a visitor or a watcher (a
// guest lands on the landing page, never /sign-in; an account on Home) and, for a seated player, the
// leave dialog first: "Leave the table?" between hands, "Leave in the middle of a hand?" mid-hand,
// Stay keeping everything as it was, the label following the deal that lands while it is open, and
// "Leave and go" / "Leave now and go" leaving and loading "/". The break: after a showdown the dock
// offers Show cards, Sit out and Leave; Leave is one tap, and tapped a moment before the next deal
// falls due it still lands first — the leaver is never dealt in, so no ante or blind of theirs is
// posted (the other pages' ticks held until the leave is answered). After leaving, the dock's left
// panel: the net, Home, "Sit down again" (which seats them again) and, for an account, the lobby.
//
// The folded hand: a viewer who folds keeps their own two cards in the dock, face up, dimmed and
// tagged "Folded" (face down while Peek is on), while every other screen sees them go to the muck;
// no other context's API answer, page HTML or RSC payload ever carries them; and in the results
// pause "Show my cards" turns them up on every screen. The host's sit-out from the Bank: "Sit out
// next hand" mid-hand on a line of its own under the player's row, then a note that it waits (no
// take-back: dealing a player in is theirs alone), the host drawer's More menu agreeing, the player
// sitting out from the next deal with "The host sat you out." and back in with "I'm back". A player
// who folds: "Sit out" says it waits beside the cards and "Deal me in" takes it back; Leave says they
// leave when the hand ends and offers nothing more, Home going straight home. The tap shield: a tap
// that lands as the action bar, the early choices or the pause's buttons appear does nothing. The
// reconnecting pill and "Back online.", the top bar's code on one line. Home's chip, "Rejoin your
// table" while seated. The emote picker's thirteen faces at 390 and 320.
//
// Side pots: a table of four whose stacks (seeded in Mongo) make a main pot and two side pots — on the
// flop and the turn, a seated phone and a watching one at every size below and on the smaller phones
// on their side (667×375, 568×320), and through the run-out and the payout six screens at once — every
// pot's pill (lib/poker-night/stage.potPlan) measured against every card (the board's and its lit
// cards' lift, the dock's, a seat's pair or turned-up hand), plate, flag, blind's mark, open seat, bet
// line, the dealer button, a winner's "+N" while it shows, the banner and the line under it: none
// touches; on the felt at every size below; each pot's words at 11 px or more, unclipped, on screen;
// and the banner and the line under it clear of the "+N" (sidepot-*.png).
//
// Every surface at 390×844, 375×667, 320×568 and on its side at 844×390: nothing scrolls sideways,
// every target is at least 44 px, nothing overlaps. The no-advice list (and the poker night copy's
// own rules: no sentence opening on Hold, Buy or Sell, no currency word) over every new surface.
// Screenshots in scripts/qa/output/poker-night-modes/.
// Run: npm run qa -- poker-night-modes   (the harness: README.md)
import {chromium} from 'playwright';
import {MongoClient} from 'mongodb';
import {createJiti} from 'jiti';
import {randomUUID} from 'node:crypto';
import {BASE, MONGO, REPO_ROOT, check, note, outDir, signUp, summary} from './lib.mjs';

const OUT = outDir('poker-night-modes');
const jiti = createJiti(import.meta.url, {alias: {'@': REPO_ROOT.replace(/\/$/, '')}, fsCache: false});
const lib = (path) => jiti.import(`${REPO_ROOT}${path}`);
const {PN_PROTOCOL} = await lib('lib/poker-night/http.ts');
const {TAP_SHIELD_MS} = await lib('lib/poker-night/keys.ts');
const {cardLabel} = await lib('lib/poker/cards.ts');
const {findBanned, stripProhibitions} = await lib('lib/learn/banned.ts');
const {TABLE_COPY, HOST_COPY, HANDS_COPY, HOME_PANEL_COPY, POKER_NIGHT_COPY, FELT_COPY} = await lib('lib/learn/copy/poker-night.ts');
const {legalFor, snapshotFromState} = await lib('lib/poker-night/betting.ts');
const {livePots} = await lib('lib/poker-night/views.ts');

const ENV = 'development'; // the harness sets no VERCEL_ENV
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const DESKTOP = {viewport: {width: 1440, height: 900}};
const PHONE = (width, height) => ({viewport: {width, height}, isMobile: true, hasTouch: true});
const SIZES = [{width: 390, height: 844}, {width: 375, height: 667}, {width: 320, height: 568}, {width: 844, height: 390}];
const sizeName = (s) => `${s.width}×${s.height}`;
const sizeFile = (s) => `${s.width}x${s.height}`;
const sameCards = (a, b) => Array.isArray(a) && Array.isArray(b) && a.length === b.length && [...a].sort((x, y) => x - y).join() === [...b].sort((x, y) => x - y).join();
const labels = (cards) => cards.map((c) => cardLabel(c)).sort().join(' ');

const browser = await chromium.launch({channel: 'chrome'});
const mongo = new MongoClient(MONGO);
let db;
let rooms;
let code = null;
const roomDoc = () => rooms.findOne({env: ENV, code});
const waitDoc = async (ok, timeout = 15000, every = 150) => {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
        const doc = await roomDoc();
        if (doc && ok(doc)) return doc;
        await sleep(every);
    }
    return null;
};
const seatIndex = (doc, p) => doc?.state?.seats.findIndex((s) => s?.pid === p.pid) ?? -1;
const handSeat = (doc, p) => doc?.state?.hand?.seats.find((s) => s.pid === p.pid) ?? null;
const ledgerRow = (doc, p) => doc?.state?.ledger.find((r) => r.pid === p.pid) ?? null;

// ── what every screen is held to ─────────────────────────────────────────────────────────────

// Every data-anim a page shows, with the seat or the dock it sits in: an init script, so nothing
// that comes and goes between two looks is missed.
const ANIM_PROBE = () => {
    const seen = [];
    window.__pnAnims = seen;
    const record = (node) => {
        if (!(node instanceof Element)) return;
        for (const el of [node, ...node.querySelectorAll('[data-anim]')]) {
            const anim = el.getAttribute('data-anim');
            if (anim) seen.push({anim, seat: el.closest('[data-seat]')?.getAttribute('data-seat') ?? null, dock: el.closest('[data-pn-dock]') !== null, at: Date.now()});
        }
    };
    new MutationObserver((records) => {
        for (const r of records) {
            if (r.type === 'attributes') record(r.target);
            else r.addedNodes.forEach(record);
        }
    }).observe(document, {subtree: true, childList: true, attributes: true, attributeFilter: ['data-anim']});
};

// Every toast a page shows, as it reads once filled in: an init script, so a toast that has come and
// gone before a check looks is still on the record (window.__pnToasts).
const TOAST_PROBE = () => {
    const seen = [];
    window.__pnToasts = seen;
    const look = () => {
        for (const el of document.querySelectorAll('[data-sonner-toast]')) {
            if (!el.__pnToast) {
                el.__pnToast = {text: '', at: Date.now()};
                seen.push(el.__pnToast);
            }
            el.__pnToast.text = el.textContent ?? '';
        }
    };
    new MutationObserver(look).observe(document, {subtree: true, childList: true, characterData: true});
};
const toasted = (page, text, timeout = 10000) => page.waitForFunction((t) => window.__pnToasts.some((x) => x.text.includes(t)), text, {timeout})
    .then(() => true, () => false);

const players = [];
const pageErrors = [];
// One browser context per person, its page's answers from the table's API kept for the scans.
const newPlayer = async (name, options) => {
    const context = await browser.newContext(options);
    await context.addInitScript(ANIM_PROBE);
    await context.addInitScript(TOAST_PROBE);
    const page = await context.newPage();
    const p = {name, context, page, pid: null, bodies: [], gone: false};
    page.on('pageerror', (e) => pageErrors.push(`${name}: ${String(e).slice(0, 300)}`));
    page.on('response', async (res) => {
        const url = res.url();
        if (!code || !url.includes(`/api/poker-night/${code}/`)) return;
        try {
            p.bodies.push({url, at: Date.now(), body: await res.json()});
        } catch {
            // Not JSON (a 204, an aborted read).
        }
    });
    players.push(p);
    return p;
};
const hideDevIndicator = (page) => page.addStyleTag({content: 'nextjs-portal{display:none!important}'}).catch(() => {});
const shot = async (page, name) => {
    await sleep(450);
    await hideDevIndicator(page);
    await page.screenshot({path: `${OUT}${name}.png`}).catch(() => {});
};
const resize = async (page, size, settle = 700) => {
    await page.setViewportSize(size);
    await sleep(settle);
};

// The words a surface shows (players' and tables' names left out: [data-user-text]) against the
// no-advice list, and the poker night copy's own rules: no sentence or label opening on Hold, Buy
// or Sell, no currency word (play chips have no cash value).
const OPENERS = /(^|[.!?:;]\s+)(hold'em|hold|buy|sell)\b/im;
const CURRENCY = /\b(money|cash|dollars?)\b|[$€£]/i;
const wordsOf = (page, scope) => page.evaluate((sel) => {
    const style = document.createElement('style');
    style.textContent = '[data-user-text] { display: none !important; }';
    document.head.append(style);
    const text = [...document.querySelectorAll(sel)].map((el) => el.innerText).join('\n');
    style.remove();
    return text;
}, scope);
const wordingOf = (text) => [
    ...findBanned(text),
    ...(OPENERS.test(text) ? [`opens on "${text.match(OPENERS)[2]}"`] : []),
    // A clause that says "No …" ("No cash value") is a prohibition, as the copy tests read it.
    ...(CURRENCY.test(stripProhibitions(text)) ? [`currency word "${stripProhibitions(text).match(CURRENCY)[0]}"`] : []),
];
const wording = async (page, where, scope = 'body') => {
    const text = await wordsOf(page, scope).catch(() => '');
    const hits = wordingOf(text);
    check(`the no-advice list over ${where}`, hits.length === 0 && text.trim().length > 0, hits.length > 0 ? hits.join(', ') : `${text.length} characters`);
};

// Every target a finger presses inside `scope`: its visible buttons, links, tabs, switches, fields
// and disclosures — less a link inside a sentence, which flows with its text (WCAG's inline
// exception). Each at least 44 × 44, none past the screen's sides, none over another, and the page
// never wider than the screen.
const targets = (page, scope) => page.evaluate((sel) => {
    const vw = innerWidth;
    const hit = (a, b) => a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1;
    const list = [];
    const seen = new Set();
    for (const root of document.querySelectorAll(sel)) {
        for (const el of root.querySelectorAll('button, a[href], [role="button"], [role="tab"], [role="switch"], [role="radio"], input:not([type="hidden"]), select, summary')) {
            if (seen.has(el)) continue;
            seen.add(el);
            const r = el.getBoundingClientRect();
            if (r.width < 1 || r.height < 1) continue;
            if (getComputedStyle(el).visibility === 'hidden' || el.closest('[aria-hidden="true"], [inert]')) continue;
            if (el.tagName === 'A') {
                const block = el.parentElement?.closest('p, dd, li, span');
                if (block && block.textContent.trim().length > el.textContent.trim().length + 2 && getComputedStyle(el).display === 'inline') continue;
            }
            const name = (el.getAttribute('aria-label') || el.textContent || el.tagName).trim().replace(/\s+/g, ' ').slice(0, 28);
            list.push({el, r, name});
        }
    }
    const overlaps = [];
    for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
            const a = list[i];
            const b = list[j];
            if (!a.el.contains(b.el) && !b.el.contains(a.el) && hit(a.r, b.r)) overlaps.push(`${a.name} / ${b.name}`);
        }
    }
    return {
        count: list.length,
        small: list.filter((t) => t.r.width < 43.5 || t.r.height < 43.5).map((t) => `${t.name} ${Math.round(t.r.width)}×${Math.round(t.r.height)}`),
        sideways: list.filter((t) => t.r.left < -1 || t.r.right > vw + 1).map((t) => t.name),
        overlaps,
        scroll: document.documentElement.scrollWidth - vw,
    };
}, scope);
const targetsOk = (m) => m !== null && m.count > 0 && m.small.length === 0 && m.sideways.length === 0 && m.overlaps.length === 0 && m.scroll <= 0;
const brief = (m) => JSON.stringify(m && {count: m.count, small: m.small.slice(0, 4), sideways: m.sideways.slice(0, 3), overlaps: m.overlaps.slice(0, 3), scroll: m.scroll});

// The table on a phone: every seat's plate on screen and none on another, the dock's controls on
// screen, every button 44 px or more, nothing sideways; on its side, the dock in the right-hand
// column and no plate over it.
const tableLayout = (page) => page.evaluate(() => {
    const vw = innerWidth;
    const vh = innerHeight;
    const rect = (el) => el.getBoundingClientRect();
    const inside = (r) => r.left >= -1 && r.right <= vw + 1 && r.top >= -1 && r.bottom <= vh + 1;
    const hit = (a, b) => a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1;
    const plates = [...document.querySelectorAll('[data-seat] .pn-plate')].map(rect);
    let overlaps = 0;
    for (let i = 0; i < plates.length; i++) for (let j = i + 1; j < plates.length; j++) if (hit(plates[i], plates[j])) overlaps++;
    const dock = document.querySelector('[data-pn-dock]');
    const row = document.querySelector('[data-pn-actions], [data-pn-seat-controls], [data-pn-left]');
    const table = document.querySelector('.pn-table');
    const small = [...document.querySelectorAll('main button, main a[href], [data-pn-topbar] :is(button, a[href])')].filter((b) => {
        const r = rect(b);
        return r.width > 0 && r.height > 0 && getComputedStyle(b).visibility !== 'hidden' && !b.closest('[aria-hidden="true"]') && (r.width < 43.5 || r.height < 43.5);
    }).map((b) => `${(b.getAttribute('aria-label') ?? b.textContent ?? '').trim().slice(0, 24)} ${Math.round(rect(b).width)}×${Math.round(rect(b).height)}`);
    const landscape = vw > vh;
    return {
        plates: plates.length, outside: plates.filter((r) => !inside(r)).length, overlaps,
        row: row ? inside(rect(row)) : null, small, scroll: document.documentElement.scrollWidth - vw,
        overDock: dock ? plates.filter((p) => hit(p, rect(dock))).length : -1,
        dockRight: landscape ? (dock && table ? rect(dock).left >= rect(table).right - 1 : false) : null,
    };
});
const tableOk = (m, seats) => m.plates === seats && m.outside === 0 && m.overlaps === 0 && m.row === true && m.small.length === 0 && m.scroll <= 0
    && m.overDock === 0 && m.dockRight !== false;

// The Hands guide where it is drawn (the lobby's tab, or the table's drawer): ten rankings and the
// kicker pair, every example inside its row, nothing sideways.
const guideOf = (page, scope) => page.evaluate((sel) => {
    const guide = document.querySelector(`${sel} [data-hands-guide]`);
    if (!guide) return null;
    const vw = innerWidth;
    const outside = [...guide.querySelectorAll('[data-guide-cards]')].filter((el) => {
        const r = el.getBoundingClientRect();
        const row = el.parentElement.getBoundingClientRect();
        return r.left < row.left - 0.5 || r.right > row.right + 0.5 || r.right > vw + 0.5;
    }).length;
    const scroller = guide.closest('.overflow-y-auto') ?? document.documentElement;
    return {
        cards: guide.querySelectorAll('.pn-card').length, rankings: guide.querySelectorAll('[data-ranking]').length,
        first: guide.querySelector('[data-guide-here]')?.getAttribute('data-guide-game') ?? null,
        order: [...guide.children].map((el) => el.getAttribute('data-guide-section')).join(),
        outside, sideways: scroller.scrollWidth - scroller.clientWidth,
        card: Math.round(guide.querySelector('.pn-card')?.getBoundingClientRect().width ?? 0),
        firstRank: Math.round(guide.querySelector('[data-ranking]')?.getBoundingClientRect().bottom ?? Infinity), vh: innerHeight,
    };
}, scope);
const guideOk = (m) => m !== null && m.cards === 60 && m.rankings === 10 && m.outside === 0 && m.sideways <= 0;

// The leave dialog as drawn: its kind, where it started, its words and buttons — every button at
// least 44 px, inside the screen, none over another, full width on a phone.
const leaveDialog = (page) => page.evaluate(() => {
    const d = document.querySelector('[data-pn-leave-dialog]');
    if (!d) return null;
    const vw = innerWidth;
    const vh = innerHeight;
    const r = d.getBoundingClientRect();
    const hit = (a, b) => a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1;
    const buttons = [...d.querySelectorAll('button')].filter((b) => b.getBoundingClientRect().width > 0)
        .map((b) => ({b, r: b.getBoundingClientRect(), name: (b.getAttribute('aria-label') || b.textContent).trim()}));
    const overlaps = [];
    for (let i = 0; i < buttons.length; i++) for (let j = i + 1; j < buttons.length; j++) if (hit(buttons[i].r, buttons[j].r)) overlaps.push(`${buttons[i].name} / ${buttons[j].name}`);
    const acts = buttons.filter((x) => x.b.hasAttribute('data-pn-leave'));
    return {
        kind: d.getAttribute('data-pn-leave-dialog'), then: d.getAttribute('data-pn-leave-then'),
        title: d.querySelector('h2')?.textContent ?? null,
        text: d.innerText,
        stay: d.querySelector('[data-pn-leave="stay"]')?.textContent?.trim() ?? null,
        leave: d.querySelector('[data-pn-leave="leave"]')?.textContent?.trim() ?? null,
        note: d.querySelector('[data-pn-leave-note]')?.textContent ?? null,
        inside: r.left >= -1 && r.right <= vw + 1 && r.top >= -1 && r.bottom <= vh + 1,
        small: buttons.filter((x) => x.r.width < 43.5 || x.r.height < 43.5).map((x) => `${x.name} ${Math.round(x.r.width)}×${Math.round(x.r.height)}`),
        outside: buttons.filter((x) => x.r.left < -1 || x.r.right > vw + 1 || x.r.top < -1 || x.r.bottom > vh + 1).map((x) => x.name),
        overlaps,
        fullWidth: acts.length > 0 && acts.every((x) => x.r.width >= r.width * 0.75),
        scroll: document.documentElement.scrollWidth - vw,
    };
});
const dialogOk = (m, phone) => m !== null && m.inside && m.small.length === 0 && m.outside.length === 0 && m.overlaps.length === 0 && m.scroll <= 0
    && (!phone || m.fullWidth);

// ── talking to the table ──────────────────────────────────────────────────────────────────────

const api = async (p, route, body) => {
    const res = await p.context.request.fetch(`${BASE}/api/poker-night/${code}/${route}`, {
        method: 'POST', headers: {'x-pn-protocol': String(PN_PROTOCOL), 'content-type': 'application/json', origin: BASE},
        data: JSON.stringify(body), failOnStatusCode: false, timeout: 60000,
    });
    let json = null;
    try {
        json = await res.json();
    } catch {
        json = null;
    }
    return {status: res.status(), body: json};
};
const hostOp = (p, op) => api(p, 'action', {actionId: randomUUID(), type: 'host', op});

// Who acts, by Mongo, and a click on their screen.
const ownerOfSeat = (doc, seat) => players.find((p) => !p.gone && p.pid && p.pid === doc.state.seats[seat]?.pid) ?? null;
const nextTurn = async (handNo, timeout = 45000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
        const doc = await roomDoc();
        const hand = doc?.state?.hand;
        if (hand && hand.no === handNo) {
            if (hand.phase === 'complete') return {doc, actor: null};
            if (hand.phase === 'betting' && hand.actor !== null) {
                const actor = ownerOfSeat(doc, hand.actor);
                if (!actor) throw new Error(`hand ${handNo}: nobody here plays seat ${hand.actor}`);
                return {doc, actor};
            }
        }
        await sleep(150);
    }
    throw new Error(`hand ${handNo}: no turn and no end within ${timeout} ms`);
};
const clickMove = async (p, move) => {
    const page = p.page;
    await page.waitForSelector('[data-pn-actions][data-pn-armed]:not([aria-busy="true"])', {timeout: 20000});
    if (move === 'fold') {
        const free = await page.locator('[data-pn-action="check"]').count() > 0;
        await page.click('[data-pn-action="fold"]');
        if (free) await page.click('[data-pn-action="fold-anyway"]', {timeout: 5000});
    } else {
        const call = await page.locator('[data-pn-action="call"]').count() > 0;
        await page.click(call ? '[data-pn-action="call"]' : '[data-pn-action="check"]');
    }
};
const waitMoved = async (turn, handNo) => {
    for (let i = 0; i < 120; i++) {
        const doc = await roomDoc();
        const hand = doc.state.hand;
        if (doc.state.turn !== turn || hand?.no !== handNo || hand.phase !== 'betting') return;
        await sleep(150);
    }
    for (const p of players.filter((q) => !q.gone)) await shot(p.page, `stuck-${p.name}`);
    throw new Error(`hand ${handNo}: the click did not move turn ${turn}`);
};
// Plays hand handNo to its end by clicking: each actor's move from choose(p, doc) ('fold', else
// check or call); before(p, doc) ahead of each move, after(p, doc) after it, onStreet(doc) once a street.
const playByClicks = async (handNo, {choose = () => 'call', before = async () => {}, after = async () => {}, onStreet = async () => {}} = {}) => {
    let street = null;
    for (let guard = 0; guard < 80; guard++) {
        const {doc, actor} = await nextTurn(handNo);
        if (!actor) return doc;
        if (doc.state.hand.street !== street) {
            street = doc.state.hand.street;
            await onStreet(doc);
        }
        await before(actor, doc);
        const turn = doc.state.turn;
        // A probe in `before` may have moved the turn (a shield that let a tap through): next turn.
        if ((await roomDoc()).state.turn !== turn) continue;
        await clickMove(actor, choose(actor, doc));
        await waitMoved(turn, handNo);
        await after(actor, await roomDoc());
    }
    throw new Error(`hand ${handNo} did not finish`);
};

// ── the scans: a folded hand's cards, outside its own context ────────────────────────────────

const NOT_CARDS = new Set(['eligible', 'winners', 'shares', 'showOrder']);
const walk = (node, key, visit) => {
    visit(node, key);
    if (Array.isArray(node)) node.forEach((child) => walk(child, key, visit));
    else if (node && typeof node === 'object') for (const [k, v] of Object.entries(node)) walk(v, k, visit);
};
const cardPairsIn = (body) => {
    const pairs = [];
    walk(body, null, (node, key) => {
        if (Array.isArray(node) && node.length === 2 && !NOT_CARDS.has(key) && node.every((n) => Number.isInteger(n) && n >= 0 && n < 52)) pairs.push(node);
    });
    return pairs;
};
// The RSC flight data a page's HTML carries, decoded from its self.__next_f.push([1, "…"]) strings.
const flightOf = (html) => {
    let out = '';
    for (const m of html.matchAll(/self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g)) {
        try {
            out += JSON.parse(m[1]);
        } catch {
            // Not a string this reader understands: left out.
        }
    }
    return out;
};
const pairsInText = (text) => [...text.matchAll(/(?:"(\w+)":)?\[(\d{1,2}),(\d{1,2})\]/g)]
    .filter((m) => !NOT_CARDS.has(m[1])).map((m) => [Number(m[2]), Number(m[3])]);
// The page HTML and RSC payload p's browser gets for the table right now: whether `hole` is in them.
const pageCarries = async (p, hole) => {
    const html = await (await p.context.request.get(`${BASE}/play/${code}`, {timeout: 90000})).text();
    const rsc = await (await p.context.request.get(`${BASE}/play/${code}`, {headers: {RSC: '1'}, timeout: 90000})).text();
    return {
        html: pairsInText(flightOf(html)).some((pair) => sameCards(pair, hole)),
        rsc: pairsInText(rsc).some((pair) => sameCards(pair, hole)),
    };
};

let H; // the host, an account at 1440 × 900
let P; // a guest on a 390 × 844 phone: folds, keeps their cards, shows them
let Q; // a guest at 1440 × 900: the host sits them out
let R; // a guest on a 375 × 667 phone: leaves in the break, comes back, goes home

try {
    await mongo.connect();
    db = mongo.db();
    rooms = db.collection('pokerrooms');
    const limits = db.collection('ratelimits');
    await limits.deleteMany({key: /^poker-night:/});

    // ═══ Home before any table, and the lobby's Hands tab ═══════════════════════════════════════
    H = await newPlayer('host', DESKTOP);
    await signUp(H.page, 'pnmodes', {name: 'Hana Modes', stay: true});
    await H.page.goto(`${BASE}/`, {waitUntil: 'load', timeout: 120000});
    await H.page.waitForSelector('[data-home]', {timeout: 60000});
    const chip = await H.page.locator('[data-home] [data-poker-night-chip]').getAttribute('href', {timeout: 10000}).catch(() => null);
    check('Home: the "Poker night" chip links to the lobby', chip === '/poker-night', String(chip));
    check('…and with no table yet, Home draws no poker night panel (a box with nothing to say is not drawn)',
        await H.page.locator('[data-home-poker-night]').count() === 0);

    // The same account on a phone (a touch screen, its own context with the host's session), for
    // every phone-size look at Home and the lobby.
    const Hm = await newPlayer('hostPhone', {...PHONE(390, 844), storageState: await H.context.storageState()});
    await H.page.goto(`${BASE}/poker-night?tab=hands`, {waitUntil: 'load', timeout: 180000});
    await H.page.waitForSelector('[data-poker-night-hands] [data-hands-guide]', {timeout: 60000});
    {
        const scope = '[data-poker-night-page]';
        const wide = await guideOf(H.page, '[data-poker-night-hands]');
        const tab = await H.page.getAttribute(`${scope} [role="tab"][aria-selected="true"]`, 'data-tab').catch(() => null);
        check('the lobby\'s Hands tab (?tab=hands): the Hands view selected, ten rankings and the kicker pair (60 cards), no lobby read',
            guideOk(wide) && tab === 'hands' && await H.page.locator('[data-quick-start]').count() === 0, JSON.stringify({wide, tab}));
        await wording(H.page, 'the Hands tab', scope);
        await shot(H.page, '01-hands-tab-1440');
        await Hm.page.goto(`${BASE}/poker-night?tab=hands`, {waitUntil: 'load', timeout: 180000});
        await Hm.page.waitForSelector('[data-poker-night-hands] [data-hands-guide]', {timeout: 60000});
        // "What these mean" open, so its Ask links are measured too.
        await Hm.page.evaluate(() => document.querySelector('[data-poker-night-hands] [data-what-these-mean]')?.setAttribute('open', ''));
        for (const size of SIZES) {
            await resize(Hm.page, size);
            const guide = await guideOf(Hm.page, '[data-poker-night-hands]');
            const tabs = await targets(Hm.page, `${scope} > [role="tablist"]`);
            const all = await targets(Hm.page, scope);
            check(`the Hands tab on a phone at ${sizeName(size)}: every example inside its row, nothing sideways, its tabs and every target 44 px (the definitions' line and Ask links too), none overlapping`,
                guideOk(guide) && targetsOk(tabs) && targetsOk(all) && all.count >= 6, `${JSON.stringify(guide)} tabs ${brief(tabs)} all ${brief(all)}`);
            await shot(Hm.page, `01-hands-tab-${sizeFile(size)}`);
        }
    }

    // ═══ a table: Quick start, then Home's panel and its Rejoin ════════════════════════════════
    await H.page.goto(`${BASE}/poker-night`, {waitUntil: 'load', timeout: 180000});
    await H.page.click('[data-quick-start]');
    await H.page.waitForURL(/\/play\/[A-HJ-NP-Z2-9]{6}(\?.*)?$/, {timeout: 120000});
    code = new URL(H.page.url()).pathname.split('/').pop();
    await H.page.waitForSelector('[data-pn-drawer="invite"]', {timeout: 60000}).catch(() => {});
    await H.page.keyboard.press('Escape');
    let doc = await roomDoc();
    H.pid = doc.state.hostPid;
    check('Quick start opens a table, the host seated', /^[A-HJ-NP-Z2-9]{6}$/.test(code) && seatIndex(doc, H) === 0, code);

    await H.page.goto(`${BASE}/`, {waitUntil: 'load', timeout: 120000});
    await H.page.waitForSelector('[data-home-poker-night]', {timeout: 30000}).catch(() => {});
    const homeRow = await H.page.evaluate((c) => {
        const row = document.querySelector(`[data-home-poker-night] [data-home-pn-list="yours"] [data-home-pn-table="${c}"]`);
        const go = row?.querySelector('[data-home-pn-go]');
        return row ? {go: go?.getAttribute('data-home-pn-go') ?? null, href: go?.getAttribute('href') ?? null, label: go?.textContent?.trim() ?? null} : null;
    }, code);
    check('with a table, Home\'s poker night panel lists it under "Your tables" with Rejoin to /play/CODE',
        homeRow?.go === 'rejoin' && homeRow.href === `/play/${code}` && homeRow.label === HOME_PANEL_COPY.rejoin, JSON.stringify(homeRow));
    await H.page.waitForSelector('[data-home] [data-poker-night-chip="rejoin"]', {timeout: 15000}).catch(() => {});
    // Its words, less the icon's ligature and the dot (aria-hidden).
    const chipBack = await H.page.$eval('[data-home] [data-poker-night-chip]', (el) => {
        const words = el.cloneNode(true);
        words.querySelectorAll('[aria-hidden="true"]').forEach((n) => n.remove());
        return {kind: el.getAttribute('data-poker-night-chip'), href: el.getAttribute('href'), text: words.textContent.trim()};
    }).catch(() => null);
    check('…and the chip at the top of Home is "Rejoin your table", straight to /play/CODE (one tap, not two screens down)',
        chipBack?.kind === 'rejoin' && chipBack.href === `/play/${code}` && chipBack.text === HOME_PANEL_COPY.chipRejoin, JSON.stringify(chipBack));
    await wording(H.page, 'Home\'s poker night panel', '[data-home-poker-night]');
    await Hm.page.goto(`${BASE}/`, {waitUntil: 'load', timeout: 120000});
    await Hm.page.waitForSelector('[data-home-poker-night]', {timeout: 30000}).catch(() => {});
    for (const size of SIZES) {
        await resize(Hm.page, size);
        await Hm.page.evaluate(() => scrollTo(0, 0));
        await sleep(200);
        const chipM = await Hm.page.evaluate(() => {
            const r = document.querySelector('[data-poker-night-chip]')?.getBoundingClientRect();
            return r ? {w: Math.round(r.width), h: Math.round(r.height), inside: r.left >= -1 && r.right <= innerWidth + 1} : null;
        });
        await Hm.page.locator('[data-home-poker-night]').scrollIntoViewIfNeeded().catch(() => {});
        const m = await targets(Hm.page, '[data-home-poker-night]');
        check(`Home on a phone at ${sizeName(size)}: the chip a 44 px target on screen; the panel's targets 44 px, none overlapping, nothing sideways`,
            targetsOk(m) && chipM !== null && chipM.h >= 43.5 && chipM.inside, `${brief(m)} chip ${JSON.stringify(chipM)}`);
        if (size.width === 390 || size.width === 844) await shot(Hm.page, `02-home-panel-${sizeFile(size)}`);
    }
    await H.page.locator('[data-home-poker-night]').scrollIntoViewIfNeeded().catch(() => {});
    await shot(H.page, '02-home-panel-1440');
    await H.page.click(`[data-home-pn-table="${code}"] [data-home-pn-go="rejoin"]`);
    await H.page.waitForURL(new RegExp(`/play/${code}$`), {timeout: 60000}).catch(() => {});
    const rejoined = await H.page.waitForSelector('[data-me]', {timeout: 60000}).then(() => true, () => false);
    check('Rejoin opens the table, the host still in their seat (no join card)', rejoined && new URL(H.page.url()).pathname === `/play/${code}`
        && await H.page.locator('[data-join-card]').count() === 0, H.page.url());

    // ═══ the way out for someone who never sat: a plain link to the landing page ════════════════
    {
        const V = await newPlayer('visitor', PHONE(390, 844));
        await V.page.goto(`${BASE}/play/${code}`, {waitUntil: 'load', timeout: 120000});
        await V.page.waitForSelector('[data-join-card="visitor"]', {timeout: 60000});
        const home = await V.page.$eval('[data-open="home"]', (el) => ({tag: el.tagName, href: el.getAttribute('href'), label: el.getAttribute('aria-label')})).catch(() => null);
        await V.page.click('[data-open="home"]');
        const landed = await V.page.waitForSelector('[data-landing]', {timeout: 60000}).then(() => true, () => false);
        const url = new URL(V.page.url());
        check('a visitor\'s "Back to AeroTrade" is a plain link to "/" that lands a guest on the landing page, never /sign-in',
            home?.tag === 'A' && home.href === '/' && home.label === TABLE_COPY.home && landed && url.pathname === '/' && !/sign-in/.test(V.page.url()),
            `${JSON.stringify(home)} → ${V.page.url()}`);
        V.gone = true;
        await V.context.close();
    }

    // ═══ guests sit down ════════════════════════════════════════════════════════════════════════
    const sitDown = async (p, name) => {
        await p.page.goto(`${BASE}/play/${code}`, {waitUntil: 'load', timeout: 120000});
        await p.page.waitForSelector('[data-join-card="visitor"]', {timeout: 60000});
        if (name) await p.page.fill('[data-join-name]', name);
        await p.page.click('[data-join-sit]');
        const me = await p.page.waitForSelector('[data-me]', {timeout: 30000});
        p.pid = await me.getAttribute('data-pid');
        await p.page.waitForSelector('[data-pn-ready="true"]', {timeout: 30000}).catch(() => {});
    };
    P = await newPlayer('P', PHONE(390, 844));
    Q = await newPlayer('Q', DESKTOP);
    R = await newPlayer('R', PHONE(375, 667));
    await sitDown(P, '');
    await sitDown(Q, 'Quinn');
    await sitDown(R, 'Rio');
    doc = await roomDoc();
    check('three guests sit down beside the host', [P, Q, R].every((p) => seatIndex(doc, p) >= 0), doc.state.seats.map((s) => s?.pid ?? '-').join(' '));

    // An ante, so every player dealt into a hand has chips in it from the start: what a leave that
    // lost the race to the deal would cost. The longest turn, so no clock runs out while a screen is
    // being measured (nothing moves until this script clicks).
    const config = await hostOp(H, {op: 'config', patch: {ante: 5, turnSeconds: 120}});
    const configured = (await roomDoc()).state.config;
    check('the host sets an ante of 5 (and the longest turn) through the table\'s API', config.status === 200 && configured.ante === 5 && configured.turnSeconds === 120,
        `${config.status} ${JSON.stringify(config.body?.error)}`);

    // ═══ hand 1: P folds on a phone and keeps their cards; the others play to a showdown ═════════
    // The tap shield on P's first turn: a tap that lands the moment the action bar appears.
    await P.page.evaluate(() => {
        const probe = {tapped: false, armedAtTap: null, at: null};
        window.__pnBarProbe = probe;
        const obs = new MutationObserver(() => {
            if (probe.tapped) return;
            const bar = document.querySelector('[data-pn-actions]');
            const button = bar?.querySelector('[data-pn-action="call"], [data-pn-action="check"]');
            if (!button) return;
            probe.tapped = true;
            probe.armedAtTap = bar.hasAttribute('data-pn-armed');
            probe.at = Date.now();
            button.dispatchEvent(new MouseEvent('click', {bubbles: true, cancelable: true, detail: 1}));
            obs.disconnect();
        });
        obs.observe(document.body, {subtree: true, childList: true});
    });
    await H.page.waitForSelector('[data-pn-seat-controls][data-pn-armed] [data-pn-control="deal"]:not([disabled])', {timeout: 30000});
    await H.page.click('[data-pn-control="deal"]');
    doc = await waitDoc((d) => d.state.hand?.no === 1, 20000);
    check('the host deals: hand 1, everyone in with the ante posted', doc !== null && doc.state.hand.seats.length === 4
        && doc.state.hand.seats.every((s) => s.committed >= 5), JSON.stringify(doc?.state.hand?.seats.map((s) => s.committed)));
    const holeP = handSeat(doc, P)?.hole;
    let foldedAt = null;
    let shieldDone = false;
    let phoneDone = false;
    let midDialogDone = false;
    let phoneDialogDone = false;
    const leaksOfP = [];
    const scanPages = async (label) => {
        if (foldedAt === null) return;
        for (const p of [H, Q]) {
            const carried = await pageCarries(p, holeP);
            if (carried.html || carried.rsc) leaksOfP.push(`${p.name} ${label} ${carried.html ? 'html' : 'rsc'}`);
        }
        const own = await pageCarries(P, holeP);
        if (!own.rsc && !own.html) leaksOfP.push(`P's own page did not carry P's hole at ${label} (the scan sees nothing)`);
    };

    // The leave dialog on a phone (R, holding cards, not on the clock): at every size, then Stay.
    const phoneDialog = async (kind) => {
        await R.page.click('[data-open="menu"]');
        await R.page.click('[data-menu="leave"]', {timeout: 5000});
        await R.page.waitForSelector('[data-pn-leave-dialog]', {timeout: 10000});
        const rows = [];
        for (const size of SIZES) {
            await resize(R.page, size, 500);
            const m = await leaveDialog(R.page);
            rows.push([size, m]);
            if (size.width === 320 || size.width === 844) await shot(R.page, `03-leave-dialog-${kind}-${sizeFile(size)}`);
        }
        await resize(R.page, {width: 375, height: 667}, 300);
        await wording(R.page, `the leave dialog (${kind})`, '[data-pn-leave-dialog]');
        await R.page.click('[data-pn-leave="stay"]');
        await R.page.waitForSelector('[data-pn-leave-dialog]', {state: 'detached', timeout: 10000}).catch(() => {});
        for (const [size, m] of rows) {
            check(`the leave dialog (${kind}) on a phone at ${sizeName(size)}: inside the screen, its buttons 44 px, full width, none overlapping, nothing sideways${kind === 'mid-hand' ? ', one sentence on when the chips are counted' : ''}`,
                dialogOk(m, size.width < 640) && m.kind === kind && (kind !== 'mid-hand' || (!/as you leave/.test(m.text) && /once it ends/.test(m.text))), JSON.stringify(m));
        }
        check(`…Stay closes it and changes nothing: R still seated (${kind})`, seatIndex(await roomDoc(), R) >= 0 && await R.page.locator('[data-pn-leave-dialog]').count() === 0);
    };

    doc = await playByClicks(1, {
        choose: (p) => (p === P && foldedAt === null ? 'fold' : 'call'),
        onStreet: async (d) => scanPages(`hand 1 ${d.state.hand.street}`),
        before: async (p) => {
            if (p !== P) return;
            if (!shieldDone) {
                shieldDone = true;
                await P.page.waitForSelector('[data-pn-actions]', {timeout: 20000});
                await sleep(TAP_SHIELD_MS + 400);
                const probe = await P.page.evaluate(() => window.__pnBarProbe);
                const moved = (await roomDoc()).state.hand.actor !== seatIndex(await roomDoc(), P);
                const armed = await P.page.locator('[data-pn-actions][data-pn-armed]').count() === 1;
                if (!probe?.tapped || probe.armedAtTap) note('the tap shield on the action bar', `the probe ${probe?.tapped ? 'found the bar armed already' : 'never saw the bar'}: not checked`);
                else check(`the tap shield: a tap the moment P's action bar appears does nothing; the bar arms after ${TAP_SHIELD_MS} ms`, !moved && armed, JSON.stringify({probe, moved, armed}));
            }
            if (phoneDone) return;
            phoneDone = true;
            // P on the clock, on a phone held upright and on its side.
            const seats = (await roomDoc()).state.seats.filter((s) => s !== null).length;
            for (const size of SIZES) {
                await resize(P.page, size, 900);
                const m = await tableLayout(P.page);
                check(`P's turn at ${sizeName(size)}: every plate on screen and apart, the action bar on screen, every button 44 px, nothing sideways${size.width > size.height ? ', the dock in its own column' : ''}`,
                    tableOk(m, seats), JSON.stringify(m));
                await shot(P.page, `04-turn-${sizeFile(size)}`);
            }
            await resize(P.page, {width: 390, height: 844}, 600);
            await wording(P.page, 'the table on P\'s turn', 'main, [data-pn-topbar]');
        },
        after: async (p, d) => {
            if (p === P && foldedAt === null && handSeat(d, P)?.folded) {
                foldedAt = Date.now();
                // The host pauses now: the hand plays on, and the pause after it lasts.
                const paused = await hostOp(H, {op: 'pause'});
                check('the host pauses mid-hand through the API: the hand plays on', paused.status === 200 && (await roomDoc()).status === 'paused');
                // P's own cards stay in front of P, face up, dimmed and tagged — never flying away.
                const kept = [];
                for (const wait of [300, 900, 1300]) {
                    await sleep(wait);
                    kept.push(await P.page.evaluate(() => {
                        const hole = document.querySelector('[data-pn-dock] [data-pn-hole="folded"]');
                        const cards = hole ? [...hole.querySelectorAll('[data-card]')] : [];
                        return {cards: cards.map((c) => c.getAttribute('data-card')), dim: cards.filter((c) => c.getAttribute('data-state') === 'dim').length,
                            tag: hole?.querySelector('[data-pn-folded-tag]')?.textContent ?? null};
                    }));
                }
                check('P folds: P\'s own two cards stay in P\'s dock — face up as dealt, dimmed, tagged "Folded" — at 0.3, 1.2 and 2.5 s, never flying to the muck',
                    kept.every((k) => k.cards.join(' ') !== '' && [...k.cards].sort().join(' ') === labels(holeP) && k.dim === 2 && k.tag === TABLE_COPY.status.folded),
                    JSON.stringify(kept));
                const ownAnims = await P.page.evaluate(() => window.__pnAnims.filter((a) => a.dock));
                check('…on P\'s screen the fold dims the dock\'s cards where they lie (no fold flight there)',
                    ownAnims.some((a) => a.anim === 'dim') && !ownAnims.some((a) => a.anim === 'fold'), JSON.stringify(ownAnims.slice(-6)));
                const seatP = seatIndex(d, P);
                const mucked = await Promise.all([H, Q, R].map(async (o) => {
                    await o.page.waitForFunction((s) => window.__pnAnims.some((a) => a.anim === 'fold' && a.seat === String(s))
                        && document.querySelectorAll(`[data-seat="${s}"] [data-card]`).length === 0, seatP, {timeout: 6000}).catch(() => {});
                    return o.page.evaluate((s) => ({
                        flew: window.__pnAnims.some((a) => a.anim === 'fold' && a.seat === String(s)),
                        left: document.querySelectorAll(`[data-seat="${s}"] [data-card]`).length,
                    }), seatP);
                }));
                check('…while every other screen sees P\'s cards go to the muck (a fold flight at P\'s seat, then no card there)',
                    mucked.every((m) => m.flew && m.left === 0), JSON.stringify(mucked));
                // P's own answers still carry the hole, through the rest of the hand.
                const ownBody = await P.page.waitForResponse((res) => res.url().includes(`/api/poker-night/${code}/state`) && res.request().method() === 'GET', {timeout: 15000})
                    .then((res) => res.json(), () => null);
                const latest = ownBody?.me ? ownBody : [...P.bodies].reverse().find((b) => b.at > foldedAt && b.body?.me)?.body;
                check('…and P\'s own GET state still carries P\'s hole (me.hole) after the fold, the seat itself showing no cards',
                    sameCards(latest?.me?.hole, holeP) && latest?.seats?.[seatP]?.cards === 'none', JSON.stringify({hole: latest?.me?.hole, cards: latest?.seats?.[seatP]?.cards}));
                await wording(P.page, 'P\'s dock with the folded hand', '[data-pn-dock]');
                await shot(P.page, '05-folded-390');
                // Peek on: the folded hand face down too, until pressed; off, face up again.
                const holeLook = () => P.page.evaluate(() => {
                    const h = document.querySelector('[data-pn-dock] [data-pn-hole]');
                    return h ? {kind: h.getAttribute('data-pn-hole'), peek: h.getAttribute('data-pn-peek'),
                        backs: h.querySelectorAll('[data-card="back"]').length, faces: h.querySelectorAll('[data-card]:not([data-card="back"])').length} : null;
                });
                const personal = async (on) => {
                    const sel = '[data-pn-drawer="look"] [data-pn-personal="peek"]';
                    await P.page.click('[data-open="menu"]');
                    await P.page.click('[data-menu="look"]');
                    await P.page.waitForSelector(sel, {timeout: 10000});
                    if (await P.page.getAttribute(sel, 'aria-checked') !== String(on)) await P.page.click(sel);
                    const now = await P.page.getAttribute(sel, 'aria-checked');
                    await P.page.keyboard.press('Escape');
                    await P.page.waitForSelector('[data-pn-drawer="look"]', {state: 'detached', timeout: 10000}).catch(() => {});
                    return now === String(on);
                };
                const peekOn = await personal(true);
                const shut = await holeLook();
                const peekOff = await personal(false);
                const open = await holeLook();
                check('…with Peek on (My look) the folded hand stays face down until pressed; off, face up again',
                    peekOn && peekOff && shut?.kind === 'folded' && shut.peek === 'hidden' && shut.backs === 2 && shut.faces === 0 && open?.faces === 2 && open.backs === 0,
                    JSON.stringify({shut, open}));
                // The pause's buttons, shielded: a tap the moment "Show my cards" appears does nothing.
                await P.page.evaluate(() => {
                    const probe = {tapped: false, armedAtTap: null};
                    window.__pnShowProbe = probe;
                    const obs = new MutationObserver(() => {
                        const b = document.querySelector('[data-pn-control="show"]');
                        if (probe.tapped || !b) return;
                        probe.tapped = true;
                        probe.armedAtTap = b.closest('[data-pn-seat-controls]')?.hasAttribute('data-pn-armed') ?? null;
                        b.dispatchEvent(new MouseEvent('click', {bubbles: true, cancelable: true, detail: 1}));
                        obs.disconnect();
                    });
                    obs.observe(document.body, {subtree: true, childList: true});
                });
            }
            const live = d.state.hand?.phase === 'betting' ? d.state.hand : null;
            // The host's leave dialog mid-hand, from Home and from the menu: the host holds cards and
            // is not on the clock (nothing moves until this script clicks).
            if (!midDialogDone && live && !handSeat(d, H)?.folded && live.actor !== seatIndex(d, H)) {
                midDialogDone = true;
                await H.page.click('[data-open="home"]');
                await H.page.waitForSelector('[data-pn-leave-dialog]', {timeout: 10000});
                const fromHome = await leaveDialog(H.page);
                await shot(H.page, '03-leave-dialog-mid-hand-home-1440');
                await H.page.click('[data-pn-leave="stay"]');
                await H.page.waitForSelector('[data-pn-leave-dialog]', {state: 'detached', timeout: 10000}).catch(() => {});
                await H.page.click('[data-open="menu"]');
                await H.page.click('[data-menu="leave"]', {timeout: 5000});
                await H.page.waitForSelector('[data-pn-leave-dialog]', {timeout: 10000});
                const fromMenu = await leaveDialog(H.page);
                await H.page.click('[data-pn-leave="stay"]');
                await H.page.waitForSelector('[data-pn-leave-dialog]', {state: 'detached', timeout: 10000}).catch(() => {});
                const after = await roomDoc();
                check('mid-hand, the host\'s Home asks first: "Leave in the middle of a hand?", [Stay] [Leave now and go]',
                    fromHome?.kind === 'mid-hand' && fromHome.then === 'home' && fromHome.title === TABLE_COPY.leaveMidHandTitle && fromHome.stay === TABLE_COPY.stay
                    && fromHome.leave === TABLE_COPY.leaveNowAndGo, JSON.stringify(fromHome));
                check('…the menu\'s Leave asks the same with [Stay] [Leave now]; Stay leaves the host seated, in the hand, on the table',
                    fromMenu?.kind === 'mid-hand' && fromMenu.then === 'stay' && fromMenu.leave === TABLE_COPY.leaveNow && seatIndex(after, H) >= 0
                    && !handSeat(after, H)?.folded && new URL(H.page.url()).pathname === `/play/${code}`, JSON.stringify(fromMenu));
            }
            if (!phoneDialogDone && live && !handSeat(d, R)?.folded && live.actor !== seatIndex(d, R)) {
                phoneDialogDone = true;
                await phoneDialog('mid-hand');
            }
        },
    });
    check('hand 1 went to a showdown by clicks, P folded', doc.state.hand.no === 1 && doc.state.hand.phase === 'complete' && doc.state.hand.result?.showdown === true
        && handSeat(doc, P)?.folded === true);
    if (!midDialogDone) note('the leave dialog mid-hand', 'the host never held cards off the clock in hand 1: not checked');
    if (!phoneDialogDone) note('the leave dialog on a phone mid-hand', 'R never held cards off the clock in hand 1: not checked');
    await scanPages('hand 1 showdown');

    // ═══ the pause after hand 1 (the game paused): Show my cards, the break, the dialogs ═══════
    {
        await P.page.waitForSelector('[data-pn-seat-controls] [data-pn-control="show"]', {timeout: 20000}).catch(() => {});
        await sleep(1000);
        const probe = await P.page.evaluate(() => window.__pnShowProbe);
        const shownEarly = handSeat(await roomDoc(), P)?.shown === true;
        if (!probe?.tapped || probe.armedAtTap) note('the tap shield on the pause\'s buttons', `the probe ${probe?.tapped ? 'found the row armed already' : 'never saw Show'}: not checked`);
        else check('the tap shield: a tap the moment the pause\'s "Show my cards" appears does nothing', !shownEarly, JSON.stringify(probe));

        // No other context ever got P's folded hand: not an API answer, not a page, not a payload.
        const others = [H, Q, R].flatMap((p) => p.bodies.filter((b) => cardPairsIn(b.body).some((pair) => sameCards(pair, holeP))).map((b) => `${p.name} ${new URL(b.url).pathname.split('/').pop()}`));
        const answered = [H, Q, R].reduce((n, p) => n + p.bodies.length, 0);
        check(`P's folded hand never reached another context: none of ${answered} API answers to the host, Q or R carried it, nor any page HTML or RSC payload on any street`,
            others.length === 0 && leaksOfP.length === 0 && answered > 20, [...others, ...leaksOfP].slice(0, 5).join(' | '));
        const ownCarried = P.bodies.filter((b) => b.at > foldedAt && sameCards(b.body?.me?.hole, holeP)).length;
        check('…while P\'s own answers carried it after the fold, through the showdown (the scan sees a hole where there is one)', ownCarried > 0, `${ownCarried} answers`);

        // The break row on P's phone: Show cards, Sit out, Leave — 44 px, one line at 320.
        const breakRow = (page) => page.evaluate(() => {
            const row = document.querySelector('[data-pn-seat-controls]');
            const r = row?.getBoundingClientRect();
            return {
                controls: [...(row?.querySelectorAll('[data-pn-control]') ?? [])].map((b) => b.getAttribute('data-pn-control')),
                words: [...(row?.querySelectorAll('button') ?? [])].map((b) => b.innerText.trim()),
                height: r ? Math.round(r.height) : null,
            };
        });
        for (const size of SIZES) {
            await resize(P.page, size);
            const row = await breakRow(P.page);
            const m = await targets(P.page, '[data-pn-seat-controls]');
            check(`the break on P's phone at ${sizeName(size)}: Sit out, then "${TABLE_COPY.showShort}" (secondary, not first), then Leave, each 44 px, none overlapping, nothing sideways${size.width === 320 ? ', one line (52 px at most)' : ''}`,
                ['show', 'sit-out', 'leave'].every((c) => row.controls.includes(c)) && row.controls.indexOf('sit-out') < row.controls.indexOf('show') && targetsOk(m)
                && (size.width !== 320 || (row.height !== null && row.height <= 52 && row.words.includes(TABLE_COPY.showShort))),
                `${JSON.stringify(row)} ${brief(m)}`);
            await shot(P.page, `06-break-${sizeFile(size)}`);
        }
        await resize(P.page, {width: 390, height: 844});
        await wording(P.page, 'the break on P\'s phone', '[data-pn-dock]');

        // Show my cards: on every screen, as dealt.
        await P.page.waitForSelector('[data-pn-seat-controls][data-pn-armed] [data-pn-control="show"]', {timeout: 10000});
        const showAt = Date.now();
        await P.page.click('[data-pn-control="show"]');
        const shown = await waitDoc((d) => handSeat(d, P)?.shown === true, 10000);
        const seatP = seatIndex(shown, P);
        const onScreens = await Promise.all([H, Q, R].map((o) => o.page.waitForFunction(({s, want}) => {
            const cards = [...document.querySelectorAll(`[data-seat="${s}"] [data-card]`)].map((c) => c.getAttribute('data-card')).filter((c) => c !== 'back');
            return cards.length === 2 && [...cards].sort().join(' ') === want;
        }, {s: seatP, want: labels(holeP)}, {timeout: 10000}).then(() => true, () => false)));
        await sleep(500);
        const viaApi = H.bodies.some((b) => b.at > showAt && sameCards(b.body?.seats?.[seatP]?.cards, holeP));
        check('"Show my cards" in the pause, from a folded hand: P\'s cards turn up on the host\'s, Q\'s and R\'s screens as dealt, and in the host\'s next answer',
            shown !== null && onScreens.every(Boolean) && viaApi, JSON.stringify({onScreens, viaApi}));
        await shot(H.page, '07-shown-1440');
        await shot(P.page, '07-shown-390');

        // The reconnecting pill on P's phone: the state reads fail, then come back.
        await P.page.route('**/api/poker-night/*/state**', (route) => route.abort());
        const lost = await P.page.waitForSelector('[data-pn-reconnecting]', {timeout: 30000}).then(() => true, () => false);
        const word = lost ? await P.page.locator('[data-pn-connection-word]').evaluate((el) => ({text: el.textContent, shown: el.getBoundingClientRect().width > 1})).catch(() => null) : null;
        const pill = [];
        if (lost) {
            for (const size of [{width: 390, height: 844}, {width: 320, height: 568}, {width: 844, height: 390}]) {
                await resize(P.page, size, 500);
                pill.push(await P.page.evaluate(() => {
                    const r = document.querySelector('[data-pn-reconnecting]')?.getBoundingClientRect();
                    const codeR = document.querySelector('[data-pn-code]')?.getBoundingClientRect();
                    const line = document.querySelector('[data-pn-status-line]')?.getBoundingClientRect();
                    const nav = document.querySelector('[data-pn-topbar] nav')?.getBoundingClientRect();
                    return {
                        inside: !!r && r.left >= -1 && r.right <= innerWidth + 1 && r.top >= -1 && r.bottom <= innerHeight + 1, scroll: document.documentElement.scrollWidth - innerWidth,
                        // The code on one line, or stepped aside on a phone; the status line clear of the buttons.
                        code: codeR && codeR.width > 0 ? Math.round(codeR.height) : 0, clear: !!line && !!nav && line.right <= nav.left + 1,
                    };
                }));
                await shot(P.page, `08-reconnecting-${sizeFile(size)}`);
            }
            await resize(P.page, {width: 390, height: 844}, 300);
        }
        await P.page.unroute('**/api/poker-night/*/state**');
        const back = await toasted(P.page, TABLE_COPY.connection.back, 30000);
        check('with the table unreachable, P\'s dock says "Reconnecting…" (on screen at 390, 320 and on its side, nothing sideways) and the top bar the word, the code never on two lines nor the line under the buttons; then "Back online."',
            lost && word?.text === TABLE_COPY.connection.reconnecting && word.shown && pill.every((x) => x.inside && x.scroll <= 0 && x.code <= 16 && x.clear) && back,
            JSON.stringify({lost, word, pill, back}));
        // Back online at 320 with the game paused: the code and the paused glyph on one line, clear of the buttons.
        await resize(P.page, {width: 320, height: 568}, 500);
        const bar320 = await P.page.evaluate(() => {
            const codeR = document.querySelector('[data-pn-code]')?.getBoundingClientRect();
            const line = document.querySelector('[data-pn-status-line]')?.getBoundingClientRect();
            const nav = document.querySelector('[data-pn-topbar] nav')?.getBoundingClientRect();
            return {code: codeR ? Math.round(codeR.height) : null, shown: !!codeR && codeR.width > 0, clear: !!line && !!nav && line.right <= nav.left + 1,
                paused: document.querySelector('[data-pn-table-status]')?.getAttribute('data-pn-table-status') ?? null};
        });
        check('…and at 320 px, back online with the game paused, the table code reads on one line beside the paused mark, clear of the buttons',
            bar320.shown && bar320.code !== null && bar320.code <= 16 && bar320.clear, JSON.stringify(bar320));
        await shot(P.page, '08-topbar-paused-320x568');
        await resize(P.page, {width: 390, height: 844}, 300);

        // The Hands drawer at the table: H on the host's screen, the menu on P's phone.
        await H.page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur());
        await H.page.keyboard.press('h');
        const byKey = await H.page.waitForSelector('[data-pn-drawer="hands"]', {timeout: 10000}).then(() => true, () => false);
        await sleep(400);
        const onH = await guideOf(H.page, '[data-pn-drawer="hands"]');
        check('H at the table opens the Hands guide: the ten rankings first, then the kicker pair, then Texas hold\'em under "At this table"',
            byKey && guideOk(onH) && onH.first === 'holdem' && onH.order === 'rankings,ties,here', JSON.stringify(onH));
        await wording(H.page, 'the Hands drawer', '[data-pn-drawer="hands"]');
        await shot(H.page, '09-hands-drawer-1440');
        await H.page.keyboard.press('Escape');
        await H.page.waitForSelector('[data-pn-drawer="hands"]', {state: 'detached', timeout: 10000}).catch(() => {});
        await P.page.click('[data-open="menu"]');
        await P.page.click('[data-menu="hands"]');
        const byMenu = await P.page.waitForSelector('[data-pn-drawer="hands"]', {timeout: 10000}).then(() => true, () => false);
        for (const size of SIZES) {
            await resize(P.page, size);
            const g = await guideOf(P.page, '[data-pn-drawer="hands"]');
            const m = await targets(P.page, '[data-pn-drawer="hands"]');
            check(`the Hands drawer from P's menu at ${sizeName(size)}: the rankings first, the first one whole on the first screen, every example inside its row, nothing sideways, its targets 44 px${size.width === 320 ? ', 40 px cards' : ''}`,
                byMenu && guideOk(g) && targetsOk(m) && g.order === 'rankings,ties,here' && g.firstRank <= g.vh && (size.width !== 320 || g.card === 40), `${JSON.stringify(g)} ${brief(m)}`);
            await shot(P.page, `09-hands-drawer-${sizeFile(size)}`);
        }
        await resize(P.page, {width: 390, height: 844});
        await P.page.keyboard.press('Escape');
        await P.page.waitForSelector('[data-pn-drawer="hands"]', {state: 'detached', timeout: 10000}).catch(() => {});

        // The emote picker on P's phone: thirteen faces, none alone on a row, a gutter at the edge.
        const pickerOf = () => P.page.evaluate(() => {
            const picker = document.querySelector('[data-pn-emote-picker]');
            const grid = picker?.querySelector('[data-emote-reactions]');
            if (!picker || !grid) return null;
            const r = picker.getBoundingClientRect();
            const cells = [...grid.querySelectorAll('button')].map((b) => b.getBoundingClientRect());
            const rows = [];
            for (const c of cells) {
                const row = rows.find((x) => Math.abs(x.top - c.top) < 2);
                if (row) row.n++;
                else rows.push({top: c.top, n: 1});
            }
            const panel = picker.querySelector('[role="tabpanel"]');
            return {
                count: cells.length, rows: rows.map((x) => x.n), left: Math.round(r.left), right: Math.round(r.right), vw: innerWidth,
                small: cells.filter((c) => c.width < 43.5 || c.height < 43.5).length, outside: cells.filter((c) => c.right > r.right + 0.5 || c.left < r.left - 0.5).length,
                sideways: panel ? panel.scrollWidth - panel.clientWidth : null,
            };
        });
        for (const size of [{width: 390, height: 844}, {width: 320, height: 568}]) {
            await resize(P.page, size);
            await P.page.click('[data-pn-emotes-open]');
            await P.page.waitForSelector('[data-pn-emote-picker] [data-emote-reactions]', {timeout: 10000}).catch(() => {});
            await sleep(300);
            const m = await pickerOf();
            check(`the emote picker at ${sizeName(size)}: thirteen faces, none alone on a row, every cell 44 px inside the picker, a gutter at the screen's edges, nothing sideways`,
                m !== null && m.count === 13 && !m.rows.includes(1) && m.small === 0 && m.outside === 0 && m.sideways !== null && m.sideways <= 0 && m.left >= 8 && m.right <= m.vw - 8,
                JSON.stringify(m));
            await shot(P.page, `16-emote-picker-${sizeFile(size)}`);
            await P.page.keyboard.press('Escape');
            await P.page.waitForSelector('[data-pn-emote-picker]', {state: 'detached', timeout: 10000}).catch(() => {});
        }
        await resize(P.page, {width: 390, height: 844});

        // Between hands, the host's Home and the menu's Leave ask "Leave the table?"; Stay changes nothing.
        await H.page.click('[data-open="home"]');
        await H.page.waitForSelector('[data-pn-leave-dialog]', {timeout: 10000});
        const fromHome = await leaveDialog(H.page);
        await shot(H.page, '03-leave-dialog-between-home-1440');
        await H.page.click('[data-pn-leave="stay"]');
        await H.page.waitForSelector('[data-pn-leave-dialog]', {state: 'detached', timeout: 10000}).catch(() => {});
        await H.page.click('[data-open="menu"]');
        await H.page.click('[data-menu="leave"]', {timeout: 5000});
        await H.page.waitForSelector('[data-pn-leave-dialog]', {timeout: 10000});
        const fromMenu = await leaveDialog(H.page);
        await H.page.click('[data-pn-leave="stay"]');
        await H.page.waitForSelector('[data-pn-leave-dialog]', {state: 'detached', timeout: 10000}).catch(() => {});
        check('between hands, the host\'s Home asks "Leave the table?" with [Stay] [Leave and go]; the menu\'s Leave [Stay] [Leave]; Stay keeps the seat',
            fromHome?.kind === 'between' && fromHome.then === 'home' && fromHome.title === TABLE_COPY.leaveTitle && fromHome.leave === TABLE_COPY.leaveAndGo
            && fromMenu?.kind === 'between' && fromMenu.then === 'stay' && fromMenu.leave === TABLE_COPY.leave && seatIndex(await roomDoc(), H) >= 0,
            JSON.stringify({fromHome, fromMenu}));
        await phoneDialog('between');
    }

    // ═══ the host leaves their seat in the break (the menu's Leave, then the dialog's Leave): ════
    // the left panel, for an account
    {
        const before = await roomDoc();
        const stackH = before.state.seats[seatIndex(before, H)].stack;
        const cashed0 = ledgerRow(before, H).cashedOut;
        await H.page.click('[data-open="menu"]');
        await H.page.click('[data-menu="leave"]', {timeout: 5000});
        await H.page.waitForSelector('[data-pn-leave-dialog="between"] [data-pn-leave="leave"]', {timeout: 10000});
        await H.page.click('[data-pn-leave-dialog] [data-pn-leave="leave"]');
        const left = await H.page.waitForSelector('[data-pn-left]', {timeout: 20000}).then(() => true, () => false);
        const dialogOpened = await H.page.locator('[data-pn-leave-dialog]').count();
        const after = await roomDoc();
        const row = ledgerRow(after, H);
        const panel = left ? await H.page.evaluate(() => ({
            net: Number(document.querySelector('[data-pn-left]')?.getAttribute('data-pn-left')),
            netText: document.querySelector('[data-pn-left-net]')?.textContent ?? null,
            home: document.querySelector('[data-pn-left] [data-pn-home]')?.getAttribute('href') ?? null,
            again: document.querySelector('[data-pn-left] [data-pn-sit-again]')?.textContent?.trim() ?? null,
            lobby: document.querySelector('[data-pn-left] [data-pn-lobby]')?.getAttribute('href') ?? null,
            topHome: document.querySelector('[data-open="home"]')?.tagName ?? null,
        })) : null;
        check('the host leaves in the break through the menu\'s "Leave the table?" and its Leave: the dialog gone, out of the seat, on the table, cashed out for the whole stack',
            left && dialogOpened === 0 && seatIndex(after, H) === -1 && row.cashedOut - cashed0 === stackH && new URL(H.page.url()).pathname === `/play/${code}`,
            `${JSON.stringify(panel)} stack ${stackH}`);
        check('…the left panel: the net, "Back to AeroTrade" to "/", "Sit down again" and, for an account, the lobby; the top bar\'s Home now a plain link',
            panel?.net === row.cashedOut - row.bought && panel.netText === TABLE_COPY.netTonight(row.cashedOut - row.bought) && panel.home === '/'
            && panel.again === TABLE_COPY.sitAgain && panel.lobby === '/poker-night' && panel.topHome === 'A', JSON.stringify(panel));
        await wording(H.page, 'the left panel', '[data-pn-dock]');
        await shot(H.page, '10-left-panel-account-1440');
        for (const size of SIZES) {
            await resize(H.page, size);
            const m = await targets(H.page, '[data-pn-left]');
            const t = await tableLayout(H.page);
            check(`the left panel at ${sizeName(size)}: its three buttons 44 px, none overlapping, on screen, nothing sideways`,
                targetsOk(m) && m.count === 3 && t.row === true && t.scroll <= 0, `${brief(m)} row ${t.row}`);
            await shot(H.page, `10-left-panel-account-${sizeFile(size)}`);
        }
        await resize(H.page, DESKTOP.viewport, 400);

        // The lobby button: the lobby, with no "You are seated" card now.
        await H.page.click('[data-pn-left] [data-pn-lobby]');
        const lobby = await H.page.waitForSelector('[data-poker-night-lobby]', {timeout: 60000}).then(() => true, () => false);
        check('…its lobby button opens the lobby, with no "You are seated at …" card for a table they left',
            lobby && await H.page.locator('[data-lobby-resume]').count() === 0, H.page.url());
        // Home from the table as a watcher: a plain link; an account lands on Home, its row now Open.
        await H.page.goto(`${BASE}/play/${code}`, {waitUntil: 'load', timeout: 120000});
        await H.page.waitForSelector('[data-pn-left]', {timeout: 30000});
        await H.page.click('[data-open="home"]');
        const home = await H.page.waitForSelector('[data-home]', {timeout: 60000}).then(() => true, () => false);
        await H.page.waitForSelector(`[data-home-pn-table="${code}"]`, {timeout: 30000}).catch(() => {});
        const go = await H.page.getAttribute(`[data-home-pn-table="${code}"] [data-home-pn-go]`, 'data-home-pn-go').catch(() => null);
        check('"Back to AeroTrade" from the table takes an account to Home, where the table is now an Open (hosted, no seat)',
            home && new URL(H.page.url()).pathname === '/' && go === 'open', `${H.page.url()} ${go}`);
        await H.page.click(`[data-home-pn-table="${code}"] [data-home-pn-go]`);
        await H.page.waitForSelector('[data-pn-left] [data-pn-armed] [data-pn-sit-again]', {timeout: 60000});
        await H.page.click('[data-pn-left] [data-pn-sit-again]');
        await H.page.waitForSelector('[data-join-card="watcher"]', {timeout: 15000});
        await H.page.click('[data-join-sit]');
        const again = await waitDoc((d) => seatIndex(d, H) >= 0, 15000);
        check('…and "Sit down again" opens the seat card; one tap seats the host again', again !== null && await H.page.locator('[data-me]').count() === 1);
    }

    // ═══ resume: a deal lands while the leave dialogs are open ══════════════════════════════════
    {
        // Opened while the game is paused, between hands; then the host's resume deals in 3 s.
        await H.page.click('[data-open="home"]');
        await H.page.waitForSelector('[data-pn-leave-dialog="between"]', {timeout: 10000});
        await Q.page.click('[data-open="menu"]');
        await Q.page.click('[data-menu="leave"]', {timeout: 5000});
        await Q.page.waitForSelector('[data-pn-leave-dialog="between"]', {timeout: 10000});
        // The early choices' tap shield: at the deal they take the break's place under P's thumb; a tap
        // the moment they appear must store no pre-action (one would play a move by itself).
        await P.page.evaluate(() => {
            const probe = {tapped: false, armedAtTap: null, pre: null};
            window.__pnPreProbe = probe;
            const obs = new MutationObserver(() => {
                const row = document.querySelector('[data-pn-pre]');
                const button = row?.querySelector('[data-pre]');
                if (probe.tapped || !button) return;
                probe.tapped = true;
                probe.armedAtTap = row.hasAttribute('data-pn-armed');
                probe.pre = button.getAttribute('data-pre');
                button.dispatchEvent(new MouseEvent('click', {bubbles: true, cancelable: true, detail: 1}));
                obs.disconnect();
            });
            window.__pnPreObserver = obs;
            obs.observe(document.body, {subtree: true, childList: true});
        });
        const resumed = await hostOp(H, {op: 'resume'});
        check('the host resumes', resumed.status === 200);
        const dealt = await waitDoc((d) => d.state.hand?.no === 2 && d.state.hand.phase === 'betting', 20000);
        {
            const tapped = await P.page.waitForFunction(() => window.__pnPreProbe.tapped, null, {timeout: 10000}).then(() => true, () => false);
            await sleep(TAP_SHIELD_MS + 400);
            const probe = await P.page.evaluate(() => {
                window.__pnPreObserver?.disconnect();
                return window.__pnPreProbe;
            });
            const stored = handSeat(await roomDoc(), P)?.pre ?? null;
            const armed = await P.page.locator('[data-pn-pre][data-pn-armed]').count() === 1;
            if (!tapped || probe.armedAtTap) note('the tap shield on the early choices', `the probe ${tapped ? 'found the row armed already' : 'never saw the early choices (P first to act)'}: not checked`);
            else check(`the tap shield: a tap the moment P's early choices replace the break at the deal stores no pre-action; the row arms after ${TAP_SHIELD_MS} ms`,
                stored === null && armed, JSON.stringify({probe, stored, armed}));
        }
        const seen = [];
        for (const p of [H, Q]) {
            if (!dealt || dealt.state.hand.actor === seatIndex(dealt, p)) continue; // their turn closes it
            const m = await p.page.waitForSelector('[data-pn-leave-dialog="mid-hand"]', {timeout: 8000}).then(() => leaveDialog(p.page), () => leaveDialog(p.page));
            seen.push({p: p.name, ...m});
        }
        check('a deal that lands while the leave dialog is open turns it into "Leave in the middle of a hand?" before anyone confirms',
            seen.length > 0 && seen.every((m) => m.kind === 'mid-hand' && m.title === TABLE_COPY.leaveMidHandTitle
                && m.leave === (m.then === 'home' ? TABLE_COPY.leaveNowAndGo : TABLE_COPY.leaveNow)), JSON.stringify(seen));
        if (seen.length > 0) await shot(seen[0].p === 'host' ? H.page : Q.page, '03-leave-dialog-switched');
        for (const p of [H, Q]) {
            if (await p.page.locator('[data-pn-leave-dialog]').count() > 0) await p.page.click('[data-pn-leave="stay"]');
        }
        const kept = await roomDoc();
        check('…and Stay sends nothing: both still seated and dealt in', [H, Q].every((p) => seatIndex(kept, p) >= 0 && handSeat(kept, p) !== null && !handSeat(kept, p).folded));
    }

    // ═══ hand 2: the host folds and sits Q out from the Bank; the race in the break after it ═════
    {
        let bankDone = false;
        const doc2 = await playByClicks(2, {
            choose: (p) => (p === H ? 'fold' : 'call'),
            after: async (p, d) => {
                if (p !== H || bankDone || !handSeat(d, H)?.folded) return;
                bankDone = true;
                await H.page.click('[data-open="bank"]');
                await H.page.waitForSelector('[data-pn-drawer="bank"]', {timeout: 10000});
                // The host's sit-out sits on a line of its own under the player's row.
                const row = `[data-bank-sit-out-row="${Q.pid}"]`;
                const own = await H.page.locator(`[data-bank-sit-out-row="${H.pid}"]`).count();
                const label = (await H.page.innerText(`${row} [data-host-sit-out="offer"] button`).catch(() => '')).trim();
                await H.page.click(`${row} [data-host-sit-out="offer"] button`);
                const on = await waitDoc((x) => x.state.seats[seatIndex(x, Q)]?.sitOutNext === true, 10000);
                const waiting = await H.page.waitForSelector(`${row} [data-host-sit-out="waiting"]`, {timeout: 10000}).then(() => true, () => false);
                const waitingText = waiting ? (await H.page.innerText(`${row} [data-host-sit-out="waiting"]`)).trim() : '';
                const takeBack = await H.page.locator(`${row} button`).count();
                check('mid-hand, the host\'s Bank sits Q out from the next hand, from a line of its own under Q\'s row (none for the host); then says it waits, with no take-back (dealing a player in is theirs alone)',
                    own === 0 && label === HOST_COPY.sitOut && on !== null && waiting && waitingText === HOST_COPY.sitOutWaiting && takeBack === 0 && handSeat(on, Q) !== null,
                    JSON.stringify({own, label, on: on !== null, waiting, waitingText, takeBack}));
                await shot(H.page, '11-bank-sit-out-1440');
                for (const size of SIZES) {
                    await resize(H.page, size);
                    const m = await targets(H.page, '[data-pn-drawer="bank"]');
                    // The other players' "Sit out next hand": its own line, never crushed into the Player column.
                    const offers = await H.page.evaluate(() => [...document.querySelectorAll('[data-bank-sit-out-row] [data-host-sit-out="offer"] button')].map((b) => {
                        const r = b.getBoundingClientRect();
                        return {w: Math.round(r.width), h: Math.round(r.height), text: b.innerText.trim()};
                    }));
                    check(`the Bank with the host's sit-out at ${sizeName(size)}: every target 44 px, none overlapping, nothing sideways; each "${HOST_COPY.sitOut}" on one line`,
                        targetsOk(m) && offers.length > 0 && offers.every((o) => o.h <= 48 && o.w >= 44 && o.text === HOST_COPY.sitOut), `${brief(m)} ${JSON.stringify(offers)}`);
                    await shot(H.page, `11-bank-sit-out-${sizeFile(size)}`);
                }
                await resize(H.page, DESKTOP.viewport, 400);
                await wording(H.page, 'the Bank with the host\'s sit-out', '[data-pn-drawer="bank"]');
                await H.page.keyboard.press('Escape');
                await H.page.waitForSelector('[data-pn-drawer="bank"]', {state: 'detached', timeout: 10000}).catch(() => {});
                // The host drawer's Players list agrees: Q's row says it waits and its More menu offers no
                // sit-out; P's offers "Sit out next hand" above Remove (not pressed: P plays on).
                await H.page.click('[data-open="host"]');
                await H.page.waitForSelector('[data-pn-drawer="host"]', {timeout: 10000});
                await H.page.click('[data-host-tab="players"]');
                await H.page.waitForSelector(`[data-host-player="${Q.pid}"]`, {timeout: 10000});
                const qWaits = await H.page.locator(`[data-host-player="${Q.pid}"] [data-host-sit-out-waiting]`).count();
                const menuOf = async (p) => {
                    await H.page.click(`[data-host-player="${p.pid}"] [data-host-more]`);
                    await H.page.waitForSelector('[role="menu"] [data-host-remove]', {timeout: 10000});
                    const items = await H.page.$$eval('[role="menu"] [role="menuitem"]', (els) => els.map((el) => (el.hasAttribute('data-host-menu-sit-out') ? 'sit-out'
                        : el.hasAttribute('data-host-remove') ? 'remove' : el.hasAttribute('data-host-handover') ? 'hand-over' : 'other')));
                    const text = await H.page.innerText('[role="menu"] [data-host-menu-sit-out]').catch(() => null);
                    await H.page.keyboard.press('Escape');
                    await H.page.waitForSelector('[role="menu"]', {state: 'detached', timeout: 10000}).catch(() => {});
                    return {items, text: text?.trim() ?? null};
                };
                const qMenu = await menuOf(Q);
                const pMenu = await menuOf(P);
                await shot(H.page, '11-host-players-1440');
                check('…the host drawer\'s Players list agrees: Q\'s row says it waits, Q\'s More menu has no sit-out; P\'s More menu offers "Sit out next hand" above Remove',
                    qWaits === 1 && !qMenu.items.includes('sit-out') && qMenu.items.includes('remove') && pMenu.text === HOST_COPY.sitOut
                    && pMenu.items.indexOf('sit-out') >= 0 && pMenu.items.indexOf('sit-out') < pMenu.items.indexOf('remove'), JSON.stringify({qWaits, qMenu, pMenu}));
                await H.page.keyboard.press('Escape');
                await H.page.waitForSelector('[data-pn-drawer="host"]', {state: 'detached', timeout: 10000}).catch(() => {});
            },
        });
        check('hand 2 played to its end with Q still in it', doc2.state.hand.no === 2 && doc2.state.hand.phase === 'complete' && handSeat(doc2, Q) !== null);

        // The race: R leaves with one tap a moment before the next deal falls due. Every page's ticks
        // are held until R's leave is answered, so nothing but R's own request could deal; the leave,
        // which arrived first, lands first — R is never dealt in, so no ante of R's goes in a pot.
        const due = doc2.state.nextHandAt;
        const seatR = seatIndex(doc2, R);
        const stackR = doc2.state.seats[seatR].stack;
        const cashedR = ledgerRow(doc2, R).cashedOut;
        let release;
        const held = new Promise((resolve) => {
            release = resolve;
        });
        const hold = async (route) => {
            await held;
            await route.continue().catch(() => {});
        };
        for (const p of [H, P, Q, R]) await p.page.route('**/api/poker-night/*/tick', hold);
        await R.page.waitForSelector('[data-pn-seat-controls][data-pn-armed] [data-pn-control="leave"]', {timeout: 15000});
        const wait = due - 300 - Date.now();
        if (wait > 0) await sleep(wait);
        const tappedAt = Date.now();
        await R.page.click('[data-pn-control="leave"]');
        const out = await waitDoc((d) => seatIndex(d, R) === -1, 10000, 50);
        const dialog = await R.page.locator('[data-pn-leave-dialog]').count();
        release();
        for (const p of [H, P, Q, R]) await p.page.unroute('**/api/poker-night/*/tick', hold).catch(() => {});
        const doc3 = await waitDoc((d) => d.state.hand?.no === 3, 15000);
        const rowR = ledgerRow(doc3, R);
        const inHand3 = doc3 ? handSeat(doc3, R) !== null : null;
        const early = tappedAt < due - 50;
        const detail = JSON.stringify({tapped: tappedAt - due, out: out !== null, dialog, inHand3, cashed: rowR && rowR.cashedOut - cashedR, stackR,
            dealtAt: doc3 && doc3.state.hand.startedAt - due, seats: doc3?.state.hand.seats.map((s) => s.pid === R.pid ? 'R' : s.pid === Q.pid ? 'Q' : s.pid === H.pid ? 'H' : 'P')});
        if (!early) {
            note('the leave in the break, close to the deal', `the tap went out ${tappedAt - due} ms from the deal, not ahead of it: not checked ${detail}`);
        } else {
            check('R leaves in the break with one tap 300 ms before the next deal: no dialog, the leave lands first — R is not dealt into hand 3 and is cashed out for every chip (no ante lost)',
                out !== null && dialog === 0 && doc3 !== null && inHand3 === false && rowR.cashedOut - cashedR === stackR, detail);
        }
        // The left panel, for a guest: no lobby.
        const panel = await R.page.waitForSelector('[data-pn-left]', {timeout: 15000}).then(() => R.page.evaluate(() => ({
            home: document.querySelector('[data-pn-left] [data-pn-home]')?.getAttribute('href') ?? null,
            again: document.querySelector('[data-pn-left] [data-pn-sit-again]') !== null,
            lobby: document.querySelector('[data-pn-left] [data-pn-lobby]') !== null,
            net: Number(document.querySelector('[data-pn-left]')?.getAttribute('data-pn-left')),
        })), () => null);
        check('…R\'s left panel: the net, Home to "/" and "Sit down again" — no lobby for a guest',
            panel?.home === '/' && panel.again && !panel.lobby && panel.net === rowR.cashedOut - rowR.bought, JSON.stringify(panel));
        for (const size of SIZES) {
            await resize(R.page, size);
            const m = await targets(R.page, '[data-pn-left]');
            check(`R's left panel at ${sizeName(size)}: its two buttons 44 px, none overlapping, nothing sideways`, targetsOk(m) && m.count === 2, brief(m));
            await shot(R.page, `12-left-panel-guest-${sizeFile(size)}`);
        }
        await resize(R.page, {width: 375, height: 667});

        // Q, sat out by the host, is not dealt into hand 3 and is told so; "I'm back" deals Q in again.
        check('Q, sat out by the host during hand 2, sits out from hand 3', doc3 !== null && handSeat(doc3, Q) === null && doc3.state.seats[seatIndex(doc3, Q)]?.sittingOut === true);
        const told = await Q.page.waitForSelector('[data-pn-sat-out="host"]', {timeout: 20000}).then(() => Q.page.innerText('[data-pn-sat-out="host"]'), () => null);
        const toast = await toasted(Q.page, TABLE_COPY.hostSatYouOut, 5000);
        await Q.page.waitForSelector('[data-pn-seat-controls][data-pn-armed] [data-pn-control="sit-in"]', {timeout: 10000});
        const backLabel = (await Q.page.innerText('[data-pn-control="sit-in"]')).trim();
        await wording(Q.page, 'Q\'s dock, sat out by the host', '[data-pn-dock]');
        await shot(Q.page, '13-sat-out-1440');
        await Q.page.click('[data-pn-control="sit-in"]');
        const backIn = await waitDoc((d) => d.state.seats[seatIndex(d, Q)]?.sittingOut === false, 10000);
        check('…Q\'s dock says "The host sat you out." (a toast too), and Q\'s "I\'m back" takes Q off sitting out',
            told?.trim() === TABLE_COPY.hostSatYouOut && toast && backLabel === TABLE_COPY.back && backIn !== null, JSON.stringify({told, toast, backLabel}));

        // R sits down again from the left panel.
        await R.page.waitForSelector('[data-pn-left] [data-pn-armed] [data-pn-sit-again]', {timeout: 10000});
        await R.page.click('[data-pn-left] [data-pn-sit-again]');
        await R.page.waitForSelector('[data-join-card="watcher"]', {timeout: 15000});
        await R.page.click('[data-join-sit]');
        const reseated = await waitDoc((d) => seatIndex(d, R) >= 0, 15000);
        check('R\'s "Sit down again" seats R again in one more tap', reseated !== null);
    }

    // ═══ hand 3 (the host and P), then hand 4 with Q and R back ══════════════════════════════════
    {
        const doc3 = await playByClicks(3);
        check('hand 3 plays to its end', doc3.state.hand.no === 3 && doc3.state.hand.phase === 'complete');
        const doc4 = await waitDoc((d) => d.state.hand?.no === 4 && d.state.hand.phase === 'betting', 25000);
        check('hand 4 deals Q in again after "I\'m back", and R after sitting down again', doc4 !== null && handSeat(doc4, Q) !== null && handSeat(doc4, R) !== null,
            JSON.stringify(doc4?.state.hand.seats.map((s) => s.pid)));
        // R goes home mid-hand: "Leave now and go", and a guest lands on the landing page.
        let homeDone = false;
        const paused = await hostOp(H, {op: 'pause'});
        check('the host pauses again, hand 4 playing on', paused.status === 200);
        const tryHome = async (d) => {
            if (homeDone || d.state.hand?.phase !== 'betting' || handSeat(d, R)?.folded || d.state.hand.actor === seatIndex(d, R)) return;
            homeDone = true;
            await R.page.click('[data-open="home"]');
            await R.page.waitForSelector('[data-pn-leave-dialog="mid-hand"]', {timeout: 10000});
            const m = await leaveDialog(R.page);
            await R.page.click('[data-pn-leave="leave"]');
            const landed = await R.page.waitForSelector('[data-landing]', {timeout: 60000}).then(() => true, () => false);
            R.gone = true;
            const after = await roomDoc();
            const seatR = seatIndex(after, R);
            check('mid-hand, a seated guest\'s Home asks first and "Leave now and go" leaves the seat and loads "/": the landing page, never /sign-in',
                m?.then === 'home' && m.leave === TABLE_COPY.leaveNowAndGo && landed && new URL(R.page.url()).pathname === '/' && !/sign-in/.test(R.page.url())
                && (seatR === -1 || after.state.seats[seatR].leaving === true), `${JSON.stringify(m)} → ${R.page.url()}`);
        };
        // Q folds, then asks to sit out (the dock says it waits; "Deal me in" takes it back), then
        // leaves: the plate still reads Folded, Q's own view says Q leaves when the hand ends.
        let foldLeaveDone = false;
        const foldThenLeave = async (p, d) => {
            if (foldLeaveDone || p !== Q || !handSeat(d, Q)?.folded || d.state.hand?.phase !== 'betting') return;
            foldLeaveDone = true;
            await resize(Q.page, {width: 390, height: 844}, 700);
            await Q.page.waitForSelector('[data-pn-seat-controls][data-pn-armed] [data-pn-control="sit-out"]', {timeout: 15000});
            await Q.page.click('[data-pn-control="sit-out"]');
            const waits = await waitDoc((x) => x.state.seats[seatIndex(x, Q)]?.sitOutNext === true, 10000);
            const said = await Q.page.waitForSelector('[data-pn-sit-out-next]', {timeout: 10000}).then((el) => el.innerText(), () => null);
            const takeBack = await Q.page.waitForSelector('[data-pn-seat-controls] [data-pn-control="take-back"]', {timeout: 10000}).then(() => true, () => false);
            const stillOffered = await Q.page.locator('[data-pn-seat-controls] [data-pn-control="sit-out"]').count();
            const waitsM = await targets(Q.page, '[data-pn-dock]');
            await shot(Q.page, '14-sit-out-next-390x844');
            await Q.page.click('[data-pn-control="take-back"]');
            const back = await waitDoc((x) => x.state.seats[seatIndex(x, Q)]?.sitOutNext === false, 10000);
            const offeredAgain = await Q.page.waitForSelector('[data-pn-seat-controls] [data-pn-control="sit-out"]', {timeout: 10000}).then(() => true, () => false);
            check('…Q, folded, taps Sit out: beside the cards "You sit out from the next hand." and "Deal me in" in place of Sit out (44 px targets); "Deal me in" takes it back',
                waits !== null && said?.trim() === TABLE_COPY.sitOutNextNote && takeBack && stillOffered === 0 && targetsOk(waitsM) && back !== null && offeredAgain,
                JSON.stringify({waits: waits !== null, said, takeBack, stillOffered, dock: brief(waitsM), back: back !== null, offeredAgain}));
            await Q.page.waitForSelector('[data-pn-seat-controls][data-pn-armed] [data-pn-control="leave"]', {timeout: 10000});
            await Q.page.click('[data-pn-control="leave"]');
            const gone = await waitDoc((x) => x.state.seats[seatIndex(x, Q)]?.leaving === true, 10000);
            const leavingSaid = await Q.page.waitForSelector('[data-pn-leaving]', {timeout: 10000}).then((el) => el.innerText(), () => null);
            const look = await Q.page.evaluate(() => ({
                controls: [...document.querySelectorAll('[data-pn-seat-controls] [data-pn-control]')].map((b) => b.getAttribute('data-pn-control')),
                home: document.querySelector('[data-open="home"]')?.tagName ?? null,
                dialog: document.querySelector('[data-pn-leave-dialog]') !== null,
                folded: document.querySelector('[data-pn-dock] [data-pn-hole="folded"]') !== null,
            }));
            await Q.page.click('[data-open="menu"]');
            await Q.page.waitForSelector('[data-menu="log"]', {timeout: 10000});
            const menu = await Q.page.$$eval('[data-menu]', (els) => els.map((el) => el.getAttribute('data-menu')));
            await Q.page.keyboard.press('Escape');
            await Q.page.waitForSelector('[data-menu="log"]', {state: 'detached', timeout: 10000}).catch(() => {});
            const plate = handSeat(gone, Q);
            check('…then Leave, one tap: Q leaves when the hand ends — the dock says so ("You leave when this hand ends.") and offers nothing more, the menu neither a seat choice nor Leave, and Home goes straight home',
                gone !== null && plate?.folded === true && leavingSaid?.trim() === TABLE_COPY.leavingAfterHand && look.controls.length === 0 && look.home === 'A' && !look.dialog
                && look.folded && !menu.some((m) => ['leave', 'sit-out', 'deal-me-in', 'back'].includes(m)), JSON.stringify({gone: gone !== null, leavingSaid, look, menu}));
            await wording(Q.page, 'Q\'s dock, folded and leaving', '[data-pn-dock]');
            await shot(Q.page, '15-leaving-after-fold-390x844');
        };
        if (doc4) await tryHome(doc4);
        const done4 = doc4 ? await playByClicks(4, {
            choose: (p) => (p === Q && !foldLeaveDone ? 'fold' : 'call'),
            after: async (p, d) => {
                await tryHome(d);
                await foldThenLeave(p, await roomDoc());
            },
        }) : null;
        if (!homeDone) note('a guest\'s Home mid-hand', 'R never held cards off the clock in hand 4: not checked');
        if (!foldLeaveDone) note('a folded player leaving mid-hand', 'Q never folded while hand 4 was being bet: not checked');
        check('hand 4 plays to its end, R\'s seat let go', done4 !== null && done4.state.hand.phase === 'complete' && seatIndex(done4, R) === -1);
        if (foldLeaveDone) {
            const left = await Q.page.waitForSelector('[data-pn-left]', {timeout: 20000}).then(() => true, () => false);
            check('…and Q, who left after folding, is cashed out as it ends: the left panel', left && seatIndex(await roomDoc(), Q) === -1);
        }

        // The host goes home between hands: "Leave the table?", "Leave and go", Home.
        await H.page.click('[data-open="home"]');
        await H.page.waitForSelector('[data-pn-leave-dialog="between"]', {timeout: 10000});
        const m = await leaveDialog(H.page);
        await H.page.click('[data-pn-leave="leave"]');
        const home = await H.page.waitForSelector('[data-home]', {timeout: 60000}).then(() => true, () => false);
        const after = await roomDoc();
        check('between hands, the host\'s "Leave and go" leaves the seat and loads Home ("/") for an account',
            m?.then === 'home' && m.leave === TABLE_COPY.leaveAndGo && home && new URL(H.page.url()).pathname === '/' && seatIndex(after, H) === -1,
            `${JSON.stringify(m)} → ${H.page.url()}`);
    }

    // ═══ the new words, as written ═══════════════════════════════════════════════════════════════
    {
        const strings = (value) => (typeof value === 'string' ? [value] : Array.isArray(value) ? value.flatMap(strings)
            : value && typeof value === 'object' ? Object.values(value).flatMap(strings) : []);
        const sample = 'Ana';
        const fixed = [
            ...strings(HANDS_COPY), ...strings(HOME_PANEL_COPY),
            TABLE_COPY.home, TABLE_COPY.sitOutShort, TABLE_COPY.showShort, TABLE_COPY.leaveShort, TABLE_COPY.hostSatYouOut, TABLE_COPY.foldedHand,
            TABLE_COPY.leaveMidHandTitle, TABLE_COPY.leaveNow, TABLE_COPY.leaveAndGo, TABLE_COPY.leaveNowAndGo, TABLE_COPY.rebuysOffNote,
            TABLE_COPY.rebuysAskNote, TABLE_COPY.rebuyCapNote, TABLE_COPY.leftTitle, TABLE_COPY.netTonight(-120), TABLE_COPY.netTonight(450), TABLE_COPY.sitAgain,
            TABLE_COPY.lobby, TABLE_COPY.connection.reconnecting, TABLE_COPY.connection.back,
            TABLE_COPY.leavingAfterHand, TABLE_COPY.sitOutNextNote, TABLE_COPY.dealMeIn, TABLE_COPY.leaveBodyInHand(1975), TABLE_COPY.leaveBodyInHand(1),
            HOST_COPY.sitOut, HOST_COPY.sitOutFor(sample), HOST_COPY.sitOutWaiting, HOST_COPY.satOut(sample),
            HOST_COPY.satOutNow(sample), POKER_NIGHT_COPY.resumeTitle('Ana\'s table'), POKER_NIGHT_COPY.rejoin,
            FELT_COPY.mainPot(600), FELT_COPY.sidePot(1, 1_350), FELT_COPY.morePots(2, 5_050), FELT_COPY.allPots(4, 6_250), FELT_COPY.sidePot(3, 1_250_000),
        ];
        const hits = fixed.flatMap((text) => wordingOf(text).map((hit) => `"${text.slice(0, 40)}": ${hit}`));
        check(`the no-advice list (and no Hold/Buy/Sell opener, no currency word) over every new string as written (${fixed.length})`,
            hits.length === 0 && fixed.every((t) => typeof t === 'string' && t.length > 0), hits.slice(0, 4).join(' | '));
    }

    // ═══ side pots on a phone: every pot's pill clear of every card, plate, the button and the banner ═
    // A new table of four, its stacks seeded in Mongo (150, 600, 2,450 and 4,800, the chips conserved):
    // the two short stacks all in before the flop make a main pot and a side pot, a bet on the flop a
    // second side pot, and an all-in on the turn runs the board out to a showdown that pays all three.
    // On the flop and the turn a seated phone and a watching one, each at 390 × 844, 375 × 667, 320 × 568
    // and on its side at 844 × 390; through the run-out and the payout six screens at once (those sizes,
    // seated and watching, and the host's desktop). Every pot pill's rectangle against every card (the
    // board's, a lit card's lift, the dock's, a seat's pair or turned-up hand), plate, flag, blind's
    // mark, open seat, the dealer button, the banner and the line under it: no intersection; each pot's
    // words at 11 px or more, unclipped, on screen; every pot in exactly one pill.
    {
        await hostOp(H, {op: 'end'}).catch(() => null);
        await H.page.goto(`${BASE}/poker-night`, {waitUntil: 'load', timeout: 180000});
        await H.page.click('[data-quick-start]');
        await H.page.waitForURL(/\/play\/[A-HJ-NP-Z2-9]{6}(\?.*)?$/, {timeout: 120000});
        code = new URL(H.page.url()).pathname.split('/').pop();
        await H.page.waitForSelector('[data-pn-drawer="invite"]', {timeout: 60000}).catch(() => {});
        await H.page.keyboard.press('Escape');
        H.pid = (await roomDoc()).state.hostPid;
        const X = await newPlayer('sideSeated', PHONE(390, 844));
        const Y = await newPlayer('sideY', PHONE(375, 667));
        const Z = await newPlayer('sideZ', PHONE(320, 568));
        await sitDown(X, 'Xena');
        await sitDown(Y, 'Yuri');
        await sitDown(Z, 'Zed');
        const watch = async (p) => {
            await p.page.goto(`${BASE}/play/${code}`, {waitUntil: 'load', timeout: 120000});
            await p.page.waitForSelector('[data-join-card="visitor"]', {timeout: 60000});
            await p.page.click('[data-join-watch]');
            await p.page.waitForSelector('[data-join-card]', {state: 'detached', timeout: 30000}).catch(() => {});
            await p.page.waitForSelector('[data-pn-ready="true"]', {timeout: 30000}).catch(() => {});
        };
        const W = await newPlayer('sideWatcher', PHONE(390, 844));
        const W2 = await newPlayer('sideWatcher320', PHONE(320, 568));
        await watch(W);
        await watch(W2);
        await hostOp(H, {op: 'config', patch: {turnSeconds: 120}});
        let d = await roomDoc();
        const before = d.state.seats.reduce((s, seat) => s + (seat?.stack ?? 0), 0);
        const stacks = new Map([[Z, 150], [Y, 600], [X, 2_450], [H, before - 150 - 600 - 2_450]]);
        const set = {};
        for (const [p, n] of stacks) set[`state.seats.${seatIndex(d, p)}.stack`] = n;
        await rooms.updateOne({env: ENV, code}, {$set: set, $inc: {seq: 1}});
        d = await roomDoc();
        check('side pots: four seated with stacks of 150, 600, 2,450 and the rest, chips conserved, and a watcher on two phones',
            [H, X, Y, Z].every((p) => d.state.seats[seatIndex(d, p)]?.stack === stacks.get(p)) && d.state.seats.reduce((s, seat) => s + (seat?.stack ?? 0), 0) === before,
            JSON.stringify(d.state.seats.map((s) => s?.stack ?? null)));
        const started = await hostOp(H, {op: 'start'});
        d = await waitDoc((x) => x.state.hand?.phase === 'betting', 30000);
        check('…the host starts the game: a hand is dealt', started.status === 200 && d !== null, `${started.status}`);
        const handNo = d.state.hand.no;

        // Each move by the API, the actor's choice from the moves legalFor offers, until `stop`.
        const actors = [H, X, Y, Z];
        const playUntil = async (stop, choose, timeout = 60000) => {
            const t0 = Date.now();
            while (Date.now() - t0 < timeout) {
                const doc = await roomDoc();
                const hand = doc.state.hand;
                if (hand?.no === handNo && stop(doc)) return doc;
                if (!hand || hand.no !== handNo || hand.phase !== 'betting' || hand.actor === null) {
                    await sleep(150);
                    continue;
                }
                const actor = actors.find((p) => p.pid === doc.state.seats[hand.actor]?.pid);
                const legal = legalFor(snapshotFromState(doc.state), hand.actor);
                const move = choose(actor, legal);
                const r = await api(actor, 'action', {actionId: randomUUID(), type: 'act', turn: doc.state.turn, move});
                if (r.status !== 200) throw new Error(`side pots: ${actor.name}'s ${JSON.stringify(move)} answered ${r.status} ${JSON.stringify(r.body?.error)}`);
                for (let i = 0; i < 100; i++) {
                    const next = await roomDoc();
                    if (next.state.turn !== doc.state.turn || next.state.hand?.phase !== 'betting') break;
                    await sleep(100);
                }
            }
            throw new Error(`side pots: hand ${handNo} did not reach its stop in ${timeout} ms`);
        };

        // What a screen shows of the pots, against everything they must not cover.
        const SIDEPOT_PROBE = () => {
            const vis = (el) => {
                const r = el.getBoundingClientRect();
                const cs = getComputedStyle(el);
                return r.width > 0.5 && r.height > 0.5 && cs.visibility !== 'hidden' && cs.display !== 'none';
            };
            // A winner's "+N" counts only while it shows (it rises from nothing and fades away).
            const showing = (el) => vis(el) && parseFloat(getComputedStyle(el).opacity) > 0.05;
            const box = (el) => el.getBoundingClientRect();
            const hit = (a, b) => a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;
            const pills = [...document.querySelectorAll('[data-pn-pot] [data-pot]')].filter(vis).map((el) => {
                const label = el.querySelector('.pn-pot-label');
                return {r: box(el), pots: el.getAttribute('data-pot'), text: label?.textContent ?? '', font: label ? parseFloat(getComputedStyle(label).fontSize) : 0,
                    clipped: label ? label.scrollWidth > label.clientWidth + 0.5 : true};
            });
            const seatOf = (el) => el.closest('[data-seat]')?.getAttribute('data-seat') ?? '?';
            const where = (el) => (el.closest('.pn-board') ? 'board' : el.closest('[data-pn-dock]') ? 'dock' : `seat ${seatOf(el)}`);
            const obstacles = [];
            const add = (sel, name) => document.querySelectorAll(sel).forEach((el) => {
                if (vis(el) && !el.closest('[data-pn-pot]')) obstacles.push({name: name(el), r: box(el)});
            });
            add('main .pn-card', (el) => `${where(el)} card ${el.getAttribute('data-card')}`);
            add('main .pn-card > .pn-card-inner', (el) => `${where(el)} card ${el.parentElement.getAttribute('data-card')} as lifted`);
            add('.pn-board .pn-slot', () => 'board slot');
            add('[data-seat] .pn-plate', (el) => `plate ${seatOf(el)}`);
            add('[data-seat] .pn-plate-flag', (el) => `flag ${seatOf(el)}`);
            add('[data-seat] .pn-blind', (el) => `blind's mark ${seatOf(el)}`);
            add('.pn-open-seat', (el) => `open seat ${seatOf(el)}`);
            add('[data-pn-dealer]', () => 'dealer button');
            add('.pn-banner', () => 'banner');
            add('.pn-banner-note, [data-pn-next-hand]', () => 'line under the banner');
            add('.pn-bet', (el) => `bet line ${el.getAttribute('data-bet-seat')}`);
            const pops = [...document.querySelectorAll('.pn-win-pop-text')].filter(showing).map((el) => ({name: `"${el.textContent}" over seat ${seatOf(el)}`, r: box(el)}));
            obstacles.push(...pops);
            const hits = [];
            const apart = [];
            pills.forEach((p, i) => {
                for (const o of obstacles) if (hit(p.r, o.r)) hits.push(`"${p.text}" × ${o.name}`);
                for (const q of pills.slice(i + 1)) if (hit(p.r, q.r)) apart.push(`"${p.text}" × "${q.text}"`);
            });
            // The banner and the line under it against a showing "+N".
            const popHits = [];
            for (const el of document.querySelectorAll('.pn-banner, .pn-banner-note, [data-pn-next-hand]')) {
                if (!vis(el)) continue;
                for (const o of pops) if (hit(box(el), o.r)) popHits.push(`${el.matches('.pn-banner') ? 'banner' : 'line under the banner'} × ${o.name}`);
            }
            const table = document.querySelector('.pn-table')?.getBoundingClientRect();
            const pot = document.querySelector('[data-pn-pot]');
            return {
                pills: pills.map((p) => ({text: p.text, pots: p.pots, font: p.font, clipped: p.clipped,
                    inside: p.r.left >= -0.5 && p.r.right <= innerWidth + 0.5 && p.r.top >= -0.5 && p.r.bottom <= innerHeight + 0.5,
                    rect: [Math.round(p.r.left), Math.round(p.r.top), Math.round(p.r.width), Math.round(p.r.height)]})),
                hits, apart, popHits, pops: pops.length, obstacles: obstacles.length, cards: obstacles.filter((o) => / card /.test(o.name)).length,
                banner: document.querySelector('.pn-banner') !== null, variant: pot?.getAttribute('data-pn-pot-variant') ?? null,
                keeps: pot?.getAttribute('data-pn-pot-keeps') ?? null, felt: pot?.getAttribute('data-pn-pot-felt') ?? null,
                table: table ? `${Math.round(table.width)}×${Math.round(table.height)}` : null,
            };
        };
        const pillsBad = (m) => m.pills.filter((p) => p.font < 11 || p.clipped || !p.inside).map((p) => `${p.text} ${p.font}px${p.clipped ? ' clipped' : ''}${p.inside ? '' : ' off screen'}`);
        const potsIn = (m) => m.pills.flatMap((p) => p.pots.split(',')).sort((a, b) => a - b).join(',');
        const sideBrief = (m) => JSON.stringify({table: m.table, variant: m.variant, keeps: m.keeps, felt: m.felt, pills: m.pills.map((p) => `${p.text} @${p.rect.join(',')}`),
            hits: m.hits.slice(0, 4), apart: m.apart.slice(0, 2), bad: pillsBad(m).slice(0, 2), cards: m.cards, obstacles: m.obstacles});

        // A street's pots on the seated phone and the watching one, at every size and on the smaller
        // phones on their side; on the felt at every size but those.
        const SIDEWAYS = [{width: 667, height: 375}, {width: 568, height: 320}];
        const measureStreet = async (label, pots) => {
            const total = pots.reduce((s, p) => s + p.amount, 0);
            const want = pots.map((_, i) => i).join(',');
            for (const [who, p] of [['seated', X], ['watcher', W]]) {
                const shown = await p.page.waitForFunction((n) => document.querySelector('[data-pn-pot]')?.getAttribute('data-pn-pot') === String(n), total, {timeout: 20000})
                    .then(() => true, () => false);
                for (const size of [...SIZES, ...SIDEWAYS]) {
                    await resize(p.page, size, 900);
                    const m = await p.page.evaluate(SIDEPOT_PROBE);
                    const felt = SIDEWAYS.includes(size) || m.felt === 'true';
                    check(`side pots on the ${label} at ${sizeName(size)} (${who}): every pot's pill clear of every card, plate, flag, blind's mark, open seat, bet line and the dealer button, apart${SIDEWAYS.includes(size) ? '' : ', on the felt'}; 11 px or more, unclipped, on screen; every pot in one pill`,
                        shown && m.pills.length > 0 && m.hits.length === 0 && m.apart.length === 0 && felt && pillsBad(m).length === 0 && potsIn(m) === want && m.cards > 0, sideBrief(m));
                    await shot(p.page, `sidepot-${label}-${who}-${sizeFile(size)}`);
                }
                await resize(p.page, {width: 390, height: 844}, 500);
            }
        };

        // Before the flop: the short stacks all in, the others call.
        d = await playUntil((x) => x.state.hand.street === 'flop' && x.state.hand.phase === 'betting',
            (p, legal) => (p === Y || p === Z ? {kind: 'all-in'} : legal.check ? {kind: 'check'} : {kind: 'call'}));
        const flop = livePots(d.state.hand);
        check('side pots: all in for 150 and 600 before the flop makes a main pot of 600 and a side pot of 1,350',
            flop.map((p) => p.amount).join() === '600,1350', JSON.stringify(flop));
        await measureStreet('flop', flop);

        // The flop: Xena bets 300, the host calls — a second side pot.
        d = await playUntil((x) => x.state.hand.street === 'turn' && x.state.hand.phase === 'betting',
            (p, legal) => (legal.call > 0 ? {kind: 'call'} : p === X && legal.raise ? {kind: 'raise', to: Math.max(legal.raise.min, 300)} : {kind: 'check'}));
        const turn = livePots(d.state.hand);
        check('side pots: a bet of 300 called on the flop makes a second side pot (600, 1,350, 600)', turn.map((p) => p.amount).join() === '600,1350,600', JSON.stringify(turn));
        await measureStreet('turn', turn);

        // The turn: Xena all in, the host calls; the river runs out and the showdown pays three pots,
        // looked at on six screens at once while it plays.
        await resize(X.page, {width: 844, height: 390}, 900);
        const screens = [['seated-844x390', X], ['seated-375x667', Y], ['seated-320x568', Z], ['watcher-390x844', W], ['watcher-320x568', W2], ['host-1440x900', H]];
        const seen = new Map(screens.map(([name]) => [name, {looks: 0, pots: 0, together: 0, pops: 0, hits: [], popHits: [], bad: [], apart: [], want: new Set(), shot: false}]));
        let sampling = true;
        const sampler = (async () => {
            while (sampling) {
                await Promise.all(screens.map(async ([name, p]) => {
                    const m = await p.page.evaluate(SIDEPOT_PROBE).catch(() => null);
                    const s = seen.get(name);
                    if (!m) return;
                    s.looks++;
                    s.pops += m.pops;
                    s.popHits.push(...m.popHits);
                    if (m.pills.length === 0) return;
                    s.pots++;
                    s.want.add(potsIn(m));
                    s.hits.push(...m.hits);
                    s.apart.push(...m.apart);
                    s.bad.push(...pillsBad(m));
                    if (!m.banner) return;
                    s.together++;
                    if (s.shot) return;
                    s.shot = true;
                    await hideDevIndicator(p.page);
                    await p.page.screenshot({path: `${OUT}sidepot-payout-${name}.png`}).catch(() => {});
                }));
                await sleep(100);
            }
        })();
        try {
            d = await playUntil((x) => x.state.hand.phase === 'complete',
                (p, legal) => (legal.call > 0 ? {kind: 'call'} : p === X ? {kind: 'all-in'} : {kind: 'check'}));
            // The payout plays for a few seconds after the hand completes: until every screen's pots are gone.
            await Promise.all(screens.map(([, p]) => p.page.waitForFunction(() => document.querySelector('.pn-banner') !== null && document.querySelector('[data-pn-pot]') === null,
                null, {timeout: 20000}).catch(() => {})));
        } finally {
            sampling = false;
            await sampler;
        }
        const paid = d.state.hand.result?.pots.map((p) => p.amount) ?? [];
        check('side pots: Xena all in on the turn and called, the board runs out and the showdown pays three pots (600, 1,350, 3,700)',
            paid.join() === '600,1350,3700', JSON.stringify(paid));
        for (const [name] of screens) {
            const s = seen.get(name);
            check(`side pots through the run-out and the payout (${name}): no pot's pill over any card, plate, flag, bet line, the dealer button, a winner's "+N", the banner or the line under it, in ${s.pots} looks with the pots on screen (${s.together} beside the banner); 11 px or more, unclipped, every pot in one pill; the banner and its line off the "+N" (${s.pops} looks at one)`,
                s.pots > 0 && s.hits.length === 0 && s.apart.length === 0 && s.bad.length === 0 && s.popHits.length === 0 && [...s.want].every((w) => w === '0,1,2'),
                JSON.stringify({looks: s.looks, pots: s.pots, together: s.together, pops: s.pops, hits: [...new Set(s.hits)].slice(0, 4), popHits: [...new Set(s.popHits)].slice(0, 2),
                    apart: s.apart.slice(0, 2), bad: [...new Set(s.bad)].slice(0, 2), want: [...s.want]}));
        }
        const together = [...seen.entries()].filter(([, s]) => s.together > 0).map(([name]) => name);
        check('…the winner\'s banner seen beside the pots it pays out, clear of them, on the screens the payout played on', together.length > 0, together.join(', '));
        if (together.length < screens.length) note('the banner beside the pots', `not seen together on ${screens.length - together.length} screen(s) (the payout came in a stale poll there)`);
        await resize(X.page, {width: 390, height: 844}, 300);
    }

    await hostOp(H, {op: 'end'}).catch(() => null);
    const errors = pageErrors.filter((e) => !/ResizeObserver loop|Failed to execute 'measure' on 'Performance'.*negative time stamp/.test(e));
    check('no page error on any screen', errors.length === 0, errors.slice(0, 3).join(' | '));
} catch (error) {
    check(`poker night modes threw: ${error.message}`, false, error.stack?.split('\n').slice(1, 4).join(' '));
    for (const p of players.filter((q) => !q.gone)) await shot(p.page, `failed-${p.name}`);
} finally {
    if (db) await db.collection('ratelimits').deleteMany({key: /^poker-night:/}).catch(() => {});
    await mongo.close().catch(() => {});
    await browser.close().catch(() => {});
}

summary('poker-night-modes');
