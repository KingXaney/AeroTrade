// Poker night, in two parts.
//
// The table's API (app/api/poker-night/[code]/*; lib/poker-night). A signed-up host's room is
// inserted through the app's own store (lib/poker-night/store.insertRoom, through jiti), and every
// move after that goes through the routes the way a browser sends it — X-PN-Protocol, the same
// origin, JSON — from one browser context per player, each guest with the cookie the join route gave
// it. Checked: the gates (protocol, identity, origin, body), guests who are never better-auth users,
// a returning join, a hand played to a showdown whose winners are worked out again here from the
// stored holes, nothing private in any response on any street, an all-in run-out dealt by ticks
// alone 1.5 s a street, a pre-action written without moving the public seq (the player on the clock
// polls Unchanged), a timeout that waits out the slack, a repeated action id, a seat race, a
// double-tapped and a retried join that make one guest, a rebuy, a removal and its "let back in", a
// state a newer deploy wrote answered reload on every route, the env on every room, index and
// counter, an unknown code costing a miss on every route, joins a locked table turns down spending
// their addresses' join counters and never the room's, a seated player's bucket no one on their
// address can drain, the in-memory limit on a burst of polls, and the copy behind every code the API
// answered with.
//
// The table in a browser (P3: /poker-night, /play/CODE, components/poker-night). The lobby lights
// Learn's tab and /games has the card; Quick start lands the host on the table with the invite open
// (the link on the clipboard, a QR of currentColor rects, none of the app's shell, polling); guests
// open the link signed out and sit in one tap — a desktop guest who types a name, a phone guest who
// leaves it blank, a third under reduced motion — and come back as themselves; every hand is played
// by clicking the action bar of whoever's turn it is. On every street the guests' API answers, page
// HTML and RSC payload carry no deck and no other seat's unshown hole, and the other seats' cards are
// backs; at the showdown the shown cards are Mongo's, the winners and the five cards that play are
// worked out again here, and the banner names the hand; the animation hooks fire, flights never move
// under reduced motion; a rebuy lands once and the bank balances; the host removes a player only on
// a two-second press (a tap does nothing), the removed guest is told so, and their screen finds
// out by itself when "Let back in" lets them sit again; the phone layout holds at 390 and 320 px —
// names readable, flags at least 10 px, the raise panel never over the viewer's cards or seconds;
// a fold turns the viewer's cards face down (pixels, at the turn's midpoint); shown hands, tags and
// the banner never cover a name, a stack or the line under the board; the top bar says a pause or
// the night's end waits for the hand in play; keys stay out of the top bar and Enter on a button is
// the button's; a dialog the turn closes hands the focus to the action bar; an unknown code is a
// real 404, spending the address's miss counter, and an address past it gets a 404 for the live
// table too; the host ends the night and every context sees the summary. The no-advice list runs over every screen, and screenshots at 1440 and 390 px land in
// scripts/qa/output/poker-night/ui-*.png.
//
// Realtime over a fake relay (P4). The harness has no Ably key, so GET token answers
// {realtime: false} and every page polls — but one more guest's page defines window.__PN_RT_FAKE__
// (the seam run.sh opens with NEXT_PUBLIC_PN_RT_FAKE=1), and this script is its channel: it reads
// the room's seq from Mongo, builds the message the server publishes (room-doc.wireOfRoom and
// channel.stateMessage, through jiti) and hands it to the page held back, out of order and twice.
// Over two hands that page is Live (data-pn-mode="realtime", the top bar's "Live"), the seq it
// draws only ever moves up, at each new hand it reads its own view once and its cards appear, it
// reads the table only that and every 20 s, and no message carries a hole that was not shown, an
// identity, the people or the viewer's own part, or passes the size budget. The relay then stops
// mid-hand: the watchdog brings the polls back within its 3 s and the page keeps up. No page in any
// context opens a request or a socket to an Ably host.
// Emotes (P6). Through the API: a seated player's reaction answered with the emote as stored, a
// second inside the 1.2 s cooldown 429 with nothing written, a throw counted for the night summary
// (awards thrown and received) while the game's seq stays put, a poll from before them bringing
// both, a watcher refused (409), a throw at oneself or a watcher refused (422), free text refused
// (400), and with the host's throwables off a throw 403 while a phrase still goes. In the browser:
// a reaction on one screen shows on another within its next poll, with a pop on that screen (its
// 600 Hz tone started), a tomato lands on its target's plate ([data-splat]) and in the counts,
// the reduced-motion screen draws the impact and never the flight, and a player muted from a
// plate's menu stays off that screen while their own shows it, and a third player's does not. Then
// "?" lists every key; the host's throwables switch takes the picker's Throw tab away and a throw
// posted from a page's own cookie is 403; two emotes from it inside 1.2 s, 429. One more hand, on
// a turn that is neither A's nor B's: A's reaction over A's seat (under it for a seat along the
// top) on three other screens within a hand's poll, never behind the top bar, a phrase in its
// words, a tomato flying on the host's screen with its arc's peak under the top bar and landing on
// B's avatar on three screens, B's name and stack left clear (only the impact under reduced
// motion), "Mute emotes" keeping A's next one off B's screen, A's own card back drawn mid-hand,
// Peek turning A's cards face down until pressed, and B's new look saved mid-hand waiting for the
// hand's end (kept while the drawer is shut), then on the table by itself; at the hand's end a club
// or a diamond in A's four colours; every Web Audio start counted by an init script — A's screen
// plays tones and noise over the hand, B's, with its sound off, none — every tab of the picker on
// the no-advice list; and a phone driven by taps alone wakes its audio inside the gesture.
// The looks (P5): paused after hand 1, A's card back and four-colour deck change A's cards (the
// colours LOOKS_CSS gives them, read off a drawn back and suit) and never B's, without a request,
// and survive a reload; A's avatar from the builder reaches every screen's seat within 5 s; the
// host's Look section sends seven scenes and a felt to three tables within 5 s each, kept for the
// host's next tables, and every open seat is filled with the felt. At hand 2's first turn a brutalist visitor's felt stays a stadium while its
// plate pulse and the scene's twinkle stop by name, and A's emulated reduced motion stops the
// twinkle and keeps the hand's chip flights still. After the night, the lobby's My look saves a
// name, the builder's avatar, a card back and the tables' scene, mirrored into the browser with
// none of its own look left over the account's, and the next Quick start opens with them from the
// account alone.
// The night's awards (P7): once the host ends the night, the summary's awards are the ones
// lib/poker-night/awards works out again from the stored ledger and throws (Tomato magnet exactly
// when a tomato landed), the same on a guest's phone; Copy summary adds a line per award; the
// celebration plays at 1440 px, stands still under reduced motion and never widens the phone's page.
// Run: npm run qa -- poker-night   (the harness: README.md)
import {chromium} from 'playwright';
import {MongoClient} from 'mongodb';
import {createJiti} from 'jiti';
import {randomUUID} from 'node:crypto';
import {BASE, MONGO, REPO_ROOT, check, note, outDir, signUp, summary} from './lib.mjs';

const OUT = outDir('poker-night');
// The store runs here on the harness database, never on a MONGODB_URI left in the shell.
process.env.MONGODB_URI = MONGO;
process.env.BETTER_AUTH_SECRET ??= 'local-qa-secret-at-least-32-characters-long';
process.env.BETTER_AUTH_URL ??= BASE;
const jiti = createJiti(import.meta.url, {alias: {'@': REPO_ROOT.replace(/\/$/, '')}, fsCache: false});
const lib = (path) => jiti.import(`${REPO_ROOT}${path}`);
const {insertRoom} = await lib('lib/poker-night/store.ts');
const {legalFor} = await lib('lib/poker-night/betting.ts');
const {snapshotFromView} = await lib('lib/poker-night/views.ts');
const {seatShares} = await lib('lib/poker-night/pots.ts');
const {conservation} = await lib('lib/poker-night/ledger.ts');
const {DEFAULT_CONFIG, ENTRY_FLAGS, ENTRY_KINDS, LEDGER_KINDS, STATE_VERSION, TIMING} = await lib('lib/poker-night/config.ts');
const {PN_PROTOCOL} = await lib('lib/poker-night/http.ts');
const {RATE_LIMITS} = await lib('lib/poker-night/limits.ts');
const {CODE_ALPHABET} = await lib('lib/poker-night/code.ts');
const {guestCookieName} = await lib('lib/poker-night/guest-token.ts');
const {faceNameOf} = await lib('lib/poker-night/room.ts');
const {evaluateCards} = await lib('lib/poker/evaluator.ts');
const {cardLabel} = await lib('lib/poker/cards.ts');
const {bestFive, describeHand} = await lib('lib/poker-night/hand-name.ts');
const {isAvatar} = await lib('lib/poker-night/avatar.ts');
const {
    POKER_NIGHT_ERRORS, JOIN_COPY, BANK_COPY, HAND_COPY, HOST_COPY, SUMMARY_COPY, TABLE_COPY, EMOTE_COPY, LOBBY_COPY, SHORTCUTS_COPY, LOOKS_COPY,
} = await lib('lib/learn/copy/poker-night.ts');
const {nightAwards, throwCountsOf} = await lib('lib/poker-night/awards.ts');
const {CARD_BACKS, FELTS, SCENES, SUIT_COLOURS} = await lib('lib/poker-night/looks.ts');
const {SOUNDS} = await lib('lib/poker-night/sounds.ts');
const {ME_STORAGE_KEY} = await lib('lib/poker-night/personal.ts');
const {SHORTCUTS} = await lib('lib/poker-night/keys.ts');
const {findBanned} = await lib('lib/learn/banned.ts');
const {migrateState} = await lib('lib/poker-night/migrate.ts');
const {coreFromDoc, serverRoomFromDoc, wireOfRoom} = await lib('lib/poker-night/room-doc.ts');
const {stateMessage, STATE_MESSAGE, WIRE_BUDGET_BYTES} = await lib('lib/poker-night/channel.ts');
const {AHEAD_GRACE_MS} = await lib('lib/poker-night/feed.ts');
const models = await Promise.all(['poker-room', 'poker-hand', 'poker-result'].map(async (m) => (await lib(`database/models/${m}.model.ts`)).default));

const ENV = 'development'; // the harness sets no VERCEL_ENV
const COOKIE = guestCookieName(ENV);
const AVATARS = {
    host: 'v1:lion:coral:gold:crown', A: 'v1:cat:sky:none:none', B: 'v1:panda:mint:ring:star', C: 'v1:owl:grape:none:none',
    D: 'v1:frog:lime:none:none', E: 'v1:bee:lemon:dashed:none', F: 'v1:whale:ocean:none:none',
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const sameCards = (a, b) => Array.isArray(a) && Array.isArray(b) && a.length === b.length && [...a].sort((x, y) => x - y).join() === [...b].sort((x, y) => x - y).join();

const browser = await chromium.launch({channel: 'chrome'});
const mongo = new MongoClient(MONGO);

// Every host any page in any context asked anything of — a request or a socket — and the ones that
// were Ably's: this harness has no key, and the one realtime page takes its messages from the relay.
const hostsSeen = new Set();
const ablyContacts = [];
const noteUrl = (url) => {
    try {
        const host = new URL(url).hostname;
        hostsSeen.add(host);
        if (/ably/i.test(host)) ablyContacts.push(url);
    } catch {
        // data: and the like have no host.
    }
};
const newContext = async (options) => {
    const context = await browser.newContext(options);
    context.on('request', (r) => noteUrl(r.url()));
    context.on('page', (page) => page.on('websocket', (ws) => noteUrl(ws.url())));
    return context;
};

// The Next dev indicator (the round "N" button) sits over the dock in every phone picture of a dev
// server: hidden from every screenshot this suite takes, by a style added once the page has
// hydrated (none of the suite's checks reads it).
const hideDevIndicator = (page) => page.addStyleTag({content: 'nextjs-portal{display:none!important}'}).catch(() => {});

// ── what every response is held to ──────────────────────────────────────────────────────────
// Keys no response may carry: the deck, who a player is outside the room, the room's bookkeeping.
const PRIVATE_KEYS = new Set(['deck', 'userId', 'guestId', 'bannedKeys', 'applied', 'seen', 'emoteAt', 'awards', 'lastError', 'hostUserId', '_id']);
// Two-number lists that are seat numbers or chips, never cards.
const NOT_CARDS = new Set(['eligible', 'winners', 'shares', 'showOrder', 'toDiscard']);
// Version 2's shapes (state and views alike): a hand's first board, a paid pot's winners over every
// board, and what each seat took from it (lib/poker-night/pots.seatShares, the client's own split).
const boardOf = (hand) => hand?.boards?.[0] ?? [];
const winnersOf = (pot) => [...new Set(pot.winners.flat())];
const leaks = [];
const errorCodes = new Map(); // code -> where it was first answered
const outcomes = new Set();
const renames = new Set();
const streetsSeen = {A: new Set(), B: new Set()};
let responsesChecked = 0;
// What Mongo said each hand's holes were, by hand number, with which seats were shown.
const dbHands = new Map();

const walk = (node, key, visit) => {
    visit(node, key);
    if (Array.isArray(node)) node.forEach((child) => walk(child, key, visit));
    else if (node && typeof node === 'object') for (const [k, v] of Object.entries(node)) walk(v, k, visit);
};
const keysIn = (body) => {
    const found = new Set();
    walk(body, null, (node) => {
        if (node && typeof node === 'object' && !Array.isArray(node)) for (const k of Object.keys(node)) found.add(k);
    });
    return found;
};
const cardPairsIn = (body) => {
    const pairs = [];
    walk(body, null, (node, key) => {
        if (Array.isArray(node) && node.length === 2 && !NOT_CARDS.has(key) && node.every((n) => Number.isInteger(n) && n >= 0 && n < 52)) pairs.push(node);
    });
    return pairs;
};

let db;
let rooms;
let code;
let roomId;
const roomDoc = (filter = {}) => rooms.findOne({env: ENV, code, ...filter});
// The seq every answer carries (room-doc.publicSeq): the compare-and-set's, less the writes only
// their author could see (a pre-action).
const pubSeq = (doc) => doc.seq - (doc.hiddenCommits ?? 0);
// Every edit moves seq on, as a commit would, so the next write's compare-and-set sees it.
const editRoom = (set) => rooms.updateOne({env: ENV, code}, {$set: set, $inc: {seq: 1}});

const rememberHand = (hand) => {
    if (!hand) return;
    const known = dbHands.get(hand.no);
    dbHands.set(hand.no, {
        no: hand.no, board: boardOf(hand),
        seats: hand.seats.map((p) => ({seat: p.seat, pid: p.pid, hole: p.hole, shown: p.shown || (known?.seats.find((q) => q.seat === p.seat)?.shown ?? false)})),
    });
};

// A response's private parts, against Mongo read right after it: no private key, the viewer's own
// hole as dealt, every other seat's cards face down until shown, and no unshown hole pair anywhere.
// A page's own requests are read as they land, so Mongo may already be a street further on: there
// the board need only be the start of Mongo's (`overheard`).
const leakCheck = async (p, label, body, {overheard = false} = {}) => {
    responsesChecked++;
    const keys = keysIn(body);
    for (const k of PRIVATE_KEYS) if (keys.has(k)) leaks.push(`${p.name} ${label}: "${k}"`);
    // A table view's hand (GET detail?part=log names its hand by number: a public log, no cards).
    if (!body || typeof body.hand !== 'object' || body.hand === null) return;
    const doc = await roomDoc();
    rememberHand(doc?.state?.hand);
    const truth = dbHands.get(body.hand.no);
    if (!truth) return leaks.push(`${p.name} ${label}: hand ${body.hand.no} was never seen in Mongo`);
    if (p.name in streetsSeen) streetsSeen[p.name].add(`${body.hand.no}:${body.hand.street}`);
    const pairs = cardPairsIn(body);
    for (const seat of truth.seats) {
        if (seat.pid === p.pid) {
            if (body.me && body.hand.phase !== 'complete' && !sameCards(body.me.hole, seat.hole)) leaks.push(`${p.name} ${label}: own hole is not the dealt one`);
            continue;
        }
        if (seat.shown) continue;
        if (pairs.some((pair) => sameCards(pair, seat.hole))) leaks.push(`${p.name} ${label}: seat ${seat.seat}'s hole before it was shown`);
        const shownAs = body.seats?.[seat.seat]?.cards;
        if (Array.isArray(shownAs)) leaks.push(`${p.name} ${label}: seat ${seat.seat} face up before it was shown`);
    }
    const board = overheard ? truth.board.slice(0, boardOf(body.hand).length) : truth.board;
    if (boardOf(body.hand).join() !== board.join()) leaks.push(`${p.name} ${label}: the board is not Mongo's`);
};

// A page of history for viewer p: a hole only where it was shown or is p's own, as PokerHand keeps it.
const historyCheck = async (p, body) => {
    const problems = [];
    for (const h of body.hands ?? []) {
        const row = await db.collection('pokerhands').findOne({env: ENV, roomId, handNo: h.no});
        if (!row) {
            problems.push(`hand ${h.no} has no PokerHand row`);
            continue;
        }
        const pairs = cardPairsIn(h);
        for (const truth of row.summary.players) {
            const shownTo = truth.shown || truth.pid === p.pid;
            const seen = h.players.find((q) => q.pid === truth.pid);
            if (shownTo ? !sameCards(seen?.hole, truth.hole) : seen?.hole !== null) problems.push(`hand ${h.no} seat ${truth.seat}: ${JSON.stringify(seen?.hole)}`);
            if (!shownTo && pairs.some((pair) => sameCards(pair, truth.hole))) problems.push(`hand ${h.no} seat ${truth.seat}'s hole elsewhere`);
        }
    }
    return problems;
};

// ── talking to the API as a browser would ───────────────────────────────────────────────────
// A request with a valid seat pass spends its player's own in-memory bucket; one without (a first
// join, a request whose pass the identity read replaced) spends the address's, which every context
// here — one machine — shares (POSTs 5 a second, 20 at once): actions and joins go out at most one
// per POST_GAP_MS. Ticks go as they come.
const POST_GAP_MS = 230;
let nextPostAt = 0;
const paced = async () => {
    const now = Date.now();
    const at = Math.max(now, nextPostAt);
    nextPostAt = at + POST_GAP_MS;
    if (at > now) await sleep(at - now);
};

const players = [];
const newPlayer = async (name, viewport = {width: 1440, height: 900}) => {
    const context = await newContext({viewport});
    const p = {name, context, pass: null, pid: null, seat: null, view: null};
    players.push(p);
    return p;
};

// One request. headers: null drops a default; usePass: false leaves the seat pass off.
const call = async (p, method, route, {data, query = '', at = code, headers = {}, usePass = true, pace = method === 'POST' && route !== 'tick', check: holdTo = true} = {}) => {
    const h = {'x-pn-protocol': String(PN_PROTOCOL), ...(method === 'POST' ? {'content-type': 'application/json', origin: BASE} : {}), ...headers};
    if (usePass && p.pass && !('x-pn-pass' in headers)) h['x-pn-pass'] = p.pass;
    for (const [k, v] of Object.entries(h)) if (v === null) delete h[k];
    if (pace) await paced();
    const response = await p.context.request.fetch(`${BASE}/api/poker-night/${at}/${route}${query}`, {
        method, headers: h, data: data === undefined ? undefined : typeof data === 'string' ? data : JSON.stringify(data),
        timeout: 90000, failOnStatusCode: false, maxRedirects: 0,
    });
    const text = await response.text();
    let body = null;
    try {
        body = JSON.parse(text);
    } catch {
        body = null;
    }
    if (body?.error && !errorCodes.has(body.error)) errorCodes.set(body.error, `${p.name} ${method} ${route} ${response.status()}`);
    if (body?.outcome) outcomes.add(body.outcome);
    if (body?.renamed) renames.add(body.renamed);
    if (typeof body?.pass === 'string') p.pass = body.pass;
    if (body?.me && at === code) {
        p.view = body;
        p.pid = body.me.pid;
        p.seat = body.me.seat;
    }
    if (holdTo && body && at === code) {
        if (route === 'detail' && body.part === 'history') {
            for (const problem of await historyCheck(p, body)) leaks.push(`${p.name} history: ${problem}`);
            responsesChecked++;
        } else {
            await leakCheck(p, `${method} ${route}`, body);
        }
    }
    return {status: response.status(), body, text, headers: response.headers()};
};
const getState = (p, opts = {}) => call(p, 'GET', 'state', opts);
const post = (p, route, data, opts = {}) => call(p, 'POST', route, {...opts, data});
// Every join carries a fresh joinId unless it names one (a retry reuses its join's).
const join = (p, input, opts = {}) => post(p, 'join', {joinId: randomUUID(), avatar: AVATARS[p.name], as: 'player', ...input}, opts);
const action = (p, body, opts = {}) => post(p, 'action', {actionId: randomUUID(), ...body}, opts);
const hostOp = (p, op, opts = {}) => action(p, {type: 'host', op}, opts);
const tick = (p, beat = false) => post(p, 'tick', beat ? {beat: {hidden: false}} : {});
const act = (p, view, move, opts = {}) => action(p, {type: 'act', turn: view.turn, move}, opts);

// Ticks from p every `every` ms until a view passes `until`; the views on the way are handed to `seen`.
const tickUntil = async (p, until, {timeout = 15000, every = 200, seen = () => {}} = {}) => {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
        const r = await tick(p);
        if (r.status === 200 && r.body?.me) {
            seen(r.body, Date.now());
            if (until(r.body)) return r.body;
        }
        await sleep(every);
    }
    return null;
};

const ownerOf = (view, seat) => players.find((p) => p.pid && p.pid === view.seats[seat]?.pid) ?? null;

// Plays the hand in `view` until it completes (or `stop` says so), each actor's move from
// choose(owner, legal, view). On every new street A and B fetch their own view, for the leak checks.
const playHand = async (view, choose, {stop = () => false, onActed = async () => {}} = {}) => {
    let v = view;
    let street = null;
    for (let guard = 0; guard < 120; guard++) {
        const hand = v.hand;
        if (!hand || hand.phase === 'complete' || stop(v)) return v;
        const at = `${hand.no}:${hand.street}`;
        if (at !== street) {
            street = at;
            for (const p of players.filter((q) => q.name === 'A' || q.name === 'B')) await getState(p);
        }
        if (hand.phase === 'runout') {
            v = (await tickUntil(players[0], (next) => next.hand?.phase === 'complete' || boardOf(next.hand).length !== boardOf(hand).length)) ?? v;
            continue;
        }
        const owner = ownerOf(v, hand.actor);
        if (!owner) throw new Error(`no player sits at seat ${hand.actor}`);
        const legal = legalFor(snapshotFromView(v), hand.actor);
        const r = await act(owner, v, choose(owner, legal, v));
        if (r.status !== 200) throw new Error(`${owner.name}'s move answered ${r.status} ${r.text}`);
        await onActed(owner, r.body);
        v = r.body;
    }
    throw new Error('the hand did not finish');
};
const checkOrCall = (_owner, legal) => (legal.check ? {kind: 'check'} : {kind: 'call'});

let host;
let A;
let B;
const pageErrors = [];

try {
    await mongo.connect();
    db = mongo.db();
    rooms = db.collection('pokerrooms');
    const results = db.collection('pokerresults');
    const limits = db.collection('ratelimits');

    // --- setup --------------------------------------------------------------------------------
    await limits.deleteMany({key: /^poker-night:/});
    host = await newPlayer('host');
    const hostPage = await host.context.newPage();
    hostPage.on('pageerror', (error) => pageErrors.push(String(error)));
    const hostEmail = await signUp(hostPage, 'pnhost', {stay: true});
    const hostUser = await db.collection('user').findOne({email: hostEmail});
    const hostUserId = String(hostUser._id);
    const userCount = await db.collection('user').countDocuments();
    const sessionCount = await db.collection('session').countDocuments();

    const room = await insertRoom({
        env: ENV, at: Date.now(), host: {userId: hostUserId, name: 'QA host', avatar: AVATARS.host},
        config: {...DEFAULT_CONFIG, pauseSeconds: 3}, settings: {name: 'QA poker night'},
    });
    code = room.core.code;
    roomId = room.core.id;
    host.pid = room.core.state.hostPid;
    const seeded = await roomDoc();
    check('the store inserts the room under its env, the host seated at seat 0 with the cap',
        seeded?.env === ENV && seeded.seq === 0 && seeded.state.seats[0]?.pid === host.pid && seeded.state.seats[0].stack === DEFAULT_CONFIG.buyInMax
        && seeded.players.length === 1 && seeded.players[0].userId === hostUserId && seeded.peopleV === 1, `${code} ${seeded?.env}`);

    // --- gates ----------------------------------------------------------------------------------
    const stranger = await newPlayer('stranger');
    const strangerPage = await stranger.context.newPage();
    const playPage = await strangerPage.goto(`${BASE}/play/${code}`, {waitUntil: 'load', timeout: 180000});
    const joinCard = await strangerPage.waitForSelector('[data-join-card="visitor"]', {timeout: 60000}).then(() => true, () => false);
    check('/play/CODE is open to a browser with no session: 200, no redirect to sign-in, the join card over the table',
        playPage?.status() === 200 && new URL(strangerPage.url()).pathname === `/play/${code}` && joinCard, `${playPage?.status()} ${strangerPage.url()} card ${joinCard}`);
    await hideDevIndicator(strangerPage);
    await strangerPage.screenshot({path: `${OUT}01-play-visitor.png`});
    // The way out for a visitor: Home is a plain link to "/" (the landing page for a guest), never
    // the lobby, which would send them to sign in.
    const visitorHome = await strangerPage.$eval('[data-open="home"]', (el) => ({tag: el.tagName, href: el.getAttribute('href')})).catch(() => null);
    check('a visitor\'s Home in the top bar is a plain link to "/"', visitorHome?.tag === 'A' && visitorHome.href === '/', JSON.stringify(visitorHome));
    await strangerPage.goto(`${BASE}/players`, {waitUntil: 'load'});
    check('…while /players, a look-alike, still sends it to sign in', /\/sign-in/.test(strangerPage.url()), strangerPage.url());

    let r = await getState(stranger, {headers: {'x-pn-protocol': null}});
    check('GET state without X-PN-Protocol: 426 reload', r.status === 426 && r.body?.error === 'reload', `${r.status} ${r.text}`);
    check('…never cached', /no-store/.test(r.headers['cache-control'] ?? ''), r.headers['cache-control']);
    r = await getState(stranger, {headers: {'x-pn-protocol': String(PN_PROTOCOL - 1)}});
    check('…and with another protocol: 426', r.status === 426 && r.body?.error === 'reload', `${r.status}`);
    r = await getState(stranger);
    check('GET state with it but no identity: 401 no_identity', r.status === 401 && r.body?.error === 'no_identity', `${r.status} ${r.text}`);
    r = await getState(stranger, {at: 'ZZZZZZ'});
    check('…before the code is even looked up: an unknown one is 401 too', r.status === 401 && r.body?.error === 'no_identity', `${r.status}`);
    r = await post(stranger, 'tick', {});
    check('POST tick with no identity: 401', r.status === 401, `${r.status}`);
    r = await join(stranger, {name: 'Eve'}, {headers: {origin: null}});
    check('POST join with no Origin and no Sec-Fetch-Site: 403 cross_origin', r.status === 403 && r.body?.error === 'cross_origin', `${r.status} ${r.text}`);
    r = await join(stranger, {name: 'Eve'}, {headers: {'sec-fetch-site': 'cross-site'}});
    check('…from another site: 403 cross_origin', r.status === 403 && r.body?.error === 'cross_origin', `${r.status}`);
    r = await join(stranger, {name: 'Eve'}, {headers: {'content-type': 'text/plain'}});
    check('…not JSON: 400', r.status === 400 && r.body?.error === 'bad_request', `${r.status}`);
    r = await post(stranger, 'join', JSON.stringify({name: 'x'.repeat(2100), avatar: AVATARS.A, as: 'player'}));
    check('…over 2 KiB: 400', r.status === 400 && r.body?.error === 'bad_request', `${r.status}`);
    r = await join(stranger, {name: 'Eve', extra: 1});
    check('…an unknown key: 400', r.status === 400 && r.body?.error === 'bad_request', `${r.status}`);
    r = await join(stranger, {name: 'Eve', avatar: 'v1:dragon:plaid:none:none'});
    check('…an avatar that is not one of ours: 400', r.status === 400 && r.body?.error === 'bad_request', `${r.status}`);
    check('…and no refused request left the stranger a cookie', (await stranger.context.cookies(BASE)).every((c) => c.name !== COOKIE));

    // --- guests join ----------------------------------------------------------------------------
    A = await newPlayer('A');
    r = await join(A, {name: 'Ana'});
    check('guest A joins by the link: seated, with a seat pass', r.status === 200 && r.body?.outcome === 'seated' && r.body.me.role === 'seated'
        && r.body.me.seat === 1 && typeof r.body.pass === 'string' && r.body.me.hasAccount === false && r.body.renamed === null, `${r.status} ${r.text.slice(0, 200)}`);
    check('…under the name typed, in the people part', r.body?.people?.[A.pid]?.name === 'Ana' && r.body.people[A.pid].avatar === AVATARS.A
        && r.body.people[host.pid]?.name === 'QA host' && r.body.peopleV === 2);
    const cookiesA = await A.context.cookies(BASE);
    const guestCookie = cookiesA.find((c) => c.name === COOKIE);
    check(`…given the ${COOKIE} cookie: httpOnly, Lax, path /`, guestCookie?.httpOnly === true && guestCookie.sameSite === 'Lax' && guestCookie.path === '/'
        && guestCookie.expires > Date.now() / 1000 + 170 * 86400, JSON.stringify(guestCookie && {...guestCookie, value: '…'}));
    check('…and no better-auth cookie', cookiesA.every((c) => !/better-auth/i.test(c.name)), cookiesA.map((c) => c.name).join(','));
    const rowA = (await roomDoc()).players.find((p) => p.pid === A.pid);
    check('…a player row with the cookie\'s guestId and no userId', rowA?.userId === null && /^[A-Za-z0-9_-]{22}$/.test(rowA?.guestId ?? '')
        && guestCookie?.value.split('.')[1] === rowA.guestId);

    B = await newPlayer('B', {width: 390, height: 844});
    r = await join(B, {name: '   '});
    const faceB = faceNameOf(AVATARS.B);
    check('guest B leaves the name blank and sits as the face\'s name', r.status === 200 && r.body?.people?.[B.pid]?.name === faceB && r.body.renamed === null
        && r.body.me.seat === 2, `${r.body?.people?.[B.pid]?.name} vs ${faceB}`);
    check('no better-auth user or session came of either guest',
        await db.collection('user').countDocuments() === userCount && await db.collection('session').countDocuments() === sessionCount);

    const peopleV = (await roomDoc()).peopleV;
    r = await join(A, {name: 'Someone else'});
    check('a returning guest\'s join is answered as they are: the same pid and seat, the name kept',
        r.status === 200 && r.body?.outcome === 'returning' && r.body.me.pid === A.pid && r.body.me.seat === 1 && r.body.people[A.pid].name === 'Ana');
    const afterReturn = await roomDoc();
    check('…with no new row and no write', afterReturn.players.length === 3 && afterReturn.peopleV === peopleV && afterReturn.seq === seeded.seq + 2);

    r = await getState(A, {usePass: false});
    check('GET state by the cookie alone mints a pass', r.status === 200 && typeof r.body?.pass === 'string' && r.body.me.pid === A.pid);
    r = await getState(A);
    check('…and with the pass, answers with none', r.status === 200 && r.body?.pass === null && r.body.me.pid === A.pid);
    r = await getState(A, {query: `?since=${r.body.seq}&esince=${r.body.emoteSeq}`});
    check('…and nothing new since its seq: unchanged, from the head alone', r.status === 200 && r.body?.unchanged === true && r.body.seq === afterReturn.seq);
    {
        // The viewer's own nudge count: the same poll naming the one it holds is Unchanged, a count it
        // does not hold reads the whole view (an ask or an answer meant for it alone moves the count).
        const held = await getState(A, {query: `?since=${r.body.seq}&esince=${r.body.emoteSeq}&nsince=${r.body.nudge}`});
        const stale = await getState(A, {query: `?since=${r.body.seq}&esince=${r.body.emoteSeq}&nsince=${r.body.nudge + 1}`});
        check('…naming its nudge count: Unchanged; naming another: the whole view, its own count on it', r.body.nudge === 0
            && held.status === 200 && held.body?.unchanged === true && stale.status === 200 && stale.body?.unchanged !== true
            && stale.body?.me?.pid === A.pid && stale.body.nudge === 0, `${held.text.slice(0, 80)} | ${stale.text.slice(0, 80)}`);
    }
    {
        // A failed publish stamps rt out of band (no seq moves), and an Unchanged answer — a poll's or a
        // tick's, from the head alone — says so as a view does, so a page that sees only those still
        // learns when the five minutes are over.
        const since = `?since=${r.body.seq}&esince=${r.body.emoteSeq}`;
        await rooms.updateOne({env: ENV, code}, {$set: {'rt.failAt': new Date()}});
        const failing = await getState(A, {query: since});
        const ticked = await tick(A);
        await rooms.updateOne({env: ENV, code}, {$set: {'rt.failAt': new Date(Date.now() - 6 * 60_000)}});
        const over = await getState(A, {query: since});
        await rooms.updateOne({env: ENV, code}, {$unset: {rt: ''}});
        check('an Unchanged answer carries realtimeOk: false while a failed publish is under five minutes old (a poll\'s and a tick\'s), true once it is older',
            failing.body?.unchanged === true && failing.body.realtimeOk === false && ticked.body?.unchanged === true && ticked.body.realtimeOk === false
            && over.body?.unchanged === true && over.body.realtimeOk === true,
            `${failing.text.slice(0, 120)} | ${ticked.text.slice(0, 120)} | ${over.text.slice(0, 120)}`);
    }
    r = await getState(A, {at: code.toLowerCase()});
    check('the code in lower case reaches the same table', r.status === 200 && r.body?.code === code);

    await tick(A, true);
    await tick(B, true);
    r = await getState(host);
    check('the host, by session: their own view, a pass minted', r.status === 200 && r.body?.me?.isHost === true && r.body.me.hasAccount === true
        && r.body.me.seat === 0 && typeof r.body.pass === 'string');
    const presence = (r.body?.seats ?? []).map((s) => s?.presence ?? '-');
    check('beats put A and B here, and the clock with the lowest seat here (A)',
        presence.slice(0, 3).join() === 'offline,here,here' && r.body.clockLeader === A.pid, `${presence.join()} leader ${r.body?.clockLeader === A.pid ? 'A' : r.body?.clockLeader}`);

    // --- hand 1: played to a showdown ---------------------------------------------------------------
    r = await hostOp(A, {op: 'start'});
    check('a guest cannot deal: 403 not_host', r.status === 403 && r.body?.error === 'not_host', `${r.status}`);
    r = await hostOp(host, {op: 'start'});
    const started = r.body;
    check('the host starts the table: playing, the first deal timed three seconds out',
        r.status === 200 && started?.status === 'playing' && started.hand === null
        && Math.abs(started.nextDueAt - started.serverNow - TIMING.START_DELAY_MS) < 1000, `${r.status} ${started?.nextDueAt - started?.serverNow}`);
    await sleep(Math.max(0, started.nextDueAt - started.serverNow) + 400);
    r = await getState(A);
    check('a GET never deals, even once the deal is due', r.status === 200 && r.body?.hand === null && r.body.nextDueAt <= r.body.serverNow,
        `${r.body?.nextDueAt} vs ${r.body?.serverNow}`);
    let view = await tickUntil(A, (v) => v.hand?.no === 1, {timeout: 10000});
    check('a tick deals hand 1 once it is due', view?.hand?.no === 1 && view.hand.phase === 'betting' && view.hand.actor !== null);
    if (!view) throw new Error('hand 1 was never dealt');

    // Refusals before the first move: someone else's turn, an old turn number, a raise too small.
    {
        const actorSeat = view.hand.actor;
        const actor = ownerOf(view, actorSeat);
        const other = players.find((p) => [host, A, B].includes(p) && p !== actor);
        r = await act(other, view, {kind: 'check'});
        check('a move out of turn: 409 not_your_turn', r.status === 409 && r.body?.error === 'not_your_turn', `${r.status} ${r.text}`);
        r = await act(actor, {turn: view.turn - 1}, {kind: 'call'});
        check('a move on an old turn: 409 stale', r.status === 409 && r.body?.error === 'stale', `${r.status}`);
        r = await act(actor, view, {kind: 'raise', to: view.hand.currentBet + 1});
        check('a raise below the minimum: 422', r.status === 422 && r.body?.error === 'below_min_raise', `${r.status} ${r.text}`);

        const before = await roomDoc();
        const body = {actionId: randomUUID(), type: 'act', turn: view.turn, move: checkOrCall(actor, legalFor(snapshotFromView(view), actorSeat))};
        const first = await post(actor, 'action', body);
        const again = await post(actor, 'action', body);
        const after = await roomDoc();
        check('the same actionId twice: applied once, the repeat answered duplicate', first.status === 200 && !first.body.duplicate
            && again.status === 200 && again.body?.duplicate === true && again.body.seq === first.body.seq, `${first.status} ${again.status} ${again.text.slice(0, 120)}`);
        check('…one log entry and one write', after.state.hand.log.length === before.state.hand.log.length + 1 && after.seq === before.seq + 1
            && after.applied.length === before.applied.length + 1);
        view = again.body;
    }
    {
        // A pre-action shows to nobody but its owner: its write moves the compare-and-set's seq and
        // hiddenCommits together, so the public seq every answer carries stays put — the player on
        // the clock cannot tell from it that anyone chose one — and their poll from it is Unchanged.
        const actor = ownerOf(view, view.hand.actor);
        const quiet = [host, A, B].find((p) => p !== actor && p.seat !== null && view.seats[p.seat]?.state === 'in-hand');
        const before = await roomDoc();
        const set = await action(quiet, {type: 'pre', pre: {kind: 'check-fold'}});
        const mid = await roomDoc();
        const polled = await getState(actor, {query: `?since=${pubSeq(before)}&esince=${before.emoteSeq ?? 0}`});
        const cleared = await action(quiet, {type: 'pre', pre: null});
        const after = await roomDoc();
        check(`a pre-action ${quiet?.name} sets while ${actor?.name} is on the clock: written (seq ${before.seq} → ${mid.seq}), the public seq unmoved, only the setter's answer carrying it, and ${actor?.name}'s poll Unchanged`,
            set.status === 200 && set.body?.me?.pre?.kind === 'check-fold' && set.body.seq === pubSeq(before)
            && mid.seq === before.seq + 1 && pubSeq(mid) === pubSeq(before) && mid.applied.length === before.applied.length + 1
            && polled.status === 200 && polled.body?.unchanged === true && polled.body.seq === pubSeq(before),
            `${set.status} pre ${JSON.stringify(set.body?.me?.pre)} seq ${set.body?.seq}/${pubSeq(before)} | doc ${before.seq}→${mid.seq} hidden ${mid.hiddenCommits} | poll ${polled.text.slice(0, 80)}`);
        check('…and cleared again the same way: a second write, still nothing for anyone else',
            cleared.status === 200 && cleared.body?.me?.pre === null && cleared.body.seq === pubSeq(before) && after.seq === before.seq + 2 && pubSeq(after) === pubSeq(before),
            `${cleared.status} ${JSON.stringify(cleared.body?.me?.pre)} seq ${cleared.body?.seq} doc ${after.seq} hidden ${after.hiddenCommits}`);
    }
    const peopleBefore = (await roomDoc()).peopleV;
    view = await playHand(view, checkOrCall);
    let doc = await roomDoc();
    const hand1 = doc.state.hand;
    rememberHand(hand1);
    check('hand 1 goes to a showdown with every street dealt', hand1.no === 1 && hand1.phase === 'complete' && hand1.result?.showdown === true && boardOf(hand1).length === 5);
    {
        const value = new Map(hand1.seats.filter((p) => !p.folded).map((p) => [p.seat, evaluateCards([...boardOf(hand1), ...p.hole])]));
        const expected = hand1.result.pots.map((pot) => {
            const contenders = pot.eligible.length > 0 ? pot.eligible : [...value.keys()];
            const top = Math.max(...contenders.map((s) => value.get(s)));
            return contenders.filter((s) => value.get(s) === top).sort().join(',');
        });
        const paid = view.hand.result.pots.map((pot) => winnersOf(pot).sort().join(','));
        check('the winners are the hands evaluateCards ranks highest over Mongo\'s holes and board', expected.join('|') === paid.join('|'), `${paid.join('|')} vs ${expected.join('|')}`);
        check('…every hand shown as dealt', view.hand.result.hands.length === value.size
            && view.hand.result.hands.every((h) => sameCards(h.cards, hand1.seats.find((p) => p.seat === h.seat).hole)));
    }
    check('chips are conserved after hand 1', conservation(doc.state).ok, JSON.stringify(conservation(doc.state)));
    check('no move changed the people, so peopleV stayed', doc.peopleV === peopleBefore && view.peopleV === peopleBefore);
    check('A and B each fetched their view on every street of hand 1', ['preflop', 'flop', 'turn', 'river'].every((s) => streetsSeen.A.has(`1:${s}`) && streetsSeen.B.has(`1:${s}`)),
        `${[...streetsSeen.A].join(',')} / ${[...streetsSeen.B].join(',')}`);
    {
        // after() writes the hand and the host's result once the response is on its way.
        let handRow = null;
        let hostRow = null;
        for (let i = 0; i < 25 && !(handRow && hostRow?.hands === 1); i++) {
            await sleep(200);
            handRow = await db.collection('pokerhands').findOne({env: ENV, roomId, handNo: 1});
            hostRow = await results.findOne({env: ENV, roomId, userId: hostUserId});
        }
        check('hand 1 is kept in history, every hole as dealt', handRow?.summary?.players?.length === 3
            && handRow.summary.players.every((p) => sameCards(p.hole, hand1.seats.find((q) => q.seat === p.seat).hole)));
        check('…and the host\'s night has a result row; the guests have none', hostRow?.hands === 1 && hostRow.closed === false
            && await results.countDocuments({roomId}) === 1, JSON.stringify(hostRow && {hands: hostRow.hands, net: hostRow.net}));
    }

    // --- hand 2: an all-in run-out on the clock alone ------------------------------------------------
    view = await tickUntil(A, (v) => v.hand?.no === 2, {timeout: 12000});
    check('hand 2 deals itself after the pause, on a tick', view?.hand?.no === 2);
    if (!view) throw new Error('hand 2 was never dealt');
    let closedAt = null;
    view = await playHand(view, (owner, legal, v) => {
        if (owner === host) return {kind: 'fold'};
        const allInAlready = v.seats.some((s, i) => s && i !== v.hand.actor && s.state === 'all-in');
        return allInAlready || !legal.raise ? {kind: 'call'} : {kind: 'all-in'};
    }, {stop: (v) => v.hand.phase === 'runout', onActed: async (_p, body) => {
        if (body.hand?.phase === 'runout') closedAt = body.serverNow;
    }});
    check('A and B are all in and the host folded: the hand runs out', view.hand.phase === 'runout' && boardOf(view.hand).length === 0 && closedAt !== null);
    const streets = [];
    let last = view;
    const done = await tickUntil(A, (v) => v.hand.phase === 'complete', {timeout: 12000, seen: (v) => {
        if (v.hand.no === 2 && boardOf(v.hand).length !== boardOf(last.hand).length) streets.push({cards: boardOf(v.hand).length, at: v.serverNow});
        last = v;
    }});
    const gaps = streets.map((s, i) => s.at - (i === 0 ? closedAt : streets[i - 1].at));
    check('ticks alone deal the flop, turn and river 1.5 s apart (± 0.5 s)', streets.map((s) => s.cards).join(',') === '3,4,5'
        && gaps.every((g) => Math.abs(g - TIMING.RUNOUT_STEP_MS) <= 500), gaps.join(' ms, '));
    check('…and the river settles it', done?.hand?.phase === 'complete' && done.hand.result.showdown === true);
    doc = await roomDoc();
    rememberHand(doc.state.hand);
    check('chips are conserved after hand 2', conservation(doc.state).ok);
    const result2 = doc.state.hand.result;
    const pause2 = Math.max(doc.state.config.pauseSeconds * 1000, result2.revealMs);
    view = await tickUntil(A, (v) => v.hand?.no === 3, {timeout: 15000});
    const startedAt3 = (await roomDoc()).state.hand?.startedAt ?? 0;
    check('hand 3 deals itself between the reveal\'s end and 2 s after it', view?.hand?.no === 3
        && startedAt3 - result2.completedAt >= pause2 - 50 && startedAt3 - result2.completedAt <= pause2 + 2000, `${startedAt3 - result2.completedAt} ms, pause ${pause2}`);
    if (!view) throw new Error('hand 3 was never dealt');

    // --- hand 3: paused, then a timeout -----------------------------------------------------------
    r = await hostOp(host, {op: 'pause'});
    check('the host pauses mid-hand: the hand plays on, no next deal', r.status === 200 && r.body?.status === 'paused' && r.body.hand?.no === 3 && r.body.hand.phase === 'betting');
    {
        const actorSeat = r.body.hand.actor;
        // Past the deadline and its grace, but inside the slack: a tick — not the actor's own request —
        // leaves the turn alone, so a move made in time and still on its way could land.
        let now = Date.now();
        await editRoom({'state.hand.deadline': now - TIMING.TURN_GRACE_MS - 100, nextDueAt: new Date(now - 100)});
        const inSlack = await roomDoc();
        const early = await tick(A);
        const afterEarly = await roomDoc();
        check('a tick inside the slack past the grace leaves the actor\'s turn alone', early.status === 200 && early.body?.hand?.actor === actorSeat
            && afterEarly.state.hand.log.length === inSlack.state.hand.log.length && afterEarly.state.turn === inSlack.state.turn,
            `${early.status} actor ${early.body?.hand?.actor} vs ${actorSeat}`);
        now = Date.now();
        await editRoom({'state.hand.deadline': now - TIMING.TURN_GRACE_MS - TIMING.TIMEOUT_SLACK_MS - 1000, nextDueAt: new Date(now - 1000)});
        const before = await roomDoc();
        const timedOut = await tick(A);
        const entries = (await roomDoc()).state.hand.log.slice(before.state.hand.log.length);
        const entry = entries.find((e) => e[0] === actorSeat);
        check('a turn past its deadline, grace and slack: the next tick checks or folds for the actor',
            timedOut.status === 200 && entry !== undefined && (entry[4] & ENTRY_FLAGS.timeout) !== 0 && ['check', 'fold'].includes(ENTRY_KINDS[entry[1]])
            && timedOut.body.hand.actor !== actorSeat, JSON.stringify(entries));
        check('…shown in the log tail and as one timeout on the seat', timedOut.body?.hand?.logTail?.some((e) => e[0] === actorSeat && (e[4] & ENTRY_FLAGS.timeout) !== 0)
            && timedOut.body.seats[actorSeat].timeouts === 1);
        view = timedOut.body;
    }
    view = await playHand(view, checkOrCall);
    doc = await roomDoc();
    rememberHand(doc.state.hand);
    check('hand 3 completes and, paused, nothing more is due', doc.state.hand.phase === 'complete' && doc.status === 'paused' && doc.nextDueAt === null);
    check('chips are conserved after hand 3', conservation(doc.state).ok);

    // --- a rebuy, once a hand is dealt: a request the host approves ------------------------------------
    {
        const seatOf = (p) => doc.state.seats.findIndex((s) => s?.pid === p.pid);
        let buyer = [A, B].find((p) => doc.state.seats[seatOf(p)]?.stack === 0);
        if (buyer) note('rebuy', `${buyer.name} lost the all-in`);
        else {
            // A split or a host win: B's whole stack moves to A, in one write.
            const [a, b] = [seatOf(A), seatOf(B)];
            await editRoom({[`state.seats.${a}.stack`]: doc.state.seats[a].stack + doc.state.seats[b].stack, [`state.seats.${b}.stack`]: 0});
            buyer = B;
            doc = await roomDoc();
            check('B\'s stack moved to A in Mongo, chips conserved', conservation(doc.state).ok && doc.state.seats[b].stack === 0);
        }
        const row = (state) => state.ledger.find((l) => l.pid === buyer.pid);
        const boughtBefore = row(doc.state).bought;
        const bodies = [0, 1].map(() => ({actionId: randomUUID(), type: 'buy', amount: DEFAULT_CONFIG.buyInMax}));
        const [x, y] = await Promise.all(bodies.map((b) => post(buyer, 'action', b, {pace: false})));
        const statuses = [x, y].map((q) => q.status).sort().join(',');
        doc = await roomDoc();
        check('a double rebuy, a hand dealt: one request waits for the host (the second in the first\'s place), nothing bought yet', statuses === '200,200'
            && doc.state.requests.length === 1 && doc.state.requests[0].pid === buyer.pid && doc.state.requests[0].amount === DEFAULT_CONFIG.buyInMax
            && row(doc.state).bought === boughtBefore, `${statuses} ${JSON.stringify(doc.state.requests)}`);
        const replay = await post(buyer, 'action', bodies[0]);
        check('…and its id again is a duplicate', replay.status === 200 && replay.body?.duplicate === true);
        r = await hostOp(host, {op: 'approve', pid: buyer.pid});
        check('…the host approves it: the rebuy lands', r.status === 200 && r.body?.requests?.length === 0, `${r.status} ${r.text.slice(0, 120)}`);
        r = await hostOp(host, {op: 'approve', pid: buyer.pid});
        check('…and a second yes finds nothing waiting (409 no_request)', r.status === 409 && r.body?.error === 'no_request', `${r.status}`);
        doc = await roomDoc();
        const events = row(doc.state).events.filter((e) => LEDGER_KINDS[e[1]] === 'rebuy');
        check('exactly one rebuy in the ledger: bought twice the buy-in', events.length === 1 && events[0][2] === DEFAULT_CONFIG.buyInMax
            && row(doc.state).bought === boughtBefore + DEFAULT_CONFIG.buyInMax && row(doc.state).bought === 2 * DEFAULT_CONFIG.buyInMax, JSON.stringify(row(doc.state)));
        r = await call(buyer, 'GET', 'detail', {query: '?part=bank'});
        const bankRow = r.body?.bank?.find((b) => b.pid === buyer.pid);
        check('…and the bank says so, its net from chips, cash-outs and buys', r.status === 200 && bankRow?.bought === 2 * DEFAULT_CONFIG.buyInMax
            && bankRow.events.filter((e) => e.kind === 'rebuy').length === 1
            && r.body.bank.every((b) => b.net === b.chips + b.cashedOut - b.bought), JSON.stringify(bankRow));
        check('chips are conserved after the rebuy', conservation(doc.state).ok);
    }

    // --- a removal, and "let back in" ---------------------------------------------------------------
    const C = await newPlayer('C');
    r = await join(C, {name: 'Cleo'});
    const pvJoined = r.body?.peopleV;
    check('guest C joins at the paused table', r.status === 200 && r.body?.outcome === 'seated' && pvJoined === (await roomDoc()).peopleV);
    {
        // A hand has been dealt: C sits with nothing, the chips waiting for the host's yes.
        const seatC = r.body?.me?.seat;
        const waiting = await roomDoc();
        check('…with nothing until the host approves the chips: a request waits, no ledger row yet', r.body?.seats?.[seatC]?.chips === 0
            && r.body.requests.some((q) => q.pid === C.pid) && waiting.state.requests.some((q) => q.pid === C.pid)
            && !waiting.state.ledger.some((l) => l.pid === C.pid), JSON.stringify(r.body?.requests));
        const yes = await hostOp(host, {op: 'approve', pid: C.pid});
        const landed = await roomDoc();
        check('…the host approves: C\'s first chips land as a buy-in', yes.status === 200 && landed.state.seats[seatC]?.stack === DEFAULT_CONFIG.buyInMax
            && landed.state.ledger.find((l) => l.pid === C.pid)?.events.some((e) => LEDGER_KINDS[e[1]] === 'buy-in'), `${yes.status}`);
    }
    const passC = C.pass;
    r = await action(A, {type: 'unban', pid: C.pid});
    check('a guest cannot let anyone back in: 403 not_host', r.status === 403 && r.body?.error === 'not_host');
    r = await hostOp(host, {op: 'kick', pid: C.pid});
    doc = await roomDoc();
    const rowC = doc.players.find((p) => p.pid === C.pid);
    check('the host removes C: off the table, named in removed, peopleV moved on', r.status === 200 && !r.body.seats.some((s) => s?.pid === C.pid)
        && r.body.removed.includes(C.pid) && r.body.peopleV === pvJoined + 1 && r.body.people[C.pid]?.name === 'Cleo');
    check('…C\'s row banned and C\'s guest key on the room\'s list, the chips cashed out as removed', rowC?.banned === true
        && doc.bannedKeys?.includes(`g:${rowC.guestId}`)
        && doc.state.ledger.find((l) => l.pid === C.pid).events.some((e) => LEDGER_KINDS[e[1]] === 'removed'));
    r = await join(C, {name: 'Cleo'});
    check('C\'s join is refused: 403 banned', r.status === 403 && r.body?.error === 'banned', `${r.status} ${r.text}`);
    r = await getState(C, {headers: {'x-pn-pass': passC}});
    check('…and so is C\'s poll, seat pass and all', r.status === 403 && r.body?.error === 'banned', `${r.status}`);
    r = await action(C, {type: 'sit', seat: doc.state.seats.findIndex((s) => s === null), buyIn: DEFAULT_CONFIG.buyInMax});
    check('…and C\'s move to sit again', r.status === 403 && r.body?.error === 'banned' && !(await roomDoc()).state.seats.some((s) => s?.pid === C.pid), `${r.status}`);
    r = await action(host, {type: 'unban', pid: C.pid});
    doc = await roomDoc();
    check('the host lets C back in: the row and the list cleared, peopleV moved on', r.status === 200 && r.body.removed.length === 0
        && r.body.peopleV === pvJoined + 2 && !doc.players.find((p) => p.pid === C.pid).banned && (doc.bannedKeys ?? []).length === 0);
    r = await join(C, {name: 'Cleo'});
    check('…and C joins again as the row it was', r.status === 200 && r.body?.me?.pid === C.pid && r.body.me.role === 'seated' && r.body.outcome === 'seated', `${r.status} ${r.text.slice(0, 120)}`);

    // --- a seat race, renames, a watcher, a leave ------------------------------------------------------
    const D = await newPlayer('D');
    const E = await newPlayer('E');
    doc = await roomDoc();
    const free = doc.state.seats.findIndex((s, i) => i > 0 && s === null);
    const [jd, je] = await Promise.all([join(D, {name: 'Ana', seat: free}, {pace: false}), join(E, {name: 'Dealer', seat: free}, {pace: false})]);
    check('two guests race for one seat: one sits there, the other is moved to the next free one',
        [jd, je].map((q) => q.body?.outcome).sort().join(',') === 'moved,seated' && new Set([jd.body?.me?.seat, je.body?.me?.seat]).size === 2
        && [jd, je].some((q) => q.body?.me?.seat === free), `${jd.body?.outcome}@${jd.body?.me?.seat} ${je.body?.outcome}@${je.body?.me?.seat}`);
    check('a name taken at the table, and a reserved one, are renamed', jd.body?.renamed && jd.body.renamed !== 'Ana' && je.body?.renamed && je.body.renamed !== 'Dealer',
        `${jd.body?.renamed} / ${je.body?.renamed}`);
    for (const p of [D, E]) await hostOp(host, {op: 'approve', pid: p.pid});
    r = await action(D, {type: 'leave'});
    doc = await roomDoc();
    check('D leaves between hands: cashed out at once', r.status === 200 && r.body.me.seat === null
        && doc.state.ledger.find((l) => l.pid === D.pid).events.some((e) => LEDGER_KINDS[e[1]] === 'cash-out'));
    const F = await newPlayer('F');
    r = await join(F, {name: 'Finn', as: 'watcher'});
    check('a guest may only watch', r.status === 200 && r.body?.outcome === 'watching' && r.body.me.role === 'watching' && r.body.me.seat === null);
    {
        // A browser with no cookie taps twice: both requests carry the one joinId it made.
        const G = await newPlayer('G');
        const rowsBefore = (await roomDoc()).players.length;
        const body = {joinId: randomUUID(), name: 'Gus', avatar: AVATARS.F, as: 'watcher'};
        const [g1, g2] = await Promise.all([post(G, 'join', body, {pace: false}), post(G, 'join', body, {pace: false})]);
        const doc2 = await roomDoc();
        check('a double tap on join with no cookie: one guest, one row', g1.status === 200 && g2.status === 200 && g1.body?.me?.pid === g2.body?.me?.pid
            && [g1, g2].map((q) => q.body?.outcome).sort().join(',') === 'returning,watching' && doc2.players.length === rowsBefore + 1,
            `${g1.status}/${g2.status} ${g1.body?.outcome}/${g2.body?.outcome} rows ${doc2.players.length - rowsBefore}`);
        // Its answer lost, the same browser sends the join again with no cookie: the same guest.
        const G2 = await newPlayer('G');
        const g3 = await post(G2, 'join', body);
        const cookieOf = async (q) => (await q.context.cookies(BASE)).find((c) => c.name === COOKIE)?.value.split('.')[1];
        check('…and a retry after a lost answer is that guest again, cookie and row', g3.status === 200 && g3.body?.outcome === 'returning'
            && g3.body.me.pid === g1.body?.me?.pid && (await roomDoc()).players.length === rowsBefore + 1 && (await cookieOf(G2)) === (await cookieOf(G)),
            `${g3.status} ${g3.body?.outcome}`);
    }
    check('every guest is still no better-auth user', await db.collection('user').countDocuments() === userCount
        && await db.collection('session').countDocuments() === sessionCount);

    // --- emotes (P6): seated players only, throwables as the host sets them, a 1.2 s cooldown -----------
    {
        doc = await roomDoc();
        const seq0 = doc.seq;
        const e0 = doc.emoteSeq ?? 0;
        r = await post(A, 'emote', {kind: 'react', item: 'laugh'});
        check('a seated guest reacts: answered with the emote as stored, its seq the room\'s next', r.status === 200 && r.body?.ok === true
            && r.body.emote?.kind === 'react' && r.body.emote.item === 'laugh' && r.body.emote.from === A.pid && r.body.emoteSeq === e0 + 1 && r.body.emote.seq === e0 + 1,
            `${r.status} ${r.text.slice(0, 160)}`);
        r = await post(A, 'emote', {kind: 'say', item: 'gg'});
        check('a second one inside the 1.2 s cooldown: 429 rate_limited, nothing written', r.status === 429 && r.body?.error === 'rate_limited'
            && (await roomDoc()).emoteSeq === e0 + 1, `${r.status} ${r.text.slice(0, 120)}`);
        r = await post(B, 'emote', {kind: 'throw', item: 'tomato', to: A.pid});
        doc = await roomDoc();
        check('B throws a tomato at A: counted for the night summary, thrown by B and received by A', r.status === 200 && r.body?.emote?.to === A.pid
            && doc.awards?.[B.pid]?.thrown?.tomato === 1 && doc.awards?.[A.pid]?.received?.tomato === 1 && doc.emoteSeq === e0 + 2,
            `${r.status} ${JSON.stringify(doc.awards ?? null)}`);
        check('…out of band: the game\'s seq never moved, the cooldown stamps kept off every answer', doc.seq === seq0 && typeof doc.emoteAt?.[A.pid] === 'number'
            && !r.text.includes('emoteAt') && !r.text.includes('awards'));
        r = await getState(B, {query: `?since=${pubSeq(doc)}&esince=${e0}`});
        check('a poll from before them brings both, in order', r.status === 200 && r.body?.unchanged === true
            && r.body.emotes.map((e) => `${e.seq}:${e.kind}`).join(',') === `${e0 + 1}:react,${e0 + 2}:throw`, `${r.status} ${r.text.slice(0, 200)}`);
        r = await post(F, 'emote', {kind: 'react', item: 'clap'});
        check('a watcher sends none: 409 not_seated', r.status === 409 && r.body?.error === 'not_seated', `${r.status}`);
        r = await post(C, 'emote', {kind: 'throw', item: 'egg', to: C.pid});
        check('…nobody throws at themselves: 422', r.status === 422 && r.body?.error === 'invalid_action', `${r.status}`);
        r = await post(C, 'emote', {kind: 'throw', item: 'egg', to: F.pid});
        check('…or at a watcher: 422', r.status === 422 && r.body?.error === 'invalid_action', `${r.status}`);
        r = await post(C, 'emote', {kind: 'say', item: 'Free text here'});
        check('…and free text is no emote: 400', r.status === 400 && r.body?.error === 'bad_request', `${r.status}`);
        r = await hostOp(host, {op: 'settings', patch: {throwables: false}});
        check('the host turns throwables off', r.status === 200 && r.body?.settings?.throwables === false, `${r.status}`);
        r = await post(C, 'emote', {kind: 'throw', item: 'egg', to: A.pid});
        check('…and a throw is 403 forbidden', r.status === 403 && r.body?.error === 'forbidden', `${r.status} ${r.text.slice(0, 120)}`);
        r = await post(C, 'emote', {kind: 'say', item: 'good-luck'});
        check('…while a phrase still goes', r.status === 200 && r.body?.emote?.kind === 'say' && (await roomDoc()).emoteSeq === e0 + 3, `${r.status}`);
        r = await hostOp(host, {op: 'settings', patch: {throwables: true}});
        check('…and back on', r.status === 200 && r.body?.settings?.throwables === true);
    }

    // --- history, the log, the bank ---------------------------------------------------------------------
    r = await call(A, 'GET', 'detail', {query: '?part=history'});
    check('history: the three hands, newest first, a hole only where shown or A\'s own', r.status === 200 && r.body?.hands?.map((h) => h.no).join(',') === '3,2,1',
        r.body?.hands?.map((h) => h.no).join(','));
    r = await call(B, 'GET', 'detail', {query: '?part=log'});
    doc = await roomDoc();
    check('the current hand\'s whole log', r.status === 200 && r.body?.hand === 3 && r.body.log.length === doc.state.hand.log.length);
    r = await call(B, 'GET', 'detail', {query: '?part=log&hand=1'});
    const row1 = await db.collection('pokerhands').findOne({env: ENV, roomId, handNo: 1});
    check('…and an earlier hand\'s, from history', r.status === 200 && r.body?.hand === 1 && r.body.log.length === row1.summary.log.length);
    r = await call(B, 'GET', 'detail', {query: '?part=everything'});
    check('…an unknown part: 400', r.status === 400 && r.body?.error === 'bad_request');

    // --- a state a newer deploy wrote -----------------------------------------------------------------------
    {
        const v = (await roomDoc()).state.v;
        await editRoom({'state.v': STATE_VERSION + 1});
        r = await getState(A);
        check('a state a newer deploy wrote: a poll answers 426 reload, never closed', r.status === 426 && r.body?.error === 'reload', `${r.status} ${r.text}`);
        r = await call(A, 'GET', 'detail', {query: '?part=bank'});
        check('…and so does a drawer', r.status === 426 && r.body?.error === 'reload', `${r.status} ${r.text}`);
        r = await action(A, {type: 'profile', name: 'Ana'});
        check('…and a move', r.status === 426 && r.body?.error === 'reload', `${r.status} ${r.text}`);
        const untouched = await roomDoc();
        check('…and the table is left open, as it was', untouched.status !== 'closed' && untouched.state.v === STATE_VERSION + 1);
        await editRoom({'state.v': v});
        r = await getState(A);
        check('…until this deploy can read it again', r.status === 200 && r.body?.me?.pid === A.pid, `${r.status}`);
    }

    // --- environments, unknown codes, indexes, counters ---------------------------------------------------
    const preview = await insertRoom({env: 'preview', at: Date.now(), host: {userId: hostUserId, name: 'QA host', avatar: AVATARS.host}});
    check('a room inserted for preview is stored under preview', (await rooms.findOne({code: preview.core.code, env: 'preview'}))?.env === 'preview');
    r = await getState(A, {at: preview.core.code, usePass: false});
    check('…and is not found from this deploy (development)', r.status === 404 && r.body?.error === 'not_found', `${r.status}`);
    r = await join(F, {name: 'Finn'}, {at: preview.core.code});
    check('…not even to join', r.status === 404 && r.body?.error === 'not_found');
    const unknown = code === 'ZZZZZZ' ? 'YYYYYY' : 'ZZZZZZ';
    r = await getState(A, {at: unknown, usePass: false});
    check('an unknown code: 404', r.status === 404 && r.body?.error === 'not_found');
    {
        // Every route spends the address's miss counter on an unknown code: a move and a tick too.
        const prober = {'x-forwarded-for': '10.9.9.9'};
        const misses = async () => (await limits.findOne({key: `poker-night:${ENV}:miss:ip:10.9.9.9`}))?.count ?? 0;
        r = await action(A, {type: 'profile', name: 'Ana'}, {at: unknown, headers: prober});
        const afterAction = await misses();
        r = await call(A, 'POST', 'tick', {data: {}, at: unknown, headers: prober});
        check('an unknown code on POST action and on a seat-passed POST tick: 404, each spending a miss', r.status === 404 && afterAction === 1 && await misses() === 2,
            `${r.status} misses ${afterAction}, ${await misses()}`);
    }
    {
        // Twenty-five requests with no identity from a seated player's address drain that address's
        // POST bucket; the seated player's own pass keeps their bucket theirs.
        const shared = {'x-forwarded-for': '10.7.7.7'};
        const junk = await Promise.all(Array.from({length: 25}, () => post(stranger, 'action', {actionId: randomUUID(), type: 'sit-in'}, {headers: shared, pace: false})));
        const statuses = junk.map((q) => q.status);
        check('a burst with no identity from one address: refused 401, then 429 once its bucket is empty',
            statuses.every((st) => st === 401 || st === 429) && statuses.includes(429), [...new Set(statuses)].join(','));
        // At once, while the address's bucket is still empty: the seated player and more of the same.
        const [mine, ...more] = await Promise.all([
            action(A, {type: 'profile', name: 'Ana'}, {headers: shared, pace: false}),
            ...Array.from({length: 5}, () => post(stranger, 'action', {actionId: randomUUID(), type: 'sit-in'}, {headers: shared, pace: false})),
        ]);
        check('…while a seated player on that address, with a seat pass, still acts', mine.status === 200 && mine.body?.me?.pid === A.pid,
            `${mine.status} ${mine.text.slice(0, 80)}`);
        check('…though the address\'s own bucket is still empty', more.some((q) => q.status === 429), more.map((q) => q.status).join(','));
    }
    {
        // The room's join counter counts rows joins made, so joins a locked table turns down — from
        // as many addresses as anyone likes — never use it up to keep friends out; each still spends
        // its own address's.
        const roomJoins = async () => (await limits.findOne({key: `poker-night:${ENV}:join:room:${roomId}`}))?.count ?? 0;
        const ipJoins = async (ip) => (await limits.findOne({key: `poker-night:${ENV}:join:ip:${ip}`}))?.count ?? 0;
        r = await hostOp(host, {op: 'settings', patch: {locked: true}});
        const locked = r.status === 200 && r.body?.settings?.locked === true;
        const counted = await roomJoins();
        const refused = [];
        for (const ip of ['10.5.5.1', '10.5.5.2', '10.5.5.3']) {
            const knocker = await newPlayer(`knocker ${ip}`);
            refused.push(await join(knocker, {name: '', avatar: AVATARS.F, as: 'watcher'}, {headers: {'x-forwarded-for': ip}}));
        }
        await sleep(500);
        const roomAfter = await roomJoins();
        const ipsAfter = await Promise.all(['10.5.5.1', '10.5.5.2', '10.5.5.3'].map(ipJoins));
        r = await hostOp(host, {op: 'settings', patch: {locked: false}});
        check('joins a locked table turns down spend each address\'s join counter and never the room\'s',
            locked && refused.every((q) => q.status === 403 && q.body?.error === 'locked') && counted > 0 && roomAfter === counted && ipsAfter.every((n) => n === 1)
            && r.status === 200 && r.body?.settings?.locked === false,
            `${locked} ${refused.map((q) => `${q.status} ${q.body?.error}`).join(', ')}; room ${counted} → ${roomAfter}; addresses ${ipsAfter.join(',')}`);
    }
    const keys = (await limits.find({key: /^poker-night:/}).toArray()).map((k) => k.key);
    check('every poker night counter is keyed by the env: joins per address and room, misses per address',
        keys.length > 0 && keys.every((k) => k.startsWith(`poker-night:${ENV}:`)) && keys.some((k) => k.includes(':join:ip:'))
        && keys.some((k) => k.includes(`:join:room:${roomId}`)) && keys.some((k) => k.includes(':miss:ip:')), keys.join(', '));
    await Promise.all(models.map((m) => m.init()));
    const indexes = (await Promise.all(['pokerrooms', 'pokerhands', 'pokerresults'].map(async (c) => (await db.collection(c).indexes()).map((ix) => ({c, ...ix}))))).flat();
    const unscoped = indexes.filter((ix) => ix.name !== '_id_' && ix.expireAfterSeconds === undefined && Object.keys(ix.key)[0] !== 'env');
    check('every poker night index leads with env (but _id and the TTLs)', unscoped.length === 0 && indexes.length >= 8, unscoped.map((ix) => `${ix.c}.${ix.name}`).join(', '));

    // --- a burst of polls: the in-memory bucket, no Mongo writes -------------------------------------------
    {
        const seq = pubSeq(await roomDoc());
        await getState(A, {usePass: false}); // a fresh pass: the bucket is the player's own
        // The player's bucket full again (15, refilling 3 a second) whatever the steps before spent: on a
        // fast server they run close enough together to leave it short.
        await sleep(5500);
        const ops = async () => {
            const {opcounters} = await db.admin().serverStatus();
            return Number(opcounters.insert) + Number(opcounters.update) + Number(opcounters.delete);
        };
        const writesBefore = await ops();
        const statuses = [];
        const t0 = Date.now();
        for (let i = 0; i < 200; i += 20) {
            const batch = await Promise.all(Array.from({length: 20}, () => call(A, 'GET', 'state', {query: `?since=${seq}&esince=0`, check: false})));
            statuses.push(...batch.map((q) => q.status));
        }
        const seconds = (Date.now() - t0) / 1000;
        const writes = (await ops()) - writesBefore;
        const limited = statuses.filter((s) => s === 429).length;
        const served = statuses.filter((s) => s === 200).length;
        // A full bucket (15) and its refill (3 a second) over the run, no more.
        check('200 tight polls: the bucket serves its burst and refill, and answers the rest 429', limited + served === 200 && served >= 15
            && served <= 15 + Math.ceil(3 * seconds) + 1, `${limited} × 429, ${served} × 200 in ${seconds.toFixed(1)} s`);
        check('…without a Mongo write', writes <= 2, `${writes} writes`);
        await sleep(5500); // A's bucket refills
    }

    // --- the night ends ---------------------------------------------------------------------------------
    r = await hostOp(host, {op: 'end'});
    check('the host ends the night: closed', r.status === 200 && r.body?.status === 'closed');
    doc = await roomDoc();
    check('…everyone cashed out, chips conserved', doc.status === 'closed' && doc.state.seats.every((s) => s === null)
        && conservation(doc.state).ok && conservation(doc.state).cashedOut === conservation(doc.state).bought);
    check('…kept seven days past the close', Math.abs(doc.expiresAt.getTime() - doc.closedAt.getTime() - TIMING.ROOM_TTL_MS) < 1000);
    r = await getState(A);
    check('a closed table answers 410', r.status === 410 && r.body?.error === 'closed');
    {
        let hostRow = null;
        for (let i = 0; i < 25 && !hostRow?.closed; i++) {
            await sleep(200);
            hostRow = await results.findOne({env: ENV, roomId, userId: hostUserId});
        }
        const ledger = doc.state.ledger.find((l) => l.pid === host.pid);
        check('the host\'s result row: closed, its net the ledger\'s', hostRow?.closed === true && hostRow.net === ledger.cashedOut - ledger.bought
            && hostRow.hands === ledger.hands && hostRow.seq === pubSeq(doc), JSON.stringify(hostRow && {net: hostRow.net, hands: hostRow.hands, seq: hostRow.seq}));
        check('…the only result row: guests have none', await results.countDocuments({roomId}) === 1);
        check('three hands in history, under the env', await db.collection('pokerhands').countDocuments({roomId, env: ENV}) === 3);
    }

    // --- what every response held to --------------------------------------------------------------------
    check(`no response carried the deck, an identity or another seat's unshown hole (${responsesChecked} checked)`, leaks.length === 0 && responsesChecked > 60,
        leaks.slice(0, 5).join(' | '));
    const copyFor = [...errorCodes.keys()].map((c) => [c, POKER_NIGHT_ERRORS[c]]);
    check('every code the API answered with has its sentence', copyFor.every(([, s]) => typeof s === 'string' && s.length > 0),
        copyFor.map(([c]) => c).join(', '));
    const outcomeCopy = {seated: JOIN_COPY.seated, moved: JOIN_COPY.seatTaken, full: JOIN_COPY.full, watching: JOIN_COPY.watching};
    const sentences = [
        ...copyFor.map(([, s]) => s ?? ''),
        ...[...outcomes].filter((o) => o !== 'returning').map((o) => outcomeCopy[o] ?? `missing copy for ${o}`),
        ...[...renames].map((n) => JOIN_COPY.renamed(n)),
    ];
    const banned = sentences.flatMap((s) => findBanned(s).map((hit) => `${hit} in "${s}"`));
    check(`the no-advice list over every sentence behind them (${sentences.length})`, banned.length === 0, banned.join(' | '));
    check('no page error', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));
} catch (err) {
    check(`threw: ${err.message}`, false, err.stack?.split('\n').slice(1, 4).join(' '));
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// The table in a browser (P3)
// ═══════════════════════════════════════════════════════════════════════════════════════════════

// Every data-anim a page ever showed, and how each chip flight was styled the moment it appeared:
// an init script, so nothing that comes and goes between two looks is missed.
const ANIM_PROBE = () => {
    const seen = {anims: [], flights: []};
    window.__pnSeen = seen;
    const record = (node) => {
        if (!(node instanceof Element)) return;
        const found = node.matches('[data-anim]') ? [node, ...node.querySelectorAll('[data-anim]')] : [...node.querySelectorAll('[data-anim]')];
        for (const el of found) {
            const anim = el.getAttribute('data-anim');
            if (anim && !seen.anims.includes(anim)) seen.anims.push(anim);
            if (el.classList.contains('pn-fly') && seen.flights.length < 400) {
                const style = getComputedStyle(el);
                seen.flights.push({anim, name: style.animationName, opacity: style.opacity});
            }
        }
    };
    new MutationObserver((records) => {
        for (const r of records) {
            if (r.type === 'attributes') record(r.target);
            else r.addedNodes.forEach(record);
        }
    }).observe(document, {subtree: true, childList: true, attributes: true, attributeFilter: ['data-anim']});
};

// Every Web Audio source a page starts, by kind (window.__pnAudio): the table's tones are
// oscillators, its swishes and splats slices of a noise buffer (components/poker-night/sound-player).
// An init script, so it counts from the page's first sound; the real start runs after the count.
// OscillatorNode inherits start from AudioScheduledSourceNode, looked up at each call (a later patch
// of that prototype still sees it); AudioBufferSourceNode has its own.
const AUDIO_PROBE = () => {
    const counts = {osc: 0, buffer: 0};
    window.__pnAudio = counts;
    if (window.OscillatorNode && window.AudioScheduledSourceNode) {
        Object.defineProperty(OscillatorNode.prototype, 'start', {
            configurable: true, writable: true,
            value(...args) {
                counts.osc++;
                return AudioScheduledSourceNode.prototype.start.apply(this, args);
            },
        });
    }
    if (window.AudioBufferSourceNode) {
        const start = AudioBufferSourceNode.prototype.start;
        Object.defineProperty(AudioBufferSourceNode.prototype, 'start', {
            configurable: true, writable: true,
            value(...args) {
                counts.buffer++;
                return start.apply(this, args);
            },
        });
    }
};

// Every AudioContext a page makes (window.__pnContexts) and every make or resume of one, with
// whether the page had a user's activation at that moment (window.__pnAudioLog) — so a test can
// tell a context woken inside a real gesture from one made on a touch's pointerdown, which is no
// gesture to a browser (and which iOS never lets start).
const AUDIO_GESTURE_PROBE = () => {
    const made = [];
    const log = [];
    window.__pnContexts = made;
    window.__pnAudioLog = log;
    const Base = window.AudioContext;
    if (!Base) return;
    const active = () => (navigator.userActivation ? navigator.userActivation.isActive : null);
    window.AudioContext = class extends Base {
        constructor(...args) {
            super(...args);
            made.push(this);
            log.push({op: 'make', active: active(), state: this.state});
        }
    };
    const resume = Base.prototype.resume;
    Base.prototype.resume = function (...args) {
        log.push({op: 'resume', active: active(), state: this.state});
        return resume.apply(this, args);
    };
};

// The pitch every oscillator a page starts begins at (window.__pnTones): the table's recipes start
// each tone with frequency.setValueAtTime (lib/poker-night/sounds), so a pop is a 600 Hz start.
const TONE_PROBE = () => {
    window.__pnTones = [];
    const proto = window.BaseAudioContext?.prototype;
    if (!proto || proto.__pnTones) return;
    const make = proto.createOscillator;
    proto.createOscillator = function (...args) {
        const osc = make.apply(this, args);
        const set = osc.frequency.setValueAtTime.bind(osc.frequency);
        osc.frequency.setValueAtTime = (value, at) => {
            osc.__pnHz ??= value;
            return set(value, at);
        };
        const start = osc.start.bind(osc);
        osc.start = (...a) => {
            window.__pnTones.push(osc.__pnHz ?? null);
            return start(...a);
        };
        return osc;
    };
    proto.__pnTones = true;
};

// The realtime page's channel: window.__PN_RT_FAKE__ as components/poker-night/realtime-client takes
// it ({subscribe({onState, onConnection}) → stop}), connected a moment after the link subscribes, as
// Ably's attach would be. window.__pnRelay is the script's side: deliver(data) hands a message to the
// link, and the table root's data-pn-seq, -transport and -mode are recorded at every change.
const RELAY_PROBE = () => {
    const relay = {handlers: null, subscribes: 0, stops: 0, delivered: 0, seqs: [], transports: [], modes: []};
    window.__pnRelay = relay;
    relay.deliver = (data) => {
        if (!relay.handlers) return false;
        relay.delivered++;
        relay.handlers.onState(data);
        return true;
    };
    window.__PN_RT_FAKE__ = {
        subscribe: (handlers) => {
            relay.handlers = handlers;
            relay.subscribes++;
            setTimeout(() => {
                if (relay.handlers !== handlers) return;
                handlers.onConnection('connecting');
                handlers.onConnection('connected');
            }, 50);
            return () => {
                relay.stops++;
                if (relay.handlers === handlers) relay.handlers = null;
            };
        },
    };
    const look = () => {
        const root = document.querySelector('[data-pn-seq]');
        if (!root) return;
        const seq = Number(root.getAttribute('data-pn-seq'));
        if (relay.seqs[relay.seqs.length - 1] !== seq) relay.seqs.push(seq);
        const transport = root.getAttribute('data-pn-transport');
        if (relay.transports[relay.transports.length - 1]?.[1] !== transport) relay.transports.push([Date.now(), transport]);
        const mode = root.getAttribute('data-pn-mode');
        if (relay.modes[relay.modes.length - 1]?.[1] !== mode) relay.modes.push([Date.now(), mode]);
    };
    new MutationObserver(look).observe(document, {
        subtree: true, childList: true, attributes: true, attributeFilter: ['data-pn-seq', 'data-pn-transport', 'data-pn-mode'],
    });
};

// The page's visible words, players' and tables' names left out (they are [data-user-text]).
const visibleWords = (page) => page.evaluate(() => {
    const style = document.createElement('style');
    style.textContent = '[data-user-text] { display: none !important; }';
    document.head.append(style);
    const text = document.body.innerText;
    style.remove();
    return text;
});
const uiWording = async (page, where) => {
    const text = await visibleWords(page);
    const hits = findBanned(text);
    check(`the no-advice list over ${where}`, hits.length === 0 && text.trim().length > 0, hits.length > 0 ? hits.join(', ') : `${text.length} characters`);
};

// A moment first, so a panel or a drawer that has just opened is in its place, not fading in.
const uiShot = async (page, name) => {
    await sleep(500);
    await hideDevIndicator(page);
    await page.screenshot({path: `${OUT}ui-${name}.png`});
};
// The screen at 1440 px, then narrowed to 390 for a second picture and widened back.
const uiShotBoth = async (page, name) => {
    await uiShot(page, `${name}-1440`);
    const size = page.viewportSize();
    await page.setViewportSize({width: 390, height: 844});
    await sleep(700);
    await uiShot(page, `${name}-390`);
    await page.setViewportSize(size);
    await sleep(500);
};

// The phone layout: every seat's plate on screen and none on another, the action bar on screen,
// every button at least 44 × 44, no sideways scroll.
const tableLayout = (page) => page.evaluate(() => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const box = (el) => el.getBoundingClientRect();
    const inside = (r) => r.left >= -1 && r.right <= vw + 1 && r.top >= -1 && r.bottom <= vh + 1;
    const plates = [...document.querySelectorAll('[data-seat] .pn-plate')].map(box);
    let overlaps = 0;
    for (let i = 0; i < plates.length; i++) {
        for (let j = i + 1; j < plates.length; j++) {
            const a = plates[i];
            const b = plates[j];
            if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) overlaps++;
        }
    }
    const bar = document.querySelector('[data-pn-actions]');
    const small = [...document.querySelectorAll('main button')].filter((b) => {
        const r = box(b);
        return r.width > 0 && r.height > 0 && getComputedStyle(b).visibility !== 'hidden' && (r.width < 43.5 || r.height < 43.5);
    }).map((b) => `${(b.getAttribute('aria-label') ?? b.textContent ?? '').trim().slice(0, 24)} ${Math.round(box(b).width)}×${Math.round(box(b).height)}`);
    // A name of up to nine characters is never cut short; a flag, a blind's mark or an open seat's
    // label is never under 10 px.
    const cut = [...document.querySelectorAll('[data-seat] .pn-plate-name')]
        .filter((n) => (n.textContent ?? '').length <= 9 && n.scrollWidth > n.clientWidth + 1).map((n) => n.textContent);
    const tiny = [...document.querySelectorAll('.pn-plate-flag, .pn-blind, .pn-open-seat')]
        .filter((el) => parseFloat(getComputedStyle(el).fontSize) < 10).map((el) => `${el.className} ${getComputedStyle(el).fontSize}`);
    return {
        plates: plates.length, outside: plates.filter((r) => !inside(r)).length, overlaps,
        bar: bar ? inside(box(bar)) : null, small, scroll: document.documentElement.scrollWidth - vw, cut, tiny,
    };
});
const layoutOk = (m, seats) => m.plates === seats && m.outside === 0 && m.overlaps === 0 && m.bar === true && m.small.length === 0 && m.scroll <= 0
    && m.cut.length === 0 && m.tiny.length === 0;

// The raise panel open on a phone: inside the screen, and never over the viewer's own cards or the
// seconds they have left.
const raiseLayout = (page) => page.evaluate(() => {
    const rect = (sel) => {
        const el = document.querySelector(sel);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0 ? r : null;
    };
    const hit = (a, b) => a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1;
    const panel = rect('[data-pn-raise]');
    const hole = rect('[data-pn-hole]');
    const clock = rect('[data-pn-clock]');
    return {
        panel: panel !== null,
        inside: panel !== null && panel.left >= -1 && panel.right <= window.innerWidth + 1 && panel.top >= -1 && panel.bottom <= window.innerHeight + 1,
        hole: hole !== null, clock: clock !== null,
        overHole: panel !== null && hole !== null && hit(panel, hole),
        overClock: panel !== null && clock !== null && hit(panel, clock),
    };
});
const raiseOk = (m) => m.panel && m.inside && m.hole && m.clock && !m.overHole && !m.overClock;

// What a result covers that it must not: a shown hand over any plate's name or stack, the banner
// over the line under the board (the next deal's countdown, the pause).
const coverage = (page) => page.evaluate(() => {
    const hit = (a, b) => a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1;
    const words = [...document.querySelectorAll('[data-seat] :is(.pn-plate-name, .pn-plate-stack)')]
        .map((el) => ({el, seat: el.closest('[data-seat]').getAttribute('data-seat'), r: el.getBoundingClientRect()}))
        .filter((w) => w.r.width > 0);
    const covered = [];
    const shown = [...document.querySelectorAll('[data-seat] .pn-seat-shown')];
    for (const cards of shown) {
        const r = cards.getBoundingClientRect();
        const owner = cards.closest('[data-seat]').getAttribute('data-seat');
        for (const w of words) if (hit(r, w.r)) covered.push(`seat ${owner}'s cards over seat ${w.seat}'s ${w.el.className.includes('name') ? 'name' : 'stack'}`);
    }
    const banner = document.querySelector('[data-pn-banner]')?.getBoundingClientRect() ?? null;
    let notes = 0;
    for (const el of document.querySelectorAll('[data-pn-note], [data-pn-next-hand]')) {
        notes++;
        if (banner && hit(banner, el.getBoundingClientRect())) covered.push(`the banner over "${el.textContent}"`);
    }
    return {shown: shown.length, notes, covered};
});

// The winner's banner and the line under it (the countdown, the pause) as drawn, against everything
// they must never cover (lib/poker-night/stage.bannerPlan): every seat's plate or open seat's ring and
// its status flag, every turned-up hand and each of its cards as lifted, the dealer button and every
// board card as lifted (the five that play rise). Also how many turned-up hands sit at a side seat,
// so a run proves the crowded case, and the banner's variant.
const bannerClear = (page) => page.evaluate(() => {
    const hit = (a, b) => a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;
    const rect = (el) => el.getBoundingClientRect();
    const seatOf = (el) => el.closest('[data-seat]')?.getAttribute('data-seat') ?? '?';
    const avoid = [
        ...[...document.querySelectorAll('[data-seat] :is(.pn-plate, .pn-open-seat)')].map((el) => ({what: `seat ${seatOf(el)}'s ${el.classList.contains('pn-plate') ? 'plate' : 'open seat'}`, r: rect(el)})),
        ...[...document.querySelectorAll('[data-seat] .pn-plate-flag')].map((el) => ({what: `seat ${seatOf(el)}'s flag`, r: rect(el)})),
        ...[...document.querySelectorAll('[data-seat] .pn-seat-shown, [data-seat] .pn-seat-shown .pn-card-inner')].map((el) => ({what: `seat ${seatOf(el)}'s shown hand`, r: rect(el)})),
        ...[...document.querySelectorAll('[data-pn-dealer]')].map((el) => ({what: 'the dealer button', r: rect(el)})),
        ...[...document.querySelectorAll('[data-pn-board] .pn-card, [data-pn-board] .pn-card-inner')].map((el) => ({
            what: `the board's ${el.closest('.pn-card')?.getAttribute('data-card')}${el.closest('.pn-card')?.getAttribute('data-state') === 'win' ? ' (lit)' : ''}`, r: rect(el),
        })),
    ].filter((o) => o.r.width > 0 && o.r.height > 0);
    const pieces = [
        ...[...document.querySelectorAll('[data-pn-banner]')].map((el) => ({what: 'the banner', r: rect(el)})),
        ...[...document.querySelectorAll('[data-pn-banner-place="note"] > *')].map((el) => ({what: `the line "${el.textContent}"`, r: rect(el)})),
    ];
    const table = document.querySelector('.pn-table')?.getBoundingClientRect();
    const covered = [];
    for (const p of pieces) {
        for (const o of avoid) if (hit(p.r, o.r)) covered.push(`${p.what} over ${o.what}`);
        if (table && (p.r.left < table.left - 0.5 || p.r.right > table.right + 0.5 || p.r.top < table.top - 0.5 || p.r.bottom > table.bottom + 0.5)) covered.push(`${p.what} off the table`);
    }
    return {
        banner: pieces.filter((p) => p.what === 'the banner').length,
        lines: pieces.length - pieces.filter((p) => p.what === 'the banner').length,
        variant: document.querySelector('[data-pn-banner]')?.getAttribute('data-variant') ?? null,
        sideShown: document.querySelectorAll('[data-seat]:is([data-side="left"], [data-side="right"]) .pn-seat-shown').length,
        shown: document.querySelectorAll('[data-seat] .pn-seat-shown').length,
        dealer: document.querySelectorAll('[data-pn-dealer]').length,
        covered,
    };
});

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
// Every two-number list in a JSON text that could be a hole, by the key it sits under.
const pairsIn = (text) => [...text.matchAll(/(?:"(\w+)":)?\[(\d{1,2}),(\d{1,2})\]/g)]
    .filter((m) => !NOT_CARDS.has(m[1]))
    .map((m) => [Number(m[2]), Number(m[3])]);

// ── the looks (P5) ──
// "#1f4d2b" as getComputedStyle prints a colour.
const rgbOf = (hex) => {
    const n = parseInt(hex.slice(1), 16);
    return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
};
// A page's room as the looks draw it: the ids on the room (the host's scene and felt, the viewer's
// card back and suit colours), the scene layer and the felt drawn, the custom properties LOOKS_CSS
// gives the room, and the colours a drawn card back and a club or diamond actually got.
const roomLook = (page) => page.evaluate(() => {
    const room = document.querySelector('.pn-room');
    if (!room) return null;
    const vars = getComputedStyle(room);
    const back = room.querySelector('.pn-card-back');
    const suited = (s) => {
        const face = room.querySelector(`.pn-card[data-suit="${s}"] .pn-card-face:not(.pn-card-back)`);
        return face ? getComputedStyle(face).color : null;
    };
    return {
        scene: room.getAttribute('data-pn-scene'), felt: room.getAttribute('data-pn-felt'),
        back: room.getAttribute('data-pn-back'), colours: room.getAttribute('data-pn-colours'),
        layer: room.querySelector('[data-pn-scene-layer]')?.getAttribute('data-pn-scene-layer') ?? null,
        cloth: room.querySelector('[data-pn-felt-layer]')?.getAttribute('data-pn-felt') ?? null,
        backBase: vars.getPropertyValue('--pn-back-base').trim(), suitC: vars.getPropertyValue('--pn-suit-c').trim(),
        drawnBack: back ? getComputedStyle(back).backgroundColor : null, club: suited('c'), diamond: suited('d'),
    };
});
// Waits until every page's room passes ok(roomLook); the ms each took, null for one that never did.
const lookOnAll = (pages, ok, timeout = 5000) => Promise.all(pages.map(async (page) => {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout + 2000) {
        const look = await roomLook(page).catch(() => null);
        if (look && ok(look)) return Date.now() - t0;
        await sleep(100);
    }
    return null;
}));
// What moves on a page: the style, the felt's corner, and the animation each loop runs — the plate
// on the clock (.pn-pulse) and the scene's ambient parts (.pn-ambient).
const motionOf = (page) => page.evaluate(() => {
    const names = (sel) => [...document.querySelectorAll(sel)].map((el) => getComputedStyle(el).animationName);
    const felt = document.querySelector('.pn-felt');
    return {
        style: document.documentElement.dataset.style ?? null,
        feltRadius: felt ? parseFloat(getComputedStyle(felt).borderTopLeftRadius) : null,
        pulses: names('.pn-pulse'),
        ambient: names('.pn-scene .pn-ambient'),
    };
});
// Whether the element `sel` is over seat `seat`'s plate on a page: its centre within the plate's
// width and above the plate's middle, at most 150 px above its top (a reaction rises 60 px).
// Whether an emote sits by a seat's plate: over it, or — data-below, a seat along the top or too
// near it — under it; never behind the top bar.
const overSeat = (page, sel, seat) => page.evaluate(({s, n}) => {
    const el = document.querySelector(s);
    const plate = document.querySelector(`[data-seat="${n}"] .pn-plate`);
    const bar = document.querySelector('[data-pn-topbar]');
    if (!el || !plate || !bar) return false;
    const e = el.getBoundingClientRect();
    const p = plate.getBoundingClientRect();
    const cx = e.left + e.width / 2;
    const cy = e.top + e.height / 2;
    const beside = cx >= p.left - 8 && cx <= p.right + 8;
    const near = el.hasAttribute('data-below') ? cy >= p.top + p.height / 2 && cy <= p.bottom + 170 : cy <= p.top + p.height / 2 && cy >= p.top - 170;
    return beside && near && e.top >= bar.getBoundingClientRect().bottom - 1;
}, {s: sel, n: seat});

let handWatcher = null;
// The fake relay's state while it runs (the realtime pass), so the end of the run can stop its loop.
let relay = null;

const tableInBrowser = async () => {
    const limits = db.collection('ratelimits');
    await limits.deleteMany({key: /^poker-night:/});
    dbHands.clear();
    const leaksBefore = leaks.length;
    const checkedBefore = responsesChecked;
    const users0 = await db.collection('user').countDocuments();
    const sessions0 = await db.collection('session').countDocuments();
    const ui = [];
    const uiErrors = [];
    const requested = [];
    const faceUp = [];
    const ownPairsFound = [];
    let rscType = null;

    // Every answer a page's own requests get, held to what every response is held to.
    const watchPage = (p, page) => {
        page.on('pageerror', (e) => uiErrors.push(`${p.name}: ${String(e).slice(0, 300)}`));
        page.on('request', (r) => requested.push(r.url()));
        page.on('response', async (res) => {
            try {
                const url = res.url();
                if (!code || !url.includes(`/api/poker-night/${code}/`)) return;
                let body;
                try {
                    body = await res.json();
                } catch {
                    return;
                }
                if (body?.me?.pid) {
                    p.pid = body.me.pid;
                    p.seat = body.me.seat;
                }
                if (url.includes('part=history')) {
                    responsesChecked++;
                    for (const problem of await historyCheck(p, body)) leaks.push(`${p.name} history: ${problem}`);
                } else {
                    await leakCheck(p, `page ${new URL(url).pathname.split('/').pop()}`, body, {overheard: true});
                }
            } catch (error) {
                if (db) uiErrors.push(`${p.name} response check: ${error.message}`);
            }
        });
    };
    const uiPlayer = async (name, options = {}, inits = []) => {
        const context = await newContext({viewport: {width: 1440, height: 900}, ...options});
        await context.addInitScript(ANIM_PROBE);
        for (const init of inits) await context.addInitScript(init);
        const page = await context.newPage();
        const p = {name, context, page, pid: null, seat: null, pass: null, view: null};
        watchPage(p, page);
        ui.push(p);
        return p;
    };
    // Mongo's hands, remembered every 300 ms, so an answer read a moment late still has its hand.
    handWatcher = setInterval(() => {
        roomDoc().then((d) => rememberHand(d?.state?.hand)).catch(() => {});
    }, 300);

    // The page HTML and the RSC payload a player's browser would get for the table, right now: no
    // deck, no other seat's unshown hole — and the player's own pair, so the scan is known to see one.
    const pageLeaks = async (p, label) => {
        const doc = await roomDoc();
        rememberHand(doc?.state?.hand);
        const hand = doc?.state?.hand ?? null;
        const html = await (await p.context.request.get(`${BASE}/play/${code}`, {timeout: 90000})).text();
        const rscResponse = await p.context.request.get(`${BASE}/play/${code}`, {headers: {RSC: '1'}, timeout: 90000});
        rscType ??= rscResponse.headers()['content-type'] ?? '';
        const rsc = await rscResponse.text();
        const flight = flightOf(html);
        responsesChecked += 2;
        for (const [what, text] of [['html', html], ['rsc', rsc]]) {
            if (/\\?"deck\\?"\s*:/.test(text)) leaks.push(`${p.name} ${label} ${what}: "deck"`);
        }
        if (!hand) return;
        for (const [what, text] of [['flight', flight], ['rsc', rsc]]) {
            const pairs = pairsIn(text);
            for (const seat of hand.seats) {
                const found = pairs.some((pair) => sameCards(pair, seat.hole));
                if (seat.pid === p.pid) {
                    if (found && hand.phase !== 'complete') ownPairsFound.push(`${p.name} ${what}`);
                } else if (!seat.shown && found) {
                    leaks.push(`${p.name} ${label} ${what}: seat ${seat.seat}'s hole`);
                }
            }
        }
    };

    // The other seats' cards on a player's screen, once it shows Mongo's hand: backs, before a showdown.
    const backsOnly = async (p, hand) => {
        await p.page.waitForSelector(`[data-pn-hand="${hand.no}"]`, {timeout: 15000}).catch(() => {});
        const cards = await p.page.$$eval('[data-seat]:not([data-me]) [data-card]', (els) => els.map((e) => e.getAttribute('data-card')));
        if (cards.some((c) => c !== 'back')) faceUp.push(`${p.name} hand ${hand.no} ${hand.street}: ${cards.join(' ')}`);
    };

    // ── who acts, by Mongo, and a click on their screen ──
    const ownerOfSeat = (doc, seat) => ui.find((p) => p.pid && p.pid === doc.state.seats[seat]?.pid) ?? null;
    const nextTurn = async (handNo, timeout = 45000) => {
        const t0 = Date.now();
        while (Date.now() - t0 < timeout) {
            const doc = await roomDoc();
            rememberHand(doc?.state?.hand);
            const hand = doc?.state?.hand;
            if (hand && hand.no === handNo) {
                if (hand.phase === 'complete') return {doc, actor: null};
                if (hand.phase === 'betting' && hand.actor !== null) {
                    const actor = ownerOfSeat(doc, hand.actor);
                    if (!actor) throw new Error(`hand ${handNo}: nobody here sits at seat ${hand.actor}`);
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
        } else if (move === 'raise-twice') {
            // The raise panel at its first size, its confirm double-clicked.
            await page.click('[data-pn-action="raise"]');
            await page.dblclick('[data-pn-action="confirm"]', {timeout: 5000});
        } else {
            const call = await page.locator('[data-pn-action="call"]').count() > 0;
            await page.click(call ? '[data-pn-action="call"]' : '[data-pn-action="check"]');
        }
    };
    const waitMoved = async (turn, handNo) => {
        for (let i = 0; i < 100; i++) {
            const doc = await roomDoc();
            const hand = doc.state.hand;
            if (doc.state.turn !== turn || hand?.no !== handNo || hand.phase !== 'betting') return;
            await sleep(150);
        }
        for (const p of ui) await uiShot(p.page, `stuck-${p.name}`).catch(() => {});
        throw new Error(`hand ${handNo}: the click did not move turn ${turn}`);
    };
    // Plays hand handNo to its end by clicking: each actor's move from choose(p) ('fold', else
    // check or call); onStreet once per street, after(p) after each move.
    const playByClicks = async (handNo, {choose, onStreet = async () => {}, before = async () => {}, after = async () => {}}) => {
        let street = null;
        for (let guard = 0; guard < 80; guard++) {
            const {doc, actor} = await nextTurn(handNo);
            const hand = doc.state.hand;
            if (actor && hand.street !== street) {
                street = hand.street;
                await onStreet(doc);
            }
            if (!actor) return doc;
            await before(actor, doc);
            await clickMove(actor, choose(actor, doc));
            await waitMoved(doc.state.turn, handNo);
            await after(actor, doc);
        }
        throw new Error(`hand ${handNo} did not finish`);
    };

    // The showdown on a viewer's screen, against Mongo: the winners, the shown cards, the five cards
    // that play, the banner's hand names.
    const showdownChecks = async (doc, viewer, label) => {
        const hand = doc.state.hand;
        rememberHand(hand);
        const live = hand.seats.filter((p) => !p.folded);
        const value = new Map(live.map((p) => [p.seat, evaluateCards([...boardOf(hand), ...p.hole])]));
        const expected = hand.result.pots.map((pot) => {
            const contenders = pot.eligible.length > 0 ? pot.eligible : [...value.keys()];
            const top = Math.max(...contenders.map((s) => value.get(s)));
            return contenders.filter((s) => value.get(s) === top).sort().join(',');
        });
        const paid = hand.result.pots.map((pot) => winnersOf(pot).sort().join(','));
        check(`${label}: the winners are the hands evaluateCards ranks highest over Mongo's holes and board`, hand.result.showdown === true
            && expected.join('|') === paid.join('|'), `${paid.join('|')} vs ${expected.join('|')}`);
        await viewer.page.waitForSelector(`[data-pn-hand="${hand.no}"] [data-pn-banner]`, {timeout: 30000});
        // The reveal plays out: the hands turn, the five cards lift, the banner drops in.
        await viewer.page.waitForFunction(() => {
            const banner = document.querySelector('[data-pn-banner]');
            return banner !== null && getComputedStyle(banner).opacity === '1';
        }, null, {timeout: 15000}).catch(() => {});
        await sleep(600);
        const seen = await viewer.page.evaluate(() => ({
            seats: [...document.querySelectorAll('[data-seat]:not([data-me])')].map((s) => ({
                seat: Number(s.getAttribute('data-seat')), cards: [...s.querySelectorAll('[data-card]')].map((c) => c.getAttribute('data-card')),
            })),
            lit: [...new Set([...document.querySelectorAll('[data-card][data-state="win"]')].map((c) => c.getAttribute('data-card')))],
            names: [...document.querySelectorAll('[data-pn-banner] [data-hand-name]')].map((n) => n.textContent ?? ''),
            winners: document.querySelector('[data-pn-banner]')?.getAttribute('data-pn-banner') ?? '',
        }));
        const labels = (cards) => cards.map((c) => cardLabel(c)).sort().join(' ');
        const wrong = [];
        for (const p of hand.seats) {
            if (p.pid === viewer.pid) continue;
            const shownCards = (seen.seats.find((s) => s.seat === p.seat)?.cards ?? []).filter((c) => c !== 'back');
            if (p.shown ? [...shownCards].sort().join(' ') !== labels(p.hole) : shownCards.length > 0) wrong.push(`seat ${p.seat}: ${shownCards.join(' ')}`);
        }
        check(`${label}: ${viewer.name}'s screen turns up exactly the shown hands, as Mongo dealt them`, wrong.length === 0, wrong.join(' | '));
        const winnerSeats = [...new Set(hand.result.pots.flatMap((pot) => seatShares(pot).filter((w) => w.share > 0).map((w) => w.seat)))];
        const best = new Map(winnerSeats.map((seat) => {
            const p = hand.seats.find((q) => q.seat === seat);
            return [seat, bestFive([...boardOf(hand), ...p.hole], p.hole)];
        }));
        const playing = [...new Set([...best.values()].flatMap((b) => b.cards))];
        check(`${label}: the lit cards are the winners' five cards that play`, labels(playing) === [...seen.lit].sort().join(' '),
            `${[...seen.lit].sort().join(' ')} vs ${labels(playing)}`);
        const names = winnerSeats.map((seat) => HAND_COPY.label(describeHand(best.get(seat).value)));
        check(`${label}: the banner names each winner and the hand ("${seen.names.join('", "')}")`,
            seen.winners.split(',').map(Number).sort().join() === [...winnerSeats].sort().join() && names.every((n) => seen.names.some((s) => s.startsWith(n)))
            && seen.names.length === Math.min(3, winnerSeats.length), `${seen.winners} / ${names.join(', ')}`);
        check(`${label}: chips are conserved`, conservation(doc.state).ok, JSON.stringify(conservation(doc.state)));
    };

    // ── the host, the lobby, Quick start ──
    let H;
    if (host?.context) {
        H = {name: 'uiHost', context: host.context, pid: null, seat: null, pass: null, view: null};
    } else {
        const context = await newContext({viewport: {width: 1440, height: 900}});
        H = {name: 'uiHost', context, pid: null, seat: null, pass: null, view: null};
        const page = await context.newPage();
        await signUp(page, 'pnuihost', {stay: true});
        await page.close();
    }
    await H.context.grantPermissions(['clipboard-read', 'clipboard-write'], {origin: BASE});
    await H.context.addInitScript(ANIM_PROBE);
    H.page = await H.context.newPage();
    await H.page.setViewportSize({width: 1440, height: 900});
    watchPage(H, H.page);
    ui.push(H);
    const hp = H.page;

    await hp.goto(`${BASE}/poker-night`, {waitUntil: 'load', timeout: 180000});
    await hp.waitForSelector('[data-poker-night-lobby]', {timeout: 60000});
    const tabs = await hp.$$eval('[data-section-tabs="learn"] a', (as) => as.map((a) => `${a.getAttribute('href')}${a.getAttribute('aria-current') === 'page' ? '*' : ''}`));
    check('the lobby lights Learn\'s "Poker night" tab, and only it', tabs.includes('/poker-night*') && tabs.filter((t) => t.endsWith('*')).length === 1, tabs.join(','));
    await uiWording(hp, 'the lobby');
    await uiShotBoth(hp, '01-lobby');
    await hp.goto(`${BASE}/games`, {waitUntil: 'load', timeout: 180000});
    check('/games has the poker night card', await hp.locator('[data-game-card="poker-night"]').count() === 1);

    // ── P2: the lobby's Hands tab (?tab=hands): no lobby read, Learn's tab still lit, the ten
    // rankings and the kicker pair, every example inside its row and nothing sideways on a phone ──
    await hp.goto(`${BASE}/poker-night?tab=hands`, {waitUntil: 'load', timeout: 180000});
    await hp.waitForSelector('[data-poker-night-hands]', {timeout: 60000});
    {
        const handsTab = () => hp.evaluate(() => {
            const guide = document.querySelector('[data-poker-night-hands] [data-hands-guide]');
            if (!guide) return null;
            const vw = innerWidth;
            const outside = [...guide.querySelectorAll('[data-guide-cards]')].filter((el) => {
                const r = el.getBoundingClientRect();
                const row = el.parentElement.getBoundingClientRect();
                return r.left < row.left - 0.5 || r.right > row.right + 0.5 || r.right > vw + 0.5;
            }).length;
            const viewTabs = [...document.querySelectorAll('[data-poker-night-page] > [role="tablist"] [role="tab"]')];
            return {
                cards: guide.querySelectorAll('.pn-card').length,
                rankings: guide.querySelectorAll('[data-ranking]').length,
                lifted: guide.querySelectorAll('[data-hand-rankings] .pn-card[data-state="win"]').length,
                games: [...guide.querySelectorAll('[data-guide-game]')].map((g) => g.getAttribute('data-guide-game')).join(),
                lobby: document.querySelectorAll('[data-poker-night-lobby], [data-quick-start]').length,
                tab: viewTabs.find((t) => t.getAttribute('aria-selected') === 'true')?.getAttribute('data-tab') ?? null,
                tabHeight: Math.min(...viewTabs.map((t) => t.getBoundingClientRect().height)),
                defs: document.querySelectorAll('[data-poker-night-hands] [data-what-these-mean] dt').length,
                outside, scroll: document.documentElement.scrollWidth - vw,
                card: Math.round(guide.querySelector('.pn-card').getBoundingClientRect().width),
            };
        });
        const learnTabs = await hp.$$eval('[data-section-tabs="learn"] a', (as) => as.map((a) => `${a.getAttribute('href')}${a.getAttribute('aria-current') === 'page' ? '*' : ''}`));
        const wide = await handsTab();
        check('the lobby\'s Hands tab: ten rankings and the kicker pair (60 cards, 39 lifted) and PLO\'s hand (9 more), Texas hold\'em and PLO, five definitions, no lobby read, Learn\'s "Poker night" still lit',
            wide !== null && wide.cards === 69 && wide.rankings === 10 && wide.lifted === 39 && wide.games === 'holdem,plo' && wide.lobby === 0 && wide.tab === 'hands'
            && wide.defs === 5 && learnTabs.includes('/poker-night*'), JSON.stringify({...wide, learnTabs}));
        await uiWording(hp, 'the Hands tab');
        await uiShotBoth(hp, '23-hands-tab');
        for (const [width, height] of [[390, 844], [375, 667], [320, 568], [844, 390]]) {
            await hp.setViewportSize({width, height});
            await sleep(500);
            const m = await handsTab();
            check(`the Hands tab at ${width}×${height}: every example inside its row, nothing sideways, the tabs 44 px tall${width === 320 ? ', 40 px cards (a 248 px list or more)' : ''}`,
                m !== null && m.outside === 0 && m.scroll <= 0 && m.tabHeight >= 43.5 && (width !== 320 || m.card === 40), JSON.stringify(m));
            if (width === 320) await uiShot(hp, '23-hands-tab-320');
        }
        await hp.setViewportSize({width: 1440, height: 900});
        await sleep(400);
        // The Play tab is one tap back: the lobby, at /poker-night.
        await hp.click('[data-poker-night-page] > [role="tablist"] [data-tab="play"]');
        await hp.waitForSelector('[data-poker-night-lobby]', {timeout: 30000}).catch(() => {});
        const back = new URL(hp.url());
        check('…and its Play tab is the lobby again, at /poker-night', back.pathname === '/poker-night' && back.search === ''
            && await hp.locator('[data-quick-start="holdem"]').count() === 1, hp.url());
    }

    await hp.goto(`${BASE}/poker-night`, {waitUntil: 'load', timeout: 180000});
    await hp.click('[data-quick-start="holdem"]');
    await hp.waitForURL(/\/play\/[A-HJ-NP-Z2-9]{6}(\?.*)?$/, {timeout: 120000});
    code = new URL(hp.url()).pathname.split('/').pop();
    const created = await roomDoc();
    roomId = String(created?._id);
    await hp.waitForSelector('[data-pn-drawer="invite"]', {timeout: 60000});
    check('Quick start lands the host on /play/CODE with the invite open', /^[A-HJ-NP-Z2-9]{6}$/.test(code) && created?.state?.hostPid !== undefined, hp.url());
    const link = await hp.inputValue('[data-share-link]');
    check('the invite\'s link is the table\'s own address', link === `${BASE}/play/${code}`, link);
    await hp.click('[data-copy-link]');
    await sleep(400);
    const clipped = await hp.evaluate(() => navigator.clipboard.readText()).catch((e) => `unreadable: ${e.message}`);
    check('…and Copy link puts exactly that on the clipboard', clipped === link, clipped);
    await hp.waitForSelector('[data-qr] svg rect', {timeout: 30000});
    const qr = await hp.$$eval('[data-qr] svg rect', (rs) => ({n: rs.length, fills: [...new Set(rs.map((r) => r.getAttribute('fill')))]}));
    check('…beside a QR code: its dark runs drawn as rects in currentColor', qr.n > 20 && qr.fills.join() === 'currentColor', JSON.stringify(qr));
    const shell = await hp.evaluate(() => ({
        rail: document.querySelectorAll('aside.rail').length, header: document.querySelectorAll('header.header').length,
        robot: document.querySelectorAll('[aria-label="Open Aero-AI Assistant"]').length, mode: document.querySelector('[data-pn-mode]')?.getAttribute('data-pn-mode'),
    }));
    check('the table has none of the app\'s shell — no rail, header or robot — and runs on polling',
        shell.rail === 0 && shell.header === 0 && shell.robot === 0 && shell.mode === 'polling', JSON.stringify(shell));
    await uiWording(hp, 'the invite sheet');
    await uiShot(hp, '02-invite-1440');
    await hp.keyboard.press('Escape');
    await hp.waitForSelector('[data-pn-drawer="invite"]', {state: 'detached', timeout: 10000}).catch(() => {});

    // ── the address ──
    const V = await uiPlayer('uiVisitor');
    const lower = await V.page.goto(`${BASE}/play/${code.toLowerCase()}`, {waitUntil: 'load', timeout: 120000});
    check('the code in lower case redirects to the upper-case table', lower?.status() === 200 && new URL(V.page.url()).pathname === `/play/${code}`
        && lower.request().redirectedFrom() !== null, `${lower?.status()} ${V.page.url()}`);
    const unknown = code === 'ZZZZZZ' ? 'YYYYYY' : 'ZZZZZZ';
    const missing = await V.page.goto(`${BASE}/play/${unknown}`, {waitUntil: 'load', timeout: 120000});
    await V.page.waitForSelector(`text=${TABLE_COPY.notFound}`, {timeout: 30000}).catch(() => {});
    const missingText = await V.page.innerText('body').catch(() => '');
    check('an unknown code shows the not-found copy, answered 404 (not a streamed 200)', missingText.includes(TABLE_COPY.notFound) && missing?.status() === 404,
        `${missing?.status()} ${missingText.slice(0, 120)}`);
    {
        // The page pays for a guess as the routes do: every unknown code spends the address's miss
        // counter, and an address that has used it up finds the live table gone too — a real 404 —
        // while every other address still opens it.
        const guesser = '10.6.6.6';
        const misses = async () => (await db.collection('ratelimits').findOne({key: `poker-night:${ENV}:miss:ip:${guesser}`}))?.count ?? 0;
        const render = async (c, ip) => {
            const res = await fetch(`${BASE}/play/${c}`, {headers: {'x-forwarded-for': ip}, redirect: 'manual'});
            await res.arrayBuffer();
            return res.status;
        };
        const taken = new Set((await rooms.find({env: ENV}, {projection: {code: 1}}).toArray()).map((d) => d.code));
        const guesses = [];
        for (let i = 0; guesses.length < RATE_LIMITS.miss.limit; i++) {
            const guess = `QQQQ${CODE_ALPHABET[i % 32]}${CODE_ALPHABET[Math.floor(i / 32) % 32]}`;
            if (!taken.has(guess)) guesses.push(guess);
        }
        const open = await render(code, guesser);
        const statuses = [];
        let afterFirst = null;
        for (const guess of guesses) {
            statuses.push(await render(guess, guesser));
            // One render, one miss: the layout, the page and its metadata share one read.
            afterFirst ??= await misses();
        }
        const spent = await misses();
        const closedToGuesser = await render(code, guesser);
        const elsewhere = await render(code, '10.6.6.7');
        check(`/play/CODE: ${RATE_LIMITS.miss.limit} unknown codes from one address are 404s spending its miss counter, and then the live table is a 404 to that address alone`,
            open === 200 && statuses.every((s) => s === 404) && afterFirst === 1 && spent === RATE_LIMITS.miss.limit && closedToGuesser === 404 && elsewhere === 200
            && await misses() === RATE_LIMITS.miss.limit,
            `open ${open}; guesses ${[...new Set(statuses)].join(',')}; misses ${afterFirst} after one, ${spent}; then ${closedToGuesser}, elsewhere ${elsewhere}`);
    }

    // ── guests sit down ──
    const A = await uiPlayer('uiA', {}, [AUDIO_PROBE]);
    await A.page.goto(`${BASE}/play/${code}`, {waitUntil: 'load', timeout: 120000});
    await A.page.waitForSelector('[data-join-card="visitor"]', {timeout: 60000});
    const nameA = await A.page.inputValue('[data-join-name]');
    const lookA = await A.page.getAttribute('[data-join-card] [data-avatar]', 'data-avatar');
    check('guest A, signed out, gets the join card: no name yet, a look already rolled', nameA === '' && isAvatar(lookA), `"${nameA}" ${lookA}`);
    await uiWording(A.page, 'the join card');
    await uiShot(A.page, '03-join-card-1440');
    await A.page.fill('[data-join-name]', 'Ana');
    await A.page.click('[data-join-sit]');
    await A.page.waitForSelector('[data-join-card]', {state: 'detached', timeout: 30000});
    const meA = await A.page.waitForSelector('[data-me]', {timeout: 30000});
    A.pid = await meA.getAttribute('data-pid');
    A.seat = Number(await meA.getAttribute('data-seat'));
    const cookiesA = await A.context.cookies(BASE);
    const guestA = cookiesA.find((c) => c.name === COOKIE);
    check(`…one tap on "Sit down" seats her, with the ${COOKIE} cookie: httpOnly, Lax, path /`,
        guestA?.httpOnly === true && guestA.sameSite === 'Lax' && guestA.path === '/', JSON.stringify(guestA && {...guestA, value: '…'}));
    check('…and no better-auth cookie', cookiesA.every((c) => !/better-auth/i.test(c.name)), cookiesA.map((c) => c.name).join(','));
    let doc = await roomDoc();
    const rowA = doc.players.find((p) => p.pid === A.pid);
    check('…her row: a guestId and no userId, the name typed and the look shown', !rowA?.userId && typeof rowA?.guestId === 'string'
        && rowA.name === 'Ana' && rowA.avatar === lookA, JSON.stringify(rowA && {...rowA, guestId: '…'}));

    const B = await uiPlayer('uiB', {viewport: {width: 390, height: 844}, isMobile: true, hasTouch: true}, [AUDIO_PROBE]);
    await B.page.goto(`${BASE}/play/${code}`, {waitUntil: 'load', timeout: 120000});
    await B.page.waitForSelector('[data-join-card="visitor"]', {timeout: 60000});
    const lookB = await B.page.getAttribute('[data-join-card] [data-avatar]', 'data-avatar');
    await uiShot(B.page, '03-join-card-390');
    await B.page.click('[data-join-sit]');
    await B.page.waitForSelector('[data-join-card]', {state: 'detached', timeout: 30000});
    const meB = await B.page.waitForSelector('[data-me]', {timeout: 30000});
    B.pid = await meB.getAttribute('data-pid');
    B.seat = Number(await meB.getAttribute('data-seat'));
    doc = await roomDoc();
    check('guest B on a phone leaves the name blank and sits as the face\'s name', doc.players.find((p) => p.pid === B.pid)?.name === faceNameOf(lookB),
        `${doc.players.find((p) => p.pid === B.pid)?.name} vs ${faceNameOf(lookB)}`);

    await A.page.reload({waitUntil: 'load', timeout: 120000});
    await A.page.waitForSelector('[data-me]', {timeout: 30000});
    const reloaded = {card: await A.page.locator('[data-join-card]').count(), seat: Number(await A.page.getAttribute('[data-me]', 'data-seat'))};
    const tabA = await A.context.newPage();
    await tabA.goto(`${BASE}/play/${code}`, {waitUntil: 'load', timeout: 120000});
    await tabA.waitForSelector('[data-me]', {timeout: 30000});
    const second = {card: await tabA.locator('[data-join-card]').count(), seat: Number(await tabA.getAttribute('[data-me]', 'data-seat'))};
    // The second tab goes to the background for certain (its own hidden beat, answered), then closes:
    // only the tab still open can put A back to "here", well before its own 25 s beat.
    const hiddenBeat = tabA.waitForResponse((r) => r.url().includes('/tick') && r.request().postDataJSON()?.beat?.hidden === true, {timeout: 15000})
        .then((r) => r.ok(), () => false);
    await tabA.evaluate(() => {
        Object.defineProperty(document, 'hidden', {configurable: true, get: () => true});
        Object.defineProperty(document, 'visibilityState', {configurable: true, get: () => 'hidden'});
        document.dispatchEvent(new Event('visibilitychange'));
    });
    const sawHidden = await hiddenBeat;
    const hiddenAt = Date.now();
    await tabA.close();
    let hereAgain = false;
    let hereAfter = null;
    for (let i = 0; i < 40 && !hereAgain; i++) {
        await sleep(200);
        hereAgain = (await roomDoc()).seen?.[A.pid]?.hidden === false;
        if (hereAgain) hereAfter = Date.now() - hiddenAt;
    }
    check('closing the second tab leaves A here, not "in another tab": its hidden beat landed, then the tab still open said so within 8 s',
        sawHidden && hereAgain, `hidden beat ${sawHidden}, here again ${hereAgain} after ${hereAfter} ms: ${JSON.stringify((await roomDoc()).seen?.[A.pid])}`);
    doc = await roomDoc();
    check('a reload and a second tab bring A back as herself: no join card, the same seat, still three players',
        reloaded.card === 0 && reloaded.seat === A.seat && second.card === 0 && second.seat === A.seat && doc.players.length === 3,
        `${JSON.stringify(reloaded)} ${JSON.stringify(second)} players ${doc.players.length}`);

    const C = await uiPlayer('uiC', {reducedMotion: 'reduce'});
    await C.page.goto(`${BASE}/play/${code}`, {waitUntil: 'load', timeout: 120000});
    await C.page.waitForSelector('[data-join-card="visitor"]', {timeout: 60000});
    await C.page.fill('[data-join-name]', 'Cleo');
    await C.page.click('[data-join-sit]');
    const meC = await C.page.waitForSelector('[data-me]', {timeout: 30000});
    C.pid = await meC.getAttribute('data-pid');
    C.seat = Number(await meC.getAttribute('data-seat'));
    check('no better-auth user or session came of any guest', await db.collection('user').countDocuments() === users0
        && await db.collection('session').countDocuments() === sessions0);

    // ── hand 1: the host folds, the others check or call to a showdown ──
    await hp.waitForSelector('[data-pn-seat-controls][data-pn-armed] [data-pn-control="deal"]:not([disabled])', {timeout: 30000});
    await hp.click('[data-pn-control="deal"]');
    const {doc: dealt} = await nextTurn(1);
    check('the host deals from the dock: hand 1 is dealt', dealt.state.hand?.no === 1);
    // The phone's Bank, opened while someone else acts, closes when B's turn arrives: opened only
    // when Mongo says the turn is not B's both before and after, so B's screen cannot have it yet.
    // In hand 1 the Bank drawer, in hand 2 the "Leave the table?" dialog: each closes when B's turn
    // comes round and hands the focus to the action bar.
    let armKind = 'bank';
    let bankArmed = false;
    let bankChecked = false;
    const leaveDialog = () => B.page.locator('[data-pn-leave-dialog]');
    const armBank = async () => {
        if (bankArmed || bankChecked) return;
        const before = (await roomDoc()).state;
        if (before.hand?.phase !== 'betting' || before.hand.actor === B.seat) return;
        if (armKind === 'bank') {
            await B.page.click('[data-open="bank"]');
            await B.page.waitForSelector('[data-pn-drawer="bank"]', {timeout: 10000});
        } else {
            await B.page.click('[data-open="menu"]');
            await B.page.click('[data-menu="leave"]', {timeout: 5000});
            await leaveDialog().waitFor({timeout: 10000});
        }
        const after = (await roomDoc()).state;
        bankArmed = after.turn === before.turn;
        if (!bankArmed) await B.page.keyboard.press('Escape');
    };
    const bankOnTurn = async () => {
        await B.page.waitForSelector('[data-pn-actions]', {timeout: 20000});
        if (!bankArmed || bankChecked) return;
        bankChecked = true;
        const closed = armKind === 'bank'
            ? await B.page.waitForSelector('[data-pn-drawer="bank"]', {state: 'detached', timeout: 5000}).then(() => true, () => false)
            : await leaveDialog().waitFor({state: 'detached', timeout: 5000}).then(() => true, () => false);
        await sleep(300);
        const focus = await B.page.evaluate(() => document.activeElement?.getAttribute('role') ?? document.activeElement?.tagName);
        const what = armKind === 'bank' ? 'the Bank drawer' : 'the leave dialog';
        check(`${what} open on B's phone closes when B's turn arrives, focus on the action bar`, closed && focus === 'toolbar', `closed ${closed}, focus ${focus}`);
    };
    // B's first turn on the phone: the table and the raise panel as B sees them, and the keys.
    const phoneTurn = async () => {
        await uiShot(B.page, '04-mid-hand-390');
        const turnNow = async () => (await roomDoc()).state.turn;
        const t0 = await turnNow();
        await B.page.waitForSelector('[data-pn-actions][data-pn-armed]', {timeout: 5000}).catch(() => {});
        const canRaise = await B.page.locator('[data-pn-action="raise"]').count() > 0;
        if (!canRaise) {
            note('the raise panel on the phone', 'B could not raise on this turn: not checked');
            return;
        }
        await B.page.click('[data-pn-action="raise"]');
        await B.page.waitForSelector('[data-pn-raise]', {timeout: 5000});
        await sleep(400);
        const at390 = await raiseLayout(B.page);
        check('phone at 390 px, raise panel open: on screen, and never over B\'s cards or the seconds left', raiseOk(at390), JSON.stringify(at390));
        await uiShot(B.page, '04-raise-390');
        await B.page.setViewportSize({width: 320, height: 640});
        await sleep(700);
        const at320 = await raiseLayout(B.page);
        check('…and at 320 px', raiseOk(at320), JSON.stringify(at320));
        await B.page.setViewportSize({width: 390, height: 844});
        await sleep(500);
        // Enter on the panel's Back is Back's: the panel closes, nothing is sent, the focus returns to Raise.
        await B.page.focus('[data-pn-raise] [data-pn-back]');
        await B.page.keyboard.press('Enter');
        const closedByBack = await B.page.waitForSelector('[data-pn-raise]', {state: 'detached', timeout: 3000}).then(() => true, () => false);
        await sleep(800);
        const focusBack = await B.page.evaluate(() => document.activeElement?.getAttribute('data-pn-action'));
        check('Enter on the raise panel\'s Back closes it and sends nothing; the focus goes back to Raise',
            closedByBack && await turnNow() === t0 && focusBack === 'raise', `closed ${closedByBack}, focus ${focusBack}`);
        // A letter typed with the focus in the top bar folds nothing.
        await B.page.focus('[data-open="bank"]');
        await B.page.keyboard.press('f');
        await sleep(900);
        check('"F" with the focus in the top bar folds nothing', await turnNow() === t0 && await B.page.locator('[data-pn-actions]').count() === 1);
    };
    await armBank();
    // The tap shield (lib/poker-night/keys.TAP_SHIELD_MS): a tap that lands as the action bar appears
    // — dispatched the moment it is there, as a thumb's would be — does nothing; once the bar says
    // data-pn-armed, taps act (every click of this suite waits for it).
    let shieldChecked = false;
    const shieldProbe = async (page) => {
        await page.waitForSelector('[data-pn-actions]', {timeout: 20000});
        const t0 = (await roomDoc()).state.turn;
        const sent = await page.evaluate(() => {
            const bar = document.querySelector('[data-pn-actions]');
            if (!bar || bar.hasAttribute('data-pn-armed')) return false;
            const button = bar.querySelector('[data-pn-action="call"], [data-pn-action="check"]');
            button?.dispatchEvent(new MouseEvent('click', {bubbles: true, cancelable: true, detail: 1}));
            return button !== null;
        });
        if (!sent) {
            note('the tap shield', 'the action bar was armed before the probe could tap: not checked');
            return;
        }
        await sleep(700);
        const t1 = (await roomDoc()).state.turn;
        const armed = await page.locator('[data-pn-actions][data-pn-armed]').count() === 1;
        check('a tap that lands as the action bar appears does nothing, and the bar is armed after the shield', t1 === t0 && armed, `turn ${t0} → ${t1}, armed ${armed}`);
    };
    // A phone on its side: the dock in the right-hand column, the action bar on screen, no plate over
    // the dock, nothing scrolling sideways.
    const landscape = (page) => page.evaluate(() => {
        const r = (el) => el?.getBoundingClientRect() ?? null;
        const dock = r(document.querySelector('[data-pn-dock]'));
        const table = r(document.querySelector('.pn-table'));
        const bar = r(document.querySelector('[data-pn-actions]'));
        const plates = [...document.querySelectorAll('[data-seat] .pn-plate')].map(r);
        const hit = (a, b) => a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1;
        return {
            right: dock !== null && table !== null && dock.left >= table.right - 1,
            bar: bar !== null && bar.left >= -1 && bar.right <= innerWidth + 1 && bar.top >= -1 && bar.bottom <= innerHeight + 1,
            overDock: dock ? plates.filter((p) => hit(p, dock)).length : -1,
            outside: plates.filter((p) => p.left < -1 || p.right > innerWidth + 1 || p.top < -1 || p.bottom > innerHeight + 1).length,
            scroll: document.documentElement.scrollWidth - innerWidth,
        };
    });
    let phoneChecked = false;
    let midHandShot = false;
    let hostDrawerDone = false;
    let foldProbed = false;
    // A move's tag on a bottom seat (its bet line above it) hangs under the plate: never over the
    // name or the stack. Looked at on A's screen after each move, while the tag still shows.
    const tagsSeen = [];
    const tagLook = async () => {
        const found = await A.page.evaluate(() => {
            const hit = (a, b) => a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1;
            return [...document.querySelectorAll('[data-seat] .pn-tag[data-over]')].map((tag) => {
                const seat = tag.closest('[data-seat]');
                const r = tag.getBoundingClientRect();
                const over = [...seat.querySelectorAll('.pn-plate-name, .pn-plate-stack')].some((w) => hit(r, w.getBoundingClientRect()));
                return {seat: seat.getAttribute('data-seat'), text: tag.textContent, over};
            });
        }).catch(() => []);
        tagsSeen.push(...found);
    };
    const hostDrawerTour = async () => {
        // The host, folded, has no turn to come: the drawer can stay open.
        await hp.click('[data-open="host"]');
        await hp.waitForSelector('[data-pn-drawer="host"]', {timeout: 10000});
        for (const tab of ['game', 'rebuys', 'players', 'table']) {
            await hp.click(`[data-host-tab="${tab}"]`);
            await hp.waitForSelector(`[data-host-section="${tab}"]`, {timeout: 5000});
            await uiWording(hp, `the host drawer's ${tab} section`);
            if (tab === 'players') await uiShotBoth(hp, '07-host-drawer');
        }
        await hp.click('[data-host-pause]');
        await hp.waitForSelector('[data-host-resume]', {timeout: 15000});
        check('the host pauses from the drawer, mid-hand: the hand plays on', (await roomDoc()).status === 'paused');
        const pausing = await A.page.waitForFunction(() => document.querySelector('[data-pn-table-status]')?.getAttribute('data-pn-table-status'), null, {timeout: 15000})
            .then((h) => h.jsonValue(), () => null);
        const pausingText = await A.page.locator('[data-pn-table-status]').textContent().catch(() => '');
        check('…and every top bar says so as "after this hand", not "paused", while the hand plays on',
            pausing === 'pausing' && pausingText?.trim() === TABLE_COPY.pausing, `${pausing}: ${pausingText}`);
        await hp.keyboard.press('Escape');
        await hp.waitForSelector('[data-pn-drawer="host"]', {state: 'detached', timeout: 10000}).catch(() => {});
    };
    doc = await playByClicks(1, {
        choose: (p) => (p === H ? 'fold' : 'call'),
        onStreet: async (d) => {
            for (const p of [A, B]) {
                await pageLeaks(p, `hand 1 ${d.state.hand.street}`);
                await backsOnly(p, d.state.hand);
            }
            if (d.state.hand.street === 'flop' && !midHandShot) {
                midHandShot = true;
                await sleep(1200);
                await uiShot(A.page, '04-mid-hand-1440');
                await uiWording(A.page, 'the table mid-hand');
            }
        },
        before: async (p) => {
            if (p !== B) return;
            if (!shieldChecked) {
                shieldChecked = true;
                await shieldProbe(B.page);
            }
            await bankOnTurn();
            if (phoneChecked) return;
            phoneChecked = true;
            await phoneTurn();
            const seats = (await roomDoc()).state.seats.filter((s) => s !== null).length;
            const at390 = await tableLayout(B.page);
            check('phone at 390 px on its turn: every plate on screen, none overlapping, the action bar shown, every button 44 px or more, no sideways scroll',
                layoutOk(at390, seats), JSON.stringify(at390));
            await B.page.setViewportSize({width: 320, height: 640});
            await sleep(900);
            const at320 = await tableLayout(B.page);
            check('…and at 320 px', layoutOk(at320, seats), JSON.stringify(at320));
            for (const size of [{width: 844, height: 390}, {width: 667, height: 375}]) {
                await B.page.setViewportSize(size);
                await sleep(900);
                const side = await landscape(B.page);
                check(`…and on its side at ${size.width} × ${size.height}: the dock in the right-hand column, the action bar on screen, every plate on screen and none over the dock`,
                    side.right && side.bar && side.overDock === 0 && side.outside === 0 && side.scroll <= 0, JSON.stringify(side));
                await uiShot(B.page, `04-landscape-${size.width}x${size.height}`);
            }
            await B.page.setViewportSize({width: 390, height: 844});
            await sleep(600);
        },
        after: async (p) => {
            if (p === H && !foldProbed) {
                foldProbed = true;
                // The folded hand stays the host's to see: face up in the dock, dimmed, tagged "Folded" —
                // while every other screen shows the seat with no cards (backsOnly, each street).
                const kept = await H.page.waitForFunction(() => {
                    const hole = document.querySelector('[data-pn-dock] [data-pn-hole="folded"]');
                    const cards = hole ? [...hole.querySelectorAll('[data-card]')] : [];
                    return cards.length === 2 && cards.every((c) => c.getAttribute('data-card') !== 'back' && c.getAttribute('data-state') === 'dim')
                        && hole.querySelector('[data-pn-folded-tag]') !== null;
                }, null, {timeout: 10000}).then(() => true, () => false);
                check('the host folds: their own cards stay in their dock, face up, dimmed and tagged "Folded"', kept);
            }
            if (p === H && !hostDrawerDone) {
                hostDrawerDone = true;
                await hostDrawerTour();
            }
            await tagLook(p);
            await armBank();
        },
    });
    // Opened after B's last turn of the hand: the rebuy below finds it open.
    bankArmed = false;
    check('hand 1 went to a showdown by clicks alone', doc.state.hand.no === 1 && doc.state.hand.phase === 'complete' && doc.state.hand.result?.showdown === true);
    await showdownChecks(doc, A, 'hand 1');
    await uiShot(A.page, '05-winner-1440');
    await B.page.waitForSelector('[data-pn-hand="1"] [data-pn-banner]', {timeout: 20000}).catch(() => {});
    await sleep(1500);
    await uiShot(B.page, '05-winner-390');
    // The banner on every screen size, the side seats' hands turned up: clear of every plate, hand,
    // the dealer button and the board (the bug a 390 px phone showed, the banner over two side hands).
    {
        const sizes = [[A.page, null, 1440], [B.page, null, 390], [B.page, {width: 375, height: 667}, 375], [B.page, {width: 320, height: 568}, 320]];
        for (const [page, size, width] of sizes) {
            if (size) {
                await page.setViewportSize(size);
                await sleep(900);
            }
            const seen = await bannerClear(page);
            check(`at ${width} px the winner's banner (${seen.variant}) and its line (${seen.lines}) cover no plate, turned-up hand, dealer button or board card (${seen.shown} hands shown, ${seen.sideShown} at side seats)`,
                seen.banner === 1 && seen.dealer === 1 && (width === 1440 || seen.sideShown >= 2) && seen.covered.length === 0,
                seen.covered.slice(0, 4).join(' | ') || JSON.stringify(seen));
            if (width === 320) await uiShot(page, '05-winner-320');
        }
        await B.page.setViewportSize({width: 390, height: 844});
        await sleep(600);
    }
    // The break (D1): B reached the showdown, and the dock still offers Sit out and Leave — in short
    // words on a phone, the row one line high at 320 — and Home in the top bar asks first, B being
    // seated. The host, who folded, still sees the folded hand and may show it.
    {
        const breakRow = (page) => page.evaluate(() => {
            const row = document.querySelector('[data-pn-seat-controls]');
            const r = row?.getBoundingClientRect();
            return {
                height: r ? Math.round(r.height) : null, armed: row?.hasAttribute('data-pn-armed') ?? false,
                sitOut: row?.querySelector('[data-pn-control="sit-out"]') !== null && row !== null, leave: row?.querySelector('[data-pn-control="leave"]') !== null && row !== null,
                words: [...(row?.querySelectorAll('button') ?? [])].map((b) => b.innerText.trim()),
                home: document.querySelector('[data-open="home"]')?.tagName ?? null,
            };
        });
        const at390 = await breakRow(B.page);
        check('after a showdown B reached, the dock offers Sit out and Leave in short words, and Home asks first',
            at390.sitOut && at390.leave && at390.words.includes(TABLE_COPY.sitOutShort) && at390.words.includes(TABLE_COPY.leaveShort) && at390.home === 'BUTTON',
            JSON.stringify(at390));
        await B.page.setViewportSize({width: 320, height: 568});
        await sleep(900);
        const at320 = await breakRow(B.page);
        check('…the row one line high at 320 px (52 px at most)', at320.sitOut && at320.leave && at320.height !== null && at320.height <= 52, JSON.stringify(at320));
        await uiShot(B.page, '05-break-320');
        await B.page.setViewportSize({width: 390, height: 844});
        await sleep(600);
        const host = await hp.evaluate(() => ({
            folded: document.querySelectorAll('[data-pn-dock] [data-pn-hole="folded"] [data-card]:not([data-card="back"])').length,
            show: document.querySelector('[data-pn-control="show"]') !== null,
        }));
        check('…and the host, who folded, still sees the folded hand in the pause, with "Show my cards"', host.folded === 2 && host.show, JSON.stringify(host));
    }
    for (const [p, width] of [[A, 1440], [B, 390]]) {
        const seen = await coverage(p.page);
        check(`at ${width} px the shown hands cover no name or stack, and the banner not the line under the board (${seen.shown} shown, ${seen.notes} line)`,
            seen.shown > 0 && seen.covered.length === 0, seen.covered.join(' | '));
    }
    const pausedNow = await A.page.locator('[data-pn-table-status]').getAttribute('data-pn-table-status').catch(() => null);
    check('between hands, paused, the top bar says "paused"', pausedNow === 'paused', String(pausedNow));
    if (tagsSeen.length === 0) note('a bottom seat\'s tag', 'none seen on A\'s screen after a move: not checked');
    else check(`a bottom seat's tag hangs under its plate, never over its name or stack (${tagsSeen.length} seen)`, tagsSeen.every((t) => !t.over),
        JSON.stringify(tagsSeen.filter((t) => t.over).slice(0, 3)));
    check(`every street of hand 1, A's and B's screens showed the other seats' cards as backs`, faceUp.length === 0, faceUp.slice(0, 3).join(' | '));
    check('…and the scan of the page HTML and RSC payload does see a hole: the viewer\'s own', ownPairsFound.length > 0, ownPairsFound.slice(0, 4).join(', '));
    check('the RSC payload was fetched as one', /text\/x-component/.test(rscType ?? ''), rscType ?? 'none');

    const seenA = await A.page.evaluate(() => window.__pnSeen);
    const need = ['deal', 'chips-out', 'fold', 'sweep', 'board', 'flip', 'lift', 'banner', 'stream'];
    check('the animation hooks fired on A\'s screen: the deal, chips out, the fold, the sweep, the board, the reveal and the win',
        need.every((a) => seenA.anims.includes(a)), `missing ${need.filter((a) => !seenA.anims.includes(a)).join(',') || 'none'} — saw ${seenA.anims.join(',')}`);
    check('…the chips moving there (each flight a running animation)', seenA.flights.length > 0 && seenA.flights.every((f) => f.name !== 'none'),
        `${seenA.flights.length} flights, ${seenA.flights.filter((f) => f.name === 'none').length} still`);
    await C.page.waitForSelector('[data-pn-hand="1"] [data-pn-banner]', {timeout: 20000}).catch(() => {});
    const seenC = await C.page.evaluate(() => window.__pnSeen);
    const finalC = await C.page.evaluate(() => ({
        board: document.querySelectorAll('[data-pn-board] [data-card]:not([data-card="back"])').length,
        banner: document.querySelectorAll('[data-pn-banner]').length,
    }));
    check('under reduced motion nothing flies: every chip flight appears still and invisible', seenC.flights.length > 0
        && seenC.flights.every((f) => f.name === 'none' && f.opacity === '0'), JSON.stringify(seenC.flights.slice(0, 4)));
    check('…and the end of the hand is simply there: the five board cards and the banner', finalC.board === 5 && finalC.banner === 1, JSON.stringify(finalC));

    // ── between hands (paused): a rebuy, the bank, the log ──
    doc = await roomDoc();
    check('paused, nothing more is dealt after hand 1', doc.status === 'paused' && doc.state.hand.no === 1 && doc.state.hand.phase === 'complete');
    {
        const seatOf = (p) => doc.state.seats.findIndex((s) => s?.pid === p.pid);
        const [a, b] = [seatOf(A), seatOf(B)];
        if (doc.state.seats[b].stack > 0) {
            await editRoom({[`state.seats.${a}.stack`]: doc.state.seats[a].stack + doc.state.seats[b].stack, [`state.seats.${b}.stack`]: 0});
        }
        doc = await roomDoc();
        check('B\'s whole stack moved to A in Mongo, chips conserved', doc.state.seats[b].stack === 0 && conservation(doc.state).ok);
        const boughtBefore = doc.state.ledger.find((l) => l.pid === B.pid).bought;
        if (await B.page.locator('[data-pn-drawer="bank"]').count() === 0) await B.page.click('[data-open="bank"]');
        // Once B's screen has the empty stack (its next poll): "Rebuy", not the top-up it offered before.
        await B.page.waitForFunction((label) => document.querySelector('[data-pn-rebuy]')?.textContent?.trim() === label, BANK_COPY.rebuy, {timeout: 20000});
        await B.page.dblclick('[data-pn-rebuy]');
        // A hand has been dealt: the double click is one request, which the host approves.
        let asked = null;
        for (let i = 0; i < 25 && !asked; i++) {
            await sleep(200);
            asked = (await roomDoc()).state.requests.find((q) => q.pid === B.pid) ?? null;
        }
        const waitingSaid = await B.page.waitForSelector('[data-pn-requested]', {timeout: 10000}).then(() => true, () => false);
        check('B double-clicks Rebuy: one request waits for the host, and B\'s bank says so', asked !== null
            && (await roomDoc()).state.requests.filter((q) => q.pid === B.pid).length === 1 && waitingSaid, JSON.stringify(asked));
        await hostOp(H, {op: 'approve', pid: B.pid}, {usePass: false});
        let rowB = null;
        for (let i = 0; i < 25; i++) {
            await sleep(200);
            rowB = (await roomDoc()).state.ledger.find((l) => l.pid === B.pid);
            if (rowB.bought > boughtBefore) break;
        }
        await sleep(600);
        doc = await roomDoc();
        rowB = doc.state.ledger.find((l) => l.pid === B.pid);
        const rebuys = rowB.events.filter((e) => LEDGER_KINDS[e[1]] === 'rebuy');
        check('…the host approves: exactly one rebuy lands, twice the buy-in bought', rebuys.length === 1
            && rowB.bought === 2 * doc.state.config.buyInMax && conservation(doc.state).ok, JSON.stringify({bought: rowB.bought, rebuys: rebuys.length}));
        const nets = new Map(doc.state.ledger.map((l) => {
            const seat = doc.state.seats.find((s) => s?.pid === l.pid);
            return [l.pid, (seat?.stack ?? 0) + l.cashedOut - l.bought];
        }));
        // The footer Mongo's ledger makes: every chip brought in is on the table or cashed out.
        const sum = (xs) => xs.reduce((t, x) => t + x, 0);
        const footerWanted = BANK_COPY.check(sum(doc.state.seats.map((st) => st?.stack ?? 0)), sum(doc.state.ledger.map((l) => l.bought)),
            sum(doc.state.ledger.map((l) => l.cashedOut)));
        const bankOn = async (p) => {
            if (await p.page.locator('[data-pn-drawer="bank"]').count() === 0) await p.page.click('[data-open="bank"]');
            const t0 = Date.now();
            const rows = await p.page.waitForFunction(({want, footer}) => {
                const shown = [...document.querySelectorAll('[data-bank-row]')].map((r) => [r.getAttribute('data-bank-row'), Number(r.querySelector('[data-net]')?.getAttribute('data-net'))]);
                const said = document.querySelector('[data-bank-check]')?.textContent?.trim();
                return shown.length === want.length && want.every(([pid, net]) => shown.some(([q, n]) => q === pid && n === net)) && said === footer ? shown : null;
            }, {want: [...nets.entries()], footer: footerWanted}, {timeout: 8000}).then((h) => h.jsonValue(), () => null);
            const footer = await p.page.innerText('[data-bank-check]').catch(() => '');
            return {rows, footer, ms: Date.now() - t0};
        };
        for (const p of [B, A]) {
            const bank = await bankOn(p);
            check(`${p.name}'s bank, within 5 s: every net Mongo's ledger makes, and the footer "${footerWanted}"`, bank.rows !== null && bank.ms <= 5000,
                `${bank.ms} ms: ${bank.footer} ${JSON.stringify(bank.rows)}`);
        }
        await uiWording(B.page, 'the bank');
        await uiShot(B.page, '06-bank-390');
        await uiShot(A.page, '06-bank-1440');
        for (const p of [A, B]) {
            await p.page.keyboard.press('Escape');
            await p.page.waitForSelector('[data-pn-drawer="bank"]', {state: 'detached', timeout: 10000}).catch(() => {});
        }
    }
    await A.page.click('[data-open="menu"]');
    await A.page.click('[data-menu="log"]');
    await A.page.waitForSelector('[data-pn-drawer="log"]', {timeout: 10000});
    await sleep(800);
    await uiWording(A.page, 'the hand log');
    await A.page.keyboard.press('Escape');
    await A.page.waitForSelector('[data-pn-drawer="log"]', {state: 'detached', timeout: 10000}).catch(() => {});
    // P2: the Hands guide at the table — H on A's screen (the focus on the table), the menu's Hands on
    // B's phone at 390 and 320 px: the table's own game first, the ten rankings and the kicker pair,
    // every example inside its row and nothing sideways in the drawer.
    {
        const handsDrawer = (p) => p.page.evaluate(() => {
            const guide = document.querySelector('[data-pn-drawer="hands"] [data-hands-guide]');
            if (!guide) return null;
            const body = guide.parentElement;
            const vw = innerWidth;
            const outside = [...guide.querySelectorAll('[data-guide-cards]')].filter((el) => {
                const r = el.getBoundingClientRect();
                const row = el.parentElement.getBoundingClientRect();
                return r.left < row.left - 0.5 || r.right > row.right + 0.5 || r.right > vw + 0.5;
            }).length;
            return {
                cards: guide.querySelectorAll('.pn-card').length,
                rankings: guide.querySelectorAll('[data-ranking]').length,
                first: guide.querySelector('[data-guide-here]')?.getAttribute('data-guide-game') ?? null,
                order: [...guide.children].map((el) => el.getAttribute('data-guide-section')).join(),
                outside, sideways: body.scrollWidth - body.clientWidth,
                card: Math.round(guide.querySelector('.pn-card').getBoundingClientRect().width),
                firstRank: Math.round(guide.querySelector('[data-ranking]').getBoundingClientRect().bottom), vh: innerHeight,
            };
        });
        // The rankings first (what a player opens Hands for mid-game), then ties, then the table's own game, then the others (PLO).
        const handsOk = (m) => m !== null && m.cards === 69 && m.rankings === 10 && m.first === 'holdem' && m.order === 'rankings,ties,here,games' && m.outside === 0 && m.sideways <= 0;
        await A.page.evaluate(() => {
            if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
        });
        await A.page.keyboard.press('h');
        await A.page.waitForSelector('[data-pn-drawer="hands"]', {timeout: 10000}).catch(() => {});
        await sleep(500);
        const onA = await handsDrawer(A);
        check('H with the focus on the table opens the Hands guide: the ten rankings first, then the kicker pair, then Texas hold\'em ("At this table")',
            handsOk(onA), JSON.stringify(onA));
        await uiWording(A.page, 'the Hands drawer');
        await uiShot(A.page, '23-hands-drawer-1440');
        await A.page.keyboard.press('Escape');
        await A.page.waitForSelector('[data-pn-drawer="hands"]', {state: 'detached', timeout: 10000}).catch(() => {});
        for (const [width, height] of [[390, 844], [320, 568]]) {
            await B.page.setViewportSize({width, height});
            await sleep(400);
            await B.page.click('[data-open="menu"]');
            await B.page.click('[data-menu="hands"]');
            await B.page.waitForSelector('[data-pn-drawer="hands"]', {timeout: 10000}).catch(() => {});
            await sleep(600);
            const onB = await handsDrawer(B);
            check(`at ${width} px the menu's Hands opens the guide: the first ranking whole on the first screen, ${width === 320 ? '40' : '44'} px cards, every example inside its row, nothing sideways`,
                handsOk(onB) && onB.firstRank <= onB.vh && onB.card === (width === 320 ? 40 : 44), JSON.stringify(onB));
            if (width === 390) await uiShot(B.page, '23-hands-drawer-390');
            await B.page.keyboard.press('Escape');
            await B.page.waitForSelector('[data-pn-drawer="hands"]', {state: 'detached', timeout: 10000}).catch(() => {});
        }
        await B.page.setViewportSize({width: 390, height: 844});
    }
    await A.page.click('[data-open="menu"]');
    await A.page.click('[data-menu="look"]');
    await A.page.waitForSelector('[data-pn-drawer="look"]', {timeout: 10000});
    await uiWording(A.page, 'My look');
    {
        const stored = () => A.page.evaluate(() => {
            try {
                return JSON.parse(localStorage.getItem('aero-poker-night:me') ?? 'null')?.look?.shortcuts ?? null;
            } catch {
                return null;
            }
        });
        const on = await A.page.getAttribute('[data-pn-shortcuts]', 'aria-checked');
        await A.page.click('[data-pn-shortcuts]');
        const off = {aria: await A.page.getAttribute('[data-pn-shortcuts]', 'aria-checked'), stored: await stored()};
        await A.page.click('[data-pn-shortcuts]');
        const back = await A.page.getAttribute('[data-pn-shortcuts]', 'aria-checked');
        check('My look turns the single-key shortcuts off and on, kept in this browser', on === 'true' && off.aria === 'false' && off.stored === false && back === 'true',
            JSON.stringify({on, off, back}));
    }

    // ── the looks (P5), paused between hands: A's own card back and suit colours, A's avatar for
    // everyone, then the host's scene and felt for everyone ──
    {
        const drawer = '[data-pn-drawer="look"]';
        const keptLook = () => A.page.evaluate((key) => {
            try {
                return JSON.parse(localStorage.getItem(key) ?? 'null')?.look ?? null;
            } catch {
                return null;
            }
        }, ME_STORAGE_KEY);
        // A card back and the four-colour deck: A's cards change at once, B's never.
        const back = 'tartan';
        const bBefore = await roomLook(B.page);
        const posts = [];
        const notePost = (req) => {
            if (req.method() === 'POST' && /\/api\/poker-night\/[^/]+\/action$/.test(req.url())) posts.push(req.url());
        };
        A.page.on('request', notePost);
        await A.page.click(`${drawer} [data-pn-choice="card-back"] [data-pn-option="${back}"]`);
        if (await A.page.getAttribute(`${drawer} [data-pn-personal="fourColour"]`, 'aria-checked') !== 'true') await A.page.click(`${drawer} [data-pn-personal="fourColour"]`);
        await sleep(400);
        A.page.off('request', notePost);
        const a = await roomLook(A.page);
        const four = SUIT_COLOURS.four;
        check(`My look's card back (${back}) and four-colour deck change A's own cards at once: the room's ids, LOOKS_CSS's colours for them, and the colours a drawn back${a?.club || a?.diamond ? ' and a club or diamond' : ''} got`,
            a?.back === back && a.colours === 'four' && a.backBase === CARD_BACKS[back].base && a.suitC === four.c
            && (a.drawnBack === null || a.drawnBack === rgbOf(CARD_BACKS[back].base))
            && (a.club === null || a.club === rgbOf(four.c)) && (a.diamond === null || a.diamond === rgbOf(four.d)), JSON.stringify(a));
        await sleep(4500); // a poll of B's, which nothing of A's personal look may reach
        const b = await roomLook(B.page);
        check('…and only A\'s: B\'s cards keep B\'s own look (the default back, two colours)', b?.back === bBefore?.back && b.back === 'classic-red' && b.colours === 'two'
            && b.drawnBack === bBefore.drawnBack && (b.drawnBack === null || b.drawnBack === rgbOf(CARD_BACKS['classic-red'].base))
            && (b.club === null || b.club === rgbOf(SUIT_COLOURS.two.c)), JSON.stringify(b));
        const stored = await keptLook();
        check('…kept in A\'s browser (localStorage), with no request to the table', stored?.cardBack === back && stored.fourColour === true && posts.length === 0,
            `${JSON.stringify(stored)} ${posts.join(' ')}`);

        // The avatar builder: another face, colour and badge, saved between hands — every screen
        // shows A's seat with it.
        const builder = `${drawer} [data-pn-look-profile] [data-pn-builder]`;
        const preview = `${builder} .pn-seat-in[data-avatar]`;
        const [, face0, colour0, frame0, badge0] = (await A.page.getAttribute(preview, 'data-avatar')).split(':');
        const want = {face: face0 === 'octopus' ? 'unicorn' : 'octopus', colour: colour0 === 'berry' ? 'lime' : 'berry', badge: badge0 === 'crown' ? 'gem' : 'crown'};
        await A.page.click(`${builder} [data-pn-choice="avatar-face"] [data-pn-option="${want.face}"]`);
        await A.page.click(`${builder} [data-pn-builder-tab="colour"]`);
        await A.page.click(`${builder} [data-pn-choice="avatar-colour"] [data-pn-option="${want.colour}"]`);
        await A.page.click(`${builder} [data-pn-builder-tab="badge"]`);
        await A.page.click(`${builder} [data-pn-choice="avatar-badge"] [data-pn-option="${want.badge}"]`);
        const newLook = await A.page.getAttribute(preview, 'data-avatar');
        check('the avatar builder: a face, a colour and a badge picked, its preview the look they make', newLook === `v1:${want.face}:${want.colour}:${frame0}:${want.badge}` && isAvatar(newLook),
            newLook);
        await uiWording(A.page, 'the avatar builder');
        await A.page.locator(builder).scrollIntoViewIfNeeded();
        await uiShot(A.page, '12-avatar-builder-1440');
        await A.page.locator(`${drawer} [data-pn-personal-look]`).scrollIntoViewIfNeeded();
        await uiShot(A.page, '13-my-look-1440');
        const savedAt = Date.now();
        await A.page.click('[data-pn-look-save]');
        let rowA = null;
        for (let i = 0; i < 40 && rowA?.avatar !== newLook; i++) {
            await sleep(150);
            rowA = (await roomDoc()).players.find((p) => p.pid === A.pid);
        }
        const seatAvatar = async (p) => p.page.waitForFunction(({seat, look}) => document.querySelector(`[data-seat="${seat}"] [data-avatar]`)?.getAttribute('data-avatar') === look,
            {seat: A.seat, look: newLook}, {timeout: 8000}).then(() => Date.now() - savedAt, () => null);
        const avatarMs = await Promise.all([H, B, C].map(seatAvatar));
        check(`…saved between hands, A's seat shows it on the host's, B's and C's screens within 5 s (${avatarMs.join(', ')} ms)`, rowA?.avatar === newLook
            && rowA.name === 'Ana' && avatarMs.every((ms) => ms !== null && ms <= 5000), JSON.stringify(rowA && {name: rowA.name, avatar: rowA.avatar}));
        await A.page.keyboard.press('Escape');
        await A.page.waitForSelector(drawer, {state: 'detached', timeout: 10000}).catch(() => {});

        // A reload brings A's own look back from the browser.
        await A.page.reload({waitUntil: 'load', timeout: 120000});
        await A.page.waitForSelector('[data-me]', {timeout: 30000});
        await A.page.waitForSelector('[data-pn-ready="true"]', {timeout: 30000}).catch(() => {});
        const reloaded = await roomLook(A.page);
        check('…and after a reload A\'s cards keep the back and the four colours, from this browser', reloaded?.back === back && reloaded.colours === 'four'
            && (reloaded.drawnBack === null || reloaded.drawnBack === rgbOf(CARD_BACKS[back].base)), JSON.stringify(reloaded));

        // B's My look on the phone: the builder, then the rest.
        await B.page.click('[data-open="menu"]');
        await B.page.click('[data-menu="look"]');
        await B.page.waitForSelector(drawer, {timeout: 10000});
        await uiWording(B.page, 'My look on the phone');
        await uiShot(B.page, '12-avatar-builder-390');
        await B.page.locator(`${drawer} [data-pn-personal-look]`).scrollIntoViewIfNeeded();
        await uiShot(B.page, '13-my-look-390');
        await B.page.keyboard.press('Escape');
        await B.page.waitForSelector(drawer, {state: 'detached', timeout: 10000}).catch(() => {});

        // The host's Look section: a scene, and its felt with it, on every table within 5 s.
        await hp.click('[data-open="host"]');
        await hp.waitForSelector('[data-pn-drawer="host"]', {timeout: 10000});
        await hp.click('[data-host-tab="look"]');
        await hp.waitForSelector('[data-host-section="look"] [data-pn-look-picker]', {timeout: 5000});
        await uiWording(hp, 'the host drawer\'s look section');
        await uiShotBoth(hp, '11-host-look');
        const pages = [A.page, B.page, C.page];
        const start = await roomLook(A.page);
        await uiShot(A.page, `11-scene-${start.scene}-1440`);
        await uiShot(B.page, `11-scene-${start.scene}-390`);
        const timings = [];
        for (const scene of ['garden-party', 'neon-city', 'beach-sunset', 'log-cabin', 'midnight-lounge', 'my-theme', 'deep-space']) {
            const felt = SCENES[scene].felt;
            await hp.click(`[data-host-section="look"] [data-pn-choice="scene"] [data-pn-option="${scene}"]`);
            const ms = await lookOnAll(pages, (l) => l.scene === scene && l.layer === scene && l.felt === felt && l.cloth === felt);
            timings.push({scene, ms});
            await sleep(700); // the new sky fades in
            await uiShot(A.page, `11-scene-${scene}-1440`);
            await uiShot(B.page, `11-scene-${scene}-390`);
        }
        const late = timings.filter((t) => t.ms.some((ms) => ms === null || ms > 5000));
        check(`the host's Look section: each scene (${timings.length}) reaches A's, B's and C's tables within 5 s with its own felt — the room's ids, the sky layer and the felt drawn`,
            late.length === 0, timings.map((t) => `${t.scene} ${t.ms.join('/')}`).join('; '));
        await hp.click('[data-host-section="look"] [data-pn-choice="felt"] [data-pn-option="tangerine"]');
        const feltMs = await lookOnAll(pages, (l) => l.felt === 'tangerine' && l.cloth === 'tangerine' && l.scene === 'deep-space');
        // An open seat straddles the rail, partly over the sky: it is filled with the felt and inked
        // with the felt's own colours on every screen, whatever the scene behind it.
        const openSeats = await Promise.all(pages.map((page) => page.$$eval('.pn-open-seat', (els) => els.map((el) => {
            const s = getComputedStyle(el);
            return {bg: s.backgroundColor, ink: s.color, opacity: s.opacity};
        })).catch(() => [])));
        const felt = FELTS.tangerine;
        check(`an open seat is filled with the felt and inked with its tested colours (${openSeats.map((o) => o.length).join('/')} open seats on A's, B's and C's screens)`,
            openSeats.some((o) => o.length > 0) && openSeats.flat().every((o) => o.bg === rgbOf(felt.felt) && o.ink === rgbOf(felt.onFelt) && o.opacity === '1'),
            JSON.stringify(openSeats.map((o) => o[0] ?? null)));
        doc = await roomDoc();
        check(`…and a felt on its own, the scene kept: on every table within 5 s (${feltMs.join(', ')} ms), stored as the room's settings`,
            feltMs.every((ms) => ms !== null && ms <= 5000) && doc.state.settings.scene === 'deep-space' && doc.state.settings.felt === 'tangerine',
            JSON.stringify(doc.state.settings));
        const hostUser = doc.players.find((p) => p.pid === doc.state.hostPid)?.userId;
        let prefs = null;
        for (let i = 0; i < 20 && prefs?.pokerNight?.table?.felt !== 'tangerine'; i++) {
            await sleep(200);
            prefs = await db.collection('userpreferences').findOne({userId: hostUser});
        }
        check('…and kept as the host\'s look for their next tables (preferences, after the answer)', prefs?.pokerNight?.table?.scene === 'deep-space'
            && prefs.pokerNight.table.felt === 'tangerine', JSON.stringify(prefs?.pokerNight?.table ?? null));
        await uiShot(A.page, '11-felt-tangerine-1440');
        await uiShot(B.page, '11-felt-tangerine-390');
        await hp.keyboard.press('Escape');
        await hp.waitForSelector('[data-pn-drawer="host"]', {state: 'detached', timeout: 10000}).catch(() => {});
    }

    // ── hand 2: the host folds, then removes C mid-hand ──
    await hp.click('[data-open="host"]');
    await hp.click('[data-host-tab="table"]');
    await hp.click('[data-host-resume]');
    await hp.waitForSelector('[data-host-pause]', {timeout: 15000});
    await hp.keyboard.press('Escape');
    await hp.waitForSelector('[data-pn-drawer="host"]', {state: 'detached', timeout: 10000}).catch(() => {});
    let removedC = false;
    const removeC = async () => {
        await hp.click('[data-open="host"]');
        await hp.waitForSelector('[data-pn-drawer="host"]', {timeout: 10000});
        await hp.click('[data-host-tab="table"]');
        await hp.click('[data-host-pause]'); // the night ends between hands
        await hp.waitForSelector('[data-host-resume]', {timeout: 15000});
        await hp.click('[data-host-tab="players"]');
        await hp.click(`[data-host-player="${C.pid}"] [data-host-more]`);
        await hp.click('[data-host-remove]');
        await hp.waitForSelector('[data-remove-dialog]', {timeout: 10000});
        const text = await hp.innerText('[data-remove-dialog]');
        check('Remove from table asks first: a dialog naming the player, their chips cashed out, no rejoining unless let back in',
            text.includes('Cleo') && /cash/i.test(text) && /let them back in/i.test(text) && await hp.locator('[data-pn-drawer="host"]').count() === 0, text.replace(/\s+/g, ' ').slice(0, 220));
        const inHand = (await roomDoc()).state.hand?.seats.some((s) => s.pid === C.pid && !s.folded) ?? false;
        check(`…in words that match what happens: ${inHand ? 'Cleo is in the hand, so she leaves when it ends, with no figure promised' : 'Cleo is not in the hand, so she leaves now'}`,
            inHand ? /end of this hand/.test(text) && !/leaves the table now/.test(text) : /leaves the table now/.test(text), text.replace(/\s+/g, ' ').slice(0, 220));
        check('…and asks for no typing: no text field in it', await hp.locator('[data-remove-dialog] input[type="text"], [data-remove-dialog] input:not([type])').count() === 0);
        await uiWording(hp, 'the remove dialog');
        await uiShotBoth(hp, '08-remove-dialog');
        await hp.click('[data-hold-confirm]');
        await sleep(2600);
        let d = await roomDoc();
        const rowC = () => d.players.find((p) => p.pid === C.pid);
        check('a short click on the press-and-hold button does nothing: C is still seated, not removed',
            await hp.locator('[data-remove-dialog]').count() === 1 && !rowC()?.banned && d.state.seats.some((s) => s?.pid === C.pid && !s.removed));
        const box = await hp.locator('[data-hold-confirm]').boundingBox();
        await hp.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await hp.mouse.down();
        await sleep(800);
        const filling = await hp.locator('[data-hold-confirm][data-holding]').count();
        await sleep(1400);
        await hp.mouse.up();
        const gone = await hp.waitForSelector('[data-remove-dialog]', {state: 'detached', timeout: 15000}).then(() => true, () => false);
        d = await roomDoc();
        check('pressed and held 2.2 s, the fill running: C is removed — banned, and leaving the hand as it ends', filling === 1 && gone && rowC()?.banned === true
            && d.bannedKeys?.includes(`g:${rowC()?.guestId}`), `filling ${filling}, gone ${gone}, banned ${rowC()?.banned}`);
        await hp.keyboard.press('Escape');
        await hp.waitForSelector('[data-pn-drawer="host"]', {state: 'detached', timeout: 10000}).catch(() => {});
    };
    // Hand 2's first turn (P5): the deep-space scene twinkles and the plate on the clock pulses. A
    // visitor whose theme is brutalist sees the felt's stadium still round and both loops stopped
    // by name; on A's screen they run until A's browser asks for reduced motion (emulateMedia),
    // which stops the twinkle there and keeps every chip flight of the hand still from then on.
    let styled = false;
    let reducedA = false;
    const styleChecks = async () => {
        const VB = await uiPlayer('uiBrutalist');
        await VB.context.addCookies([{name: 'aero-theme', value: 'v1:nord:brutalist:0', domain: new URL(BASE).hostname, path: '/'}]);
        await VB.page.goto(`${BASE}/play/${code}`, {waitUntil: 'load', timeout: 120000});
        await VB.page.waitForSelector('[data-pn-ready="true"]', {timeout: 30000}).catch(() => {});
        // Every screen with hand 2's first turn drawn (a page polls between hands only every 4 s).
        await Promise.all([VB, A, B].map((p) => p.page.waitForSelector('[data-pn-hand="2"] .pn-pulse', {state: 'attached', timeout: 15000}).catch(() => {})));
        const [brut, plain] = await Promise.all([motionOf(VB.page), motionOf(A.page)]);
        check('a brutalist screen keeps the felt\'s stadium round (rounded-full spared from its square corners)', brut.style === 'brutalist' && brut.feltRadius > 100
            && plain.feltRadius > 100, JSON.stringify({brutalist: brut.feltRadius, default: plain.feltRadius}));
        check('…and stops the loops by name: the plate on the clock (.pn-pulse) and the scene\'s twinkle (.pn-ambient) have animation-name none, while they run on a default screen',
            brut.pulses.length > 0 && brut.pulses.every((n) => n === 'none') && brut.ambient.length > 0 && brut.ambient.every((n) => n === 'none')
            && plain.pulses.some((n) => n === 'pn-pulse') && plain.ambient.length > 0 && plain.ambient.every((n) => n === 'pn-ambient-twinkle'),
            JSON.stringify({brutalist: {pulses: brut.pulses, ambient: [...new Set(brut.ambient)]}, default: {pulses: plain.pulses, ambient: [...new Set(plain.ambient)]}}));
        await uiWording(VB.page, 'the table in brutalist');
        await uiShot(VB.page, '17-brutalist-1440');
        await VB.context.close();
        ui.splice(ui.indexOf(VB), 1);
        // The other seats' face-down cards, dealt: in A's own back on A's screen, the default on B's.
        const backsOf = (page) => page.evaluate(() => [...document.querySelectorAll('[data-seat]:not([data-me]) [data-card="back"] .pn-card-back')]
            .map((el) => getComputedStyle(el).backgroundColor));
        const [backsA, backsB] = await Promise.all([backsOf(A.page), backsOf(B.page)]);
        check('mid-hand, the other seats\' face-down cards are drawn in each viewer\'s own back: tartan on A\'s screen, the default red on B\'s',
            backsA.length > 0 && backsA.every((c) => c === rgbOf(CARD_BACKS.tartan.base)) && backsB.length > 0 && backsB.every((c) => c === rgbOf(CARD_BACKS['classic-red'].base)),
            JSON.stringify({A: [...new Set(backsA)], B: [...new Set(backsB)]}));
        await uiShot(A.page, '13-tartan-backs-1440');
        // Reduced motion, asked for by A's browser mid-session (C's context asks from the start).
        await A.page.emulateMedia({reducedMotion: 'reduce'});
        reducedA = true;
        await sleep(300);
        await A.page.evaluate(() => {
            window.__pnSeen.flights = [];
        });
        const [still, fromStart] = await Promise.all([motionOf(A.page), motionOf(C.page)]);
        check('under reduced motion the ambient loops stop: A\'s screen once emulateMedia asks, C\'s from the start (animation-name none)',
            still.ambient.length > 0 && still.ambient.every((n) => n === 'none') && still.pulses.every((n) => n === 'none')
            && fromStart.ambient.length > 0 && fromStart.ambient.every((n) => n === 'none'), JSON.stringify({A: [...new Set(still.ambient)], C: [...new Set(fromStart.ambient)]}));
    };
    let raised = false;
    armKind = 'leave';
    bankArmed = false;
    bankChecked = false;
    doc = await playByClicks(2, {
        choose: (p) => (p === H ? 'fold' : p === A && !raised ? 'raise-twice' : 'call'),
        before: async (p) => {
            if (!styled) {
                styled = true;
                await styleChecks();
            }
            if (p === B) await bankOnTurn();
        },
        after: async (p) => {
            if (p === A && !raised) {
                raised = true;
                await sleep(1000); // a second request would have landed by now
                const log = (await roomDoc()).state.hand.log;
                const raises = log.filter((e) => e[0] === A.seat && ['bet', 'raise'].includes(ENTRY_KINDS[e[1]]));
                check('A double-clicks the raise panel\'s confirm: one raise in the log', raises.length === 1, JSON.stringify(raises));
            }
            if (p === H && !removedC) {
                removedC = true;
                await removeC();
            }
            await armBank();
        },
    });
    if (!bankChecked) note('the phone\'s Leave dialog on B\'s turn', 'never open before a turn of B\'s: not checked');
    if (bankArmed) await B.page.keyboard.press('Escape');
    check('hand 2 is played out', doc.state.hand.no === 2 && doc.state.hand.phase === 'complete' && removedC);
    if (reducedA) {
        const flights = await A.page.evaluate(() => window.__pnSeen.flights);
        check(`…and on A's screen, under the emulated reduced motion, every chip flight of it appeared still and invisible (${flights.length})`,
            flights.length > 0 && flights.every((f) => f.name === 'none' && f.opacity === '0'), JSON.stringify(flights.slice(0, 4)));
        await A.page.emulateMedia({reducedMotion: 'no-preference'});
        await sleep(300);
        const again = await motionOf(A.page);
        check('…and once A\'s browser no longer asks, the twinkle runs again', again.ambient.length > 0 && again.ambient.every((n) => n === 'pn-ambient-twinkle'),
            JSON.stringify([...new Set(again.ambient)]));
    } else {
        check('hand 2\'s style checks ran', false, 'no turn reached them');
    }
    check('…and C, removed during it, is off the table once it ends, cashed out as removed', !doc.state.seats.some((s) => s?.pid === C.pid)
        && doc.state.ledger.find((l) => l.pid === C.pid)?.events.some((e) => LEDGER_KINDS[e[1]] === 'removed') && conservation(doc.state).ok);
    const removedCard = await C.page.waitForSelector('[data-join-blocked="removed"]', {timeout: 30000}).then(() => true, () => false);
    const removedText = removedCard ? await C.page.innerText('[data-join-blocked="removed"]') : '';
    check('the removed guest\'s screen says so', removedText.trim() === JOIN_COPY.banned, removedText);
    const cardText = await C.page.innerText('[data-join-card]').catch(() => '');
    await C.page.click('[data-join-check]');
    await sleep(1500);
    check('…what would change it, "Check again" (which, still removed, changes nothing) and the way home — "/", never the lobby a guest is sent to sign in from',
        cardText.includes(JOIN_COPY.bannedNext) && await C.page.locator('[data-join-blocked="removed"]').count() === 1
        && await C.page.locator('[data-join-card] [data-join-home][href="/"]').count() === 1
        && await C.page.locator('[data-join-card] a[href="/poker-night"]').count() === 0, cardText.replace(/\s+/g, ' ').slice(0, 200));

    await hp.click('[data-open="host"]');
    await hp.click('[data-host-tab="players"]');
    await hp.waitForSelector(`[data-removed-player="${C.pid}"]`, {timeout: 15000});
    await hp.click(`[data-removed-player="${C.pid}"] [data-let-back-in]`);
    await hp.waitForSelector(`[data-removed-player="${C.pid}"]`, {state: 'detached', timeout: 15000});
    doc = await roomDoc();
    // No reload: C's screen reads the page again by itself every few seconds and finds the table open
    // to them again, as the row C was — no seat, so watching, with "Sit here" on every open seat.
    const letIn = Date.now();
    const noticed = await C.page.waitForSelector('[data-pn-joined="watching"]', {timeout: 30000}).then(() => true, () => false);
    check('the removed guest\'s screen finds out by itself that the host let them back in', noticed, `${Date.now() - letIn} ms`);
    if (!noticed) await C.page.reload({waitUntil: 'load', timeout: 120000});
    await C.page.waitForSelector('[data-pn-joined="watching"]', {timeout: 30000});
    const watchingAgain = await C.page.locator('[data-join-blocked]').count() === 0;
    await C.page.click('[data-sit-here]');
    await C.page.waitForSelector('[data-join-card="watcher"] [data-join-sit]', {timeout: 15000});
    await C.page.click('[data-join-sit]');
    const back = await C.page.waitForSelector('[data-me]', {timeout: 30000}).then(() => true, () => false);
    check('"Let back in" restores C: unbanned, back at the table watching, and seated again from "Sit here"', watchingAgain && back
        && !doc.players.find((p) => p.pid === C.pid)?.banned && (doc.bannedKeys ?? []).length === 0 && (await roomDoc()).state.seats.some((s) => s?.pid === C.pid));

    // ── realtime over the relay (P4) ──
    // One more guest, R, whose page has the relay (RELAY_PROBE): two hands with R at the table on the
    // relay alone, then the relay stops mid-hand and the polls must come back.
    const R = await uiPlayer('uiR', {}, [RELAY_PROBE]);
    const isStateRead = (req) => req.method() === 'GET' && req.url().includes(`/api/poker-night/${code}/state`);
    const readAt = new Map();
    const rReads = []; // when each of R's GET state requests left
    const rViews = []; // R's GET state answers: when asked, the hand, whether R's own cards came
    R.page.on('request', (req) => {
        if (!isStateRead(req)) return;
        const at = Date.now();
        readAt.set(req, at);
        rReads.push(at);
    });
    R.page.on('response', async (res) => {
        if (!isStateRead(res.request())) return;
        try {
            const body = await res.json();
            rViews.push({sentAt: readAt.get(res.request()) ?? 0, at: Date.now(), seq: body?.seq ?? null, hand: body?.hand?.no ?? null,
                hole: Array.isArray(body?.me?.hole), unchanged: body?.unchanged === true});
        } catch {
            // A refusal or an aborted read: no view.
        }
    });
    await R.page.goto(`${BASE}/play/${code}`, {waitUntil: 'load', timeout: 120000});
    await R.page.waitForSelector('[data-join-card="visitor"]', {timeout: 60000});
    await R.page.fill('[data-join-name]', 'Rae');
    await R.page.click('[data-join-sit]');
    const meR = await R.page.waitForSelector('[data-me]', {timeout: 30000});
    R.pid = await meR.getAttribute('data-pid');
    R.seat = Number(await meR.getAttribute('data-seat'));
    {
        // Hands have been dealt: R sits with nothing until the host says yes to the chips.
        const waiting = await roomDoc();
        const yes = await hostOp(H, {op: 'approve', pid: R.pid}, {usePass: false});
        const landed = await roomDoc();
        check('R joins after the first hands: a request for the chips waits until the host approves, then they land', waiting.state.seats[R.seat]?.stack === 0
            && waiting.state.requests.some((q) => q.pid === R.pid) && yes.status === 200 && (landed.state.seats[R.seat]?.stack ?? 0) > 0
            && !landed.state.requests.some((q) => q.pid === R.pid), `${yes.status} ${JSON.stringify(waiting.state.requests)}`);
    }
    {
        const token = await call(R, 'GET', 'token');
        const spent = await limits.countDocuments({key: /:token:/});
        check('with no Ably key, GET token answers {realtime: false} — no channel, no token — and spends no counter',
            token.status === 200 && JSON.stringify(token.body) === '{"realtime":false}' && spent === 0, `${token.status} ${token.text.slice(0, 160)}, counters ${spent}`);
        const anon = await call(V, 'GET', 'token');
        check('…and a browser that never joined gets none: 401', anon.status === 401 && anon.body?.error === 'no_identity', `${anon.status} ${anon.text.slice(0, 80)}`);
    }
    const rootOf = (page) => page.evaluate(() => {
        const root = document.querySelector('[data-pn-seq]');
        return {mode: root?.getAttribute('data-pn-mode'), transport: root?.getAttribute('data-pn-transport'), seq: Number(root?.getAttribute('data-pn-seq') ?? -1)};
    });
    const barText = (page) => page.evaluate(() => document.querySelector('[data-pn-topbar] [role="status"]')?.textContent?.trim() ?? '');
    const wentLive = await R.page.waitForFunction(() => document.querySelector('[data-pn-mode]')?.getAttribute('data-pn-mode') === 'realtime', null, {timeout: 20000})
        .then(() => true, () => false);
    {
        const now = await rootOf(R.page);
        const bar = await barText(R.page);
        const link = await R.page.evaluate(() => ({subscribes: window.__pnRelay.subscribes, stops: window.__pnRelay.stops}));
        check(`R's page, its link on the relay: Live — data-pn-mode "realtime", the channel alone, the top bar "${TABLE_COPY.connection.live}"`,
            wentLive && now.transport === 'realtime' && bar === TABLE_COPY.connection.live && link.subscribes - link.stops === 1,
            `${JSON.stringify(now)} "${bar}" ${JSON.stringify(link)}${wentLive ? '' : ' (is the dev server run.sh\'s, with NEXT_PUBLIC_PN_RT_FAKE=1?)'}`);
        const others = await Promise.all([H, A, B, C].map(async (p) => ({name: p.name, ...(await rootOf(p.page)), bar: await barText(p.page)})));
        check(`…while every page without the relay polls: "polling", polls alone, "${TABLE_COPY.connection.polling}"`,
            others.every((o) => o.mode === 'polling' && o.transport === 'poll' && o.bar === TABLE_COPY.connection.polling), JSON.stringify(others));
    }
    await uiWording(R.page, 'the table on the relay');
    await uiShot(R.page, '10-live-1440');

    // The relay: every 100 ms it reads the room's public seq; a new one is built into the message the server
    // publishes after a commit and handed to R's page — every fourth held back until the next one
    // has gone (or half a second has passed), every fourth sent twice, and the rest followed by one
    // from a few back. Every message is scanned before it goes.
    const NOT_ON_WIRE = ['people', 'removed', 'me', 'config', 'emotes', 'emoteSeq', 'pass', 'hole', 'deck'];
    const RELAY_HOLD_MS = 500;
    relay = {
        running: true, loop: null, stoppedAt: null, lastSeq: -1, built: 0, held: null, heldAt: 0, history: [], deliveries: [],
        late: 0, twice: 0, stale: 0, scanned: 0, shownSeen: 0, maxBytes: 0, problems: [], over: [], errors: [],
    };
    const relayScan = (message, hand) => {
        const seq = message.data.seq;
        relay.scanned++;
        const bytes = Buffer.byteLength(JSON.stringify(message));
        relay.maxBytes = Math.max(relay.maxBytes, bytes);
        if (bytes > WIRE_BUDGET_BYTES) relay.over.push(`seq ${seq}: ${bytes} B`);
        if (message.name !== STATE_MESSAGE || message.id !== `${roomId}:${seq}`) relay.problems.push(`seq ${seq}: sent as ${message.name} ${message.id}`);
        const keys = keysIn(message.data);
        for (const k of [...PRIVATE_KEYS, ...NOT_ON_WIRE]) if (keys.has(k)) relay.problems.push(`seq ${seq}: "${k}"`);
        if (!hand) return;
        // Only the hand the message carries: the board, the pots and a shown hand are its own.
        const pairs = cardPairsIn(message.data);
        for (const p of hand.seats) {
            const found = pairs.some((pair) => sameCards(pair, p.hole));
            if (found && p.shown) relay.shownSeen++;
            else if (found) relay.problems.push(`seq ${seq}: seat ${p.seat}'s hole, not shown`);
        }
    };
    const relayDeliver = async (messages) => {
        const at = Date.now();
        const seen = await R.page.evaluate((list) => ({
            before: {
                seq: Number(document.querySelector('[data-pn-seq]')?.getAttribute('data-pn-seq') ?? -1),
                hand: Number(document.querySelector('[data-pn-hand]')?.getAttribute('data-pn-hand') ?? 0),
            },
            taken: list.map((data) => window.__pnRelay.deliver(data)),
        }), messages.map((m) => m.data));
        messages.forEach((m, i) => relay.deliveries.push({seq: m.data.seq, hand: m.data.hand?.no ?? null, at, before: seen.before, taken: seen.taken[i]}));
    };
    const relayStep = async () => {
        const stored = await rooms.findOne({env: ENV, code}, {projection: {emoteAt: 0, awards: 0, applied: 0}});
        if (!stored) return;
        // The public seq, as the server publishes it: a write only its author can see moves none.
        const seq = pubSeq(stored);
        if (seq <= relay.lastSeq) {
            if (relay.held && Date.now() - relay.heldAt > RELAY_HOLD_MS) {
                const held = relay.held;
                relay.held = null;
                await relayDeliver([held]);
            }
            return;
        }
        relay.lastSeq = seq;
        rememberHand(stored.state?.hand);
        const state = migrateState(stored.state);
        if (state === null) {
            relay.errors.push(`seq ${seq}: a state this code cannot read`);
            return;
        }
        const message = stateMessage(roomId, wireOfRoom(serverRoomFromDoc(stored, coreFromDoc(stored, state), Date.now())));
        relayScan(message, stored.state?.hand ?? null);
        relay.built++;
        const older = relay.history[relay.history.length - 3] ?? null;
        relay.history = [...relay.history, message].slice(-8);
        if (relay.held) {
            // The one held back goes after its successor: late, and stale by then.
            const held = relay.held;
            relay.held = null;
            relay.late++;
            await relayDeliver([message, held]);
        } else if (relay.built % 4 === 1) {
            relay.held = message;
            relay.heldAt = Date.now();
        } else if (relay.built % 4 === 3) {
            relay.twice++;
            await relayDeliver([message, message]);
        } else if (older) {
            relay.stale++;
            await relayDeliver([message, older]);
        } else {
            await relayDeliver([message]);
        }
    };
    relay.loop = (async () => {
        while (relay.running) {
            try {
                await relayStep();
            } catch (error) {
                if (relay.running) relay.errors.push(error.message);
            }
            await sleep(100);
        }
    })();
    const stopRelay = async () => {
        relay.running = false;
        await relay.loop;
        relay.stoppedAt = Date.now();
    };

    // R's own two cards on R's screen, as Mongo dealt them.
    const ownCards = async (handNo) => {
        const hand = (await roomDoc()).state.hand;
        const mine = hand?.no === handNo ? hand.seats.find((p) => p.pid === R.pid) : null;
        if (!mine) return {dealt: false, ok: false};
        const want = mine.hole.map((c) => cardLabel(c)).sort().join(' ');
        const t0 = Date.now();
        const shown = await R.page.waitForFunction((w) => {
            const cards = [...document.querySelectorAll('[data-pn-hole] [data-card]')].map((c) => c.getAttribute('data-card')).sort().join(' ');
            return cards === w ? cards : null;
        }, want, {timeout: 10000}).then((h) => h.jsonValue(), () => null);
        return {dealt: true, ok: shown !== null, ms: Date.now() - t0};
    };
    const relayHands = new Map();
    const firstStreet = async (d) => {
        const no = d.state.hand.no;
        if (!relayHands.has(no)) relayHands.set(no, {cards: await ownCards(no), endedAt: null});
    };
    const pauseFromDrawer = async () => {
        await hp.click('[data-open="host"]');
        await hp.waitForSelector('[data-pn-drawer="host"]', {timeout: 10000});
        await hp.click('[data-host-tab="table"]');
        await hp.click('[data-host-pause]');
        await hp.waitForSelector('[data-host-resume]', {timeout: 15000});
        await hp.keyboard.press('Escape');
        await hp.waitForSelector('[data-pn-drawer="host"]', {state: 'detached', timeout: 10000}).catch(() => {});
    };
    const handEnds = async (handNo) => {
        const t0 = Date.now();
        const ended = await R.page.waitForSelector(`[data-pn-hand="${handNo}"] [data-pn-banner]`, {timeout: 15000}).then(() => true, () => false);
        return {ended, ms: Date.now() - t0};
    };

    // The host deals again: two hands, R in both.
    const relayHand1 = (await roomDoc()).state.handNo + 1;
    const relayHand2 = relayHand1 + 1;

    // A new hand's own read overtaken by the next message: the first read of R's own view at one of
    // these hands is held until R's page has drawn a later seq — a commit that changes nothing (a seq
    // bumped in Mongo, which the relay carries like any other) — and only then let through, older
    // than the table R's page holds. R's cards must still come with it, not wait for a poll.
    const race = {hand: null, seq: null, bumped: false, drawn: false, releasedAt: null, cardsAt: null, error: null};
    const isRaceRead = (url) => url.pathname === `/api/poker-night/${code}/state`;
    const raceRoute = async (route) => {
        if (route.request().method() !== 'GET') return route.continue();
        let response;
        try {
            response = await route.fetch();
        } catch {
            return route.abort().catch(() => {});
        }
        try {
            if (race.hand === null && relay?.running) {
                const body = await response.json().catch(() => null);
                if (body && body.unchanged !== true && Array.isArray(body.me?.hole) && [relayHand1, relayHand2].includes(body.hand?.no)) {
                    race.hand = body.hand.no;
                    race.seq = body.seq;
                    const bump = await rooms.updateOne({env: ENV, code, seq: body.seq}, {$inc: {seq: 1}});
                    race.bumped = bump.modifiedCount === 1;
                    race.drawn = await R.page.waitForFunction((s) => Number(document.querySelector('[data-pn-seq]')?.getAttribute('data-pn-seq')) > s, body.seq, {timeout: 8000})
                        .then(() => true, () => false);
                    race.releasedAt = Date.now();
                }
            }
        } catch (error) {
            race.error = error.message;
        }
        await route.fulfill({response}).catch(() => {});
        if (race.releasedAt !== null && race.cardsAt === null) {
            race.cardsAt = 0;
            R.page.waitForFunction(() => document.querySelectorAll('[data-pn-hole=""] [data-card]').length === 2, null, {timeout: 15000})
                .then(() => {
                    race.cardsAt = Date.now();
                }, () => {});
        }
    };
    await R.page.route(isRaceRead, raceRoute);
    if (await hp.locator('[data-pn-drawer="host"]').count() === 0) await hp.click('[data-open="host"]');
    await hp.click('[data-host-tab="table"]');
    await hp.click('[data-host-resume]');
    await hp.waitForSelector('[data-host-pause]', {timeout: 15000});
    await hp.keyboard.press('Escape');
    await hp.waitForSelector('[data-pn-drawer="host"]', {state: 'detached', timeout: 10000}).catch(() => {});
    doc = await playByClicks(relayHand1, {choose: (p) => (p === H ? 'fold' : 'call'), onStreet: firstStreet});
    relayHands.get(relayHand1).endedAt = Date.now();
    const end1 = await handEnds(relayHand1);
    check(`hand ${relayHand1}, R's page on the relay alone: the showdown arrives over the channel`, end1.ended && doc.state.hand.result?.showdown === true, `${end1.ms} ms`);

    // The second: the host pauses it (nothing is dealt after it), and on R's first turn past the
    // preflop, once R's screen has it, the relay stops for good, the channel still "connected": R's
    // own move is answered with a seq the channel never brings.
    let paused = false;
    let stop = null;
    const lags = [];
    doc = await playByClicks(relayHand2, {
        choose: (p) => (p === H ? 'fold' : 'call'),
        onStreet: firstStreet,
        before: async (p, d) => {
            if (p !== R || stop || d.state.hand.street === 'preflop') return;
            // Once the relay has brought R the turn (its action bar is up), so the move goes at once.
            await R.page.waitForSelector('[data-pn-actions][data-pn-armed]:not([aria-busy="true"])', {timeout: 20000});
            await stopRelay();
            stop = {
                street: d.state.hand.street,
                answered: R.page.waitForResponse((res) => res.url().endsWith('/action') && res.request().method() === 'POST', {timeout: 30000})
                    .then(() => Date.now(), () => null),
            };
        },
        after: async (p) => {
            if (p === H && !paused) {
                paused = true;
                await pauseFromDrawer();
            }
            if (!stop) return;
            if (p === R && stop.bothAt === undefined) {
                stop.answeredAt = await stop.answered;
                stop.bothAt = await R.page.waitForFunction(() => document.querySelector('[data-pn-transport]')?.getAttribute('data-pn-transport') === 'both',
                    null, {timeout: AHEAD_GRACE_MS + 15000}).then(() => Date.now(), () => null);
                await sleep(300);
                stop.root = await rootOf(R.page);
                stop.bar = await barText(R.page);
                return;
            }
            // Every move after it: on R's screen within a poll or two.
            const want = pubSeq(await roomDoc());
            const t0 = Date.now();
            const ok = await R.page.waitForFunction((s) => Number(document.querySelector('[data-pn-seq]')?.getAttribute('data-pn-seq')) >= s, want, {timeout: 10000})
                .then(() => true, () => false);
            lags.push({by: p.name, ms: Date.now() - t0, ok});
        },
    });
    relayHands.get(relayHand2).endedAt = Date.now();
    const end2 = await handEnds(relayHand2);
    const finalSeq = pubSeq(await roomDoc());
    const caughtUp = await R.page.waitForFunction((s) => Number(document.querySelector('[data-pn-seq]')?.getAttribute('data-pn-seq')) >= s, finalSeq, {timeout: 10000})
        .then(() => true, () => false);
    if (stop === null) await stopRelay();

    // ── what the relay showed ──
    const probe = await R.page.evaluate(() => ({seqs: window.__pnRelay.seqs, transports: window.__pnRelay.transports, modes: window.__pnRelay.modes, delivered: window.__pnRelay.delivered}));
    {
        const drops = probe.seqs.flatMap((s, i) => (i > 0 && s < probe.seqs[i - 1] ? [`${probe.seqs[i - 1]} → ${s}`] : []));
        const taken = relay.deliveries.filter((d) => d.taken).length;
        check(`R's page was handed ${taken} relayed messages for ${relay.scanned} seqs — ${relay.late} held back and sent after their successor, ${relay.twice} sent twice, ${relay.stale} followed by an older one — and the seq it drew only ever moved up`,
            drops.length === 0 && probe.seqs.length > 10 && relay.late > 0 && relay.twice > 0 && relay.stale > 0 && taken === probe.delivered,
            `${probe.seqs.length} seqs drawn, ${probe.seqs[0]} to ${probe.seqs[probe.seqs.length - 1]}${drops.length ? `; went back: ${drops.slice(0, 3).join(', ')}` : ''}`);
    }
    {
        const rows = [relayHand1, relayHand2].map((n) => {
            const first = relay.deliveries.find((d) => d.hand === n) ?? null;
            const relayFirst = first !== null && first.before.hand < n;
            const own = first === null ? null : rViews.find((v) => v.hand === n && v.hole && !v.unchanged && v.sentAt >= first.at - 20) ?? null;
            const cards = relayHands.get(n)?.cards ?? {dealt: false, ok: false};
            return {n, relayFirst, readMs: own && first ? own.sentAt - first.at : null, cards};
        });
        // A hand the page saw first in an answer of its own (a beat that landed first) needs no read.
        const ok = rows.every((r) => r.cards.dealt && r.cards.ok && (!r.relayFirst || (r.readMs !== null && r.readMs <= 2000))) && rows.some((r) => r.relayFirst);
        check('at each new hand the relay brings, R\'s page reads its own view once (GET state) and its own cards appear, as Mongo dealt them',
            ok, rows.map((r) => `hand ${r.n}: ${r.relayFirst ? `read ${r.readMs} ms after the message` : 'seen first in its own answer'}, cards ${r.cards.ok ? `in ${r.cards.ms} ms` : 'missing'}`).join('; '));
    }
    await R.page.unroute(isRaceRead, raceRoute);
    {
        const cardsIn = race.releasedAt !== null && race.cardsAt > 0 ? race.cardsAt - race.releasedAt : null;
        check('a new hand\'s read that lands after the next message (held until R\'s page drew a later seq) still brings R\'s own cards at once — the older whole view\'s own part is kept, not dropped as older',
            race.hand !== null && race.drawn && race.error === null && cardsIn !== null && cardsIn <= 2500 && relayHands.get(race.hand)?.cards.ok === true,
            `hand ${race.hand}, read at seq ${race.seq}, bumped ${race.bumped}, later seq drawn ${race.drawn}, cards ${cardsIn === null ? 'never' : `${cardsIn} ms`} after the release${race.error ? `; ${race.error}` : ''}`);
    }
    {
        const first = relay.deliveries.find((d) => d.hand === relayHand1);
        const until = relayHands.get(relayHand1).endedAt;
        const seconds = first ? (until - first.at) / 1000 : 0;
        const reads = first ? rReads.filter((t) => t >= first.at && t <= until).length : -1;
        check(`over hand ${relayHand1} (${seconds.toFixed(0)} s) R's page read the table ${reads === 1 ? 'once' : `${reads} times`} — the new hand's read and the 20 s safety poll, not the polls' few seconds`,
            first !== undefined && reads >= 1 && reads <= 3 + Math.ceil(seconds / 20), `polling would have read it about ${Math.round(seconds / 3)} times`);
    }
    {
        const before = (list) => list.filter(([t]) => t < relay.stoppedAt).map(([, v]) => v);
        const steady = (values) => values.slice(values.indexOf('realtime'));
        const transports = steady(before(probe.transports));
        const modes = steady(before(probe.modes));
        check('while the relay ran, R\'s page stayed Live: the channel alone, never polls beside it',
            transports.length > 0 && transports.every((v) => v === 'realtime') && modes.length > 0 && modes.every((v) => v === 'realtime'),
            `transports ${before(probe.transports).join(' → ')}; modes ${before(probe.modes).join(' → ')}`);
    }
    check(`no relayed message carried a hole that was not shown, an identity, the people or the viewer's own part (${relay.scanned} scanned)`,
        relay.problems.length === 0 && relay.scanned > 10, relay.problems.slice(0, 4).join(' | '));
    check('…and the scan does see a hole once it is shown, at the showdown', relay.shownSeen > 0, `${relay.shownSeen} shown pairs seen`);
    check(`every message, envelope and all, within the ${WIRE_BUDGET_BYTES}-byte budget (the largest ${relay.maxBytes} B)`, relay.over.length === 0, relay.over.slice(0, 3).join(', '));
    check('the relay itself ran clean', relay.errors.length === 0, relay.errors.slice(0, 3).join(' | '));
    {
        const answeredIn = stop?.answeredAt && stop?.bothAt ? stop.bothAt - stop.answeredAt : null;
        check(`the relay stopped mid-hand (${stop?.street ?? 'never'}): within ${AHEAD_GRACE_MS / 1000} s of R's move being answered ahead of the channel, polls run beside it — data-pn-transport "both", the mode "polling", the top bar "${TABLE_COPY.connection.polling}"`,
            answeredIn !== null && answeredIn <= AHEAD_GRACE_MS + 2500 && stop.bothAt - relay.stoppedAt <= AHEAD_GRACE_MS + 6000 && stop.root?.transport === 'both' && stop.root?.mode === 'polling' && stop.bar === TABLE_COPY.connection.polling,
            `${answeredIn} ms after the answer, ${stop?.bothAt && relay.stoppedAt ? stop.bothAt - relay.stoppedAt : '?'} ms after the stop: ${JSON.stringify(stop?.root)} "${stop?.bar}"`);
    }
    {
        const slow = lags.filter((l) => !l.ok);
        const worst = lags.reduce((top, l) => Math.max(top, l.ms), 0);
        check(`…and R's page keeps up by polling: every move after it on R's screen within a poll (${lags.length} moves, the slowest ${worst} ms), the hand's end and the last seq too`,
            lags.length > 0 && slow.length === 0 && worst <= 6000 && end2.ended && caughtUp, `${slow.map((l) => l.by).join(', ')} end ${end2.ended} caught up ${caughtUp}`);
    }
    await uiShot(R.page, '10-polling-again-1440');

    // ── emotes (P6): a reaction and a throw from one screen to another, a mute for the visit, the
    // sounds, and only the impact under reduced motion. The pages poll (no Ably here), so another
    // screen sees an emote within its next poll.
    {
        for (const p of [H, A, B, C, R]) await p.page.keyboard.press('Escape').catch(() => {});
        doc = await roomDoc();
        const seatOf = (pid) => doc.state.seats.findIndex((s) => s?.pid === pid);
        const onScreen = [];
        for (const p of [A, H, R, B, C]) {
            const pid = await p.page.getAttribute('[data-me]', 'data-pid', {timeout: 2000}).catch(() => null);
            if (pid && seatOf(pid) !== -1) onScreen.push({p, pid});
        }
        if (onScreen.length < 2 || doc.state.status === 'closed' || doc.state.settings.throwables === false) {
            check('emotes on screen: two seated screens, the table open, throwables on', false,
                `${onScreen.length} seated screens, status ${doc.state.status}, throwables ${doc.state.settings.throwables}`);
        } else {
            const [S, T] = onScreen;
            const sp = S.p.page;
            const tp = T.p.page;
            const emoteOn = (page, sel, timeout) => page.waitForSelector(sel, {timeout, state: 'attached'}).then(() => true, () => false);
            // The pitch of every tone T's page starts (TONE_PROBE); a key press is the gesture that wakes its audio.
            await tp.evaluate(TONE_PROBE);
            await tp.keyboard.press('Shift');
            // Under reduced motion (C's context) a throw is never drawn in flight, only its impact —
            // counted as each appears: C polls every 4 s between hands, so the impact (2.4 s) may come
            // and go while T's screen is still being watched.
            await C.page.evaluate(() => {
                window.__pnFlights = 0;
                window.__pnImpacts = 0;
                new MutationObserver((records) => {
                    for (const r of records) r.addedNodes.forEach((n) => {
                        if (!(n instanceof Element)) return;
                        if (n.matches('.pn-throw') || n.querySelector('.pn-throw')) window.__pnFlights++;
                        if (n.matches('[data-splat="tomato"]') || n.querySelector('[data-splat="tomato"]')) window.__pnImpacts++;
                    });
                }).observe(document.body, {subtree: true, childList: true});
            }).catch(() => {});

            await sp.click('[data-pn-emotes-open]');
            await sp.click('[data-emote-react="party"]');
            const sentAt = Date.now();
            const ownReact = await emoteOn(sp, `[data-emote="react"][data-emote-item="party"][data-emote-from="${S.pid}"]`, 2000);
            const seenReact = await emoteOn(tp, `[data-emote="react"][data-emote-item="party"][data-emote-from="${S.pid}"]`, 6000);
            const reactMs = Date.now() - sentAt;
            check(`a reaction rises over the sender's plate at once, and on another screen within its next poll (${reactMs} ms)`, ownReact && seenReact, `${ownReact} ${seenReact}`);
            await sleep(300);
            const tones = await tp.evaluate(() => window.__pnTones);
            check(`…with a pop on that screen: its rising tone (${SOUNDS.pop[0].freq} Hz) started`, tones.includes(SOUNDS.pop[0].freq), JSON.stringify(tones));

            await sleep(1300);
            await sp.click('[data-pn-emotes-open]');
            await sp.click('[data-emote-tab="throw"]');
            await sp.click('[data-emote-throw="tomato"]');
            await sp.click(`[data-emote-target="${T.pid}"]`);
            const landed = await emoteOn(tp, '[data-splat="tomato"]', 7000);
            const splatSeat = landed ? Number(await tp.getAttribute('[data-splat="tomato"]', 'data-splat-seat').catch(() => -1)) : -1;
            check('a tomato thrown at a player lands on their plate on their screen ([data-splat])', landed && splatSeat === seatOf(T.pid), `${landed} at seat ${splatSeat} vs ${seatOf(T.pid)}`);
            const awards = (await roomDoc()).awards ?? {};
            check('…and the night summary\'s counts have it', awards[S.pid]?.thrown?.tomato >= 1 && awards[T.pid]?.received?.tomato >= 1, JSON.stringify(awards));
            const cJoined = await C.page.locator('[data-me]').count() > 0 || await C.page.locator('[data-pn-joined="watching"]').count() > 0;
            if (cJoined) {
                const cImpact = await C.page.waitForFunction(() => window.__pnImpacts > 0, null, {timeout: 7000}).then(() => true, () => false);
                const cFlights = await C.page.evaluate(() => window.__pnFlights ?? -1);
                check('…and under reduced motion only the impact shows, never the flight', cImpact && cFlights === 0, `impact ${cImpact}, flights ${cFlights}`);
            } else {
                check('a throw under reduced motion: C still at the table to see it', false, 'C has left the table');
            }

            // T mutes S for the visit: S's next reaction shows on S's screen, never on T's.
            await tp.click(`[data-seat-menu="${seatOf(S.pid)}"]`);
            await tp.click('[data-seat-mute="mute"]');
            await sleep(1300);
            // The picker opens on the tab it was left on (Throw, just now), so React first.
            await sp.click('[data-pn-emotes-open]');
            await sp.click('[data-emote-tab="react"]');
            await sp.click('[data-emote-react="clap"]');
            const ownClap = await emoteOn(sp, `[data-emote-item="clap"][data-emote-from="${S.pid}"]`, 2000);
            const mutedClap = await emoteOn(tp, `[data-emote-item="clap"][data-emote-from="${S.pid}"]`, 6000);
            check('a player muted for the visit: their reaction shows on their own screen, never on the screen that muted them', ownClap && !mutedClap, `${ownClap} ${mutedClap}`);
            // …and only them: a third player's reaction still shows on that screen.
            const U = onScreen.find((o) => o !== S && o !== T);
            if (U) {
                const sent = await post(U.p, 'emote', {kind: 'react', item: 'wow'});
                const otherShows = await emoteOn(tp, `[data-emote="react"][data-emote-item="wow"][data-emote-from="${U.pid}"]`, 6000);
                check('…and only them: a third player\'s reaction still shows on the screen that muted the first', sent.status === 200 && otherShows, `${sent.status} ${otherShows}`);
            } else {
                check('muting one player hides only theirs: a third seated screen', false, `${onScreen.length} seated screens`);
            }
            await tp.click(`[data-seat-menu="${seatOf(S.pid)}"]`);
            await tp.waitForSelector('[data-seat-mute="show"]', {timeout: 5000});
            await uiWording(tp, 'a plate\'s menu');
            await tp.click('[data-seat-mute="show"]');
            await uiWording(sp, 'the emote picker\'s table');
        }
    }

    // ── P6, between hands: "?" lists the keys, the host's throwables switch, the cooldown from a
    // page's own cookie; then one more hand with A's emotes on every screen and the sounds counted.
    {
        // A switch in a player's My look (lib/poker-night/personal), set to `on`; whether it is.
        const drawerSwitch = async (p, which, on) => {
            const sel = `[data-pn-drawer="look"] [data-pn-personal="${which}"]`;
            await p.page.click('[data-open="menu"]');
            await p.page.click('[data-menu="look"]');
            await p.page.waitForSelector(sel, {timeout: 10000});
            if (await p.page.getAttribute(sel, 'aria-checked') !== String(on)) await p.page.click(sel);
            const now = await p.page.getAttribute(sel, 'aria-checked');
            await p.page.keyboard.press('Escape');
            await p.page.waitForSelector('[data-pn-drawer="look"]', {state: 'detached', timeout: 10000}).catch(() => {});
            return now === String(on);
        };
        const settingIs = async (key, value) => {
            for (let i = 0; i < 40; i++) {
                if ((await roomDoc()).state.settings[key] === value) return true;
                await sleep(150);
            }
            return false;
        };
        const openHostLook = async () => {
            await hp.click('[data-open="host"]');
            await hp.waitForSelector('[data-pn-drawer="host"]', {timeout: 10000});
            await hp.click('[data-host-tab="look"]');
            await hp.waitForSelector('[data-host-section="look"] [data-host-switch="throwables"]', {timeout: 5000});
        };
        const closeHostDrawer = async () => {
            await hp.keyboard.press('Escape');
            await hp.waitForSelector('[data-pn-drawer="host"]', {state: 'detached', timeout: 10000}).catch(() => {});
        };

        // "?" with the focus on the table (nothing focused): every key the table answers, listed.
        await A.page.evaluate(() => {
            if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
        });
        await A.page.keyboard.press('?');
        const listed = await A.page.waitForSelector('[data-pn-shortcuts-dialog]', {timeout: 5000}).then(() => true, () => false);
        const rows = await A.page.locator('[data-pn-shortcuts-dialog] [data-shortcut]').count();
        const keyCount = Object.values(SHORTCUTS).flat().length;
        const listText = await A.page.innerText('[data-pn-shortcuts-dialog]').catch(() => '');
        check(`"?" with the focus on the table opens the keyboard shortcuts, every key the table answers listed (${keyCount})`,
            listed && rows === keyCount && listText.includes(SHORTCUTS_COPY.title), `${listed} ${rows} rows`);
        await uiWording(A.page, 'the keyboard shortcuts');
        await uiShot(A.page, '14-shortcuts-1440');
        await A.page.keyboard.press('Escape');
        await A.page.waitForSelector('[data-pn-shortcuts-dialog]', {state: 'detached', timeout: 5000}).catch(() => {});

        doc = await roomDoc();
        const seatOf = (pid) => doc.state.seats.findIndex((s) => s?.pid === pid);
        if (seatOf(A.pid) === -1 || seatOf(B.pid) === -1 || seatOf(H.pid) === -1 || doc.status === 'closed') {
            check('emotes in a hand: A, B and the host seated', false, `A at ${seatOf(A.pid)}, B at ${seatOf(B.pid)}, host at ${seatOf(H.pid)}, ${doc.status}`);
        } else {
            // The host turns throwables off in the Look section: A's picker loses its Throw tab, and a
            // throw sent straight from A's browser is refused; a phrase would still go.
            await openHostLook();
            await hp.click('[data-host-section="look"] [data-host-switch="throwables"]');
            const off = await settingIs('throwables', false);
            await A.page.click('[data-pn-emotes-open]');
            const saysOff = await A.page.waitForSelector('[data-pn-emote-picker] [data-emote-off]', {timeout: 8000}).then(() => true, () => false);
            const tabs = await A.page.$$eval('[data-pn-emote-picker] [data-emote-tab]', (els) => els.map((e) => e.getAttribute('data-emote-tab')));
            const offText = await A.page.innerText('[data-pn-emote-picker] [data-emote-off]').catch(() => '');
            check('the host turns throwables off in the Look section: A\'s picker offers React and Say, no Throw tab, and says why',
                off && saysOff && tabs.join() === 'react,say' && offText.trim() === EMOTE_COPY.off, `${off} ${saysOff} ${tabs.join()} "${offText}"`);
            await A.page.keyboard.press('Escape');
            await sleep(1300);
            const refused = await post(A, 'emote', {kind: 'throw', item: 'egg', to: B.pid});
            check('…and a throw posted straight from A\'s browser is refused 403 forbidden', refused.status === 403 && refused.body?.error === 'forbidden',
                `${refused.status} ${refused.text.slice(0, 120)}`);
            await hp.click('[data-host-section="look"] [data-host-switch="throwables"]');
            check('…and the host turns them back on', await settingIs('throwables', true));
            await closeHostDrawer();

            // The cooldown, from A's own browser: two emotes inside 1.2 s.
            await sleep(1300);
            const first = await post(A, 'emote', {kind: 'react', item: 'cool'});
            const second = await post(A, 'emote', {kind: 'react', item: 'think'}, {pace: false});
            check('two emotes from A\'s browser inside 1.2 s: the first goes, the second is refused 429 rate_limited',
                first.status === 200 && second.status === 429 && second.body?.error === 'rate_limited', `${first.status} ${second.status} ${second.text.slice(0, 100)}`);

            // B turns the sounds off; every Web Audio start on A's and B's screens is counted from
            // here (AUDIO_PROBE), and the turns wait long enough for the emotes below.
            const soundOff = await drawerSwitch(B, 'sound', false);
            await editRoom({'state.config.turnSeconds': 120});
            await Promise.all([A, B].map((p) => p.page.evaluate(() => {
                window.__pnAudio.osc = 0;
                window.__pnAudio.buffer = 0;
            })));
            const handNo = (await roomDoc()).state.handNo + 1;
            if ((await roomDoc()).status === 'paused') {
                await hp.click('[data-open="host"]');
                await hp.waitForSelector('[data-pn-drawer="host"]', {timeout: 10000});
                await hp.click('[data-host-tab="table"]');
                await hp.click('[data-host-resume]');
                await hp.waitForSelector('[data-host-pause]', {timeout: 15000});
                await closeHostDrawer();
            }

            // Mid-hand, on a turn neither A's nor B's (it waits for its click): A's emotes.
            const aSeat = seatOf(A.pid);
            const bSeat = seatOf(B.pid);
            const attached = (p, sel, timeout) => p.page.waitForSelector(sel, {state: 'attached', timeout}).then(() => true, () => false);
            const emoteTour = async () => {
                // B's picker on the phone, closed without sending.
                await B.page.click('[data-pn-emotes-open]');
                await B.page.waitForSelector('[data-pn-emote-picker]', {timeout: 5000});
                await uiShot(B.page, '14-emote-picker-390');
                await B.page.keyboard.press('Escape');
                // A's picker: every tab's words (a throw's "who gets it?" step too) on the no-advice list.
                await A.page.click('[data-pn-emotes-open]');
                await A.page.waitForSelector('[data-pn-emote-picker]', {timeout: 5000});
                const pickerWords = () => A.page.$eval('[data-pn-emote-picker]', (el) => [
                    el.innerText, ...[...el.querySelectorAll('[aria-label], [title]')].flatMap((b) => [b.getAttribute('aria-label') ?? '', b.getAttribute('title') ?? '']),
                ].join('\n'));
                const words = [];
                await A.page.click('[data-pn-emote-picker] [data-emote-tab="say"]');
                words.push(await pickerWords());
                await A.page.click('[data-pn-emote-picker] [data-emote-tab="throw"]');
                words.push(await pickerWords());
                await A.page.click('[data-emote-throw="rose"]');
                await A.page.waitForSelector('[data-emote-aim="rose"]', {timeout: 5000});
                words.push(await pickerWords());
                await A.page.click('[data-pn-emote-picker] [data-emote-tab="react"]');
                words.push(await pickerWords());
                const hits = findBanned(words.join('\n'));
                check('the no-advice list over the emote picker\'s every tab, its labels and the throw\'s second step', hits.length === 0 && words.every((w) => w.length > 0), hits.join(', '));
                await uiShot(A.page, '14-emote-picker-1440');

                // A reaction: over A's seat on B's, C's and the host's screens, each within its next poll.
                const burst = `[data-emote="react"][data-emote-item="party"][data-emote-from="${A.pid}"]`;
                const sentAt = Date.now();
                await A.page.click('[data-emote-react="party"]');
                const own = await attached(A, burst, 1500);
                const seen = await Promise.all([B, C, H].map(async (p) => {
                    const ok = await attached(p, burst, 6000);
                    const ms = Date.now() - sentAt;
                    const over = ok ? await overSeat(p.page, burst, aSeat).catch(() => false) : false;
                    // Near the top of its rise (it lasts 1.8 s), still by the plate and under the top bar.
                    const risen = ok ? await sleep(1100).then(() => overSeat(p.page, burst, aSeat)).catch(() => false) : false;
                    const below = ok ? await p.page.$eval(burst, (el) => el.hasAttribute('data-below')).catch(() => null) : null;
                    return {who: p.name, ms: ok ? ms : null, over, risen, below};
                }));
                check(`a reaction from A rises over A's seat (under it, drifting down, where A sits along the top) on A's screen at once and on B's, C's and the host's mid-hand, each by its next poll — 3 s apart in a hand, so within 3.5 s with the request (${seen.map((s) => `${s.who} ${s.ms} ms`).join(', ')}) — and never goes behind the top bar`,
                    own && seen.every((s) => s.ms !== null && s.ms <= 3500 && s.over && s.risen), JSON.stringify(seen));

                // A phrase: in a bubble on B's phone, in its words.
                await sleep(1400);
                await A.page.click('[data-pn-emotes-open]');
                await A.page.click('[data-pn-emote-picker] [data-emote-tab="say"]');
                await A.page.click('[data-emote-say="nice-hand"]');
                const bubble = `[data-emote="say"][data-emote-item="nice-hand"][data-emote-from="${A.pid}"]`;
                const said = await B.page.waitForSelector(bubble, {state: 'attached', timeout: 6000}).then((h) => h.textContent(), () => null);
                check(`a phrase from A shows in a speech bubble on B's phone, in its words ("${EMOTE_COPY.phrases['nice-hand']}")`, said?.trim() === EMOTE_COPY.phrases['nice-hand'], String(said));
                await uiShot(B.page, '14-phrase-390');

                // A throw at B: flying on the host's screen, landing on B's plate there, on C's and on B's own.
                await sleep(1400);
                // Each screen records every flight (its running animation) and every impact (where it
                // landed) as it appears: a page polls on its own beat, so one may have drawn the whole
                // throw before another has it at all.
                const probe = () => {
                    window.__pnThrowsSeen = [];
                    window.__pnSplatsSeen = [];
                    new MutationObserver((records) => {
                        for (const r of records) {
                            r.addedNodes.forEach((n) => {
                                if (!(n instanceof Element)) return;
                                for (const el of n.matches('.pn-throw') ? [n] : n.querySelectorAll('.pn-throw')) window.__pnThrowsSeen.push(getComputedStyle(el).animationName);
                                for (const el of n.matches('[data-splat]') ? [n] : n.querySelectorAll('[data-splat]')) {
                                    window.__pnSplatsSeen.push(`${el.getAttribute('data-splat')}@${el.getAttribute('data-splat-seat')}`);
                                }
                            });
                        }
                    }).observe(document.body, {subtree: true, childList: true});
                };
                await Promise.all([H, C, B].map((p) => p.page.evaluate(probe)));
                await A.page.click('[data-pn-emotes-open]');
                await A.page.click('[data-pn-emote-picker] [data-emote-tab="throw"]');
                await A.page.click('[data-emote-throw="tomato"]');
                await A.page.click(`[data-emote-target="${B.pid}"]`);
                const flying = await attached(H, `.pn-throw[data-emote-to="${B.pid}"]`, 6000);
                // Where the flight peaks on the host's screen: its arc kept under the top bar (throwPath's ceiling).
                const peak = flying ? await hp.evaluate((to) => {
                    const t = document.querySelector(`.pn-throw[data-emote-to="${to}"]`);
                    const y = t?.querySelector('.pn-throw-y');
                    const table = document.querySelector('.pn-table');
                    const bar = document.querySelector('[data-pn-topbar]');
                    if (!t || !y || !table || !bar) return null;
                    const dy = parseFloat(y.style.getPropertyValue('--pn-dy'));
                    const arc = parseFloat(y.style.getPropertyValue('--pn-arc'));
                    const glyph = parseFloat(getComputedStyle(y).fontSize);
                    const top = table.getBoundingClientRect().top + parseFloat(t.style.top) + Math.min(dy, 0) - arc - glyph / 2;
                    return {top: Math.round(top), bar: Math.round(bar.getBoundingClientRect().bottom), arc, dy};
                }, B.pid).catch(() => null) : null;
                if (flying) {
                    await hideDevIndicator(hp);
                    await hp.screenshot({path: `${OUT}ui-15-throw-flight-1440.png`});
                }
                check('…and the flight\'s arc on the host\'s screen peaks under the top bar', peak !== null && peak.top >= peak.bar - 1, JSON.stringify(peak));
                // The splat pictured on the host's screen and on B's phone 300 ms after each lands: on
                // B's avatar, never over B's name or stack.
                const onAvatar = (seat) => {
                    const box = (sel) => document.querySelector(sel)?.getBoundingClientRect() ?? null;
                    const splat = box(`[data-splat="tomato"][data-splat-seat="${seat}"]`);
                    const avatar = box(`[data-seat="${seat}"] .pn-avatar`);
                    const name = box(`[data-seat="${seat}"] .pn-plate-name`);
                    const stack = box(`[data-seat="${seat}"] .pn-plate-stack`);
                    if (!splat || !avatar || !name || !stack) return null;
                    const mid = (r) => ({x: r.left + r.width / 2, y: r.top + r.height / 2});
                    // The blob: 86% × 78% of the impact, its middle on the avatar's.
                    const blob = {left: mid(splat).x - splat.width * 0.43, right: mid(splat).x + splat.width * 0.43, top: mid(splat).y - splat.height * 0.39, bottom: mid(splat).y + splat.height * 0.39};
                    const covers = (r) => mid(r).x > blob.left && mid(r).x < blob.right && mid(r).y > blob.top && mid(r).y < blob.bottom;
                    const off = Math.hypot(mid(splat).x - mid(avatar).x, mid(splat).y - mid(avatar).y);
                    return {off: Math.round(off), name: covers(name), stack: covers(stack)};
                };
                const landed = await Promise.all([[H, 1440], [C, null], [B, 390]].map(async ([p, width]) => {
                    const ok = await p.page.waitForFunction((at) => window.__pnSplatsSeen.includes(at), `tomato@${bSeat}`, {timeout: 7000}).then(() => true, () => false);
                    if (!ok || !width) return {ok, at: null};
                    await sleep(300);
                    const at = await p.page.evaluate(onAvatar, bSeat).catch(() => null);
                    await hideDevIndicator(p.page);
                    await p.page.screenshot({path: `${OUT}ui-15-splat-${width}.png`}).catch(() => {});
                    return {ok, at};
                }));
                check('…the splat lands on B\'s avatar, leaving B\'s name and stack readable, on the host\'s screen and on B\'s phone',
                    [landed[0], landed[2]].every((l) => l.ok && l.at !== null && l.at.off <= 4 && !l.at.name && !l.at.stack), JSON.stringify([landed[0].at, landed[2].at]));
                const [hThrows, cThrows] = await Promise.all([H, C].map((p) => p.page.evaluate(() => window.__pnThrowsSeen)));
                check('a tomato from A at B flies across the host\'s screen (.pn-throw-x running) and lands on B\'s plate there, on C\'s screen and on B\'s own ([data-splat] at B\'s seat)',
                    flying && hThrows.length > 0 && hThrows.every((n) => n === 'pn-throw-x') && landed.every((l) => l.ok), JSON.stringify({flying, hThrows, landed}));
                check('…C\'s screen, under reduced motion, draws the impact and never the flight', landed[1].ok && cThrows.length === 0, JSON.stringify(cThrows));

                // "Mute emotes" in B's My look: A's next reaction everywhere but B's screen.
                await sleep(1400);
                const muted = await drawerSwitch(B, 'muteEmotes', true);
                await A.page.click('[data-pn-emotes-open]');
                await A.page.click('[data-pn-emote-picker] [data-emote-tab="react"]');
                await A.page.click('[data-emote-react="fire"]');
                const fire = `[data-emote="react"][data-emote-item="fire"][data-emote-from="${A.pid}"]`;
                const [onA, onH, onB] = await Promise.all([attached(A, fire, 1500), attached(H, fire, 6000), attached(B, fire, 6000)]);
                const unmuted = await drawerSwitch(B, 'muteEmotes', false);
                check('"Mute emotes" in B\'s My look: A\'s next reaction shows on A\'s screen and the host\'s, never on B\'s; and B turns it back off',
                    muted && onA && onH && !onB && unmuted, JSON.stringify({muted, onA, onH, onB, unmuted}));

                // A's own look mid-hand (P5): another seat's card backs drawn in A's back, in LOOKS_CSS's colour.
                const mid = await roomLook(A.page);
                check(`mid-hand, A's screen draws a card back in A's own (${mid?.back}), LOOKS_CSS's colour for it`,
                    mid?.back === 'tartan' && mid.drawnBack !== null && mid.drawnBack === rgbOf(CARD_BACKS.tartan.base), JSON.stringify(mid));

                // Peek in A's My look: A's own cards face down, the hand's name replaced by how to peek;
                // turned up only while pressed.
                const hole = '[data-pn-dock] [data-pn-hole]';
                const holeState = () => A.page.evaluate((sel) => {
                    const h = document.querySelector(sel);
                    if (!h) return null;
                    return {
                        peek: h.getAttribute('data-pn-peek'), pressed: h.getAttribute('aria-pressed'),
                        backs: h.querySelectorAll('.pn-card[data-card="back"]').length, faces: h.querySelectorAll('.pn-card:not([data-card="back"])').length,
                        prompt: document.querySelector('[data-pn-peek-prompt]')?.textContent ?? null, strength: document.querySelector('[data-pn-strength]') !== null,
                    };
                }, hole);
                const peekOn = await drawerSwitch(A, 'peek', true);
                const shut = await holeState();
                const box = await A.page.locator(hole).boundingBox();
                await A.page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
                await A.page.mouse.down();
                await sleep(150);
                const pressed = await holeState();
                await A.page.mouse.up();
                await sleep(150);
                const released = await holeState();
                await uiWording(A.page, 'the dock with Peek on');
                const peekOff = await drawerSwitch(A, 'peek', false);
                const plain = await holeState();
                check(`Peek in A's My look: mid-hand A's cards stay face down with "${LOOKS_COPY.peekPrompt}" in place of the hand's name, turn up while pressed and go face down on letting go; off, they show again`,
                    peekOn && peekOff && shut?.peek === 'hidden' && shut.backs === 2 && shut.faces === 0 && shut.prompt === LOOKS_COPY.peekPrompt && !shut.strength
                    && pressed?.peek === 'shown' && pressed.pressed === 'true' && pressed.faces === 2 && pressed.prompt === null
                    && released?.peek === 'hidden' && released.backs === 2 && plain?.peek === null && plain.faces === 2,
                    JSON.stringify({shut, pressed, released, plain}));

                // B's new look, saved mid-hand: it waits for the hand's end, kept while the drawer is
                // shut, then goes on the table by itself.
                const lookDrawer = '[data-pn-drawer="look"]';
                const bBuilder = `${lookDrawer} [data-pn-look-profile] [data-pn-builder]`;
                const bPreview = `${bBuilder} .pn-seat-in[data-avatar]`;
                const openLook = async () => {
                    await B.page.click('[data-open="menu"]');
                    await B.page.click('[data-menu="look"]');
                    await B.page.waitForSelector(lookDrawer, {timeout: 10000});
                };
                const closeLook = async () => {
                    await B.page.keyboard.press('Escape');
                    await B.page.waitForSelector(lookDrawer, {state: 'detached', timeout: 10000}).catch(() => {});
                };
                await openLook();
                bLookBefore = await B.page.getAttribute(bPreview, 'data-avatar');
                const badge = bLookBefore.split(':')[4] === 'balloon' ? 'cherries' : 'balloon';
                await B.page.click(`${bBuilder} [data-pn-builder-tab="badge"]`);
                await B.page.click(`${bBuilder} [data-pn-choice="avatar-badge"] [data-pn-option="${badge}"]`);
                bLookQueued = await B.page.getAttribute(bPreview, 'data-avatar');
                await B.page.click(`${lookDrawer} [data-pn-look-save]`);
                const waits = await B.page.waitForSelector(`${lookDrawer} [data-pn-look-wait]`, {timeout: 5000}).then((h) => h.textContent(), () => null);
                const greyed = await B.page.locator(`${lookDrawer} [data-pn-look-queued]:disabled`).count();
                await uiShot(B.page, '12-look-queued-390');
                await closeLook();
                await openLook();
                const kept = await B.page.getAttribute(bPreview, 'data-avatar');
                await closeLook();
                const rowMid = (await roomDoc()).players.find((p) => p.pid === B.pid);
                check(`mid-hand, B's new look saved in My look waits for the hand ("${LOOKS_COPY.queued}"), and is still there when the drawer is opened again`,
                    waits?.trim() === LOOKS_COPY.queued && greyed === 1 && kept === bLookQueued && bLookQueued !== bLookBefore && rowMid?.avatar === bLookBefore,
                    JSON.stringify({waits, greyed, kept, bLookQueued, row: rowMid?.avatar}));
                return true;
            };

            let pausedAfter = false;
            let toured = false;
            let bLookBefore = null;
            let bLookQueued = null;
            doc = await playByClicks(handNo, {
                choose: (p) => (p === H ? 'fold' : 'call'),
                before: async (p) => {
                    if (!pausedAfter) {
                        pausedAfter = true;
                        await pauseFromDrawer(); // nothing is dealt after this hand
                    }
                    if (!toured && p !== A && p !== B) toured = await emoteTour();
                },
            });
            check(`hand ${handNo}, the emotes' hand, is played out — the emotes sent on a turn neither A's nor B's`, doc.state.hand.no === handNo && doc.state.hand.phase === 'complete' && toured);
            // B's queued look, sent by B's own page once the hand is over.
            let rowB = null;
            for (let i = 0; i < 40 && rowB?.avatar !== bLookQueued; i++) {
                await sleep(200);
                rowB = (await roomDoc()).players.find((p) => p.pid === B.pid);
            }
            const bSeatNow = (await roomDoc()).state.seats.findIndex((s) => s?.pid === B.pid);
            const bDrawn = await A.page.waitForFunction(({seat, look}) => document.querySelector(`[data-seat="${seat}"] [data-avatar]`)?.getAttribute('data-avatar') === look,
                {seat: bSeatNow, look: bLookQueued}, {timeout: 8000}).then(() => true, () => false);
            check('…and goes on the table by itself when the hand ends: stored, and on A\'s screen', bLookQueued !== null && rowB?.avatar === bLookQueued && bDrawn,
                JSON.stringify({queued: bLookQueued, row: rowB?.avatar, bDrawn}));
            // A's four-colour deck on the cards turned up by the hand's end (P5): a club or a diamond among them, in A's colours.
            const end = await roomLook(A.page);
            check('…and at its end A\'s screen draws a club or a diamond in A\'s four colours',
                end !== null && (end.club !== null || end.diamond !== null) && (end.club === null || end.club === rgbOf(SUIT_COLOURS.four.c))
                && (end.diamond === null || end.diamond === rgbOf(SUIT_COLOURS.four.d)), JSON.stringify(end));
            await sleep(1500); // the last sounds of the hand
            const [audioA, audioB] = await Promise.all([A, B].map((p) => p.page.evaluate(() => ({...window.__pnAudio}))));
            check(`over hand ${handNo} the table's sounds played on A's screen (${audioA.osc} tones and ${audioA.buffer} noise slices started) and none on B's, whose sound is off`,
                soundOff && audioA.osc > 0 && audioA.buffer > 0 && audioB.osc === 0 && audioB.buffer === 0, JSON.stringify({A: audioA, B: audioB}));
            check('…and B turns the sounds back on', await drawerSwitch(B, 'sound', true));

            // A phone driven by touch alone (page.tap: touch events, no mouse): its first tap wakes the
            // table's sound inside a real gesture — a touch's pointerup or touchend, never its
            // pointerdown, which is no gesture to a browser (and iOS starts Web Audio only in a
            // touchend or a click) — and the context runs.
            const touch = await newContext({viewport: {width: 390, height: 844}, isMobile: true, hasTouch: true});
            await touch.addInitScript(AUDIO_GESTURE_PROBE);
            const tapPage = await touch.newPage();
            await tapPage.goto(`${BASE}/play/${code}`, {waitUntil: 'load', timeout: 120000});
            await tapPage.waitForSelector('[data-pn-ready="true"]', {timeout: 60000}).catch(() => {});
            const madeBefore = await tapPage.evaluate(() => window.__pnContexts.length);
            // A tap on the felt by its place on the screen (the board and the seats sit over it).
            const feltBox = await tapPage.locator('.pn-felt').boundingBox();
            await tapPage.touchscreen.tap(feltBox.x + feltBox.width / 2, feltBox.y + feltBox.height / 2);
            const running = await tapPage.waitForFunction(() => window.__pnContexts.some((c) => c.state === 'running'), null, {timeout: 5000}).then(() => true, () => false);
            const audioLog = await tapPage.evaluate(() => window.__pnAudioLog);
            check('a phone driven by taps alone: its first tap makes the table\'s audio context inside the gesture (the page has activation), and it runs',
                madeBefore === 0 && running && audioLog.length > 0 && audioLog[0].active === true, JSON.stringify(audioLog));
            await touch.close().catch(() => {});
        }
    }

    // ── the way out and the break (modes P1), between hands with the game paused ──
    const breakDoc = await roomDoc();
    const leaver = [C, R].find((p) => breakDoc.state.seats.some((x) => x?.pid === p.pid)) ?? null;
    if (breakDoc.status !== 'paused' || (breakDoc.state.hand !== null && breakDoc.state.hand.phase !== 'complete') || !breakDoc.state.seats.some((x) => x?.pid === A.pid) || !leaver) {
        note('the way out and the break between hands', 'the game was not paused between hands with A and a guest seated: not checked');
    } else {
        // B's state reads fail for a while: the dock and the top bar say "Reconnecting…", then
        // "Back online." once they answer again.
        await B.page.route('**/api/poker-night/*/state**', (route) => route.abort());
        const lost = await B.page.waitForSelector('[data-pn-reconnecting]', {timeout: 30000}).then(() => true, () => false);
        const word = lost ? await B.page.locator('[data-pn-connection-word]').evaluate((el) => ({text: el.textContent, shown: el.getBoundingClientRect().width > 1})).catch(() => null) : null;
        if (lost) await uiShot(B.page, '25-reconnecting-390');
        await B.page.unroute('**/api/poker-night/*/state**');
        const back = await B.page.waitForFunction((text) => [...document.querySelectorAll('[data-sonner-toast]')].some((t) => t.textContent?.includes(text)),
            TABLE_COPY.connection.back, {timeout: 30000}).then(() => true, () => false);
        check('with the table unreachable, B\'s dock says "Reconnecting…" (and the top bar the word, even on a phone); then "Back online."',
            lost && word?.text === TABLE_COPY.connection.reconnecting && word.shown && back, JSON.stringify({lost, word, back}));

        // The host sits A out from the bank: at once between hands; A's dock says the host did, and
        // A's own "I'm back" deals A in again.
        await hp.click('[data-open="bank"]');
        await hp.waitForSelector('[data-pn-drawer="bank"]', {timeout: 10000});
        await hp.click(`[data-bank-sit-out-row="${A.pid}"] [data-host-sit-out="offer"] button`);
        let aSeat = null;
        for (let i = 0; i < 40 && !aSeat?.sittingOut; i++) {
            await sleep(200);
            aSeat = (await roomDoc()).state.seats.find((s) => s?.pid === A.pid) ?? null;
        }
        const told = await A.page.waitForSelector('[data-pn-sat-out="host"]', {timeout: 20000}).then(() => true, () => false);
        const toldText = told ? await A.page.innerText('[data-pn-sat-out="host"]') : '';
        await hp.keyboard.press('Escape');
        await hp.waitForSelector('[data-pn-drawer="bank"]', {state: 'detached', timeout: 10000}).catch(() => {});
        await A.page.waitForSelector('[data-pn-seat-controls][data-pn-armed] [data-pn-control="sit-in"]', {timeout: 10000});
        const backLabel = (await A.page.innerText('[data-pn-control="sit-in"]')).trim();
        await A.page.click('[data-pn-control="sit-in"]');
        let aBack = null;
        for (let i = 0; i < 40 && aBack?.sittingOut !== false; i++) {
            await sleep(200);
            aBack = (await roomDoc()).state.seats.find((s) => s?.pid === A.pid) ?? null;
        }
        check('the host sits A out from the bank between hands: at once, A\'s dock says "The host sat you out.", and A\'s "I\'m back" deals A in again',
            aSeat?.sittingOut === true && told && toldText.trim() === TABLE_COPY.hostSatYouOut && backLabel === TABLE_COPY.back && aBack?.sittingOut === false,
            JSON.stringify({aSeat: aSeat && {sittingOut: aSeat.sittingOut}, toldText, backLabel, aBack: aBack && {sittingOut: aBack.sittingOut}}));

        // A guest leaves with one tap (sitting down again would need the host's yes, which the left
        // panel says after): the dock then says what they left with, the way home ("/") and a way back
        // to a seat — and no lobby, which a guest cannot open.
        const G = leaver;
        await G.page.waitForSelector('[data-pn-seat-controls][data-pn-armed] [data-pn-control="leave"]', {timeout: 20000});
        await G.page.click('[data-pn-control="leave"]');
        const left = await G.page.waitForSelector('[data-pn-left]', {timeout: 20000}).then(() => true, () => false);
        const row = (await roomDoc()).state.ledger.find((l) => l.pid === G.pid);
        const panel = left ? await G.page.evaluate(() => ({
            net: Number(document.querySelector('[data-pn-left]')?.getAttribute('data-pn-left')),
            home: document.querySelector('[data-pn-left] [data-pn-home]')?.getAttribute('href') ?? null,
            again: document.querySelector('[data-pn-left] [data-pn-sit-again]') !== null,
            lobby: document.querySelector('[data-pn-left] [data-pn-lobby]') !== null,
        })) : null;
        check(`${G.name} (a guest) leaves between hands with one tap: the left panel shows their net, Home ("/") and "Sit down again", no lobby for a guest`,
            left && !(await roomDoc()).state.seats.some((x) => x?.pid === G.pid) && panel?.net === row.cashedOut - row.bought && panel.home === '/' && panel.again && !panel.lobby,
            JSON.stringify(panel));
        if (left) await uiShot(G.page, '22-left-panel-1440');
    }

    await hp.click('[data-open="host"]');
    await hp.waitForSelector('[data-pn-drawer="host"]', {timeout: 10000});

    // ── the night ends ──
    await hp.click('[data-host-tab="table"]');
    await hp.click('[data-host-end]');
    await hp.getByRole('button', {name: HOST_COPY.end}).last().click();
    const summaries = await Promise.all([H, A, B, C, R].map((p) => p.page.waitForSelector('[data-night-summary]', {timeout: 45000}).then(() => true, () => false)));
    await V.page.goto(`${BASE}/play/${code}`, {waitUntil: 'load', timeout: 120000});
    const fresh = await V.page.waitForSelector('[data-night-summary]', {timeout: 30000}).then(() => true, () => false);
    check('the host ends the night: every context — host, A, B, C, R and a fresh one — sees the summary', summaries.every(Boolean) && fresh,
        `${summaries.join(',')} fresh ${fresh}`);
    doc = await roomDoc();
    check('…the table closed, every chip cashed out', doc.status === 'closed' && conservation(doc.state).ok);
    const footer = await hp.innerText('[data-summary-check]').catch(() => '');
    check('…and the summary\'s footer: every chip accounted for', /^Every chip is accounted for: [\d,]+ brought in\.$/.test(footer.trim()), footer);

    // ── the night's awards (P7): the room's own, drawn, copied and celebrated ──
    {
        const order = await hp.$$eval('[data-standing]', (rows) => rows.map((row) => row.getAttribute('data-standing')));
        const expected = nightAwards(order, doc.state.ledger, throwCountsOf(doc.awards));
        const drawnOn = (page) => page.$$eval('[data-award]', (cards) => cards.map((card) => ({
            id: card.getAttribute('data-award'),
            pids: [...card.querySelectorAll('[data-award-winner]')].map((w) => w.getAttribute('data-award-winner')),
            value: Number(card.getAttribute('data-award-value')),
        })));
        const drawn = await drawnOn(hp);
        check('the summary\'s awards are the ledger\'s counters and the room\'s throws worked out again, every winner on a tie, none without its data',
            JSON.stringify(drawn) === JSON.stringify(expected) && expected.some((a) => a.id === 'most-won'), JSON.stringify({drawn, expected}));
        const tomatoes = Object.values(doc.awards ?? {}).some((t) => t?.received?.tomato > 0);
        check(`…Tomato magnet shown exactly when a tomato landed tonight (${tomatoes ? 'one did' : 'none did'})`, drawn.some((a) => a.id === 'tomato-magnet') === tomatoes);
        {
            const pot = drawn.find((a) => a.id === 'biggest-pot');
            const magnet = drawn.find((a) => a.id === 'tomato-magnet');
            const biggest = Math.max(0, ...doc.state.ledger.filter((l) => order.includes(l.pid)).map((l) => l.biggestWin ?? 0));
            const caught = Math.max(0, ...order.map((pid) => doc.awards?.[pid]?.received?.tomato ?? 0));
            check(`…tonight's data shows on them: Biggest pot (${biggest} chips, the ledger's largest win) and Tomato magnet (${caught}, the most tomatoes one player caught)`,
                pot?.value === biggest && biggest > 0 && magnet?.value === caught && caught > 0, JSON.stringify({pot, magnet}));
        }
        check('…the same awards on a guest\'s phone', JSON.stringify(await drawnOn(B.page)) === JSON.stringify(expected));
        await hp.click('[data-copy-summary]');
        const copied = await hp.evaluate(() => navigator.clipboard.readText()).catch((e) => `unreadable: ${e.message}`);
        const lines = copied.split('\n');
        check('Copy summary puts the standings and one line per award on the clipboard, the footer last',
            expected.every((a) => lines.some((line) => line.startsWith(`${SUMMARY_COPY.awards[a.id]}: `)))
                && lines.length === 2 + order.length + expected.length + 1 && lines.at(-1) === SUMMARY_COPY.footer, copied);
        // The celebration: confetti and the cards stepping in, still under reduced motion (C), and
        // never a sideways scroll on the phone (B).
        const motion = (page) => page.evaluate(() => ({
            confetti: document.querySelectorAll('[data-celebration] .pn-confetti').length,
            cards: [...document.querySelectorAll('.pn-award-in')].map((el) => getComputedStyle(el).animationName),
            bits: [...document.querySelectorAll('[data-celebration] .pn-confetti')].map((el) => getComputedStyle(el).animationName),
            wide: document.documentElement.scrollWidth > window.innerWidth,
        }));
        const [hm, bm, cm] = await Promise.all([motion(hp), motion(B.page), motion(C.page)]);
        check('the summary celebrates as it opens: confetti and the award cards stepping in', hm.confetti > 0 && hm.cards.length === expected.length
            && hm.cards.every((n) => n === 'pn-award-in') && hm.bits.every((n) => n === 'pn-confetti'), JSON.stringify(hm));
        check('…held still under reduced motion: no card moves and no piece flies', cm.cards.length === expected.length
            && cm.cards.every((n) => n === 'none') && cm.bits.every((n) => n === 'none'), JSON.stringify(cm));
        check('…and the confetti never widens the phone\'s page', !bm.wide && bm.confetti > 0, JSON.stringify(bm));
    }

    {
        const homeC = await C.page.getAttribute('[data-summary-home]', 'href').catch(() => null);
        await C.page.click('[data-summary-home]');
        const landed = await C.page.waitForSelector('[data-landing]', {timeout: 60000}).then(() => true, () => false);
        const path = new URL(C.page.url()).pathname;
        check('the summary\'s Home takes a guest to "/", the landing page — never to sign in', homeC === '/' && landed && path === '/', `${homeC} → ${C.page.url()}`);
    }
    await uiWording(hp, 'the night\'s summary');
    await uiShot(hp, '09-summary-1440');
    await uiShot(B.page, '09-summary-390');
    for (const [p, width] of [[H, 1440], [B, 390]]) {
        await p.page.locator('[data-award]').first().scrollIntoViewIfNeeded().catch(() => {});
        await uiShot(p.page, `16-awards-${width}`);
    }

    // ── the lobby's My look (P5): a name, an avatar, a card back and the tables' scene saved to the
    // host's account, and the next table opening with them — from the account alone, this
    // browser's own copy cleared first ──
    {
        await hp.goto(`${BASE}/poker-night`, {waitUntil: 'load', timeout: 180000});
        const panel = '[data-my-look]';
        await hp.waitForSelector(`${panel} [data-pn-builder]`, {timeout: 60000});
        const builder = `${panel} [data-pn-builder]`;
        const preview = `${builder} .pn-seat-in[data-avatar]`;
        const [, face0, colour0, frame0, badge0] = (await hp.getAttribute(preview, 'data-avatar')).split(':');
        const want = {
            face: face0 === 'robot' ? 'rocket' : 'robot', colour: colour0 === 'ocean' ? 'coral' : 'ocean',
            frame: frame0 === 'gold' ? 'neon' : 'gold', badge: badge0 === 'gem' ? 'star' : 'gem',
        };
        await hp.click(`${builder} [data-pn-choice="avatar-face"] [data-pn-option="${want.face}"]`);
        for (const part of ['colour', 'frame', 'badge']) {
            await hp.click(`${builder} [data-pn-builder-tab="${part}"]`);
            await hp.click(`${builder} [data-pn-choice="avatar-${part}"] [data-pn-option="${want[part]}"]`);
        }
        const avatar = await hp.getAttribute(preview, 'data-avatar');
        const name = 'Lobby Lou';
        await hp.fill(`${panel} [data-field="look-name"]`, name);
        const scene = 'beach-sunset';
        await hp.click(`${panel} [data-pn-default-table] [data-pn-choice="scene"] [data-pn-option="${scene}"]`);
        const back = 'starfield';
        await hp.click(`${panel} [data-pn-choice="card-back"] [data-pn-option="${back}"]`);
        await uiWording(hp, 'the lobby with My look filled in');
        await hp.locator(panel).scrollIntoViewIfNeeded();
        await uiShotBoth(hp, '18-lobby-my-look');
        await hp.click(`${panel} [data-save-look]`);
        const saved = await hp.getByText(LOBBY_COPY.saved).waitFor({timeout: 30000}).then(() => true, () => false);
        const closed = await roomDoc();
        const owner = closed.players.find((p) => p.pid === closed.state.hostPid)?.userId;
        const prefs = (await db.collection('userpreferences').findOne({userId: owner}))?.pokerNight ?? null;
        check('the lobby\'s My look saves the name, the avatar from the builder, a card back and the tables\' scene (with its felt) to the account',
            saved && avatar === `v1:${want.face}:${want.colour}:${want.frame}:${want.badge}` && prefs?.name === name && prefs.avatar === avatar
            && prefs.look?.cardBack === back && prefs.table?.scene === scene && prefs.table.felt === SCENES[scene].felt, JSON.stringify(prefs));
        // The save is mirrored into this browser: the name and the avatar, and none of the browser's
        // own look — the account holds it, so a later save from another device reaches the tables here.
        const mirrored = await hp.evaluate((key) => {
            try {
                return JSON.parse(localStorage.getItem(key) ?? 'null');
            } catch {
                return null;
            }
        }, ME_STORAGE_KEY);
        check('…mirrored into this browser as the name and the avatar, with none of the browser\'s own look left to stand over the account\'s',
            mirrored?.name === name && mirrored.avatar === avatar && mirrored.look !== null && typeof mirrored.look === 'object' && Object.keys(mirrored.look).length === 0,
            JSON.stringify(mirrored));
        // The next table, from the account alone: this browser's own copy of the look cleared first.
        await hp.evaluate((key) => localStorage.removeItem(key), ME_STORAGE_KEY);
        await hp.click('[data-quick-start="holdem"]');
        await hp.waitForURL(/\/play\/[A-HJ-NP-Z2-9]{6}(\?.*)?$/, {timeout: 120000});
        const next = new URL(hp.url()).pathname.split('/').pop();
        await hp.waitForSelector('[data-pn-drawer="invite"]', {timeout: 60000}).catch(() => {});
        await hp.keyboard.press('Escape');
        await hp.waitForSelector('[data-me]', {timeout: 30000});
        await hp.waitForSelector('[data-pn-ready="true"]', {timeout: 30000}).catch(() => {});
        const room = await rooms.findOne({env: ENV, code: next});
        const row = room?.players.find((p) => p.pid === room.state.hostPid);
        const seen = await hp.evaluate(() => ({
            avatar: document.querySelector('[data-me] [data-avatar]')?.getAttribute('data-avatar') ?? null,
            name: document.querySelector('[data-me] .pn-plate-name')?.textContent ?? null,
        }));
        const look = await roomLook(hp);
        check(`…and the next table opens with them: the host seated as "${name}" in that avatar, the beach at sunset with its felt, the starfield backs`,
            next !== code && row?.name === name && row.avatar === avatar && room.state.settings.scene === scene && room.state.settings.felt === SCENES[scene].felt
            && seen.avatar === avatar && seen.name?.trim() === name && look?.scene === scene && look.felt === SCENES[scene].felt && look.back === back,
            JSON.stringify({row: row && {name: row.name, avatar: row.avatar}, settings: room?.state.settings, seen, look}));
        await uiShotBoth(hp, '19-next-table');
    }

    // ── what every screen was held to ──
    const fresh_leaks = leaks.slice(leaksBefore);
    check(`no answer a page got, no page HTML and no RSC payload carried the deck or another seat's unshown hole (${responsesChecked - checkedBefore} checked)`,
        fresh_leaks.length === 0 && responsesChecked - checkedBefore > 40, fresh_leaks.slice(0, 5).join(' | '));
    check('no page asked anything of Ably', requested.every((u) => !/ably/i.test(u)), requested.filter((u) => /ably/i.test(u)).slice(0, 2).join(' '));
    check('no page in any context — the API part\'s or the table\'s, the relay\'s included — opened a request or a socket to an Ably host',
        ablyContacts.length === 0 && hostsSeen.size > 0, ablyContacts.length > 0 ? ablyContacts.slice(0, 3).join(' ') : `hosts: ${[...hostsSeen].join(', ')}`);
    // Left out: the browser's own ResizeObserver note, and React's dev-only Server Components
    // performance track, which measures a server render that began before the page's time origin
    // (after a redirect) and throws on the negative time stamp — neither is in a production build.
    const errors = uiErrors.filter((e) => !/ResizeObserver loop|Failed to execute 'measure' on 'Performance'.*negative time stamp/.test(e));
    check('no page error on any table screen', errors.length === 0, errors.slice(0, 3).join(' | '));
};

try {
    if (!db) throw new Error('the API part never reached the database');
    await tableInBrowser();
} catch (err) {
    check(`the table in a browser threw: ${err.message}`, false, err.stack?.split('\n').slice(1, 4).join(' '));
} finally {
    clearInterval(handWatcher);
    if (relay) {
        relay.running = false;
        await relay.loop?.catch(() => {});
    }
    if (db) await db.collection('ratelimits').deleteMany({key: /^poker-night:/}).catch(() => {});
    await mongo.close().catch(() => {});
    await browser.close().catch(() => {});
}

summary('poker-night');
