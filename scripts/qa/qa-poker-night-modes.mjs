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
// Batch B (P4): leaving after this hand — the mid-hand Home dialog's three ways, the one-tap door
// beside the early choices at every size (on its side too), its note with Stay, the menu's toggle,
// the note stepping aside on the player's own turn, the seat emptied and cashed out once as the hand
// completes, a ghost of the plate (and the banner naming the leaver) through the result, and no other
// player ever told. The host's yes on chips once the game has started: the start form's Off / On, the
// join card's note, a new player seated with none ("Waiting for the host to approve your chips",
// Cancel), the plates' "Waiting for chips", the host's dot on Bank and Host and a toast whose Approve
// lands them, the bank's row; the host drawer's Off / On saved. Asks to see a hand, after it, from a
// folded player: the plate's menu, the prompt under the top bar (its seconds, three 44 px answers
// behind a tap shield, never over the dock), "Show Ben" turning the cards up on Ben's screen alone
// ("Shown to you" on the plate and in the hand log) and no other context's answer or page carrying
// them or the ask, "No thanks" and its five-hand wait, "Let others ask to see my cards" off in My
// look, an ask nobody answers running out as a no. A page on an older protocol is asked to reload.
//
// Batch B (P5): PLO on one board — the lobby's "Start PLO" beside the one-tap Texas hold'em and the
// start form's Game choice; a PLO table named on the top bar, the invite sheet and the join card
// ("How it plays": the Hands guide on PLO, for a visitor); three phones (390, 375 and 320 wide, and on
// their sides) each fanning four cards, every card at least half in sight, four backs on every other
// plate; no other context's answer or page carrying two cards of a hand of four; the raise panel's
// Pot ("Raise to … (pot)") landing a raise to the server's cap, never an all-in; a check-down to a
// showdown whose winner is QA's own Omaha brute force's, its hands of four turned up on every screen,
// the banner clear of them and the lit cards two of the winner's and three of the board's; then
// (P6) the host drawer's Boards (PLO only) to three boards from the next hand, said by a toast and
// the top bar: three rows of five on every phone upright and on its side, inside the table, clear of
// every plate and bet line, at or above the floors stage.test pins, the block a 44 px button that
// opens the boards sheet (44 px cards under their names); a check-down whose every pot splits three
// ways, each part to QA's own Omaha on its board, the page's paid pots rebuilt by pots.paidParts to
// the server's shares, a banner line a board (one for a scoop) clear of the hands up, each board's
// lit cards its winner's three, the hand log board by board; and the host drawer's Game back to
// Texas hold'em, said by the countdown and a toast at the deal.
//
// Batch B (P7): Triple T — the lobby's "Start Triple T", the join card's "How it plays" on Triple T;
// at the deal every phone (390, 375 and 320 wide) holds three cards to pick from (a radio group, each
// card 44 px or more), the confirm and the clock, the other plates three backs and "Discarding…", the
// felt's count; a tap and the confirm throw the card picked, the desktop's 1–3, Escape and Enter do
// the same, a player who throws nothing has a card thrown for them at the deadline (no timeout
// counted); plates go from three backs to two; no other context's answer, page or history ever carries
// a card another player threw away, each player's history and log their own; the next hand on the
// phones turned on their sides, and under reduced motion a card thrown away is never seen leaving.
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
const {TABLE_COPY, HOST_COPY, HANDS_COPY, HOME_PANEL_COPY, POKER_NIGHT_COPY, FELT_COPY, JOIN_COPY, BANK_COPY, ASK_COPY, MODE_COPY, ACTION_COPY, INVITE_COPY, DISCARD_COPY, LOG_COPY, HAND_COPY} = await lib('lib/learn/copy/poker-night.ts');
const {evaluateCards} = await lib('lib/poker/evaluator.ts');
const {ASK_ANSWERS, ASKS, LEDGER_KINDS, ENTRY_KINDS} = await lib('lib/poker-night/config.ts');
const {autoDiscard} = await lib('lib/poker-night/variants.ts');
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
// Ten rankings (50 cards), the kicker pair (10) and PLO's hand (9).
const guideOk = (m) => m !== null && m.cards === 69 && m.rankings === 10 && m.outside === 0 && m.sideways <= 0;

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
        leave: d.querySelector('[data-pn-leave-way="now"]')?.textContent?.trim() ?? null,
        after: d.querySelector('[data-pn-leave-way="after"]')?.textContent?.trim() ?? null,
        afterNote: d.querySelector('[data-pn-leave-after-note]')?.textContent ?? null,
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

const NOT_CARDS = new Set(['eligible', 'winners', 'shares', 'showOrder', 'toDiscard']);
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
        check('the lobby\'s Hands tab (?tab=hands): the Hands view selected, ten rankings, the kicker pair and PLO\'s hand (69 cards), no lobby read',
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
    await H.page.click('[data-quick-start="holdem"]');
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
                check('mid-hand, the host\'s Home asks first: "Leave in the middle of a hand?", [Stay] [Leave after this hand] [Leave now and go]',
                    fromHome?.kind === 'mid-hand' && fromHome.then === 'home' && fromHome.title === TABLE_COPY.leaveMidHandTitle && fromHome.stay === TABLE_COPY.stay
                    && fromHome.leave === TABLE_COPY.leaveNowAndGo && fromHome.after === TABLE_COPY.leaveAfter && fromHome.afterNote === TABLE_COPY.leaveAfterNote,
                    JSON.stringify(fromHome));
                check('…the menu\'s "Leave now" asks the same with [Stay] [Leave now] [Leave after this hand]; Stay leaves the host seated, in the hand, on the table',
                    fromMenu?.kind === 'mid-hand' && fromMenu.then === 'stay' && fromMenu.leave === TABLE_COPY.leaveNow && fromMenu.after === TABLE_COPY.leaveAfter
                    && seatIndex(after, H) >= 0
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
            const modeEl = document.querySelector('[data-pn-mode-label]');
            const modeR = modeEl?.getBoundingClientRect();
            const line = document.querySelector('[data-pn-status-line]')?.getBoundingClientRect();
            const nav = document.querySelector('[data-pn-topbar] nav')?.getBoundingClientRect();
            return {
                mode: modeEl?.textContent ?? null, modeH: modeR ? Math.round(modeR.height) : null, modeShown: !!modeR && modeR.width > 0,
                code: codeR && codeR.width > 0 ? Math.round(codeR.height) : 0, clear: !!line && !!nav && line.right <= nav.left + 1,
                paused: document.querySelector('[data-pn-table-status]')?.getAttribute('data-pn-table-status') ?? null,
            };
        });
        check('…and at 320 px, back online with the game paused, the game ("Texas hold\'em") reads on one line beside the paused mark, clear of the buttons; the code steps aside below 400 px (the Invite sheet has it)',
            bar320.modeShown && bar320.mode === "Texas hold'em" && bar320.modeH !== null && bar320.modeH <= 16 && bar320.code === 0 && bar320.clear, JSON.stringify(bar320));
        await shot(P.page, '08-topbar-paused-320x568');
        await resize(P.page, {width: 390, height: 844}, 300);

        // The Hands drawer at the table: H on the host's screen, the menu on P's phone.
        await H.page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur());
        await H.page.keyboard.press('h');
        const byKey = await H.page.waitForSelector('[data-pn-drawer="hands"]', {timeout: 10000}).then(() => true, () => false);
        await sleep(400);
        const onH = await guideOf(H.page, '[data-pn-drawer="hands"]');
        check('H at the table opens the Hands guide: the ten rankings first, then the kicker pair, then Texas hold\'em under "At this table", then PLO',
            byKey && guideOk(onH) && onH.first === 'holdem' && onH.order === 'rankings,ties,here,games', JSON.stringify(onH));
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
                byMenu && guideOk(g) && targetsOk(m) && g.order === 'rankings,ties,here,games' && g.firstRank <= g.vh && (size.width !== 320 || g.card === 40), `${JSON.stringify(g)} ${brief(m)}`);
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
        await H.page.waitForSelector('[data-pn-leave-dialog="between"] [data-pn-leave-way="now"]', {timeout: 10000});
        await H.page.click('[data-pn-leave-dialog] [data-pn-leave-way="now"]');
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
        // Hands have been dealt: R's chips wait for the host's yes.
        const asked = reseated?.state.requests.some((q) => q.pid === R.pid) === true && reseated.state.seats[seatIndex(reseated, R)]?.stack === 0;
        const yes = await hostOp(H, {op: 'approve', pid: R.pid});
        const landed = await waitDoc((d) => (d.state.seats[seatIndex(d, R)]?.stack ?? 0) > 0, 10000);
        check('…with nothing until the host approves the chips, which then land', asked && yes.status === 200 && landed !== null, String(yes.status));
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
            await R.page.click('[data-pn-leave-way="now"]');
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
            const gone = await waitDoc((x) => x.state.seats[seatIndex(x, Q)]?.leaveAfter === true, 10000);
            const leavingSaid = await Q.page.waitForSelector('[data-pn-leaving-after] [data-pn-stay]', {timeout: 10000})
                .then(() => Q.page.innerText('[data-pn-leaving-after]'), () => null);
            const leftToast = await toasted(Q.page, TABLE_COPY.leaveAfterSet, 5000);
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
            check('…then Leave, one tap — "leave after this hand": Q leaves when the hand ends; the dock says "Last hand" with Stay and offers nothing more, the menu "Stay at the table" and "Leave now" but no seat choice, and Home still asks',
                gone !== null && plate?.folded === true && leavingSaid?.includes(TABLE_COPY.lastHand) && leavingSaid.includes(TABLE_COPY.stay) && leftToast
                && look.controls.length === 0 && look.home === 'BUTTON' && !look.dialog && look.folded
                && menu.includes('stay') && menu.includes('leave') && !menu.some((m) => ['leave-after', 'sit-out', 'deal-me-in', 'back'].includes(m)),
                JSON.stringify({gone: gone !== null, leavingSaid, leftToast, look, menu}));
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
        await H.page.click('[data-pn-leave-way="now"]');
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
            ASK_COPY.ask, ASK_COPY.asked(sample), ASK_COPY.prompt(sample), ASK_COPY.showOne(sample), ASK_COPY.showAll, ASK_COPY.noThanks, ASK_COPY.shownTag,
            ASK_COPY.shownOne(sample), ASK_COPY.allow, ASK_COPY.allowHint, ASK_COPY.blocked['asks-off'](sample), ASK_COPY.blocked.cooldown(),
            ASK_COPY.blocked.waiting(), ASK_COPY.blocked.limit(), ASK_COPY.status.waiting(sample), ASK_COPY.status.no(sample), ASK_COPY.status.expired(sample),
            ASK_COPY.ended.shown(sample), ASK_COPY.ended.everyone(sample), ASK_COPY.ended.no(sample), ASK_COPY.ended.expired(sample),
            TABLE_COPY.leaveAfter, TABLE_COPY.lastHand, TABLE_COPY.leavingAfter, TABLE_COPY.stayAtTable, TABLE_COPY.leaveAfterSet, TABLE_COPY.leaveAfterCleared,
            TABLE_COPY.leaveLanded, TABLE_COPY.leaveAfterNote, TABLE_COPY.waitingApproval, TABLE_COPY.awaitingChips, TABLE_COPY.leftSeat, TABLE_COPY.ghostLabel(sample, 3),
            JOIN_COPY.approvalNote, HOST_COPY.rebuysHint, HOST_COPY.requestSeat(sample, 2000), HOST_COPY.requestRebuy(sample, 2000), HOST_COPY.requestTopUp(sample, 500),
            HOST_COPY.approvedFor(sample), BANK_COPY.cancel, BANK_COPY.cancelled,
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
        await H.page.click('[data-quick-start="holdem"]');
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

    // ═══ batch B: leaving after this hand, the host's yes on chips, asks to see a hand ═══════════
    // A new table: the host and three guests on phones (Ana 390 × 844, Ben 375 × 667, Cy 320 × 568)
    // seated before the first deal — their chips land at once — then Dee on a phone on its side
    // (844 × 390) once the game has started, whose chips wait for the host. In hand 1 (paused by the
    // host as it plays, so its result stays) Ben and Cy fold; Ana leaves after it, playing it out.
    // In its pause Ben asks Cy (shown to Ben alone) and Cy asks Ben (no thanks); Cy turns asks off.
    // Hand 2 (paused too): everyone folds to the host; the blocked asks and one that runs out. Hand 3
    // is not paused: Ben asks Dee and the next deal ends it first (no cooldown, Ben told). Last, Eve
    // sits down and the host goes quiet for ten minutes: her chips no longer wait for them.
    {
        await hostOp(H, {op: 'end'}).catch(() => null);
        const plain = (text) => text.replace(/[⁨⁩]/g, '');
        const rectOf = (page, sel) => page.evaluate((s) => {
            const r = document.querySelector(s)?.getBoundingClientRect();
            return r ? {left: r.left, top: r.top, right: r.right, bottom: r.bottom, w: r.width, h: r.height} : null;
        }, sel);
        const overlap = (a, b) => !!a && !!b && a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1;
        const inView = (page, r) => page.evaluate((x) => !!x && x.left >= -1 && x.top >= -1 && x.right <= innerWidth + 1 && x.bottom <= innerHeight + 1, r);
        const PHONES = [...SIZES, {width: 667, height: 375}, {width: 568, height: 320}];
        // What the ask prompt covers of the table: every plate and its flag but the viewer's own, a
        // turned-up hand, the board, the pots, an open seat, the result banner and the line under it,
        // the top bar. It may cover only the viewer's own corner (the dock, their own plate).
        const askCovers = (page, own) => page.evaluate((mine) => {
            const prompt = document.querySelector('[data-pn-ask-prompt]')?.getBoundingClientRect();
            if (!prompt) return null;
            const vis = (el) => {
                const r = el.getBoundingClientRect();
                const cs = getComputedStyle(el);
                return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && parseFloat(cs.opacity) > 0.05;
            };
            const hit = (a, b) => a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;
            const seatOf = (el) => el.closest('[data-seat]')?.getAttribute('data-seat') ?? '?';
            const hits = [];
            const add = (sel, name, keep = () => true) => document.querySelectorAll(sel).forEach((el) => {
                if (vis(el) && keep(el) && hit(prompt, el.getBoundingClientRect())) hits.push(name(el));
            });
            const others = (el) => seatOf(el) !== String(mine);
            add('[data-seat] .pn-plate', (el) => `plate ${seatOf(el)}`, others);
            add('[data-seat] .pn-plate-flag', (el) => `flag ${seatOf(el)}`, others);
            add('[data-seat] .pn-seat-shown', (el) => `shown hand ${seatOf(el)}`, others);
            add('.pn-open-seat', (el) => `open seat ${seatOf(el)}`);
            add('.pn-board', () => 'board');
            add('[data-pn-pot] [data-pot]', () => 'pot');
            add('.pn-banner, .pn-banner-note, [data-pn-next-hand]', () => 'banner');
            add('[data-pn-topbar]', () => 'top bar');
            return {hits, inView: prompt.left >= -1 && prompt.top >= -1 && prompt.right <= innerWidth + 1 && prompt.bottom <= innerHeight + 1,
                fromFoot: Math.round(innerHeight - prompt.bottom)};
        }, own);
        // No pre-action's label spills out of its button (a word drawn over the next one).
        const preSpill = (page) => page.$$eval('[data-pn-pre] button', (els) => els.filter((el) => el.scrollWidth > el.clientWidth + 0.5)
            .map((el) => `${el.textContent} ${el.scrollWidth}>${el.clientWidth}`));

        // The start form's rebuy policy on a phone: Off / On (host approves), two 44 px radios.
        await Hm.page.goto(`${BASE}/poker-night`, {waitUntil: 'load', timeout: 180000});
        await Hm.page.waitForSelector('[data-poker-night-setup]', {timeout: 60000});
        await Hm.page.evaluate(() => document.querySelector('[data-poker-night-setup]')?.setAttribute('open', ''));
        await Hm.page.waitForSelector('[data-pn-choice="rebuys"]', {timeout: 15000});
        for (const size of SIZES) {
            await resize(Hm.page, size);
            await Hm.page.locator('[data-pn-choice="rebuys"]').scrollIntoViewIfNeeded().catch(() => {});
            const m = await targets(Hm.page, '[data-create-table] [data-field="rebuys"]');
            const radios = await Hm.page.$$eval('[data-pn-choice="rebuys"] [role="radio"]',
                (els) => els.map((el) => ({id: el.getAttribute('data-pn-option'), on: el.getAttribute('aria-checked'), text: el.textContent.trim()})));
            check(`the start form's rebuys at ${sizeName(size)}: "Off" / "On (host approves)", two 44 px radios, On chosen, none overlapping, nothing sideways`,
                targetsOk(m) && m.count === 2 && radios.map((r) => r.id).join() === 'off,approve' && radios[1].on === 'true'
                && radios[0].text === HOST_COPY.rebuysValue.off && radios[1].text === HOST_COPY.rebuysValue.approve, `${brief(m)} ${JSON.stringify(radios)}`);
            if (size.width === 390) await shot(Hm.page, '20-rebuys-form-390x844');
        }
        await Hm.page.click('[data-pn-choice="rebuys"] [data-pn-option="off"]');
        check('…a tap on Off chooses it, and the line under them says what the host\'s yes covers',
            await Hm.page.getAttribute('[data-pn-choice="rebuys"] [data-pn-option="off"]', 'aria-checked') === 'true'
            && (await Hm.page.innerText('[data-create-table] [data-field="rebuys"]')).includes(HOST_COPY.rebuysHint.slice(0, 40)));
        await wording(Hm.page, 'the start form\'s rebuys', '[data-create-table] [data-field="rebuys"]');

        await H.page.goto(`${BASE}/poker-night`, {waitUntil: 'load', timeout: 180000});
        await H.page.click('[data-quick-start="holdem"]');
        await H.page.waitForURL(/\/play\/[A-HJ-NP-Z2-9]{6}(\?.*)?$/, {timeout: 120000});
        code = new URL(H.page.url()).pathname.split('/').pop();
        await H.page.waitForSelector('[data-pn-drawer="invite"]', {timeout: 60000}).catch(() => {});
        await H.page.keyboard.press('Escape');
        H.pid = (await roomDoc()).state.hostPid;
        const A = await newPlayer('ana', PHONE(390, 844));
        const B = await newPlayer('ben', PHONE(375, 667));
        const C = await newPlayer('cy', PHONE(320, 568));
        await sitDown(A, 'Ana');
        await sitDown(B, 'Ben');
        await sitDown(C, 'Cy');
        let d = await roomDoc();
        check('before the first hand chips land at once: three guests seated with their chips, nothing waiting for the host',
            [A, B, C].every((p) => (d.state.seats[seatIndex(d, p)]?.stack ?? 0) > 0) && d.state.requests.length === 0,
            JSON.stringify({stacks: d.state.seats.map((s) => s?.stack ?? null), requests: d.state.requests}));
        await hostOp(H, {op: 'config', patch: {turnSeconds: 120}});
        await H.page.waitForSelector('[data-pn-seat-controls][data-pn-armed] [data-pn-control="deal"]:not([disabled])', {timeout: 30000});
        await H.page.click('[data-pn-control="deal"]');
        d = await waitDoc((x) => x.state.hand?.no === 1 && x.state.hand.phase === 'betting', 20000);
        const paused1 = await hostOp(H, {op: 'pause'});
        const seats = Object.fromEntries([A, B, C].map((p) => [p.name, seatIndex(d, p)]));
        const startA = d.state.seats[seats.ana].stack + handSeat(d, A).committed;

        // ── the host's yes: Dee sits down once the game has started ──
        const D = await newPlayer('dee', PHONE(844, 390));
        await D.page.goto(`${BASE}/play/${code}`, {waitUntil: 'load', timeout: 120000});
        await D.page.waitForSelector('[data-join-card="visitor"]', {timeout: 60000});
        const approvalNote = await D.page.$eval('[data-join-approval]', (el) => el.textContent.trim()).catch(() => null);
        await shot(D.page, '23-join-approval-844x390');
        await D.page.fill('[data-join-name]', 'Dee');
        await D.page.click('[data-join-sit]');
        D.pid = await (await D.page.waitForSelector('[data-me]', {timeout: 30000})).getAttribute('data-pid');
        d = await waitDoc((x) => x.state.requests.some((r) => r.pid === D.pid), 10000);
        const seatD = d ? seatIndex(d, D) : -1;
        const amountD = d?.state.requests.find((r) => r.pid === D.pid)?.amount ?? 0;
        check('once the first hand is dealt the join card says the host approves the chips; Dee sits with none, nothing bought, a request waiting',
            approvalNote === JOIN_COPY.approvalNote && d !== null && d.state.seats[seatD]?.stack === 0 && ledgerRow(d, D) === null && amountD > 0,
            JSON.stringify({approvalNote, stack: d?.state.seats[seatD]?.stack, amountD}));
        const waitingSaid = await D.page.waitForSelector('[data-pn-waiting-approval]', {timeout: 15000}).then((el) => el.innerText(), () => null);
        for (const size of [{width: 844, height: 390}, {width: 390, height: 844}, {width: 320, height: 568}]) {
            await resize(D.page, size);
            const m = await targets(D.page, '[data-pn-dock]');
            check(`Dee's dock at ${sizeName(size)}: "Waiting for the host to approve your chips" with Cancel and Leave, 44 px, none overlapping, nothing sideways`,
                targetsOk(m) && await D.page.locator('[data-pn-control="withdraw"]').count() === 1, brief(m));
            await shot(D.page, `23-waiting-approval-${sizeFile(size)}`);
        }
        await resize(D.page, {width: 844, height: 390});
        const hostDots = await H.page.waitForSelector('[data-bank-requests-dot]', {timeout: 15000}).then(async () => ({
            bank: await H.page.locator('[data-bank-requests-dot]').count(), host: await H.page.locator('[data-requests-dot]').count(),
        }), () => null);
        const hostToast = await toasted(H.page, HOST_COPY.requestSeat('Dee', amountD), 15000);
        const plateFlag = await H.page.waitForFunction((s) => document.querySelector(`[data-seat="${s}"] [data-flag]`)?.textContent ?? null, seatD, {timeout: 10000})
            .then((h) => h.jsonValue(), () => null);
        check('…Dee\'s dock says so; the host sees a dot on Bank and Host and a toast ("Dee asks for … chips to sit down."); every plate reads "Waiting for chips"',
            waitingSaid?.trim() === TABLE_COPY.waitingApproval && hostDots?.bank === 1 && hostDots.host === 1 && hostToast && plateFlag === TABLE_COPY.awaitingChips,
            JSON.stringify({waitingSaid, hostDots, hostToast, plateFlag}));
        await D.page.waitForSelector('[data-pn-seat-controls][data-pn-armed] [data-pn-control="withdraw"]', {timeout: 10000});
        await D.page.click('[data-pn-control="withdraw"]');
        const withdrawn = await waitDoc((x) => !x.state.requests.some((r) => r.pid === D.pid), 10000);
        const firstChips = await D.page.waitForSelector('[data-pn-control="first-chips"]', {timeout: 10000}).then((el) => el.innerText(), () => null);
        const noChips = await D.page.$eval('[data-pn-no-chips]', (el) => el.textContent).catch(() => null);
        const outOfChips = await D.page.locator('[data-pn-control="rebuy"]').count();
        const cancelToast = await toasted(D.page, TABLE_COPY.requestCancelled, 5000);
        const toastGone = await H.page.waitForFunction((t) => ![...document.querySelectorAll('[data-sonner-toast]')].some((el) => el.textContent.includes(t)),
            HOST_COPY.requestSeat('Dee', amountD), {timeout: 10000}).then(() => true, () => false);
        await sleep(1500);
        const declinedSaid = await D.page.evaluate((t) => window.__pnToasts.some((x) => x.text.includes(t)), BANK_COPY.declined);
        await shot(D.page, '23-no-chips-yet-844x390');
        check('…Cancel takes the request back (toasted, and never as "The host declined the request."), the host\'s toast for it goes, and the dock says "No chips yet." with "Ask for … chips" — never "Out of chips" or a top-up',
            withdrawn !== null && plain(firstChips ?? '').trim() === BANK_COPY.askFor(amountD) && noChips === TABLE_COPY.noChipsYet && outOfChips === 0
            && cancelToast && toastGone && !declinedSaid, JSON.stringify({withdrawn: withdrawn !== null, firstChips, noChips, outOfChips, cancelToast, toastGone, declinedSaid}));
        await D.page.click('[data-open="bank"]');
        const bankOffer = await D.page.waitForSelector('[data-pn-drawer="bank"] [data-pn-rebuy]', {timeout: 10000}).then((el) => el.innerText(), () => null);
        await D.page.click('[data-pn-drawer="bank"] [data-pn-rebuy]');
        d = await waitDoc((x) => x.state.requests.some((r) => r.pid === D.pid), 10000);
        const ownRow = await D.page.waitForSelector('[data-pn-requested] [data-pn-withdraw]', {timeout: 10000}).then(() => true, () => false);
        const ownM = await targets(D.page, '[data-own-chips]');
        await D.page.keyboard.press('Escape');
        check('…asked again from the bank, whose button says so too ("Ask for … chips"): the bank says it waits, with Cancel (44 px)',
            d !== null && ownRow && targetsOk(ownM) && plain(bankOffer ?? '').trim() === BANK_COPY.askFor(amountD), `${brief(ownM)} ${bankOffer}`);
        const toastText = HOST_COPY.requestSeat('Dee', amountD);
        const toastAgain = await H.page.waitForFunction((t) => [...document.querySelectorAll('[data-sonner-toast]')]
            .some((el) => el.textContent.includes(t) && el.querySelector('[data-button][data-action]')), toastText, {timeout: 15000}).then(() => true, () => false);
        await H.page.click('[data-open="bank"]');
        const row = await H.page.waitForSelector(`[data-bank-requests] [data-request="${D.pid}"]`, {timeout: 10000}).then(() => H.page.$eval(`[data-request="${D.pid}"]`, (el) => ({
            kind: el.querySelector('[data-request-kind]')?.getAttribute('data-request-kind') ?? null, text: el.querySelector('[data-request-kind]')?.textContent ?? '',
            approve: el.querySelector('[data-approve]') !== null, decline: el.querySelector('[data-decline]') !== null,
        })), () => null);
        const rowM = await targets(H.page, '[data-bank-requests]');
        await shot(H.page, '23-bank-request-1440');
        await H.page.keyboard.press('Escape');
        await H.page.waitForSelector('[data-pn-drawer="bank"]', {state: 'detached', timeout: 10000}).catch(() => {});
        check('…the host\'s bank: the row says what it is for ("to sit down") with Approve and Decline, 44 px', row?.kind === 'seat' && row.approve && row.decline
            && plain(row.text).includes(plain(toastText)) && targetsOk(rowM), `${JSON.stringify(row)} ${brief(rowM)}`);
        const approveH = await H.page.evaluate((t) => [...document.querySelectorAll('[data-sonner-toast]')].find((x) => x.textContent.includes(t))
            ?.querySelector('[data-button][data-action]')?.getBoundingClientRect().height ?? 0, toastText);
        check('…the host\'s toast\'s Approve is a full 44 px target', approveH >= 43.5, String(approveH));
        const clicked = await H.page.evaluate((t) => {
            const el = [...document.querySelectorAll('[data-sonner-toast]')].find((x) => x.textContent.includes(t) && x.querySelector('[data-button][data-action]'));
            el?.querySelector('[data-button][data-action]')?.click();
            return !!el;
        }, toastText);
        const landedD = await waitDoc((x) => (x.state.seats[seatD]?.stack ?? 0) === amountD && !x.state.requests.some((r) => r.pid === D.pid), 10000);
        check('…and the toast\'s Approve lands Dee\'s chips (Dee told so)', toastAgain && clicked && landedD !== null && await toasted(D.page, BANK_COPY.approved(amountD), 10000),
            JSON.stringify({toastAgain, clicked, landed: landedD !== null}));

        // ── leaving after this hand: Ana, mid-hand ──
        let leaveDone = false;
        let ownTurnDone = false;
        const leaveAfterTests = async (actor, doc) => {
            if (leaveDone || doc.state.hand.phase !== 'betting' || actor === A || handSeat(doc, A)?.folded) return;
            leaveDone = true;
            const seatA = seats.ana;
            // Home mid-hand: three ways.
            await A.page.click('[data-open="home"]');
            await A.page.waitForSelector('[data-pn-leave-dialog="mid-hand"]', {timeout: 10000});
            const home = await leaveDialog(A.page);
            await shot(A.page, '21-leave-dialog-three-390x844');
            await A.page.click('[data-pn-leave="stay"]');
            await A.page.waitForSelector('[data-pn-leave-dialog]', {state: 'detached', timeout: 10000}).catch(() => {});
            check('Ana\'s Home mid-hand: [Stay] [Leave after this hand] [Leave now and go], full width, 44 px, the line on what "after" does; Stay changes nothing',
                dialogOk(home, true) && home.after === TABLE_COPY.leaveAfter && home.leave === TABLE_COPY.leaveNowAndGo && home.afterNote === TABLE_COPY.leaveAfterNote
                && (await roomDoc()).state.seats[seatA]?.leaveAfter === false, JSON.stringify(home));
            // The one-tap door beside the early choices, at every size.
            await A.page.waitForSelector('[data-pn-leave-after][data-pn-armed]', {timeout: 15000});
            for (const size of PHONES) {
                await resize(A.page, size, 500);
                const m = await targets(A.page, '[data-pn-dock]');
                const t = await rectOf(A.page, '[data-pn-leave-after]');
                const pre = await rectOf(A.page, '[data-pn-pre]');
                const spill = await preSpill(A.page);
                const word = await A.page.$eval('[data-pn-leave-after] .pn-leave-word', (el) => (getComputedStyle(el).display === 'none' ? null : el.textContent.trim())).catch(() => 'missing');
                check(`"Leave after this hand" beside the early choices at ${sizeName(size)}: one 44 px tap on screen, clear of them, its word (where shown) "${TABLE_COPY.leaveAfterShort}"; no early choice's label spills out of its button; every dock target 44 px, nothing sideways`,
                    targetsOk(m) && t !== null && t.w >= 43.5 && t.h >= 43.5 && await inView(A.page, t) && !overlap(t, pre) && spill.length === 0
                    && (word === null || word === TABLE_COPY.leaveAfterShort), `${brief(m)} ${JSON.stringify({t, spill, word})}`);
                if ([390, 320, 844, 568].includes(size.width)) await shot(A.page, `21-leave-after-door-${sizeFile(size)}`);
            }
            await resize(A.page, {width: 390, height: 844});
            await A.page.waitForSelector('[data-pn-leave-after][data-pn-armed]', {timeout: 10000});
            await A.page.click('[data-pn-leave-after]');
            const set = await waitDoc((x) => x.state.seats[seatA]?.leaveAfter === true, 10000);
            const note = await A.page.waitForSelector('[data-pn-leaving-after] [data-pn-stay]', {timeout: 10000}).then(() => A.page.innerText('[data-pn-leaving-after]'), () => null);
            const toastSet = await toasted(A.page, TABLE_COPY.leaveAfterSet, 5000);
            const stayToastH = await A.page.evaluate((t) => [...document.querySelectorAll('[data-sonner-toast]')].find((x) => x.textContent.includes(t))
                ?.querySelector('[data-button]')?.getBoundingClientRect().height ?? 0, TABLE_COPY.leaveAfterSet);
            const pre = await A.page.locator('[data-pn-pre]').count();
            const dot = await A.page.locator('[data-pn-leaving-dot]').count();
            const onHost = await H.page.getAttribute(`[data-seat="${seatA}"]`, 'data-state');
            const stayM = await targets(A.page, '[data-pn-leaving-after]');
            await shot(A.page, '21-leaving-after-390x844');
            check('one tap on the door: Ana plays on (the early choices still there), the dock says "Last hand" with Stay (44 px), a toast, a dot on Home — and the host\'s table still shows Ana in the hand',
                set !== null && note?.includes(TABLE_COPY.lastHand) && toastSet && pre > 0 && dot === 1 && onHost === 'in-hand' && targetsOk(stayM),
                JSON.stringify({set: set !== null, note, toastSet, pre, dot, onHost, stay: brief(stayM)}));
            check('…the toast\'s Stay is a full 44 px target', stayToastH >= 43.5, String(stayToastH));
            // On a phone on its side the note has a row of its own under the cards: its words read whole, Stay inside it.
            for (const size of [{width: 844, height: 390}, {width: 667, height: 375}, {width: 568, height: 320}]) {
                await resize(A.page, size, 500);
                const n = await A.page.evaluate(() => {
                    const pill = document.querySelector('[data-pn-leaving-after]');
                    const label = pill?.querySelector('[role="status"]');
                    const stay = pill?.querySelector('[data-pn-stay]');
                    if (!pill || !label || !stay) return null;
                    const p = pill.getBoundingClientRect();
                    const s = stay.getBoundingClientRect();
                    return {text: label.textContent.trim(), w: label.clientWidth, sw: label.scrollWidth, inside: s.left >= p.left - 0.5 && s.right <= p.right + 0.5};
                });
                const m = await targets(A.page, '[data-pn-dock]');
                check(`…at ${sizeName(size)} the note beside the cards reads whole ("${TABLE_COPY.lastHand}", never cut short) with Stay inside it; every dock target 44 px`,
                    n !== null && n.w > 20 && n.sw <= n.w + 0.5 && n.inside && n.text.includes(TABLE_COPY.lastHand) && targetsOk(m), `${JSON.stringify(n)} ${brief(m)}`);
                await shot(A.page, `21-leaving-after-${sizeFile(size)}`);
            }
            await resize(A.page, {width: 390, height: 844}, 500);
            await A.page.click('[data-pn-stay]');
            const back = await waitDoc((x) => x.state.seats[seatA]?.leaveAfter === false, 10000);
            const toggleBack = await A.page.waitForSelector('[data-pn-leave-after]', {timeout: 10000}).then(() => true, () => false);
            check('…Stay takes it back: still at the table (toasted), the door offered again', back !== null && toggleBack && await toasted(A.page, TABLE_COPY.leaveAfterCleared, 5000));
            await A.page.click('[data-open="menu"]');
            await A.page.click('[data-menu="leave-after"]', {timeout: 5000});
            const again = await waitDoc((x) => x.state.seats[seatA]?.leaveAfter === true, 10000);
            await A.page.click('[data-open="menu"]');
            await A.page.waitForSelector('[data-menu="log"]', {timeout: 10000});
            const menu = await A.page.$$eval('[data-menu]', (els) => els.map((el) => el.getAttribute('data-menu')));
            await A.page.keyboard.press('Escape');
            check('…the menu\'s "Leave after this hand" sets it again; its place is then "Stay at the table", beside "Leave now"',
                again !== null && menu.includes('stay') && menu.includes('leave') && !menu.includes('leave-after') && !menu.includes('sit-out'), JSON.stringify(menu));
            const told = [H, B, C, D].flatMap((p) => p.bodies).filter((b) => /leave-after|leaveAfter/.test(JSON.stringify(b.body)));
            check('…and no answer to anyone else ever says it', told.length === 0, told.slice(0, 2).map((b) => b.url).join(' '));
        };
        const ownTurn = async (actor) => {
            if (ownTurnDone || !leaveDone || actor !== A) return;
            ownTurnDone = true;
            await A.page.waitForSelector('[data-pn-actions][data-pn-armed]', {timeout: 15000});
            const hidden = await A.page.locator('[data-pn-leaving-after]').count();
            const dot = await A.page.locator('[data-pn-leaving-dot]').count();
            check('on Ana\'s own turn the action bar has the dock: the "Last hand" note steps aside, Home\'s dot still says it', hidden === 0 && dot === 1, JSON.stringify({hidden, dot}));
        };
        const done1 = await playByClicks(1, {
            choose: (p) => (p === B || p === C ? 'fold' : 'call'),
            before: async (p, doc) => {
                await leaveAfterTests(p, doc);
                await ownTurn(p);
            },
        });
        if (!leaveDone) note('leaving after this hand', 'Ana never held cards off the clock in hand 1: not checked');
        const result1 = done1.state.hand.result;
        const netA = result1.nets.find((n) => n.seat === seats.ana)?.net ?? 0;
        const rowA = ledgerRow(done1, A);
        const cashOuts = (rowA?.events ?? []).filter((e) => LEDGER_KINDS[e[1]] === 'cash-out').length;
        check('hand 1 played out by clicks, the game paused under it; Ana, leaving after it, played it to the end and left as it completed: the seat empty, cashed out once for every chip',
            paused1.status === 200 && done1.state.status === 'paused' && seatIndex(done1, A) === -1 && cashOuts === 1 && rowA.cashedOut === startA + netA
            && handSeat(done1, B).folded && handSeat(done1, C).folded, JSON.stringify({cashOuts, cashed: rowA?.cashedOut, startA, netA}));
        const ghost = await H.page.waitForSelector(`[data-seat="${seats.ana}"][data-ghost]`, {timeout: 10000}).then(() => H.page.evaluate((s) => {
            const el = document.querySelector(`[data-seat="${s}"][data-ghost]`);
            return {name: el?.querySelector('.pn-plate-name')?.textContent ?? null, cards: el?.querySelectorAll('.pn-seat-shown [data-card]').length ?? 0, flag: el?.querySelector('[data-flag]')?.textContent ?? null};
        }, seats.ana), () => null);
        const wonA = result1.pots.some((pot) => pot.winners.some((list) => list.includes(seats.ana)));
        const banner = await H.page.$eval('[data-pn-banner]', (el) => el.textContent).catch(() => '');
        check(`…through the result the host sees a ghost of Ana's plate (name, the two cards she showed, "Left")${wonA ? ', and the banner names her' : ''}`,
            ghost?.name === 'Ana' && ghost.cards === 2 && ghost.flag === TABLE_COPY.leftSeat && (!wonA || banner.includes('Ana')), JSON.stringify({ghost, wonA, banner}));
        await shot(H.page, '21-ghost-plate-1440');
        const leftA = await A.page.waitForSelector('[data-pn-left]', {timeout: 15000}).then(() => true, () => false);
        check('…and Ana\'s dock is the left panel', leftA);

        // ── asks to see a hand: Ben asks Cy, who shows Ben alone ──
        const holeC = handSeat(done1, C).hole;
        const askedAt = Date.now();
        await B.page.click(`[data-seat-menu="${seats.cy}"]`);
        await B.page.waitForSelector(`[data-pn-seat-menu="${seats.cy}"] [data-seat-ask="ask"]`, {timeout: 10000});
        const askItem = await rectOf(B.page, `[data-pn-seat-menu="${seats.cy}"] [data-seat-ask="ask"]`);
        await shot(B.page, '22-ask-menu-375x667');
        await B.page.click(`[data-pn-seat-menu="${seats.cy}"] [data-seat-ask="ask"]`);
        const asked = await waitDoc((x) => x.state.hand.asks.some((e) => e[0] === seats.ben && e[1] === seats.cy), 10000);
        check('after the hand, Ben (who folded) asks Cy from Cy\'s plate: "Ask to see their cards" first in the menu, 44 px; the ask kept, Ben told',
            askItem !== null && askItem.h >= 43.5 && await inView(B.page, askItem) && asked !== null && await toasted(B.page, ASK_COPY.asked('Cy'), 5000), JSON.stringify(askItem));
        const prompt = await C.page.waitForSelector('[data-pn-ask-prompt]', {timeout: 10000}).then(() => true, () => false);
        const shieldArmed = await C.page.waitForSelector('[data-pn-ask-prompt][data-pn-armed]', {timeout: 5000}).then(() => true, () => false);
        for (const size of [{width: 320, height: 568}, {width: 568, height: 320}]) {
            await resize(C.page, size, 400);
            const m = await targets(C.page, '[data-pn-ask-prompt]');
            const covers = await askCovers(C.page, seats.cy);
            const text = await C.page.innerText('[data-pn-ask-prompt]').catch(() => '');
            const left = Number(await C.page.getAttribute('[data-pn-ask-left]', 'data-pn-ask-left').catch(() => -1));
            check(`Cy's prompt at ${sizeName(size)}: "Ben asks to see your cards", its seconds (15 or fewer), three 44 px answers at the foot of the screen, over the dock and nothing of the table — no other plate, turned-up hand, the board, a pot or the banner; nothing sideways`,
                prompt && targetsOk(m) && m.count === 3 && covers !== null && covers.inView && covers.hits.length === 0 && covers.fromFoot <= 24
                && plain(text).includes(plain(ASK_COPY.prompt('Ben'))) && left > 0 && left <= ASKS.WAIT_MS / 1000, `${brief(m)} ${JSON.stringify({covers, left, text})}`);
            await shot(C.page, `22-ask-prompt-${sizeFile(size)}`);
        }
        await resize(C.page, {width: 320, height: 568}, 300);
        await wording(C.page, 'the ask prompt', '[data-pn-ask-prompt]');
        await C.page.click('[data-pn-reply="one"]');
        const shownOne = await waitDoc((x) => x.state.hand.asks.some((e) => e[0] === seats.ben && e[1] === seats.cy && ASK_ANSWERS[e[3]] === 'shown'), 10000);
        const promptGone = await C.page.waitForSelector('[data-pn-ask-prompt]', {state: 'detached', timeout: 10000}).then(() => true, () => false);
        const onBen = await B.page.waitForSelector(`[data-seat="${seats.cy}"] [data-pn-shown-to-me]`, {timeout: 15000}).then(() => B.page.evaluate((s) => ({
            cards: [...document.querySelectorAll(`[data-seat="${s}"] [data-pn-shown-to-me] [data-card]`)].map((el) => el.getAttribute('data-card')).sort().join(' '),
            flag: document.querySelector(`[data-seat="${s}"] [data-flag]`)?.textContent ?? null,
        }), seats.cy), () => null);
        const benToast = await toasted(B.page, ASK_COPY.ended.shown('Cy'), 10000);
        check('the tap shield arms the answers; "Show Ben" shows Cy\'s cards to Ben alone: on Cy\'s plate on Ben\'s screen ("Shown to you"), Ben told, the prompt gone',
            shieldArmed && shownOne !== null && promptGone && onBen?.cards === labels(holeC) && onBen.flag === ASK_COPY.shownTag && benToast,
            JSON.stringify({shieldArmed, onBen, want: labels(holeC), benToast}));
        await shot(B.page, '22-shown-to-you-375x667');
        await B.page.click('[data-open="menu"]');
        await B.page.click('[data-menu="log"]', {timeout: 5000});
        const logSays = await B.page.waitForFunction(() => document.querySelector('[data-pn-drawer="log"]')?.innerText.includes('Shown to you:') ?? false, null, {timeout: 15000})
            .then(() => true, () => false);
        await B.page.keyboard.press('Escape');
        check('…and Ben\'s hand log says "Shown to you: Cy held …"', logSays);
        await B.page.click(`[data-seat-menu="${seats.cy}"]`);
        const benStatus = await B.page.waitForSelector(`[data-pn-seat-menu="${seats.cy}"] [data-seat-ask-status]`, {timeout: 10000})
            .then((el) => el.getAttribute('data-seat-ask-status'), () => null);
        await B.page.keyboard.press('Escape');
        check('…Ben\'s menu on Cy now says how the ask stands: shown to him', benStatus === 'shown');
        // Nobody else: the host and Dee (seated), Ana (watching) — no answer, page or RSC payload with
        // Cy's cards, the ask or anything shown to one player.
        const others = [H, D, A];
        const leaks = others.flatMap((p) => p.bodies.filter((b) => b.at >= askedAt).flatMap((b) => {
            const out = [];
            if (cardPairsIn(b.body).some((pair) => sameCards(pair, holeC))) out.push(`${p.name} cards ${b.url}`);
            if ((b.body?.me?.asks ?? []).length > 0) out.push(`${p.name} asks ${b.url}`);
            if ((b.body?.me?.shownToMe ?? []).length > 0) out.push(`${p.name} shownToMe ${b.url}`);
            return out;
        }));
        const answered = others.reduce((n, p) => n + p.bodies.filter((b) => b.at >= askedAt).length, 0);
        for (const p of [H, D]) {
            const carried = await pageCarries(p, holeC);
            if (carried.html || carried.rsc) leaks.push(`${p.name} page ${carried.html ? 'html' : 'rsc'}`);
        }
        const benHas = B.bodies.filter((b) => b.at >= askedAt).some((b) => cardPairsIn(b.body).some((pair) => sameCards(pair, holeC)));
        check(`a third player never receives an ask or a hand shown to one: none of ${answered} answers to the host, Dee or Ana, nor their page HTML or RSC, carried Cy's cards or the ask`,
            leaks.length === 0 && answered > 0, leaks.slice(0, 4).join(' | '));
        check('…while Ben\'s own answers carried them (the scan sees them where they are)', benHas);

        // ── No thanks: Cy asks Ben ──
        await C.page.click(`[data-seat-menu="${seats.ben}"]`);
        await C.page.waitForSelector(`[data-pn-seat-menu="${seats.ben}"] [data-seat-ask="ask"]`, {timeout: 10000});
        await C.page.click(`[data-pn-seat-menu="${seats.ben}"] [data-seat-ask="ask"]`);
        await B.page.waitForSelector('[data-pn-ask-prompt][data-pn-armed]', {timeout: 10000});
        for (const size of [{width: 375, height: 667}, {width: 667, height: 375}]) {
            await resize(B.page, size, 400);
            const m = await targets(B.page, '[data-pn-ask-prompt]');
            const covers = await askCovers(B.page, seats.ben);
            check(`Ben's prompt at ${sizeName(size)}: three 44 px answers on screen, at the foot, over nothing of the table`,
                targetsOk(m) && m.count === 3 && covers !== null && covers.inView && covers.hits.length === 0 && covers.fromFoot <= 24, `${brief(m)} ${JSON.stringify(covers)}`);
            await shot(B.page, `22-ask-prompt-${sizeFile(size)}`);
        }
        await resize(B.page, {width: 375, height: 667}, 300);
        await B.page.click('[data-pn-reply="none"]');
        const declined = await waitDoc((x) => x.state.hand.asks.some((e) => e[0] === seats.cy && e[1] === seats.ben && ASK_ANSWERS[e[3]] === 'no'), 10000);
        const cyToast = await toasted(C.page, ASK_COPY.ended.no('Ben'), 10000);
        const cooled = declined?.state.askCooldowns.some(([from, to]) => from === C.pid && to === B.pid) ?? false;
        check('"No thanks": Cy is told, Ben\'s cards stay hidden, and Cy may not ask Ben again for five hands', declined !== null && cyToast && cooled
            && !(await C.page.locator(`[data-seat="${seats.ben}"] [data-pn-shown-to-me]`).count()), JSON.stringify({cyToast, cooled}));

        // ── Cy turns asks off in My look ──
        await C.page.click('[data-open="menu"]');
        await C.page.click('[data-menu="look"]', {timeout: 5000});
        await C.page.waitForSelector('[data-pn-drawer="look"] [data-pn-personal="allowAsks"]', {timeout: 10000});
        await C.page.locator('[data-pn-personal="allowAsks"]').scrollIntoViewIfNeeded();
        const switchSaid = await C.page.innerText('[data-pn-switch-row="allowAsks"]').catch(() => '');
        await C.page.click('[data-pn-personal="allowAsks"]');
        const off = await waitDoc((x) => x.state.noAsks.includes(C.pid), 10000);
        await C.page.keyboard.press('Escape');
        check('Cy turns off "Let others ask to see my cards" in My look: the room keeps it for Cy\'s seat', off !== null && switchSaid.includes(ASK_COPY.allow), switchSaid);

        // ── hand 2: everyone folds to the host; the blocked asks; one nobody answers ──
        await hostOp(H, {op: 'resume'});
        d = await waitDoc((x) => x.state.hand?.no === 2 && x.state.hand.phase === 'betting', 30000);
        await hostOp(H, {op: 'pause'});
        const done2 = await playByClicks(2, {choose: (p) => (p === H ? 'call' : 'fold')});
        check('hand 2: the host, Ben, Cy and Dee dealt in (not Ana); all but the host fold', done2.state.hand.no === 2 && handSeat(done2, A) === null
            && [B, C, D].every((p) => handSeat(done2, p)?.folded) && !done2.state.hand.result.showdown, JSON.stringify(done2.state.hand.seats.map((s) => [s.pid, s.folded])));
        await B.page.click(`[data-seat-menu="${seats.cy}"]`);
        const offSaid = await B.page.waitForSelector(`[data-pn-seat-menu="${seats.cy}"] [data-seat-ask="asks-off"]`, {timeout: 10000}).then(async () => {
            await sleep(300);
            return B.page.evaluate((s) => {
                const menu = document.querySelector(`[data-pn-seat-menu="${s}"]`);
                const last = menu?.querySelector('[data-seat-mute]')?.getBoundingClientRect();
                const plate = document.querySelector(`[data-seat="${s}"] .pn-plate`)?.getBoundingClientRect();
                const m = menu?.getBoundingClientRect();
                return {
                    disabled: document.querySelector(`[data-pn-seat-menu="${s}"] [data-seat-ask]`)?.hasAttribute('data-disabled') ?? false,
                    why: document.querySelector(`[data-pn-seat-menu="${s}"] [data-seat-ask-why]`)?.textContent ?? null,
                    side: menu?.getAttribute('data-side') ?? null,
                    lastInView: !!last && last.top >= -0.5 && last.bottom <= innerHeight + 0.5,
                    scrolls: !!menu && menu.scrollHeight > menu.clientHeight + 1,
                    towardMiddle: !!m && !!plate && (plate.top + plate.height / 2 > innerHeight / 2 ? m.bottom <= plate.top + 1 : m.top >= plate.bottom - 1),
                };
            }, seats.cy);
        }, () => null);
        await shot(B.page, '22-ask-blocked-375x667');
        await B.page.keyboard.press('Escape');
        check('in the next hand\'s pause, Ben\'s ask of Cy is greyed: "Cy has turned off asks to see their cards."', offSaid?.disabled === true && offSaid.why === ASK_COPY.blocked['asks-off']('Cy'),
            JSON.stringify(offSaid));
        check('…and Cy\'s menu opens toward the middle of the table, whole on screen: its last row in view, nothing to scroll inside it',
            offSaid?.lastInView === true && offSaid.scrolls === false && offSaid.towardMiddle === true, JSON.stringify(offSaid));
        await C.page.click(`[data-seat-menu="${seats.ben}"]`);
        const coolSaid = await C.page.waitForSelector(`[data-pn-seat-menu="${seats.ben}"] [data-seat-ask="cooldown"]`, {timeout: 10000})
            .then(() => C.page.$eval(`[data-pn-seat-menu="${seats.ben}"] [data-seat-ask-why]`, (el) => el.textContent), () => null);
        await C.page.keyboard.press('Escape');
        check('…and Cy\'s ask of Ben, a hand after his no, says why it waits', coolSaid === ASK_COPY.blocked.cooldown(), String(coolSaid));
        // Dee asks the host, who never answers: a no once its seconds are up.
        const seatH = seatIndex(done2, H);
        await D.page.click(`[data-seat-menu="${seatH}"]`);
        await D.page.waitForSelector(`[data-pn-seat-menu="${seatH}"] [data-seat-ask="ask"]`, {timeout: 10000});
        await D.page.click(`[data-pn-seat-menu="${seatH}"] [data-seat-ask="ask"]`);
        const hostPrompt = await H.page.waitForSelector('[data-pn-ask-prompt]', {timeout: 10000}).then(() => true, () => false);
        await shot(H.page, '22-ask-prompt-1440');
        const hostPromptGone = await H.page.waitForSelector('[data-pn-ask-prompt]', {state: 'detached', timeout: ASKS.WAIT_MS + 5000}).then(() => true, () => false);
        const expiredToast = await toasted(D.page, 'No answer from', 8000);
        await D.page.click(`[data-seat-menu="${seatH}"]`);
        const expiredStatus = await D.page.waitForSelector(`[data-pn-seat-menu="${seatH}"] [data-seat-ask-status]`, {timeout: 10000})
            .then((el) => el.getAttribute('data-seat-ask-status'), () => null);
        await D.page.keyboard.press('Escape');
        check('an ask nobody answers runs out as a no: the host\'s prompt goes by itself, Dee is told "No answer from …", and her menu says so',
            hostPrompt && hostPromptGone && expiredToast && expiredStatus === 'expired', JSON.stringify({hostPrompt, hostPromptGone, expiredToast, expiredStatus}));

        // ── hand 3, not paused: Ben asks Dee and the next deal ends it first ──
        // An eight-second pause, so the ask is made with its fifteen seconds outlasting it.
        await hostOp(H, {op: 'config', patch: {pauseSeconds: 8}});
        await hostOp(H, {op: 'resume'});
        await waitDoc((x) => x.state.hand?.no === 3 && x.state.hand.phase === 'betting', 30000);
        const done3 = await playByClicks(3, {choose: (p) => (p === H ? 'call' : 'fold')});
        const seatDee = seatIndex(done3, D);
        await B.page.click(`[data-seat-menu="${seatDee}"]`);
        await B.page.waitForSelector(`[data-pn-seat-menu="${seatDee}"] [data-seat-ask="ask"]`, {timeout: 10000});
        await B.page.click(`[data-pn-seat-menu="${seatDee}"] [data-seat-ask="ask"]`);
        const askedDee = await waitDoc((x) => x.state.hand.no === 3 && x.state.hand.asks.some((e) => e[0] === seats.ben && e[1] === seatDee), 10000);
        const deePrompt = await D.page.waitForSelector('[data-pn-ask-prompt]', {timeout: 10000}).then(() => true, () => false);
        const deeLeft = Number(await D.page.getAttribute('[data-pn-ask-left]', 'data-pn-ask-left').catch(() => -1));
        const deeNow = Date.now();
        const deeCovers = await askCovers(D.page, seatDee);
        const deeM = await targets(D.page, '[data-pn-ask-prompt]');
        await shot(D.page, '22-ask-prompt-dealing-844x390');
        const toDeal = Math.ceil(((askedDee?.state.nextHandAt ?? 0) - deeNow) / 1000) + 1;
        check('an ask made in a running pause: Dee\'s prompt (a phone on its side: in the dock\'s column, over nothing of the table) counts down to the next deal, not to the ask\'s fifteen seconds',
            askedDee !== null && deePrompt && deeLeft > 0 && deeLeft <= Math.max(1, toDeal) && deeLeft < ASKS.WAIT_MS / 1000 - 3 && deeCovers !== null && deeCovers.inView
            && deeCovers.hits.length === 0 && targetsOk(deeM), JSON.stringify({deeLeft, toDeal, deeCovers, m: brief(deeM)}));
        const dealt4 = await waitDoc((x) => x.state.hand?.no === 4, 30000);
        const deePromptGone = await D.page.waitForSelector('[data-pn-ask-prompt]', {state: 'detached', timeout: 10000}).then(() => true, () => false);
        const benDealtToast = await toasted(B.page, plain(ASK_COPY.ended.dealt('Dee')).slice(0, 30), 15000);
        const noCooldown = dealt4 !== null && !dealt4.state.askCooldowns.some(([a, b]) => a === B.pid && b === D.pid);
        check('…the deal ends it with no answer: Dee\'s prompt goes, Ben is told ("The next hand was dealt before Dee answered."), and no cooldown keeps Ben from asking Dee again',
            dealt4 !== null && deePromptGone && benDealtToast && noCooldown, JSON.stringify({dealt: dealt4 !== null, deePromptGone, benDealtToast, cooldowns: dealt4?.state.askCooldowns}));
        await hostOp(H, {op: 'pause'});

        // ── the host drawer's Off / On, saved ──
        await H.page.click('[data-open="host"]');
        await H.page.click('[data-host-tab="rebuys"]');
        await H.page.waitForSelector('[data-pn-choice="host-rebuys"]', {timeout: 10000});
        const drawerM = await targets(H.page, '[data-pn-choice="host-rebuys"]');
        await H.page.click('[data-pn-choice="host-rebuys"] [data-pn-option="off"]');
        await H.page.click('[data-host-section="rebuys"] [data-host-save]');
        const savedOff = await waitDoc((x) => x.state.config.rebuys === 'off', 10000);
        await H.page.click('[data-pn-choice="host-rebuys"] [data-pn-option="approve"]');
        await H.page.click('[data-host-section="rebuys"] [data-host-save]');
        const savedOn = await waitDoc((x) => x.state.config.rebuys === 'approve', 10000);
        await shot(H.page, '20-rebuys-host-1440');
        await H.page.keyboard.press('Escape');
        check('the host drawer\'s Rebuys: Off / On (host approves), two 44 px radios; each saved as chosen', targetsOk(drawerM) && drawerM.count === 2 && savedOff !== null && savedOn !== null,
            brief(drawerM));

        // ── a page on an older protocol is asked to reload ──
        const older = async (route) => {
            await route.continue({headers: {...route.request().headers(), 'x-pn-protocol': String(PN_PROTOCOL - 1)}}).catch(() => {});
        };
        await B.page.route('**/api/poker-night/**', older);
        const reloadAsked = await B.page.waitForSelector('[data-pn-problem="reload"]', {timeout: 30000}).then(() => true, () => false);
        await shot(B.page, '24-reload-375x667');
        await B.page.unroute('**/api/poker-night/**', older);
        if (reloadAsked) await B.page.click('[data-pn-problem="reload"] button');
        const back = await B.page.waitForSelector('[data-me]', {timeout: 60000}).then(() => true, () => false);
        const problemAfter = await B.page.locator('[data-pn-problem]').count();
        check('a page on an older protocol (its requests sent as protocol ' + (PN_PROTOCOL - 1) + ') is asked to reload, and the reload brings the table back',
            reloadAsked && back && problemAfter === 0, JSON.stringify({reloadAsked, back, problemAfter}));

        // ── the host away ten minutes: a guest's chips no longer wait for them ──
        // Eve, a guest, sits once the game has started: her chips wait. Then the host's page goes
        // quiet (its beats held back) and the room's record of them is set eleven minutes back, as
        // ten minutes away would leave it: Eve's page says the chips no longer wait, and one tap lands them.
        const E = await newPlayer('eve', PHONE(390, 844));
        await sitDown(E, 'Eve');
        const eveAsked = await waitDoc((x) => x.state.requests.some((r) => r.pid === E.pid), 10000);
        const amountE = eveAsked?.state.requests.find((r) => r.pid === E.pid)?.amount ?? 0;
        const eveWaits = await E.page.waitForSelector('[data-pn-waiting-approval]', {timeout: 15000}).then(() => true, () => false);
        const takeBefore = await E.page.locator('[data-pn-control="take-chips"]').count();
        const quiet = (route) => route.abort().catch(() => {});
        await H.page.route('**/api/poker-night/*/tick', quiet);
        const longAgo = Date.now() - 11 * 60_000;
        await rooms.updateOne({env: ENV, code}, {$set: {[`seen.${H.pid}.at`]: longAgo, 'players.$[h].joinedAt': new Date(longAgo)}}, {arrayFilters: [{'h.pid': H.pid}]});
        await E.page.reload({waitUntil: 'load'});
        const takeSaid = await E.page.waitForSelector('[data-pn-waiting-approval][data-pn-host-away]', {timeout: 20000}).then((el) => el.innerText(), () => null);
        const takeLabel = await E.page.waitForSelector('[data-pn-seat-controls][data-pn-armed] [data-pn-control="take-chips"]', {timeout: 15000}).then((el) => el.innerText(), () => null);
        const takeM = await targets(E.page, '[data-pn-dock]');
        await shot(E.page, '23-host-away-390x844');
        check('a guest whose chips wait sees no way round the host while they are here; once the host has been away ten minutes the dock says the chips no longer wait for them, with "Take … chips" (44 px)',
            eveAsked !== null && eveWaits && takeBefore === 0 && takeSaid?.trim() === TABLE_COPY.hostAwayNote && plain(takeLabel ?? '').trim() === BANK_COPY.takeChips(amountE) && targetsOk(takeM),
            JSON.stringify({eveWaits, takeBefore, takeSaid, takeLabel, m: brief(takeM)}));
        await E.page.click('[data-pn-control="take-chips"]');
        const landedE = await waitDoc((x) => (x.state.seats[seatIndex(x, E)]?.stack ?? 0) === amountE && !x.state.requests.some((r) => r.pid === E.pid), 10000);
        check('…one tap lands Eve\'s chips without the host (told so), the request gone, every chip accounted for', landedE !== null && await toasted(E.page, BANK_COPY.approved(amountE), 10000)
            && ledgerRow(landedE, E)?.bought === amountE, JSON.stringify({landed: landedE !== null}));
        await H.page.unroute('**/api/poker-night/*/tick', quiet);
        await hostOp(H, {op: 'end'}).catch(() => null);
    }

    // ═══ PLO (P5): picking it, four cards on every phone, pot limit, the showdown ════════════════
    // The lobby's buttons (Texas hold'em one tap, PLO beside it, each 44 px at every phone size) and
    // the start form's Game choice; "Start PLO" opens a PLO table whose top bar, invite sheet and join
    // card name the game, "How it plays" opening the Hands guide on PLO. Three guests on 390 × 844,
    // 375 × 667 and 320 × 568 phones: each dock fans four cards, every card at least half in sight,
    // every other seat four backs, nothing sideways, every target 44 px — and on their sides at
    // 844 × 390, 667 × 375 and 568 × 320. No other context's answer, page HTML or RSC payload carries a
    // hole (two cards of one or more). The first actor's raise panel tops out at Pot, says "(pot)", and
    // its confirm lands a raise to the server's own cap. The hand checked down to a showdown: every hand
    // of four turned up overlapping on every phone, the banner clear of them, the winner the one QA's
    // own Omaha brute force finds, the lit cards two of that hand and three of the board. The host
    // switches back to Texas hold'em: the countdown says so, the next deal toasts it and deals two.
    {
        const unisolate = (text) => (text ?? '').replace(/[⁨⁩]/g, '');
        await hostOp(H, {op: 'end'}).catch(() => null);
        await H.page.goto(`${BASE}/poker-night`, {waitUntil: 'load', timeout: 180000});
        await H.page.waitForSelector('[data-quick-start="plo"]', {timeout: 60000});
        const quick = await H.page.$$eval('[data-quick-start]', (els) => els.map((el) => [el.getAttribute('data-quick-start'), el.textContent?.trim() ?? '']));
        check('the lobby: "Start a table" (Texas hold\'em, one tap), and "Start PLO" and "Start Triple T" under it',
            JSON.stringify(quick) === JSON.stringify([['holdem', POKER_NIGHT_COPY.quickStart], ['plo', POKER_NIGHT_COPY.quickPlo], ['triple-t', POKER_NIGHT_COPY.quickTripleT]]), JSON.stringify(quick));
        await H.page.click('[data-poker-night-setup] summary');
        await H.page.waitForSelector('[data-pn-choice="game"]', {timeout: 10000});
        const formGame = await H.page.$$eval('[data-pn-choice="game"] [role="radio"]', (els) => els.map((el) => [el.getAttribute('data-pn-option'), el.getAttribute('aria-checked')]));
        await H.page.click('[data-pn-choice="game"] [data-pn-option="plo"]');
        const ploChecked = await H.page.getAttribute('[data-pn-choice="game"] [data-pn-option="plo"]', 'aria-checked');
        check('…"Set it up first" opens with the Game choice: Texas hold\'em (chosen), PLO and Triple T, a tap choosing PLO',
            JSON.stringify(formGame) === JSON.stringify([['holdem', 'true'], ['plo', 'false'], ['triple-t', 'false']]) && ploChecked === 'true', JSON.stringify({formGame, ploChecked}));
        await wording(H.page, 'the lobby with the games', '[data-poker-night-start]');
        {
            const strings = (value) => (typeof value === 'string' ? [value] : value && typeof value === 'object' ? Object.values(value).flatMap(strings) : []);
            const fixed = [
                ...strings(MODE_COPY.short), ...strings(MODE_COPY.spoken), ...strings(MODE_COPY.pick), MODE_COPY.gameLabel, MODE_COPY.nextHand('PLO'),
                MODE_COPY.nextHandIn('PLO', 4), MODE_COPY.changed('Pot-limit Omaha'), ACTION_COPY.potRaise(340), ACTION_COPY.potBet(120), JOIN_COPY.howItPlays,
                JOIN_COPY.terms('PLO', 10, 20, 2000), INVITE_COPY.mode('PLO'), INVITE_COPY.shareText("Ana's table", 'Pot-limit Omaha'),
                INVITE_COPY.ogDescription('Pot-limit Omaha'), POKER_NIGHT_COPY.quickPlo, POKER_NIGHT_COPY.subtitle, ...strings(HANDS_COPY.games.plo),
                HANDS_COPY.ploExample, HANDS_COPY.ploHand, HANDS_COPY.ploBoard,
            ];
            const hits = fixed.flatMap((text) => wordingOf(text).map((hit) => `"${text.slice(0, 40)}": ${hit}`));
            check(`the no-advice list (and no Hold/Buy/Sell opener, no currency word) over PLO's strings as written (${fixed.length})`, hits.length === 0, hits.slice(0, 4).join(' | '));
        }
        // The quick starts and the Game cards on a phone: each 44 px or more, inside the screen, none over another.
        const startTargets = (page) => page.evaluate(() => {
            const vw = innerWidth;
            const els = [...document.querySelectorAll('[data-quick-start], [data-pn-choice="game"] [role="radio"]')];
            const rects = els.map((el) => el.getBoundingClientRect());
            const hit = (a, b) => a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1;
            let overlaps = 0;
            for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) if (hit(rects[i], rects[j])) overlaps++;
            return {
                count: els.length, small: rects.filter((r) => r.width < 43.5 || r.height < 43.5).map((r) => `${Math.round(r.width)}×${Math.round(r.height)}`),
                outside: rects.filter((r) => r.left < -1 || r.right > vw + 1).length, overlaps, scroll: document.documentElement.scrollWidth - vw,
            };
        });
        for (const size of SIZES.slice(0, 3)) {
            await Hm.page.goto(`${BASE}/poker-night`, {waitUntil: 'load', timeout: 180000});
            await resize(Hm.page, size);
            await Hm.page.waitForSelector('[data-quick-start="plo"]', {timeout: 60000});
            await Hm.page.click('[data-poker-night-setup] summary').catch(() => {});
            await Hm.page.waitForSelector('[data-pn-choice="game"]', {timeout: 10000}).catch(() => {});
            await sleep(300);
            const m = await startTargets(Hm.page);
            check(`the lobby's start at ${sizeName(size)}: the three quick starts and the three Game cards 44 px or more, inside the screen, none over another, nothing sideways`,
                m.count === 6 && m.small.length === 0 && m.outside === 0 && m.overlaps === 0 && m.scroll <= 0, JSON.stringify(m));
            await shot(Hm.page, `30-plo-start-${sizeFile(size)}`);
        }

        await H.page.click('[data-quick-start="plo"]');
        await H.page.waitForURL(/\/play\/[A-HJ-NP-Z2-9]{6}(\?.*)?$/, {timeout: 120000});
        code = new URL(H.page.url()).pathname.split('/').pop();
        const inviteMode = await H.page.waitForSelector('[data-invite-mode]', {timeout: 60000}).then((el) => el.textContent(), () => null);
        await shot(H.page, '31-plo-invite-1440');
        await H.page.keyboard.press('Escape');
        H.pid = (await roomDoc()).state.hostPid;
        let d = await roomDoc();
        const barMode = await H.page.textContent('[data-pn-mode-label]').catch(() => null);
        check('"Start PLO" opens a PLO table on one board: the top bar says "PLO", the invite sheet "Game: PLO"',
            d.state.config.variant === 'plo' && d.state.config.boards === 1 && barMode === MODE_COPY.short.plo && inviteMode === INVITE_COPY.mode('PLO'),
            JSON.stringify({config: [d.state.config.variant, d.state.config.boards], barMode, inviteMode}));

        const ploPlayers = [[390, 844, 'Amy'], [375, 667, 'Bo'], [320, 568, 'Cal']];
        const guests = [];
        for (const [width, height, name] of ploPlayers) {
            const g = await newPlayer(`plo-${name}`, PHONE(width, height));
            g.size = {width, height};
            guests.push(g);
        }
        // The first guest reads the join card and opens "How it plays" before sitting.
        {
            const g = guests[0];
            await g.page.goto(`${BASE}/play/${code}`, {waitUntil: 'load', timeout: 120000});
            await g.page.waitForSelector('[data-join-card="visitor"]', {timeout: 60000});
            const terms = await g.page.textContent('[data-join-terms]');
            await g.page.click('[data-join-how]');
            const drawer = await g.page.waitForSelector('[data-pn-drawer="hands"]', {timeout: 10000}).then(() => true, () => false);
            await sleep(400);
            const here = await g.page.getAttribute('[data-pn-drawer="hands"] [data-guide-here]', 'data-guide-game').catch(() => null);
            const ploCards = await g.page.locator('[data-pn-drawer="hands"] [data-guide-plo] .pn-card').count();
            const lifted = await g.page.locator('[data-pn-drawer="hands"] [data-guide-plo] .pn-card[data-state="win"]').count();
            await shot(g.page, '32-plo-how-it-plays-390x844');
            await wording(g.page, 'the Hands drawer on PLO', '[data-pn-drawer="hands"]');
            check('the join card names the game first ("PLO · Blinds 10/20 · 2,000 chips to start") and "How it plays" opens the Hands guide on PLO for a visitor: its hand of four on one board, the five that play lifted',
                (terms ?? '').trim() === JOIN_COPY.terms('PLO', 10, 20, 2000) && drawer && here === 'plo' && ploCards === 9 && lifted === 5, JSON.stringify({terms, drawer, here, ploCards, lifted}));
            await g.page.keyboard.press('Escape');
            await g.page.waitForSelector('[data-pn-drawer="hands"]', {state: 'detached', timeout: 10000}).catch(() => {});
        }
        for (const [i, g] of guests.entries()) await sitDown(g, ploPlayers[i][2]);
        await hostOp(H, {op: 'config', patch: {turnSeconds: 120}});
        const started = await hostOp(H, {op: 'start'});
        d = await waitDoc((x) => x.state.hand?.phase === 'betting', 30000);
        check('…three guests sit down beside the host and the first PLO hand is dealt: four cards each', started.status === 200 && d !== null
            && d.state.hand.variant === 'plo' && d.state.hand.seats.length === 4 && d.state.hand.seats.every((p) => p.hole.length === 4), `${started.status}`);
        const handNo = d.state.hand.no;
        const dealtAt = Date.now() - 5000;
        const all = [H, ...guests];
        // The table laid out on a phone mid-hand (the early choices are the dock's row then).
        const layoutOk = (m) => m.plates === 4 && m.outside === 0 && m.overlaps === 0 && m.small.length === 0 && m.scroll <= 0 && m.overDock === 0 && m.dockRight !== false;
        const holeOf = (doc, p) => handSeat(doc, p)?.hole ?? [];

        // The docks: four cards in a fan, each at least half in sight; four backs on every other plate.
        const dockFan = (p) => p.page.evaluate(() => {
            const cards = [...document.querySelectorAll('[data-pn-dock] .pn-hole .pn-card')].map((el) => el.getBoundingClientRect());
            const vw = innerWidth;
            const shownShare = cards.map((r, i) => {
                const next = cards[i + 1];
                const visible = next ? Math.min(r.right, next.left) - r.left : r.width;
                return visible / r.width;
            });
            const bar = document.querySelector('[data-pn-topbar]')?.getBoundingClientRect().bottom ?? 0;
            const emote = document.querySelector('[data-pn-dock] [data-pn-emotes-open]')?.getBoundingClientRect();
            return {
                count: cards.length, minShown: Math.min(...shownShare), inside: cards.every((r) => r.left >= -1 && r.right <= vw + 1),
                // Under the top bar, and on one row with the emote button.
                clear: cards.every((r) => r.top >= bar - 0.5), row: !!emote && cards.length > 0 && emote.top < Math.max(...cards.map((r) => r.bottom)),
                backs: [...document.querySelectorAll('[data-seat]:not([data-me]) .pn-seat-cards')].map((el) => el.getAttribute('data-count')),
            };
        });
        // Each screen has the deal and has played it: four cards in the dock, none still flying in.
        await sleep(1500);
        const dealtIn = (p) => p.page.waitForFunction(() => document.querySelectorAll('[data-pn-dock] .pn-hole[data-count="4"] .pn-card').length === 4
            && !document.querySelector('[data-pn-dock] [data-anim="deal"], .pn-seat-cards [data-anim="deal"]'), null, {timeout: 20000}).catch(() => {});
        for (const p of all) await dealtIn(p);
        for (const g of guests) {
            await dealtIn(g);
            const fan = await dockFan(g);
            const m = await tableLayout(g.page);
            check(`PLO at ${sizeName(g.size)}: the dock fans four cards, each at least half in sight, on screen; three other plates show four backs; the table laid out (plates apart, nothing sideways, every target 44 px)`,
                fan.count === 4 && fan.minShown >= 0.5 && fan.inside && fan.clear && fan.row && fan.backs.length === 3 && fan.backs.every((b) => b === '4') && layoutOk(m),
                JSON.stringify({fan, m}));
            await shot(g.page, `33-plo-dock-${sizeFile(g.size)}`);
        }
        // On its side: each phone turned.
        for (const g of guests) {
            const side = {width: g.size.height, height: g.size.width};
            await resize(g.page, side);
            const fan = await dockFan(g);
            const m = await tableLayout(g.page);
            check(`…and on its side at ${sizeName(side)}: the fan whole, in the dock's column, under the top bar and on one row with the emote button, the table laid out`,
                fan.count === 4 && fan.minShown >= 0.5 && fan.inside && fan.clear && fan.row && layoutOk(m), JSON.stringify({fan, m}));
            await shot(g.page, `33-plo-dock-${sizeFile(side)}`);
            await resize(g.page, g.size);
        }
        await shot(H.page, '33-plo-table-1440');

        // No hole leaves its own context: two cards of a hidden hand in any array of two to four.
        const leaks = (doc, label) => {
            const out = [];
            for (const p of all) {
                const hidden = all.filter((q) => q !== p).map((q) => holeOf(doc, q)).filter((h) => h.length === 4);
                for (const {body} of p.bodies.filter((b) => b.at >= dealtAt && b.url.includes(`/api/poker-night/${code}/`))) {
                    walk(body, null, (node, key) => {
                        if (!Array.isArray(node) || node.length < 2 || node.length > 4 || NOT_CARDS.has(key)) return;
                        if (!node.every((n) => Number.isInteger(n) && n >= 0 && n < 52)) return;
                        for (const h of hidden) if (node.filter((c) => h.includes(c)).length >= 2) out.push(`${label}: ${p.name} ${key} ${JSON.stringify(node)}`);
                    });
                }
            }
            return out;
        };
        d = await roomDoc();
        const preflopLeaks = leaks(d, 'preflop');
        const pageLeaks = [];
        // A hand of four as a page carries it: any array of four numbers, and any pair, in the HTML's flight data and the RSC payload.
        const quadsIn = (text) => [...text.matchAll(/[(d{1,2}),(d{1,2}),(d{1,2}),(d{1,2})]/g)].map((m) => m.slice(1, 5).map(Number));
        for (const p of guests) {
            const html = flightOf(await (await p.context.request.get(`${BASE}/play/${code}`, {timeout: 90000})).text());
            const rsc = await (await p.context.request.get(`${BASE}/play/${code}`, {headers: {RSC: '1'}, timeout: 90000})).text();
            for (const q of all.filter((x) => x !== p)) {
                const hole = holeOf(d, q);
                const inText = (text) => quadsIn(text).some((quad) => sameCards(quad, hole))
                    || pairsInText(text).some((pair) => pair.every((c) => hole.includes(c)));
                if (inText(html) || inText(rsc)) pageLeaks.push(`${p.name} carries ${q.name}'s`);
            }
        }
        check('no other context\'s answers, page HTML or RSC payload carry two cards of a hand of four', preflopLeaks.length === 0 && pageLeaks.length === 0,
            [...preflopLeaks, ...pageLeaks].slice(0, 3).join(' | '));

        // The first actor's raise panel: Pot is the top, it says so, and its confirm lands the cap.
        const {doc: turnDoc, actor} = await nextTurn(handNo);
        const legal = legalFor(snapshotFromState(turnDoc.state), turnDoc.state.hand.actor);
        const cap = legal.raise.max;
        const stackTo = turnDoc.state.seats[turnDoc.state.hand.actor].stack + handSeat(turnDoc, actor).streetBet;
        await actor.page.waitForSelector('[data-pn-actions][data-pn-armed]', {timeout: 20000});
        await actor.page.click('[data-pn-action="raise"]');
        await actor.page.waitForSelector('[data-pn-raise]', {timeout: 10000});
        const sizes = await actor.page.$$eval('[data-pn-raise] [data-size]', (els) => els.map((el) => el.getAttribute('data-size')));
        await actor.page.click('[data-pn-raise] [data-size="pot"]');
        const confirmText = (await actor.page.textContent('[data-pn-action="confirm"]'))?.trim() ?? '';
        const raiseM = await targets(actor.page, '[data-pn-raise]');
        await shot(actor.page, `34-plo-pot-raise-${actor.size ? sizeFile(actor.size) : '1440'}`);
        const turn = turnDoc.state.turn;
        await actor.page.click('[data-pn-action="confirm"]');
        await waitMoved(turn, handNo);
        d = await roomDoc();
        const last = d.state.hand.log.at(-1);
        check(`pot limit: ${actor.name}'s raise panel tops out at Pot (no all-in, the stack of ${stackTo} past the cap of ${cap}), its confirm reads "${ACTION_COPY.potRaise(cap)}", and lands a raise to exactly the cap`,
            cap < stackTo && sizes.at(-1) === 'pot' && !sizes.includes('all-in') && confirmText === ACTION_COPY.potRaise(cap) && targetsOk(raiseM)
            && handSeat(d, actor)?.streetBet === cap && last?.[3] === cap && (last?.[4] & 1) === 0,
            JSON.stringify({cap, stackTo, sizes, confirmText, bet: handSeat(d, actor)?.streetBet, last, m: brief(raiseM)}));

        // Everyone calls and checks it down: the flop's answers carry no hole either.
        let flopChecked = false;
        const done = await playByClicks(handNo, {
            choose: () => 'call',
            onStreet: async (doc) => {
                if (doc.state.hand.street !== 'flop' || flopChecked) return;
                flopChecked = true;
                await sleep(800);
                const flopLeaks = leaks(await roomDoc(), 'flop');
                check('…on the flop too, no other context\'s answer carries two cards of a hand of four', flopLeaks.length === 0, flopLeaks.slice(0, 3).join(' | '));
            },
        });
        await hostOp(H, {op: 'pause'});
        const result = done.state.hand.result;
        const board = done.state.hand.boards[0];
        // QA's own Omaha: every two of the four with every three of the board.
        const omaha = (hole) => {
            let top = -1;
            for (let a = 0; a < 4; a++) for (let b = a + 1; b < 4; b++) for (let c = 0; c < 5; c++) for (let e = c + 1; e < 5; e++) for (let f = e + 1; f < 5; f++) {
                top = Math.max(top, evaluateCards([hole[a], hole[b], board[c], board[e], board[f]]));
            }
            return top;
        };
        const live = done.state.hand.seats.filter((p) => !p.folded);
        const values = new Map(live.map((p) => [p.seat, omaha(p.hole)]));
        const topValue = Math.max(...values.values());
        const expected = live.filter((p) => values.get(p.seat) === topValue).map((p) => p.seat).sort((a, b) => a - b);
        check('the showdown: every hand of four turned up, the pot to the hand QA\'s own Omaha finds strongest (exactly two of four with three of the board)',
            result.showdown && result.hands.length === live.length && result.hands.every((h) => h.cards.length === 4)
            && JSON.stringify([...result.pots[0].winners[0]].sort((a, b) => a - b)) === JSON.stringify(expected), JSON.stringify({pots: result.pots, expected, values: [...values]}));
        await sleep(2500);
        const winnerHoles = expected.map((seat) => live.find((p) => p.seat === seat).hole);
        for (const p of all) {
            const seen = await p.page.evaluate(() => {
                const rect = (el) => el.getBoundingClientRect();
                const hit = (a, b) => a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1;
                const banner = [...document.querySelectorAll('.pn-banner')].map(rect).filter((r) => r.width > 0);
                const hands = [...document.querySelectorAll('.pn-seat-shown')].map((el) => ({count: el.getAttribute('data-count'), r: rect(el)}));
                return {
                    lit: [...new Set([...document.querySelectorAll('main .pn-card[data-state="win"]')].map((el) => el.getAttribute('data-card')))],
                    hands: hands.map((h) => h.count),
                    bannerOver: banner.some((b) => hands.some((h) => hit(b, h.r))), banner: banner.length,
                    scroll: document.documentElement.scrollWidth - innerWidth,
                };
            });
            const litCards = winnerHoles.flatMap((hole) => hole.filter((c) => seen.lit.includes(cardLabel(c))));
            const litBoard = board.filter((c) => seen.lit.includes(cardLabel(c)));
            const fiveOk = expected.length > 1 || (litCards.length === 2 && litBoard.length === 3
                && evaluateCards([...litCards, ...litBoard]) === topValue);
            check(`…on ${p.name}'s screen${p.size ? ` (${sizeName(p.size)})` : ''}: the other hands of four turned up overlapping, the banner clear of them, the lit cards two of the winning hand and three of the board`,
                seen.hands.length === 3 && seen.hands.every((c) => c === '4') && seen.banner === 1 && !seen.bannerOver && fiveOk
                && winnerHoles.every((hole) => hole.filter((c) => seen.lit.includes(cardLabel(c))).length === 2) && seen.scroll <= 0,
                JSON.stringify({...seen, litCards: litCards.map(cardLabel), litBoard: litBoard.map(cardLabel)}));
            await shot(p.page, `35-plo-showdown-${p.size ? sizeFile(p.size) : '1440'}`);
        }

        // ═══ PLO on three boards (P6) ═══════════════════════════════════════════════════════════
        // The host drawer's Boards choice, under PLO alone (One board, 2 boards, 3 boards, each 44 px),
        // three boards from the next hand: three rows of five on every phone, upright and on its side,
        // inside the table and clear of every plate and bet line, their cards at or above what the
        // seat layers QA drives measure in stage.test (8 seats: 33 px at 390 × 844, 19 at 375 × 667, 16
        // at 320 × 568, 26 and 24 on the phones on their side, 14 on the smallest, 60 on the desktop); a
        // tap on them opens the boards sheet, each board at 44 px under its name. Played down to a
        // showdown: each board's share of the pot to the hands QA's own Omaha finds strongest on that
        // board, the page's paid pots the server's own split (pots.paidParts), and the banner a line a
        // board — or one when a player won every board — clear of the hands turned up (and, but on the
        // 320 px phone, the boards too), the lit cards on each board the winner's.
        const {paidParts} = await lib('lib/poker-night/pots.ts');
        let lastNo = handNo;
        await H.page.click('[data-open="host"]');
        await H.page.click('[data-host-tab="game"]');
        await H.page.waitForSelector('[data-pn-choice="host-boards"]', {timeout: 10000});
        const boardsM = await targets(H.page, '[data-pn-choice="host-boards"]');
        const boardsAria = await H.page.$$eval('[data-pn-choice="host-boards"] [role="radio"]', (els) => els.map((el) => [el.getAttribute('aria-label'), el.getAttribute('aria-checked')]));
        await H.page.click('[data-pn-choice="host-boards"] [data-pn-option="3"]');
        await H.page.click('[data-host-section="game"] [data-host-save]');
        const saved3 = await waitDoc((x) => x.state.config.boards === 3, 10000);
        await shot(H.page, '37-plo-host-boards-1440');
        await H.page.keyboard.press('Escape');
        check('the host drawer offers PLO\'s boards under the game: "One board" (chosen), "2 boards", "3 boards", each 44 px; three are saved from the next hand',
            targetsOk(boardsM) && boardsM.count === 3 && JSON.stringify(boardsAria) === JSON.stringify([[MODE_COPY.boardsValue(1), 'true'], [MODE_COPY.boardsValue(2), 'false'], [MODE_COPY.boardsValue(3), 'false']])
            && saved3 !== null, JSON.stringify({m: brief(boardsM), boardsAria}));
        await hostOp(H, {op: 'resume'});
        d = await waitDoc((x) => x.state.hand?.no === handNo + 1 && x.state.hand.phase === 'betting', 30000);
        const hand3 = d?.state.hand.no ?? handNo + 1;
        lastNo = hand3;
        check('…the next hand deals three runs of five: three boards, four cards each', d !== null && d.state.hand.variant === 'plo' && d.state.hand.deck.length === 3
            && d.state.hand.deck.every((run) => run.length === 5) && d.state.hand.boards.length === 3 && d.state.hand.seats.every((p) => p.hole.length === 4), JSON.stringify(d?.state.hand.boards));
        const toast3 = await toasted(guests[0].page, MODE_COPY.changed(MODE_COPY.spokenLabel('plo', 3)), 15000);
        const bar3 = await guests[0].page.textContent('[data-pn-mode-label]').catch(() => null);
        check(`…the deal toasts "${MODE_COPY.changed(MODE_COPY.spokenLabel('plo', 3))}" and the top bar says "${MODE_COPY.label('plo', 3)}"`, toast3 && bar3 === MODE_COPY.label('plo', 3), JSON.stringify({toast3, bar3}));

        // The boards where the stage put them, as drawn.
        const boardsOn = (p) => p.page.evaluate(() => {
            const rect = (el) => el.getBoundingClientRect();
            const hit = (a, b) => a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1;
            const table = rect(document.querySelector('.pn-table'));
            const set = document.querySelector('.pn-board-set');
            const boards = [...document.querySelectorAll('.pn-board')].map(rect);
            const card = document.querySelector('.pn-board .pn-card, .pn-board .pn-slot');
            const plates = [...document.querySelectorAll('[data-seat] .pn-plate')].map(rect);
            const bets = [...document.querySelectorAll('.pn-bet')].map(rect).filter((r) => r.width > 0);
            const zoom = document.querySelector('[data-pn-boards-zoom]');
            return {
                n: set?.getAttribute('data-pn-boards') ?? null, arrangement: set?.getAttribute('data-pn-arrangement') ?? null, count: boards.length,
                cardW: card ? Math.round(rect(card).width) : 0,
                inside: boards.every((r) => r.left >= table.left - 1 && r.right <= table.right + 1 && r.top >= table.top - 1 && r.bottom <= table.bottom + 1),
                overPlates: boards.filter((r) => plates.some((q) => hit(r, q))).length, overBets: boards.filter((r) => bets.some((b) => hit(r, b))).length,
                labels: document.querySelectorAll('.pn-board-label').length, zoom: zoom ? [Math.round(rect(zoom).width), Math.round(rect(zoom).height)] : null,
                scroll: document.documentElement.scrollWidth - innerWidth,
            };
        });
        const floorAt = (size) => ({'390×844': 33, '375×667': 19, '320×568': 16, '844×390': 26, '667×375': 24, '568×320': 14}[sizeName(size)] ?? 60);
        const boardsOk = (m, size) => m.n === '3' && m.count === 3 && m.cardW >= floorAt(size) && m.inside && m.overPlates === 0 && m.overBets === 0
            && m.zoom !== null && m.zoom[0] >= 44 && m.zoom[1] >= 44 && m.scroll <= 0;
        // The flop out on every screen: three boards of three cards.
        const flopTurn = await (async () => {
            for (let guard = 0; guard < 12; guard++) {
                const {doc, actor} = await nextTurn(hand3);
                if (!actor || doc.state.hand.street !== 'preflop') return doc;
                const turn = doc.state.turn;
                await clickMove(actor, 'call');
                await waitMoved(turn, hand3);
            }
            return roomDoc();
        })();
        check('…called round to the flop: every board three cards', flopTurn.state.hand.boards.every((b) => b.length === 3), JSON.stringify(flopTurn.state.hand.boards));
        const flopped = (p) => p.page.waitForFunction(() => [...document.querySelectorAll('.pn-board')].filter((el) => el.getAttribute('data-pn-board') === '3').length === 3
            && !document.querySelector('.pn-board [data-anim="board"]'), null, {timeout: 20000}).catch(() => {});
        for (const p of all) await flopped(p);
        for (const g of guests) {
            const m = await boardsOn(g);
            const layout = await tableLayout(g.page);
            check(`three boards at ${sizeName(g.size)}: inside the table, clear of every plate and bet line, cards ${m.cardW} px (at least ${floorAt(g.size)}), the block a 44 px button, the table laid out`,
                boardsOk(m, g.size) && layoutOk(layout), JSON.stringify({m, layout}));
            await shot(g.page, `ui-20-plo-3boards-${sizeFile(g.size)}`);
            const side = {width: g.size.height, height: g.size.width};
            await resize(g.page, side);
            const ms = await boardsOn(g);
            const ls = await tableLayout(g.page);
            check(`…and on its side at ${sizeName(side)}: cards ${ms.cardW} px (at least ${floorAt(side)}), inside, clear, the table laid out`,
                boardsOk(ms, side) && layoutOk(ls), JSON.stringify({ms, ls}));
            await shot(g.page, `ui-20-plo-3boards-${sizeFile(side)}`);
            await resize(g.page, g.size);
        }
        const desk = await boardsOn(H);
        check(`…and on the desktop: three boards stacked side by side or cascaded at ${desk.cardW} px (at least 60), each with its numeral`,
            boardsOk(desk, {width: 1440, height: 900}) && desk.labels === 3, JSON.stringify(desk));
        await shot(H.page, 'ui-20-plo-3boards-1440');

        // The boards sheet: a tap on the boards on the 320 px phone.
        const small = guests.find((g) => g.size.width === 320) ?? guests[0];
        await small.page.click('[data-pn-boards-zoom]');
        await small.page.waitForSelector('[data-pn-drawer="boards"]', {timeout: 10000});
        await sleep(500);
        const sheet = await small.page.evaluate(() => {
            const rows = [...document.querySelectorAll('[data-pn-drawer="boards"] .pn-sheet-board')];
            return {
                rows: rows.length, places: rows.map((r) => r.children.length), cards: rows.map((r) => r.querySelectorAll('.pn-card').length),
                widths: [...new Set(rows.flatMap((r) => [...r.children].map((c) => Math.round(c.getBoundingClientRect().width))))],
                inside: rows.every((r) => r.getBoundingClientRect().right <= innerWidth + 0.5 && r.getBoundingClientRect().left >= -0.5),
                names: [...document.querySelectorAll('[data-pn-drawer="boards"] [data-pn-sheet-board] h3')].map((h) => h.textContent),
            };
        });
        await shot(small.page, `ui-25-boards-sheet-${sizeFile(small.size)}`);
        await wording(small.page, 'the boards sheet', '[data-pn-drawer="boards"]');
        check('a tap on the boards opens them larger: three boards under "Board 1", "Board 2", "Board 3", five 44 px places each, the flop\'s three cards, on screen at 320 px',
            sheet.rows === 3 && sheet.places.every((n) => n === 5) && sheet.cards.every((n) => n === 3) && JSON.stringify(sheet.widths) === '[44]' && sheet.inside
            && JSON.stringify(sheet.names) === JSON.stringify([0, 1, 2].map(TABLE_COPY.boardName)), JSON.stringify(sheet));
        await small.page.keyboard.press('Escape');
        await small.page.waitForSelector('[data-pn-drawer="boards"]', {state: 'detached', timeout: 10000}).catch(() => {});

        // Checked down to a showdown.
        const done3 = await playByClicks(hand3, {choose: () => 'call'});
        await hostOp(H, {op: 'pause'});
        const hand3Doc = done3.state.hand;
        const result3 = hand3Doc.result;
        const live3 = hand3Doc.seats.filter((p) => !p.folded);
        // QA's own Omaha on each board: the strongest value and the five that make it.
        const omahaOn = (hole, board) => {
            let top = {value: -1, cards: []};
            for (let a = 0; a < 4; a++) for (let b = a + 1; b < 4; b++) for (let c = 0; c < 5; c++) for (let e = c + 1; e < 5; e++) for (let f = e + 1; f < 5; f++) {
                const five = [hole[a], hole[b], board[c], board[e], board[f]];
                const value = evaluateCards(five);
                if (value > top.value) top = {value, cards: five};
            }
            return top;
        };
        const perBoard = hand3Doc.boards.map((board) => {
            const values = new Map(live3.map((p) => [p.seat, omahaOn(p.hole, board).value]));
            const top = Math.max(...values.values());
            return {top, winners: live3.filter((p) => values.get(p.seat) === top).map((p) => p.seat).sort((a, b) => a - b)};
        });
        const sorted = (list) => [...list].sort((a, b) => a - b);
        check('the showdown on three boards: every pot in three parts, each board\'s part to the hands QA\'s own Omaha finds strongest on that board, the odd chips to the first boards',
            result3.showdown && result3.pots.every((pot) => pot.winners.length === 3 && pot.winners.every((w, k) => JSON.stringify(sorted(w)) === JSON.stringify(perBoard[k].winners))
                && pot.shares.map((s) => s.reduce((x, y) => x + y, 0)).every((n, k) => n === Math.floor(pot.amount / 3) + (k < pot.amount % 3 ? 1 : 0))),
            JSON.stringify({pots: result3.pots, perBoard}));
        await sleep(2500);
        // The page's paid pots: the winners alone, the shares the server's own split.
        const paid = [...guests[0].bodies].reverse().map((b) => b.body?.hand).find((h) => h?.no === hand3 && h.result)?.result?.pots ?? null;
        check('…the page is sent each pot\'s winners board by board, and pots.paidParts rebuilds the server\'s shares from them',
            paid !== null && paid.length === result3.pots.length && paid.every((pot, i) => JSON.stringify(pot.winners) === JSON.stringify(result3.pots[i].winners)
                && JSON.stringify(paidParts(pot).map((part) => part.shares)) === JSON.stringify(result3.pots[i].shares) && !('shares' in pot)),
            JSON.stringify(paid));
        const scoop = perBoard.every((b) => b.winners.length === 1 && b.winners[0] === perBoard[0].winners[0]) && result3.pots.length === 1;
        for (const p of all) {
            const seen = await p.page.evaluate(() => {
                const rect = (el) => el.getBoundingClientRect();
                const hit = (a, b) => a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1;
                const banner = [...document.querySelectorAll('.pn-banner')].map(rect).filter((r) => r.width > 0);
                const hands = [...document.querySelectorAll('.pn-seat-shown')].map(rect);
                return {
                    rows: [...document.querySelectorAll('.pn-banner [data-winner]')].map((el) => el.getAttribute('data-board')),
                    lit: [0, 1, 2].map((k) => [...document.querySelectorAll(`.pn-board[data-pn-board-index="${k}"] .pn-card[data-state="win"]`)].map((el) => el.getAttribute('data-card'))),
                    bannerOver: banner.some((b) => hands.some((h) => hit(b, h))), banner: banner.length, scroll: document.documentElement.scrollWidth - innerWidth,
                    boardsOver: [...document.querySelectorAll('.pn-board')].map(rect).some((b) => hands.some((h) => hit(b, h))),
                };
            });
            // Each board's lit cards: three of its own, which with two of a winner's four make the strongest value there.
            const litOk = hand3Doc.boards.every((board, k) => {
                const lit = board.filter((c) => seen.lit[k].includes(cardLabel(c)));
                if (perBoard[k].winners.length > 1) return lit.length >= 3;
                const hole = live3.find((q) => q.seat === perBoard[k].winners[0]).hole;
                return lit.length === 3 && hole.some((a, i) => hole.some((b, j) => j > i && evaluateCards([a, b, ...lit]) === perBoard[k].top));
            });
            const rowsOk = scoop ? JSON.stringify(seen.rows) === JSON.stringify([null]) : seen.rows.length >= 1 && seen.rows.every((r, i) => r === String(i));
            // The boards clear of the hands turned up where the stage keeps them clear: every phone but the 320 px one.
            const handsOk = (p.size?.width ?? 1440) <= 320 || !seen.boardsOver;
            check(`…on ${p.name}'s screen${p.size ? ` (${sizeName(p.size)})` : ''}: ${scoop ? 'one line, every board won by one player' : 'a banner line a board'}, the banner${(p.size?.width ?? 1440) > 320 ? ' and the boards' : ''} clear of the hands turned up; each board's lit cards the winner's three`,
                seen.banner === 1 && rowsOk && !seen.bannerOver && handsOk && litOk && seen.scroll <= 0, JSON.stringify({...seen, perBoard, scoop}));
            await shot(p.page, `38-plo-3boards-showdown-${p.size ? sizeFile(p.size) : '1440'}`);
        }
        const logLines = await (async () => {
            await guests[0].page.click('[data-open="menu"]');
            await guests[0].page.click('[data-menu="log"]').catch(() => guests[0].page.keyboard.press('Escape'));
            await guests[0].page.waitForSelector('[data-pn-drawer="log"]', {timeout: 10000}).catch(() => {});
            await sleep(800);
            const lines = await guests[0].page.$$eval(`[data-pn-drawer="log"] [data-log-hand="${hand3}"] [data-log-line]`, (els) => els.map((el) => [el.getAttribute('data-log-line'), el.textContent]));
            await guests[0].page.keyboard.press('Escape');
            return lines;
        })();
        const streets3 = logLines.filter(([kind]) => kind === 'street').length;
        const results3 = logLines.filter(([kind]) => kind === 'result').map(([, text]) => text ?? '');
        check('…the hand log prints each street board by board (nine lines) and a result line a board, each "Board k: …"',
            streets3 === 9 && results3.length >= 3 && results3.every((t) => /^Board [123][:,] /.test(t.replace(/[⁨⁩]/g, ''))), JSON.stringify({streets3, results3}));

        // Back to Texas hold'em from the host drawer, from the next hand.
        await H.page.click('[data-open="host"]');
        await H.page.click('[data-host-tab="game"]');
        await H.page.waitForSelector('[data-pn-choice="host-game"]', {timeout: 10000});
        const hostGame = await targets(H.page, '[data-pn-choice="host-game"]');
        await H.page.click('[data-pn-choice="host-game"] [data-pn-option="holdem"]');
        await H.page.click('[data-host-section="game"] [data-host-save]');
        const back = await waitDoc((x) => x.state.config.variant === 'holdem', 10000);
        await shot(H.page, '36-plo-host-game-1440');
        await H.page.keyboard.press('Escape');
        await hostOp(H, {op: 'resume'});
        const countdown = await guests[0].page.waitForSelector('[data-pn-next-game]', {timeout: 30000}).then((el) => el.textContent(), () => null);
        const dealt2 = await waitDoc((x) => x.state.hand?.no === lastNo + 1, 30000);
        const toast = await toasted(guests[0].page, MODE_COPY.changed("Texas hold'em"), 15000);
        await guests[0].page.waitForFunction(() => document.querySelectorAll('[data-pn-dock] .pn-hole .pn-card').length === 2, null, {timeout: 20000}).catch(() => {});
        const twoCards = await guests[0].page.locator('[data-pn-dock] .pn-hole[data-count="2"] .pn-card').count();
        const barBack = await guests[0].page.textContent('[data-pn-mode-label]').catch(() => null);
        check('the host drawer\'s Game switches the table back to Texas hold\'em (two 44 px cards), saved from the next hand: the countdown says "Next hand: Texas hold\'em, in …", the deal toasts "New game from this hand: Texas hold\'em." and deals two cards',
            targetsOk(hostGame) && hostGame.count === 3 && back !== null && /^Next hand: Texas hold'em, in \d+ s$/.test(unisolate(countdown ?? '').trim())
            && dealt2?.state.hand.variant === 'holdem' && toast && twoCards === 2 && barBack === MODE_COPY.short.holdem,
            JSON.stringify({m: brief(hostGame), countdown, dealt: dealt2?.state.hand.variant, toast, twoCards, barBack}));
        await hostOp(H, {op: 'end'}).catch(() => null);
        for (const g of guests) g.gone = true;
    }

    // ═══ Triple T (P7): the lobby's one tap, the throw-away on every phone, keys, the deadline, privacy ═══
    // "Start Triple T" opens a Triple T table, named on the top bar and the invite sheet; "How it plays"
    // opens the Hands guide on Triple T for a visitor. Three guests on 390 × 844, 375 × 667 and 320 × 568
    // phones and the host at 1440 × 900: at the deal every dock holds three cards to pick from — a radio
    // group, each card 44 px or more, inside the screen, none over another — with the throw-away's clock
    // and "Pick a card first"; every other plate three backs and "Discarding…"; the felt counts "0 of 4
    // done". The 390 phone taps a card and confirms ("Throw away …"); the host picks with 1, 2, 3, takes
    // a pick back with Escape and throws with Enter; the 375 phone taps and confirms; the 320 phone
    // throws nothing and the deadline throws for it (flagged the clock's), its timeouts and away
    // untouched. Plates go from three backs to two as each throws. No other context's answer, page or
    // history ever carries a card another player threw away; each player's own history says theirs.
    // The next hand on the phones turned on their sides (844 × 390, 667 × 375, 568 × 320): the picker and
    // the table laid out there too, and under reduced motion the card thrown away is never seen leaving.
    {
        await hostOp(H, {op: 'end'}).catch(() => null);
        await H.page.goto(`${BASE}/poker-night`, {waitUntil: 'load', timeout: 180000});
        await H.page.waitForSelector('[data-quick-start="triple-t"]', {timeout: 60000});
        const quick = await H.page.$$eval('[data-quick-start]', (els) => els.map((el) => el.getAttribute('data-quick-start')));
        check('the lobby: "Start a table", then "Start PLO" and "Start Triple T" side by side', JSON.stringify(quick) === JSON.stringify(['holdem', 'plo', 'triple-t'])
            && (await H.page.textContent('[data-quick-start="triple-t"]'))?.trim() === POKER_NIGHT_COPY.quickTripleT, JSON.stringify(quick));
        await H.page.click('[data-quick-start="triple-t"]');
        await H.page.waitForURL(/\/play\/[A-HJ-NP-Z2-9]{6}(\?.*)?$/, {timeout: 120000});
        code = new URL(H.page.url()).pathname.split('/').pop();
        const inviteMode = await H.page.waitForSelector('[data-invite-mode]', {timeout: 60000}).then((el) => el.textContent(), () => null);
        await H.page.keyboard.press('Escape');
        H.pid = (await roomDoc()).state.hostPid;
        let d = await roomDoc();
        const barMode = await H.page.textContent('[data-pn-mode-label]').catch(() => null);
        check('"Start Triple T" opens a Triple T table: the top bar says "Triple T", the invite sheet "Game: Triple T"',
            d.state.config.variant === 'triple-t' && barMode === MODE_COPY.short['triple-t'] && inviteMode === INVITE_COPY.mode(MODE_COPY.short['triple-t']),
            JSON.stringify({variant: d.state.config.variant, barMode, inviteMode}));

        const ttPlayers = [[390, 844, 'Tia'], [375, 667, 'Teo'], [320, 568, 'Tam']];
        const guests = [];
        for (const [width, height, name] of ttPlayers) {
            const g = await newPlayer(`tt-${name}`, PHONE(width, height));
            g.size = {width, height};
            guests.push(g);
        }
        const [g390, g375, g320] = guests;
        // The first guest reads the join card: "How it plays" opens the guide on Triple T.
        {
            await g390.page.goto(`${BASE}/play/${code}`, {waitUntil: 'load', timeout: 120000});
            await g390.page.waitForSelector('[data-join-card="visitor"]', {timeout: 60000});
            const terms = await g390.page.textContent('[data-join-terms]');
            await g390.page.click('[data-join-how]');
            await g390.page.waitForSelector('[data-pn-drawer="hands"]', {timeout: 10000}).catch(() => {});
            await sleep(400);
            const here = await g390.page.getAttribute('[data-pn-drawer="hands"] [data-guide-here]', 'data-guide-game').catch(() => null);
            const short = await g390.page.textContent('[data-pn-drawer="hands"] #triple-t').catch(() => '');
            await shot(g390.page, '40-triple-t-how-it-plays-390x844');
            await wording(g390.page, 'the Hands drawer on Triple T', '[data-pn-drawer="hands"]');
            check('the join card names Triple T first ("Triple T · Blinds 10/20 · …") and "How it plays" opens the guide on Triple T: the glossary\'s own words, then the table\'s facts',
                (terms ?? '').trim() === JOIN_COPY.terms(MODE_COPY.short['triple-t'], 10, 20, 2000) && here === 'triple-t'
                && (short ?? '').includes(HANDS_COPY.games['triple-t'].facts[2]), JSON.stringify({terms, here}));
            await g390.page.keyboard.press('Escape');
            await g390.page.waitForSelector('[data-pn-drawer="hands"]', {state: 'detached', timeout: 10000}).catch(() => {});
        }
        for (const [i, g] of guests.entries()) await sitDown(g, ttPlayers[i][2]);
        await hostOp(H, {op: 'config', patch: {turnSeconds: 120}});
        const all = [H, ...guests];
        const started = await hostOp(H, {op: 'start'});
        d = await waitDoc((x) => x.state.hand?.phase === 'discard', 30000);
        check('…three guests sit beside the host; the first hand deals three cards each and opens the throw-away: nobody on the clock, one deadline twenty seconds on',
            started.status === 200 && d !== null && d.state.hand.variant === 'triple-t' && d.state.hand.seats.length === 4 && d.state.hand.seats.every((p) => p.hole.length === 3)
            && d.state.hand.actor === null && d.state.hand.deadline - d.state.hand.startedAt === 20_000, `${started.status} ${JSON.stringify(d?.state.hand.phase)}`);
        const handNo = d.state.hand.no;
        const dealtAt = Date.now() - 5000;
        const startedAt = d.state.hand.startedAt;
        const holeAt = (doc, p) => handSeat(doc, p)?.hole ?? [];
        const dealt = new Map(all.map((p) => [p, holeAt(d, p)]));

        // A dock's picker as drawn: three radios, each 44 px or more, inside the screen and apart; the
        // confirm full width and 44 px or more; the clock; the plates' backs and flags; the felt's count.
        const pickerOf = (p) => p.page.evaluate(() => {
            const rect = (el) => el.getBoundingClientRect();
            const hit = (a, b) => a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1;
            const vw = innerWidth;
            const vh = innerHeight;
            const group = document.querySelector('[data-pn-dock] [data-pn-pick][role="radiogroup"]');
            const radios = [...document.querySelectorAll('[data-pn-dock] [data-pn-pick-card]')].map((el) => ({r: rect(el), checked: el.getAttribute('aria-checked'), label: el.getAttribute('aria-label')}));
            let overlaps = 0;
            for (let i = 0; i < radios.length; i++) for (let j = i + 1; j < radios.length; j++) if (hit(radios[i].r, radios[j].r)) overlaps++;
            const button = document.querySelector('[data-pn-dock] [data-pn-throw]');
            const actions = document.querySelector('[data-pn-dock] .pn-dock-actions');
            const bar = document.querySelector('[data-pn-topbar]')?.getBoundingClientRect().bottom ?? 0;
            return {
                group: group?.getAttribute('aria-label') ?? null, count: radios.length,
                small: radios.filter((x) => x.r.width < 43.5 || x.r.height < 43.5).map((x) => `${Math.round(x.r.width)}×${Math.round(x.r.height)}`),
                inside: radios.every((x) => x.r.left >= -1 && x.r.right <= vw + 1 && x.r.top >= bar - 1 && x.r.bottom <= vh + 1), overlaps,
                labels: radios.map((x) => x.label), checked: radios.map((x) => x.checked),
                button: button ? {text: button.textContent?.trim() ?? '', disabled: button.hasAttribute('disabled'), h: Math.round(rect(button).height),
                    full: actions ? rect(button).width >= rect(actions).width - 2 : false, inside: rect(button).right <= vw + 1 && rect(button).bottom <= vh + 1} : null,
                clock: document.querySelector('[data-pn-dock] [data-pn-clock]')?.textContent ?? null,
                backs: [...document.querySelectorAll('[data-seat]:not([data-me]) .pn-seat-cards')].map((el) => el.getAttribute('data-count')),
                flags: [...document.querySelectorAll('[data-seat][data-discarding] [data-flag]')].map((el) => el.textContent),
                felt: document.querySelector('[data-pn-throw-away]')?.getAttribute('data-pn-throw-away') ?? null,
                feltText: document.querySelector('[data-pn-throw-away]')?.textContent ?? null,
                // The felt's count: inside the table, over no plate, bet line or dealer button.
                noteOver: (() => {
                    const note = document.querySelector('[data-pn-throw-away]');
                    if (!note) return -1;
                    const n = rect(note);
                    const table = rect(document.querySelector('.pn-table'));
                    const others = [...document.querySelectorAll('[data-seat] .pn-plate, .pn-bet, .pn-dealer, [data-seat] .pn-seat-cards')].map(rect).filter((r) => r.width > 0);
                    return others.filter((r) => hit(n, r)).length + (n.left < table.left - 1 || n.right > table.right + 1 ? 100 : 0);
                })(),
                scroll: document.documentElement.scrollWidth - vw,
            };
        });
        const layoutOk = (m) => m.plates === 4 && m.outside === 0 && m.overlaps === 0 && m.small.length === 0 && m.scroll <= 0 && m.overDock === 0 && m.dockRight !== false;
        const pickOk = (m) => m.count === 3 && m.group === DISCARD_COPY.groupLabel && m.small.length === 0 && m.inside && m.overlaps === 0 && m.scroll <= 0
            && m.button !== null && m.button.h >= 44 && m.button.full && m.button.inside && m.noteOver <= 0;
        for (const p of all) await p.page.waitForSelector('[data-pn-dock] [data-pn-pick-card]', {timeout: 20000}).catch(() => {});
        await sleep(1200);
        for (const g of guests) {
            const m = await pickerOf(g);
            const layout = await tableLayout(g.page);
            check(`Triple T at ${sizeName(g.size)}: three cards to pick from (each 44 px or more, inside, apart), "${DISCARD_COPY.confirmNone}" full width, the clock; three backs and "${TABLE_COPY.discarding}" on every other plate; the felt's "0 of 4", clear of every plate, bet and the button; the table laid out`,
                pickOk(m) && m.button.text === DISCARD_COPY.confirmNone && m.button.disabled && (m.clock ?? '').startsWith(DISCARD_COPY.clock)
                && m.backs.length === 3 && m.backs.every((b) => b === '3') && m.flags.filter((f) => f === TABLE_COPY.discarding).length >= 3
                && m.felt === '0/4' && [DISCARD_COPY.felt(0, 4), DISCARD_COPY.feltShort(0, 4)].some((t) => (m.feltText ?? '').startsWith(t)) && layoutOk(layout), JSON.stringify({m, layout}));
            await wording(g.page, `the throw-away at ${sizeName(g.size)}`, '[data-pn-dock]');
        }
        await shot(g390.page, 'ui-21-triple-t-discard-390');

        // The 390 phone taps its second card and confirms.
        const card390 = dealt.get(g390)[1];
        await g390.page.waitForSelector('[data-pn-pick][data-pn-armed]', {timeout: 5000}).catch(() => {});
        await g390.page.click('[data-pn-pick-card="1"]');
        const picked390 = await pickerOf(g390);
        await shot(g390.page, 'ui-21-triple-t-picked-390');
        await g390.page.click('[data-pn-throw]');
        d = await waitDoc((x) => holeAt(x, g390).length === 2, 10000);
        const thrown390 = d?.state.hand.discards.find(([seat]) => seat === seatIndex(d, g390))?.[1];
        check(`the 390 phone taps its second card (it rises, the confirm names it) and throws it: the card thrown is the one picked, two kept`,
            picked390.checked.join() === 'false,true,false' && picked390.button?.text === DISCARD_COPY.confirm(HAND_COPY.cardShort(card390)) && !picked390.button.disabled
            && d !== null && thrown390 === card390 && d.state.hand.phase === 'discard', JSON.stringify({checked: picked390.checked, button: picked390.button, thrown390, card390}));
        const after390 = await g390.page.waitForSelector('[data-pn-dock] [data-pn-waiting]', {timeout: 10000}).then((el) => el.textContent(), () => null);
        check(`…its dock then says "${DISCARD_COPY.waiting(3)}" (the two kept as wide as three)`, after390 === DISCARD_COPY.waiting(3)
            && await g390.page.locator('[data-pn-dock] .pn-hole[data-slots="3"]').count() === 1, String(after390));

        // The host on the desktop: 3 picks, Escape takes it back, 1 picks, Enter throws.
        await H.page.waitForSelector('[data-pn-pick][data-pn-armed]', {timeout: 5000}).catch(() => {});
        await H.page.keyboard.press('3');
        const three = (await pickerOf(H)).checked.join();
        await H.page.keyboard.press('Escape');
        const none = (await pickerOf(H)).checked.join();
        await H.page.keyboard.press('1');
        await H.page.keyboard.press('Enter');
        d = await waitDoc((x) => holeAt(x, H).length === 2, 10000);
        const thrownH = d?.state.hand.discards.find(([seat]) => seat === seatIndex(d, H))?.[1];
        check('the host on the desktop: 3 picks the third card, Escape takes it back, 1 picks the first and Enter throws it',
            three === 'false,false,true' && none === 'false,false,false' && thrownH === dealt.get(H)[0], JSON.stringify({three, none, thrownH}));

        // Plates go three → two on the others' screens, the flag gone with the throw.
        await sleep(1500);
        const onH = await H.page.evaluate(([a, b]) => [a, b].map((seat) => ({
            count: document.querySelector(`[data-seat="${seat}"] .pn-seat-cards`)?.getAttribute('data-count') ?? null,
            flag: document.querySelector(`[data-seat="${seat}"]`)?.hasAttribute('data-discarding') ?? null,
        })), [seatIndex(d, g390), seatIndex(d, g320)]);
        const felt = await g375.page.getAttribute('[data-pn-throw-away]', 'data-pn-throw-away').catch(() => null);
        check('…on the others\' screens the 390 phone\'s plate goes to two backs with no flag, the 320 phone\'s keeps three and "Discarding…"; the felt counts "2 of 4 done"',
            onH[0].count === '2' && onH[0].flag === false && onH[1].count === '3' && onH[1].flag === true && felt === '2/4', JSON.stringify({onH, felt}));
        const seen = await H.page.evaluate(() => window.__pnAnims.filter((a) => a.anim === 'discard').length);
        check('…a card thrown away flies off: the plate\'s third back and the thrower\'s own card animate as data-anim="discard"', seen > 0, String(seen));

        // The 375 phone taps its third card and confirms; the 320 phone throws nothing.
        await g375.page.click('[data-pn-pick-card="2"]');
        await g375.page.click('[data-pn-throw]');
        d = await waitDoc((x) => holeAt(x, g375).length === 2, 10000);
        const timeouts320 = d.state.seats[seatIndex(d, g320)].timeouts;
        // The deadline (and its grace) passes: the clock throws for the 320 phone.
        d = await waitDoc((x) => x.state.hand?.no === handNo && x.state.hand.phase !== 'discard', 40000);
        const seat320 = seatIndex(d, g320);
        const line320 = d?.state.hand.log.find((e) => e[0] === seat320 && ENTRY_KINDS[e[1]] === 'discard');
        const thrown320 = d?.state.hand.discards.find(([seat]) => seat === seat320)?.[1];
        check('the 320 phone throws nothing: after the deadline the clock throws its card (flagged the clock\'s, the odd one out or the lowest), counting no timeout, and the betting opens on the player after the big blind',
            d !== null && d.state.hand.phase === 'betting' && holeAt(d, g320).length === 2 && line320 !== undefined && (line320[4] & 2) === 2
            && d.state.seats[seat320].timeouts === timeouts320 && d.state.seats[seat320].away === false && thrown320 === autoDiscard(dealt.get(g320))
            && d.state.hand.seats.every((p) => !p.folded), JSON.stringify({line320, thrown320, timeouts: [timeouts320, d?.state.seats[seat320]?.timeouts]}));
        const toast320 = await g320.page.waitForFunction(() => document.querySelector('[data-pn-live="polite"]')?.textContent?.includes('Time ran out'), null, {timeout: 10000}).then(() => true, () => false);
        note('the 320 phone\'s screen reader line for the card thrown for it', toast320 ? 'said' : 'not seen within 10 s (the live region clears after 4 s)');

        // No card another player threw away in any context's answers or page: under "discard", or in any
        // list of cards.
        const thrownBy = new Map(d.state.hand.discards.map(([seat, card]) => [seat, card]));
        const discardLeaks = (label) => {
            const out = [];
            for (const p of all) {
                const own = thrownBy.get(seatIndex(d, p));
                const others = new Set([...thrownBy.values()].filter((c) => c !== own));
                for (const {body} of p.bodies.filter((b) => b.at >= dealtAt)) {
                    walk(body, null, (node, key) => {
                        if (key === 'discard' && typeof node === 'number' && others.has(node)) out.push(`${label}: ${p.name} discard ${node}`);
                        if (key === 'discards') out.push(`${label}: ${p.name} carries "discards"`);
                        if (Array.isArray(node) && ['cards', 'hole', 'boards', 'best'].includes(key) && node.some((c) => others.has(c))) out.push(`${label}: ${p.name} ${key} ${JSON.stringify(node)}`);
                    });
                }
            }
            return out;
        };
        const pagesCarry = async () => {
            const out = [];
            for (const p of all) {
                const own = thrownBy.get(seatIndex(d, p));
                const html = flightOf(await (await p.context.request.get(`${BASE}/play/${code}`, {timeout: 90000})).text());
                const rsc = await (await p.context.request.get(`${BASE}/play/${code}`, {headers: {RSC: '1'}, timeout: 90000})).text();
                for (const text of [html, rsc]) {
                    for (const m of text.matchAll(/"discard":(\d{1,2})/g)) if (Number(m[1]) !== own) out.push(`${p.name} page discard ${m[1]}`);
                    if (text.includes('"discards"')) out.push(`${p.name} page carries "discards"`);
                }
            }
            return out;
        };
        const throwLeaks = [...discardLeaks('throw-away'), ...await pagesCarry()];
        check('no other context\'s answers, page HTML or RSC payload carry a card another player threw away (under "discard", "discards" or any list of cards)',
            throwLeaks.length === 0 && thrownBy.size === 4, throwLeaks.slice(0, 4).join(' | '));

        // Checked down to its end; then each player's history of it says their own card thrown away alone.
        const done = await playByClicks(handNo, {choose: () => 'call'});
        await hostOp(H, {op: 'pause'});
        const result = done.state.hand.result;
        check('…played on as Texas hold\'em to a showdown: every hand turned up is the two kept, never a card thrown away',
            result.showdown && result.hands.every((h) => h.cards.length === 2 && !h.cards.some((c) => [...thrownBy.values()].includes(c))), JSON.stringify(result.hands));
        const history = async (p) => {
            const res = await p.context.request.fetch(`${BASE}/api/poker-night/${code}/detail?part=history`, {
                method: 'GET', headers: {'x-pn-protocol': String(PN_PROTOCOL)}, failOnStatusCode: false, timeout: 60000,
            });
            return res.json().catch(() => null);
        };
        const historyLeaks = [];
        for (const p of all) {
            const h = await history(p);
            const row = h?.hands?.find((x) => x.no === handNo);
            const own = thrownBy.get(seatIndex(done, p));
            if (!row) {
                historyLeaks.push(`${p.name}: no history row`);
                continue;
            }
            for (const player of row.players) {
                if (player.pid === p.pid ? player.discard !== own : player.discard !== null) historyLeaks.push(`${p.name}: ${player.pid} discard ${player.discard}`);
            }
            if (JSON.stringify(row).includes('"discards"')) historyLeaks.push(`${p.name}: "discards"`);
        }
        check('each player\'s history of the hand gives their own card thrown away and nobody else\'s', historyLeaks.length === 0, historyLeaks.slice(0, 4).join(' | '));
        const logOf = async (p) => {
            await p.page.click('[data-open="menu"]');
            await p.page.click('[data-menu="log"]').catch(() => p.page.keyboard.press('Escape'));
            await p.page.waitForSelector('[data-pn-drawer="log"]', {timeout: 10000}).catch(() => {});
            await sleep(900);
            const lines = await p.page.$$eval(`[data-pn-drawer="log"] [data-log-hand="${handNo}"] [data-log-line]`, (els) => els.map((el) => (el.textContent ?? '').replace(/[⁨⁩]/g, '')));
            await p.page.keyboard.press('Escape');
            return lines;
        };
        const log390 = await logOf(g390);
        check(`…the 390 phone's hand log: four "throws away a card" lines and "${LOG_COPY.youThrew(HAND_COPY.cardShort(card390))}", no other card thrown away`,
            log390.filter((l) => l.endsWith('throws away a card.') || l.endsWith('throws away a card as time ran out.')).length === 4
            && log390.includes(LOG_COPY.youThrew(HAND_COPY.cardShort(card390)))
            && ![...thrownBy.values()].filter((c) => c !== card390).some((c) => log390.join(' ').includes(HAND_COPY.cardShort(c))), JSON.stringify(log390));

        // ── the next hand, the phones on their sides; reduced motion on the 390 phone ──
        await g390.page.emulateMedia({reducedMotion: 'reduce'});
        await g390.page.evaluate(() => {
            window.__pnThrowStyles = [];
            new MutationObserver(() => {
                for (const el of document.querySelectorAll('[data-anim="discard"]')) {
                    if (el.__pnSeen) continue;
                    el.__pnSeen = true;
                    const cs = getComputedStyle(el);
                    window.__pnThrowStyles.push({name: cs.animationName, opacity: cs.opacity});
                }
            }).observe(document, {subtree: true, childList: true, attributes: true, attributeFilter: ['data-anim']});
        });
        for (const g of guests) await resize(g.page, {width: g.size.height, height: g.size.width});
        await hostOp(H, {op: 'resume'});
        d = await waitDoc((x) => x.state.hand?.no === handNo + 1 && x.state.hand.phase === 'discard', 40000);
        for (const p of all) await p.page.waitForSelector('[data-pn-dock] [data-pn-pick-card]', {timeout: 20000}).catch(() => {});
        await sleep(1200);
        for (const g of guests) {
            const side = {width: g.size.height, height: g.size.width};
            const m = await pickerOf(g);
            const layout = await tableLayout(g.page);
            check(`…on its side at ${sizeName(side)}: the three cards to pick from (44 px or more, inside, apart) and the confirm in the dock's column, the felt's count clear of every plate, bet and the button, the table laid out`,
                pickOk(m) && layoutOk(layout), JSON.stringify({m, layout}));
            await shot(g.page, `ui-21-triple-t-discard-${sizeFile(side)}`);
        }
        // Under reduced motion: the pick is drawn in place (no transition), the card thrown away never seen leaving.
        await g390.page.click('[data-pn-pick-card="0"]');
        const still = await g390.page.evaluate(() => ({
            transition: getComputedStyle(document.querySelector('[data-pn-pick-card="0"]')).transitionDuration,
            // The table's own (a toast's fade is the toaster's).
            running: document.getAnimations().filter((a) => a.playState === 'running' && a.effect?.target?.closest?.('main') && !a.effect.target.closest('[data-sonner-toaster]'))
                .map((a) => `${a.animationName ?? a.transitionProperty ?? 'animation'} ${a.effect.target.className}`),
        }));
        for (const p of [g390, H, g375, g320]) {
            await p.page.click('[data-pn-pick-card="0"]').catch(() => {});
            await p.page.click('[data-pn-throw]').catch(() => {});
            await sleep(250);
        }
        d = await waitDoc((x) => x.state.hand?.no === handNo + 1 && x.state.hand.phase !== 'discard', 30000);
        await sleep(800);
        const throwStyles = await g390.page.evaluate(() => window.__pnThrowStyles);
        check('under reduced motion (the 390 phone): the pick drawn in place, nothing running, and every card thrown away appears still and invisible',
            d !== null && still.transition.split(',').every((t) => parseFloat(t) === 0) && still.running.length === 0 && throwStyles.length > 0
            && throwStyles.every((s) => s.name === 'none' && s.opacity === '0'), JSON.stringify({still, throwStyles: throwStyles.slice(0, 4)}));
        await g390.page.emulateMedia({reducedMotion: 'no-preference'});
        for (const g of guests) await resize(g.page, g.size);
        await hostOp(H, {op: 'end'}).catch(() => null);
        for (const g of guests) g.gone = true;
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
