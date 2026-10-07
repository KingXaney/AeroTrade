// Poker night's table API (app/api/poker-night/[code]/*; lib/poker-night), before the table's
// pages exist: P3 adds its UI checks to this file. A signed-up host's room is inserted through the
// app's own store (lib/poker-night/store.insertRoom, through jiti), and every move after that goes
// through the routes the way a browser sends it — X-PN-Protocol, the same origin, JSON — from one
// browser context per player, each guest with the cookie the join route gave it. Checked: the gates
// (protocol, identity, origin, body), guests who are never better-auth users, a returning join, a
// hand played to a showdown whose winners are worked out again here from the stored holes, nothing
// private in any response on any street, an all-in run-out dealt by ticks alone 1.5 s a street, a
// timeout that waits out the slack, a repeated action id, a seat race, a double-tapped and a retried
// join that make one guest, a rebuy, a removal and its "let back in", a state a newer deploy wrote
// answered reload on every route, the env on every room, index and counter, an unknown code costing
// a miss on every route, a seated player's bucket no one on their address can drain, the in-memory
// limit on a burst of polls, and the copy behind every code the API answered with.
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
const {conservation} = await lib('lib/poker-night/ledger.ts');
const {DEFAULT_CONFIG, ENTRY_FLAGS, ENTRY_KINDS, LEDGER_KINDS, STATE_VERSION, TIMING} = await lib('lib/poker-night/config.ts');
const {PN_PROTOCOL} = await lib('lib/poker-night/http.ts');
const {guestCookieName} = await lib('lib/poker-night/guest-token.ts');
const {faceNameOf} = await lib('lib/poker-night/room.ts');
const {evaluateCards} = await lib('lib/poker/evaluator.ts');
const {POKER_NIGHT_ERRORS, JOIN_COPY} = await lib('lib/learn/copy/poker-night.ts');
const {findBanned} = await lib('lib/learn/banned.ts');
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

// ── what every response is held to ──────────────────────────────────────────────────────────
// Keys no response may carry: the deck, who a player is outside the room, the room's bookkeeping.
const PRIVATE_KEYS = new Set(['deck', 'userId', 'guestId', 'bannedKeys', 'applied', 'seen', 'emoteAt', 'awards', 'lastError', 'hostUserId', '_id']);
// Two-number lists that are seat numbers or chips, never cards.
const NOT_CARDS = new Set(['eligible', 'winners', 'shares', 'showOrder']);
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
// Every edit moves seq on, as a commit would, so the next write's compare-and-set sees it.
const editRoom = (set) => rooms.updateOne({env: ENV, code}, {$set: set, $inc: {seq: 1}});

const rememberHand = (hand) => {
    if (!hand) return;
    const known = dbHands.get(hand.no);
    dbHands.set(hand.no, {
        no: hand.no, board: hand.board,
        seats: hand.seats.map((p) => ({seat: p.seat, pid: p.pid, hole: p.hole, shown: p.shown || (known?.seats.find((q) => q.seat === p.seat)?.shown ?? false)})),
    });
};

// A response's private parts, against Mongo read right after it: no private key, the viewer's own
// hole as dealt, every other seat's cards face down until shown, and no unshown hole pair anywhere.
const leakCheck = async (p, label, body) => {
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
    if (body.hand.board.join() !== truth.board.join()) leaks.push(`${p.name} ${label}: the board is not Mongo's`);
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
    const context = await browser.newContext({viewport});
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
            v = (await tickUntil(players[0], (next) => next.hand?.phase === 'complete' || next.hand?.board.length !== hand.board.length)) ?? v;
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
    const playPage = await strangerPage.goto(`${BASE}/play/${code}`, {waitUntil: 'load'});
    check('/play/CODE is open to a browser with no session: no redirect to sign-in (no page until P3, so 404)',
        playPage?.status() === 404 && new URL(strangerPage.url()).pathname === `/play/${code}`, `${playPage?.status()} ${strangerPage.url()}`);
    await strangerPage.screenshot({path: `${OUT}01-play-before-p3.png`});
    await strangerPage.goto(`${BASE}/players`, {waitUntil: 'load'});
    check('…while /players, a look-alike, still sends it to sign in', /\/sign-in/.test(strangerPage.url()), strangerPage.url());

    let r = await getState(stranger, {headers: {'x-pn-protocol': null}});
    check('GET state without X-PN-Protocol: 426 reload', r.status === 426 && r.body?.error === 'reload', `${r.status} ${r.text}`);
    check('…never cached', /no-store/.test(r.headers['cache-control'] ?? ''), r.headers['cache-control']);
    r = await getState(stranger, {headers: {'x-pn-protocol': '2'}});
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
    const peopleBefore = (await roomDoc()).peopleV;
    view = await playHand(view, checkOrCall);
    let doc = await roomDoc();
    const hand1 = doc.state.hand;
    rememberHand(hand1);
    check('hand 1 goes to a showdown with every street dealt', hand1.no === 1 && hand1.phase === 'complete' && hand1.result?.showdown === true && hand1.board.length === 5);
    {
        const value = new Map(hand1.seats.filter((p) => !p.folded).map((p) => [p.seat, evaluateCards([...hand1.board, ...p.hole])]));
        const expected = hand1.result.pots.map((pot) => {
            const contenders = pot.eligible.length > 0 ? pot.eligible : [...value.keys()];
            const top = Math.max(...contenders.map((s) => value.get(s)));
            return contenders.filter((s) => value.get(s) === top).sort().join(',');
        });
        const paid = view.hand.result.pots.map((pot) => [...pot.winners].sort().join(','));
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
    check('A and B are all in and the host folded: the hand runs out', view.hand.phase === 'runout' && view.hand.board.length === 0 && closedAt !== null);
    const streets = [];
    let last = view;
    const done = await tickUntil(A, (v) => v.hand.phase === 'complete', {timeout: 12000, seen: (v) => {
        if (v.hand.no === 2 && v.hand.board.length !== last.hand.board.length) streets.push({cards: v.hand.board.length, at: v.serverNow});
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

    // --- a rebuy under auto -------------------------------------------------------------------------
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
        check('a double rebuy: one lands, the other would pass the cap (422)', statuses === '200,422' && [x, y].some((q) => q.body?.error === 'over_cap'), statuses);
        const landed = x.status === 200 ? 0 : 1;
        const replay = await post(buyer, 'action', bodies[landed]);
        check('…and its id again is a duplicate', replay.status === 200 && replay.body?.duplicate === true);
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
        const seq = (await roomDoc()).seq;
        await getState(A, {usePass: false}); // a fresh pass: the bucket is the player's own
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
            && hostRow.hands === ledger.hands && hostRow.seq === doc.seq, JSON.stringify(hostRow && {net: hostRow.net, hands: hostRow.hands, seq: hostRow.seq}));
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
} finally {
    if (db) await db.collection('ratelimits').deleteMany({key: /^poker-night:/}).catch(() => {});
    await mongo.close().catch(() => {});
    await browser.close().catch(() => {});
}

summary('poker-night');
