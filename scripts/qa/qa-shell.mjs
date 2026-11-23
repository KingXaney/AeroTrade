// The app shell (components/shell, lib/shell): the icon rail lists the five sections every account
// has (the owner's seven: Strategies and Brain are theirs alone, lib/lab/owner.ts) and names each
// on hover, Portfolio and News open their cards, a section's other pages are tabs on the page,
// ⌘K works by keyboard alone and finds a page by name (Enter runs nothing while the stock search for
// the typed query is out, and opens the first stock once it has answered — never the Follow row
// while anything else was found), the mobile drawer stands in for the rail
// and closes after navigating, and the drawer's Logout signs out and lands on /sign-in. Also
// friends: a sent request is toasted without the name its address is registered under and listed
// with its age, one past the cap of requests waiting or past the hour's count is refused, and the
// recipient sees a dot on the avatar and a count in the account menu. Anyone but the owner meets
// none of the owner's pages: each sends them Home, the routes answer 401, and nothing on their own
// pages leads there. The frame is held by computed style to its density tokens (app/globals.css):
// the bar, the rail and its tiles, where the content starts and how wide its column is, the titles,
// the tab track at the column's left, a grid's gap, the rows' padding and a game page's own column;
// on a phone the round search, the content's sides and one row of tabs.
// Run: npm run qa -- shell   (the harness: README.md)
import {chromium} from 'playwright';
import {MongoClient} from 'mongodb';
import {BASE, HOME_URL, MONGO, check, outDir, ownerEmail, signUp, summary} from './lib.mjs';

const OUT = outDir('shell');
// The harness's Finnhub stand-in (start-finnhub-stub.mjs): ⌘K's stock search answers from it.
const FINNHUB_STUB = `http://localhost:${process.env.QA_FINNHUB_PORT ?? 8791}`;

const browser = await chromium.launch({channel: 'chrome'});
const page = await browser.newPage({viewport: {width: 1440, height: 900}});
const shot = (n) => page.screenshot({path: `${OUT}${n}.png`, fullPage: true});
const mongo = new MongoClient(MONGO);

// A density token in pixels: its value read from :root (getPropertyValue) and resolved by a probe
// element, so `calc(3.5rem + 1rem)` reads as the 72 px it draws. A check compares an element with
// the token, never with a number of its own, so a retuned token moves the suite with it.
const tokensPx = (p, names) => p.evaluate((list) => Object.fromEntries(list.map((name) => {
    const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    const probe = document.createElement('div');
    probe.style.cssText = 'position:absolute;visibility:hidden;height:0';
    probe.style.width = value;
    document.body.append(probe);
    const px = parseFloat(getComputedStyle(probe).width);
    probe.remove();
    return [name, px];
})), names);
// Equal to the half pixel: a box's edges land on fractions of one.
const near = (a, b) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= 0.5;
// A tab track's shape: how many rows its tabs make, its height beside its tallest tab's and its own
// padding, where it sits in the content column (0 from its left; its right, the room it leaves), how
// it wraps and scrolls, and every tab's padding above and below its words.
const trackOf = (p, selector) => p.evaluate((sel) => {
    const track = document.querySelector(sel);
    if (!track) return null;
    const column = document.querySelector('[data-app-content]').firstElementChild.getBoundingClientRect();
    const box = track.getBoundingClientRect();
    const style = getComputedStyle(track);
    const tabs = [...track.children];
    const boxes = tabs.map((t) => t.getBoundingClientRect());
    return {
        rows: new Set(boxes.map((b) => Math.round(b.top))).size,
        height: +box.height.toFixed(2), tab: +Math.max(...boxes.map((b) => b.height)).toFixed(2),
        padY: parseFloat(style.paddingTop) + parseFloat(style.paddingBottom),
        left: +(box.left - column.left).toFixed(2), right: +(column.right - box.right).toFixed(2),
        wrap: style.flexWrap, overflowX: style.overflowX,
        tabPad: tabs.flatMap((t) => [parseFloat(getComputedStyle(t).paddingTop), parseFloat(getComputedStyle(t).paddingBottom)]),
    };
}, selector);

try {
    await mongo.connect();
    const db = mongo.db();
    const firstEmail = await signUp(page, 'one');

    // --- the desktop rail: one icon per section, nothing repeated in the header ---
    const railHrefs = await page.$$eval('aside.rail nav a', (as) => as.map((a) => a.getAttribute('href')));
    // This account is not the owner (lib/lab/owner.ts): no Strategies or Brain icon, and the Learn
    // icon goes to the games, since /learn is the owner's lab.
    check('the rail lists the five sections every account has',
        railHrefs.join(',') === '/,/news,/trade,/portfolio,/games', railHrefs.join(','));
    check('…each named for a screen reader, with the dashboard lit',
        await page.locator('aside.rail nav a[aria-label]').count() === 5
        && await page.locator('aside.rail nav a[aria-current="page"]').getAttribute('data-rail') === 'home');
    check('the header carries no section links',
        await page.locator('header nav a').count() === 0 && await page.locator('header a[href="/"]').count() === 1);
    check('hamburger is hidden at desktop width',
        !(await page.locator('button[aria-label="Open navigation"]').isVisible()));

    // --- the bar's search sits in its middle (.header-bar) ---
    // From md the search is a box with its words, centred in the bar, wide and narrow, whatever
    // the logo's and the account button's widths; below md it is an icon beside the account
    // menu, since a centred icon would meet the logo. The app has one look, so this is one pass
    // under the theme a new account has, with no theme cookie to set.
    // The account button's avatar sits on the bar's middle line (the bar's own box, above its
    // border), and where the logo leads the bar (lg and up, the drawer button hidden) the button's
    // visible edge (the chevron) is as far from the right as the logo's icon is from the left.
    const barPlaces = () => page.evaluate(() => {
        const header = document.querySelector('header.header');
        const bar = header.getBoundingClientRect();
        const border = parseFloat(getComputedStyle(header).borderBottomWidth) || 0;
        const trigger = document.querySelector('header .search-text');
        const search = trigger.getBoundingClientRect();
        const account = document.querySelector('header .header-bar > :last-child').getBoundingClientRect();
        const avatar = document.querySelector('header [data-slot="avatar"]').getBoundingClientRect();
        const chevron = document.querySelector('header [data-slot="avatar"]').closest('button').querySelector('svg').getBoundingClientRect();
        const logo = document.querySelector('header a[href="/"] .material-symbols-outlined').getBoundingClientRect();
        const drawer = document.querySelector('header button[aria-label="Open navigation"]');
        const logoLeads = !drawer || drawer.getBoundingClientRect().width === 0;
        return {
            off: Math.round(search.left + search.width / 2 - (bar.left + bar.width / 2)),
            gap: Math.round(account.left - search.right),
            // Its label and the ⌘K hint are drawn from md only: with neither, it is the icon alone.
            icon: trigger.innerText.trim() === '',
            dy: +(avatar.top + avatar.height / 2 - (bar.top + (bar.height - border) / 2)).toFixed(1),
            edges: logoLeads ? Math.round((bar.right - Math.max(avatar.right, chevron.right)) - (logo.left - bar.left)) : null,
        };
    });
    const barAt = async (width, height, path = '/trade') => {
        await page.setViewportSize({width, height});
        await page.goto(`${BASE}${path}`, {waitUntil: 'load'});
        await page.locator('header .search-text').waitFor({timeout: 30000});
        return barPlaces();
    };
    const offCentre = [];
    const offProfile = [];
    const profileOf = (where, {dy, edges}) => {
        if (Math.abs(dy) > 1 || (edges !== null && Math.abs(edges) > 1)) offProfile.push(`${where}: ${dy}px low, edges ${edges}px apart`);
    };
    for (const width of [1440, 1024, 768]) {
        const places = await barAt(width, 900);
        if (places.icon || Math.abs(places.off) > 1) offCentre.push(`at ${width}px: ${places.icon ? 'an icon' : 'a box'}, ${places.off}px off`);
        profileOf(`at ${width}px`, places);
    }
    check('the bar\'s search is a box in its middle, wide and narrow', offCentre.length === 0, offCentre.join(', '));
    const iconByTheMenu = (places) => places.icon && places.gap >= 0 && places.gap <= 16;
    const phoneBar = await barAt(390, 844);
    check('…and on a phone it is an icon beside the account menu', iconByTheMenu(phoneBar), JSON.stringify(phoneBar));
    profileOf('on a phone', phoneBar);
    // md is 48rem, 768 px: one pixel under it the box has already given way to the icon.
    const underMd = await barAt(767, 900);
    check('…as it is at every width below md, one pixel under it too', iconByTheMenu(underMd), JSON.stringify(underMd));
    profileOf('at 767px', underMd);
    profileOf('on Home at 1440px', await barAt(1440, 900, '/'));
    check('the account button sits on the bar\'s middle line, its edge as far from the right as the logo from the left',
        offProfile.length === 0, offProfile.join(', '));
    await page.locator('aside.rail a[data-rail="markets"]').hover();
    const tip = page.locator('[data-rail-tip="markets"]');
    await tip.waitFor({timeout: 5000}).catch(() => {});
    check('an icon names itself on hover', (await tip.innerText().catch(() => '')).includes('Markets'));
    await page.locator('aside.rail a[data-rail="portfolio"]').hover();
    const flyout = page.locator('[data-rail-flyout="portfolio"]');
    await flyout.waitFor({timeout: 5000}).catch(() => {});
    check('…and Portfolio opens its summary beside the rail', /total return/.test(await flyout.innerText().catch(() => '')));
    await page.locator('aside.rail a[data-rail="news"]').hover();
    const newsFly = page.locator('[data-rail-flyout="news"]');
    await newsFly.waitFor({timeout: 5000}).catch(() => {});
    const newsText = (await newsFly.innerText().catch(() => '')).replace(/\n/g, ' ');
    // `/i`: the card's eyebrow and footer are label-type, whose case the look's type tokens decide.
    check('…and News opens its card, which leads to the news',
        /News/i.test(newsText) && /Open the news/i.test(newsText) && await newsFly.locator('a[href="/news"]').count() === 1, newsText);
    await page.mouse.move(700, 500);

    // --- a section's other pages are tabs on the page ---
    await page.goto(`${BASE}/portfolio`, {waitUntil: 'load'});
    const tabs = await page.$$eval('[data-section-tabs="portfolio"] a', (as) => as.map((a) => `${a.getAttribute('href')}${a.getAttribute('aria-current') === 'page' ? '*' : ''}`));
    check('Portfolio shows Overview and Activity, Overview current', tabs.join(',') === '/portfolio*,/history', tabs.join(','));
    await page.goto(`${BASE}/games`, {waitUntil: 'load'});
    const learnTabs = await page.$$eval('[data-section-tabs="learn"] a', (as) => as.map((a) => `${a.getAttribute('href')}${a.getAttribute('aria-current') === 'page' ? '*' : ''}`));
    check('Learn shows Games, the Poker solver, Poker night and the Glossary, Games current', learnTabs.join(',') === '/games*,/poker,/poker-night,/glossary', learnTabs.join(','));
    // Markets and Trade merged on 2026-10-13: the desk is the Markets section's first page.
    await page.goto(`${BASE}/trade`, {waitUntil: 'load'});
    const marketTabs = await page.$$eval('[data-section-tabs="markets"] a', (as) => as.map((a) => `${a.getAttribute('href')}${a.getAttribute('aria-current') === 'page' ? '*' : ''}`));
    check('Markets shows the trade desk and the Watchlist, the desk current', marketTabs.join(',') === '/trade*,/watchlist', marketTabs.join(','));
    check('…under the Markets heading, with the ticker tape, the ticket and the scan on one page',
        await page.getByRole('heading', {name: 'Markets', exact: true}).count() === 1
        && await page.getByText('Order Entry').count() === 1
        && await page.getByRole('tablist', {name: 'Market views'}).count() === 1);

    // --- the frame, by computed style against the density tokens ------------------------------
    // How much room the frame takes is the density tokens on :root (app/globals.css), each declared
    // once (lib/theme/__tests__/density.test.ts) and read by the frame's rules and the shell's own
    // classes. Each figure is the token's, compared with what its element draws: a rule that
    // silently beats the frame's — one moved between cascade layers, a class at a call site — fails
    // here, where a diff of pictures could not tell it from a change made on purpose.
    const T = await tokensPx(page, ['--header-h', '--rail-w', '--rail-tile', '--search-h', '--content-pt', '--content-px',
        '--content-px-lg', '--content-pb', '--content-max', '--row-pad-y', '--row-pad-x', '--title-size', '--tab-pad-y',
        '--spacing', '--container-3xl']);
    const leading = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--leading-tight')));
    const tokens = (...names) => names.map((name) => `${name} ${T[name]}`).join(', ');
    await page.goto(`${BASE}/portfolio`, {waitUntil: 'load'});
    const frame = await page.evaluate(() => {
        const box = (el) => el.getBoundingClientRect();
        const style = (el) => getComputedStyle(el);
        const wrap = document.querySelector('[data-app-content]');
        const column = wrap.firstElementChild;
        const rail = document.querySelector('aside.rail');
        const search = document.querySelector('header .search-text');
        const inner = {left: box(wrap).left + parseFloat(style(wrap).paddingLeft), right: box(wrap).right - parseFloat(style(wrap).paddingRight)};
        return {
            bar: box(document.querySelector('header.header')).height,
            rail: {width: box(rail).width, top: box(rail).top},
            tiles: [...document.querySelectorAll('aside.rail nav a[data-rail]')].map((a) => [box(a).width, box(a).height]),
            search: {height: box(search).height, radius: parseFloat(style(search).borderTopLeftRadius)},
            pad: {top: parseFloat(style(wrap).paddingTop), side: parseFloat(style(wrap).paddingLeft), bottom: parseFloat(style(wrap).paddingBottom)},
            beside: parseFloat(style(wrap).marginLeft),
            top: box(column).top + scrollY, first: box(column.firstElementChild).top + scrollY,
            width: box(column).width, max: parseFloat(style(column).maxWidth),
            offCentre: +((box(column).left - inner.left) - (inner.right - box(column).right)).toFixed(2),
        };
    });
    check('every density token resolves to a length, and the bar is --header-h tall, the rail --rail-w wide under it, each tile --rail-tile square',
        Object.values(T).every((px) => px > 0) && near(frame.bar, T['--header-h']) && near(frame.rail.width, T['--rail-w']) && near(frame.rail.top, T['--header-h'])
        && frame.tiles.length === 5 && frame.tiles.every(([w, h]) => near(w, T['--rail-tile']) && near(h, T['--rail-tile'])),
        `bar ${frame.bar}, rail ${frame.rail.width} wide at ${frame.rail.top}, tiles ${[...new Set(frame.tiles.map((t) => t.join('×')))].join(' ')} — ${tokens('--header-h', '--rail-w', '--rail-tile')}`);
    check('…the bar\'s search a pill --search-h tall',
        near(frame.search.height, T['--search-h']) && frame.search.radius >= frame.search.height / 2,
        `${frame.search.height} tall, corner ${frame.search.radius} — ${tokens('--search-h')}`);
    check('the content starts --content-pt down, its first pixel there, beside the rail, and keeps --content-pb at its foot',
        near(frame.pad.top, T['--content-pt']) && near(frame.top, T['--content-pt']) && near(frame.first, T['--content-pt'])
        && near(frame.beside, T['--rail-w']) && near(frame.pad.side, T['--content-px-lg']) && near(frame.pad.bottom, T['--content-pb']),
        `padding ${frame.pad.top}/${frame.pad.side}/${frame.pad.bottom}, beside ${frame.beside}, column at ${frame.top}, first pixel at ${frame.first} — ${tokens('--content-pt', '--rail-w', '--content-px-lg', '--content-pb')}`);
    check('…in a column --content-max wide, centred beside the rail',
        near(frame.width, T['--content-max']) && near(frame.max, T['--content-max']) && Math.abs(frame.offCentre) <= 1,
        `${frame.width} wide (max ${frame.max}), ${frame.offCentre}px off centre — ${tokens('--content-max')}`);
    // The tab track is a pill around its tabs at the column's left — the look centred it once.
    const portfolioTabs = await trackOf(page, '[data-section-tabs="portfolio"]');
    check('a section\'s tabs are one row in a track sized to them at the column\'s left, each tab --tab-pad-y above and below its words',
        portfolioTabs !== null && portfolioTabs.rows === 1 && near(portfolioTabs.height, portfolioTabs.tab + portfolioTabs.padY)
        && near(portfolioTabs.left, 0) && portfolioTabs.right > 1 && portfolioTabs.tabPad.every((pad) => near(pad, T['--tab-pad-y'])),
        `${JSON.stringify(portfolioTabs)} — ${tokens('--tab-pad-y')}`);
    // A page's title — the shared PageTitle's and the hand-written ones (an account's heading, a game's)
    // — is --title-size on its own tight line.
    const titles = {};
    let game = null;
    let gameTabs = null;
    for (const path of ['/portfolio', '/trade', '/games/kelly', '/']) {
        if (path !== '/portfolio') await page.goto(`${BASE}${path}`, {waitUntil: 'load'});
        await page.locator('h1').first().waitFor({timeout: 30000}).catch(() => {});
        titles[path] = await page.locator('h1').first().evaluate((h) => [parseFloat(getComputedStyle(h).fontSize), parseFloat(getComputedStyle(h).lineHeight)]).catch(() => null);
        if (path === '/games/kelly') {
            // A game page narrows back to its own column (max-w-3xl) in the middle of the content's,
            // while its section's tabs keep the column's left.
            game = await page.evaluate(() => {
                const el = document.querySelector('[data-game-page]');
                const box = el.getBoundingClientRect();
                const column = document.querySelector('[data-app-content]').firstElementChild.getBoundingClientRect();
                return {width: box.width, max: parseFloat(getComputedStyle(el).maxWidth),
                    offCentre: +((box.left - column.left) - (column.right - box.right)).toFixed(2)};
            }).catch(() => null);
            gameTabs = await trackOf(page, '[data-section-tabs="learn"]');
        }
    }
    const offTitles = Object.values(titles).filter((t) => t === null || !near(t[0], T['--title-size']) || !near(t[1], t[0] * leading));
    check('a page\'s title is --title-size on a tight line, the shared title\'s and the hand-written ones\'',
        offTitles.length === 0 && leading > 0, `${JSON.stringify(titles)} — ${tokens('--title-size')}, --leading-tight ${leading}`);
    check('a game page narrows to its own column, max-w-3xl, in the middle of the content\'s, its section\'s tabs still at the column\'s left',
        game !== null && near(game.width, T['--container-3xl']) && near(game.max, T['--container-3xl']) && Math.abs(game.offCentre) <= 1
        && gameTabs !== null && near(gameTabs.left, 0), `${JSON.stringify({game, tabs: gameTabs})} — ${tokens('--container-3xl')}`);
    // Home's panels: the grid's own gap between them (gap-4, four steps of --spacing), and a row
    // inside one padded by the row tokens (checked below beside a friend request's row). Read once
    // the panels are drawn: a streamed page sits hidden for a moment after 'load'.
    await page.locator('#home-next-step').waitFor({timeout: 30000}).catch(() => {});
    const home = await page.evaluate(() => {
        const accounts = document.querySelector('#home-accounts');
        const next = document.querySelector('#home-next-step');
        const grid = getComputedStyle(accounts.parentElement);
        const row = getComputedStyle(accounts.querySelector('.row-card'));
        return {gap: +(next.getBoundingClientRect().left - accounts.getBoundingClientRect().right).toFixed(2),
            columnGap: parseFloat(grid.columnGap), rowGap: parseFloat(grid.rowGap),
            row: [row.paddingTop, row.paddingRight, row.paddingBottom, row.paddingLeft].map(parseFloat)};
    });
    check('panels side by side stand their grid\'s own gap apart, gap-4 (4 × --spacing), never one the look forces',
        near(home.gap, 4 * T['--spacing']) && near(home.columnGap, 4 * T['--spacing']) && near(home.rowGap, 4 * T['--spacing']),
        `${JSON.stringify(home)} — ${tokens('--spacing')}`);

    // The palette listens for ⌘K from an effect, so a press before Home has hydrated is lost —
    // on a cold dev server that is seconds after 'load'. Wait for the network to settle first.
    await page.goto(`${BASE}/`, {waitUntil: 'networkidle'});

    // --- ⌘K is keyboard-drivable ----------------------------------------------
    await page.keyboard.press('Meta+k');
    await page.waitForSelector('[cmdk-input]', {timeout: 15000});
    check('⌘K opens the palette', await page.locator('[cmdk-input]').isVisible());
    await page.keyboard.type('act');
    check('…and finds a page by name', await page.locator('[data-page-hit="/history"]').count() === 1);
    for (let i = 0; i < 3; i++) await page.keyboard.press('Backspace');
    // A stock query by keyboard alone. Enter runs the selected row, and cmdk selects the first row
    // that can be run after every keystroke: a ticker and Enter once followed a topic of that name,
    // the Follow row standing before the stocks and before the search had answered. The stand-in
    // lists two symbols no other suite searches for (the search is cached by its address).
    await fetch(`${FINNHUB_STUB}/__search?QSHA=QA%20Shell%20Alpha&QSHB=QA%20Shell%20Beta`);
    const paletteRows = () => page.evaluate(() => {
        const kind = (el) => ['page', 'learn', 'stock'].find((k) => el.hasAttribute(`data-${k}-hit`)) ?? (el.hasAttribute('data-topic-row') ? 'topic' : 'other');
        const items = [...document.querySelectorAll('[cmdk-list] [cmdk-item]')];
        const selected = items.find((el) => el.getAttribute('aria-selected') === 'true');
        const topic = document.querySelector('[cmdk-list] [data-topic-row]');
        return {
            kinds: items.map(kind).join(','),
            topic: topic ? `${topic.getAttribute('data-topic-row')}${topic.getAttribute('aria-disabled') === 'true' ? ', disabled' : ''}` : null,
            selected: selected ? selected.getAttribute('data-stock-hit') ?? kind(selected) : null,
        };
    });
    await page.keyboard.type('QSH');
    // Inside the search's debounce: nothing has answered for "QSH" yet.
    const searching = await paletteRows();
    check('while the stock search is out ⌘K draws no stock row, its Follow row waits and no row is selected',
        searching.kinds === 'topic' && searching.topic === 'waiting, disabled' && searching.selected === null, JSON.stringify(searching));
    await page.locator('[data-stock-hit="QSHA"]').waitFor({timeout: 15000}).catch(() => {});
    const answered = await paletteRows();
    check('once it answers, the stocks stand before the Follow row and the first stock is selected',
        answered.kinds === 'stock,stock,topic' && answered.topic === 'ready' && answered.selected === 'QSHA', JSON.stringify(answered));
    await shot('01-palette-keyboard');
    // Arrows + Enter alone — never a mouse. This is what the raw <li>/<Link> rows broke.
    await page.keyboard.press('ArrowDown');
    const moved = (await paletteRows()).selected;
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('Enter');
    await page.waitForURL(/\/stocks\/QSHA$/, {timeout: 10000}).catch(() => {});
    check('the arrows move the selection and Enter opens the first stock',
        moved === 'QSHB' && /\/stocks\/QSHA$/.test(page.url()), `${moved} ${page.url()}`);

    // An Enter pressed while the search is out is kept for it, not dropped: a ticker typed and
    // entered in one go opens its stock once the search answers, and follows no topic of its name.
    await page.goto(`${BASE}/`, {waitUntil: 'networkidle'});
    for (let i = 0; i < 5 && !(await page.locator('[cmdk-input]').isVisible()); i++) {
        await page.keyboard.press('Meta+k');
        await page.waitForSelector('[cmdk-input]', {timeout: 3000}).catch(() => {});
    }
    await page.keyboard.type('QSHB');
    await page.keyboard.press('Enter');
    await page.waitForURL(/\/stocks\/QSHB$/, {timeout: 15000}).catch(() => {});
    check('an Enter pressed while the stock search is out opens the first stock once it answers, and follows no topic',
        /\/stocks\/QSHB$/.test(page.url()) && await db.collection('topics').countDocuments({name: {$in: ['QSH', 'QSHB']}}) === 0, page.url());

    // --- a long list of stocks, and a search that does not answer ---------------
    // The topic row is the list's last, after as many as 25 stocks in a list 400 px tall with no
    // scrollbar: it is pinned to the list's foot, and the row the arrows reach is never under it.
    const many = Array.from({length: 12}, (_, i) => `QST${String.fromCharCode(65 + i)}`);
    await fetch(`${FINNHUB_STUB}/__search?${many.map((s) => `${s}=QA%20Long%20${s.slice(-1)}`).join('&')}`);
    await page.goto(`${BASE}/`, {waitUntil: 'networkidle'});
    // A press before Home has hydrated is lost, and a second press closes the palette again.
    for (let i = 0; i < 5 && !(await page.locator('[cmdk-input]').isVisible()); i++) {
        await page.keyboard.press('Meta+k');
        await page.waitForSelector('[cmdk-input]', {timeout: 3000}).catch(() => {});
    }
    await page.keyboard.type('QST');
    await page.locator('[data-stock-hit="QSTL"]').waitFor({state: 'attached', timeout: 15000}).catch(() => {});
    const pinned = () => page.evaluate(() => {
        const list = document.querySelector('[cmdk-list]');
        const topic = document.querySelector('[cmdk-list] [data-topic-row]');
        const selected = document.querySelector('[cmdk-list] [cmdk-item][aria-selected="true"]');
        if (!list || !topic) return null;
        const box = (el) => el.getBoundingClientRect();
        const foot = topic.closest('.search-topic') ?? topic;
        return {
            stocks: document.querySelectorAll('[cmdk-list] [data-stock-hit]').length,
            scrolls: list.scrollHeight > list.clientHeight + 1,
            topicInSight: box(topic).top >= box(list).top - 1 && box(topic).bottom <= box(list).bottom + 1,
            selected: selected?.getAttribute('data-stock-hit') ?? null,
            selectedClear: selected ? box(selected).bottom <= box(foot).top + 1 : null,
        };
    });
    const longList = await pinned();
    check('with twelve stocks found the list scrolls and the topic row is still in sight',
        longList?.stocks === 12 && longList.scrolls && longList.topicInSight && longList.selected === 'QSTA', JSON.stringify(longList));
    for (let i = 0; i < 11; i++) await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(250);
    const lastStock = await pinned();
    check('…and the last stock the arrows reach is clear of it',
        lastStock?.selected === 'QSTL' && lastStock.selectedClear === true && lastStock.topicInSight, JSON.stringify(lastStock));
    await shot('01b-palette-long-list');

    // A search past the reader's count does not answer (lib/prices/action-limits.ts). That is
    // not "No stocks found": the palette says so and the Follow row goes on waiting — with no
    // stock row it would be Enter's, and a ticker and Enter would follow a topic of its name.
    const first = await db.collection('user').findOne({email: firstEmail});
    const searchKey = `search:${String(first?._id)}`;
    await db.collection('ratelimits').updateOne({key: searchKey},
        {$set: {count: 60, windowStartedAt: new Date(), expiresAt: new Date(Date.now() + 60_000)}}, {upsert: true});
    for (let i = 0; i < 3; i++) await page.keyboard.press('Backspace');
    await page.keyboard.type('QSU');
    const unanswered = page.locator('[data-search-unanswered]');
    await unanswered.waitFor({timeout: 15000}).catch(() => {});
    const refused = await paletteRows();
    const listText = await page.locator('[cmdk-list]').innerText().catch(() => '');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(500);
    check('a search past the reader\'s count is said as unanswered, never as "No stocks found", and the Follow row waits',
        await unanswered.count() === 1 && !/No stocks found/i.test(listText)
        && refused.kinds === 'topic' && refused.topic === 'waiting, disabled' && refused.selected === null, `${JSON.stringify(refused)} ${listText.slice(0, 120)}`);
    check('…so Enter follows no topic of that name',
        await page.locator('[cmdk-input]').isVisible() && await db.collection('topics').countDocuments({name: 'QSU'}) === 0);
    await db.collection('ratelimits').deleteMany({key: {$in: [searchKey, `search:hour:${String(first?._id)}`]}});
    await page.keyboard.press('Escape');
    await fetch(`${FINNHUB_STUB}/__search?QSHA=QA%20Shell%20Alpha&QSHB=QA%20Shell%20Beta`);

    // --- below lg: the drawer stands in for the rail ---------------------------
    await page.setViewportSize({width: 390, height: 844});
    await page.goto(`${BASE}/portfolio`, {waitUntil: 'networkidle'});
    check('the rail is gone and search is still one tap away',
        !(await page.locator('aside.rail').isVisible()) && await page.locator('header button.search-text').isVisible());
    // On a phone the search is a circle as wide as the bar's search is tall (an oval once), and the
    // content, with no rail beside it, keeps --content-px from both edges.
    const phoneFrame = await page.evaluate(() => {
        const search = document.querySelector('header .search-text');
        const box = search.getBoundingClientRect();
        const column = document.querySelector('[data-app-content]').firstElementChild.getBoundingClientRect();
        return {search: [box.width, box.height], corner: parseFloat(getComputedStyle(search).borderTopLeftRadius),
            bar: document.querySelector('header.header').getBoundingClientRect().height,
            sides: [column.left, document.documentElement.clientWidth - column.right]};
    });
    check('on a phone the search is a circle --search-h across, in a bar still --header-h tall',
        near(phoneFrame.search[0], T['--search-h']) && near(phoneFrame.search[1], T['--search-h']) && phoneFrame.corner >= phoneFrame.search[1] / 2
        && near(phoneFrame.bar, T['--header-h']), `${JSON.stringify(phoneFrame)} — ${tokens('--search-h', '--header-h')}`);
    check('…and the content keeps --content-px from both edges', phoneFrame.sides.every((side) => near(side, T['--content-px'])),
        `${JSON.stringify(phoneFrame.sides)} — ${tokens('--content-px')}`);
    check('Activity is a tab on the page, without opening anything', await page.locator('[data-section-tabs] a[href="/history"]:visible').count() === 1);
    const before = await page.locator('a[href="/news"]:visible').count();
    check('news has no visible link before opening the drawer', before === 0, String(before));

    await page.locator('button[aria-label="Open navigation"]').click();
    await page.waitForTimeout(400);
    for (const href of ['/', '/news', '/trade', '/portfolio', '/games', '/friends', '/settings']) {
        check(`drawer reaches ${href}`, await page.locator(`[data-slot="sheet-content"] a[href="${href}"]`).count() === 1);
    }
    check("…and none of the owner's sections",
        await page.locator('[data-slot="sheet-content"] a[href^="/strategies"], [data-slot="sheet-content"] a[href="/brain"], [data-slot="sheet-content"] a[href="/culture"], [data-slot="sheet-content"] a[href="/agent-world"]').count() === 0);
    await shot('02-mobile-drawer');

    // Closing on navigation is manual — Radix does not do it for us.
    await page.locator('[data-slot="sheet-content"] a[href="/trade"]').click();
    await page.waitForURL(/\/trade/, {timeout: 15000});
    await page.waitForTimeout(600);
    check('drawer closes after navigating', await page.locator('[data-slot="sheet-content"]').count() === 0);
    check('landed on /trade, where Watchlist is a tab',
        page.url().endsWith('/trade') && await page.locator('[data-section-tabs="markets"] a[href="/watchlist"]:visible').count() === 1);
    // A section's tabs on a phone are one row that scrolls sideways, never a second row, and stay
    // inside the column (Learn's four are a little wider than a phone).
    await page.goto(`${BASE}/games`, {waitUntil: 'load'});
    const phoneTabs = await trackOf(page, '[data-section-tabs="learn"]');
    check('on a phone a section\'s tabs are one row that scrolls sideways, inside the column',
        phoneTabs !== null && phoneTabs.rows === 1 && phoneTabs.wrap === 'nowrap' && phoneTabs.overflowX === 'auto'
        && near(phoneTabs.height, phoneTabs.tab + phoneTabs.padY) && near(phoneTabs.left, 0) && phoneTabs.right >= -0.5, JSON.stringify(phoneTabs));

    // --- friend-request badge --------------------------------------------------
    const second = await browser.newPage({viewport: {width: 1440, height: 900}});
    const secondEmail = await signUp(second, 'two');
    await second.goto(`${BASE}/friends`, {waitUntil: 'networkidle'});
    const sendRequest = async (email) => {
        await second.fill('input[type="email"]', email);
        await second.locator('form button[type="submit"], button:has-text("Send")').first().click();
    };
    const friendToast = (text) => second.locator('[data-sonner-toast]').filter({hasText: text}).first();
    await sendRequest(firstEmail);
    // The toast says a request was sent and names nobody: the name the address is registered
    // under ("QA one") is not the sender's to learn from it (lib/learn/copy/friends.ts).
    await friendToast('Friend request sent').waitFor({timeout: 15000}).catch(() => {});
    const sentToast = await friendToast('Friend request sent').innerText().catch(() => '');
    check('a sent request is toasted without the name its address is registered under',
        /Friend request sent/.test(sentToast) && !/QA one/.test(sentToast), sentToast);
    await second.waitForTimeout(1500);
    check('sent request shows in the Sent panel',
        await second.getByText('Sent (1)').count() > 0);
    // A row inside a panel is padded by the row tokens (.row-card; RowCard's own classes say none, so
    // a call site may still ask for its own): Home's account row, read above, and this sent request.
    const sentRow = await second.locator('.row-card').filter({hasText: firstEmail}).first()
        .evaluate((el) => { const s = getComputedStyle(el); return [s.paddingTop, s.paddingRight, s.paddingBottom, s.paddingLeft].map(parseFloat); })
        .catch(() => null);
    const rowPadded = (pad) => pad !== null && near(pad[0], T['--row-pad-y']) && near(pad[2], T['--row-pad-y'])
        && near(pad[1], T['--row-pad-x']) && near(pad[3], T['--row-pad-x']);
    check('a row inside a panel is padded by the row tokens: Home\'s account row and a sent friend request',
        rowPadded(home.row) && rowPadded(sentRow), `${JSON.stringify({home: home.row, sent: sentRow})} — ${tokens('--row-pad-y', '--row-pad-x')}`);
    await second.screenshot({path: `${OUT}03-sent-requests.png`, fullPage: true});

    const sender = await db.collection('user').findOne({email: secondEmail});
    const backdated = await db.collection('friendships').updateOne(
        {requesterId: String(sender?._id), status: 'pending'},
        {$set: {createdAt: new Date(Date.now() - 3 * 86_400_000)}});
    await second.reload({waitUntil: 'networkidle'});
    const waiting = await second.getByText(/Waiting · sent/).first().innerText().catch(() => '');
    check('a three-day-old sent request says so', backdated.modifiedCount === 1 && /sent 3 days ago/.test(waiting), waiting);

    // A friend request is counted per reader by the hour, and refused while 20 of the reader's
    // own wait for an answer (lib/friends/limits.ts) — both before the address is looked up.
    // Nineteen more pending rows, to nobody, fill the cap beside the one above; then the counter
    // is set to its limit of 10 rather than spent by ten requests.
    const senderId = String(sender?._id);
    await db.collection('friendships').insertMany(Array.from({length: 19}, (_, i) => ({
        requesterId: senderId, addresseeId: `qa-shell-nobody-${i}`, status: 'pending', createdAt: new Date(), updatedAt: new Date(),
    })));
    await sendRequest(`qanobody${Date.now()}@example.com`);
    const capped = await friendToast('You have 20 friend requests waiting for an answer').waitFor({timeout: 15000}).then(() => true, () => false);
    check('a request while 20 of the reader\'s own wait is refused with the cap\'s sentence', capped);
    await db.collection('friendships').deleteMany({requesterId: senderId, addresseeId: /^qa-shell-nobody-/});
    const requestKey = `friends:request:${senderId}`;
    await db.collection('ratelimits').updateOne({key: requestKey},
        {$set: {count: 10, windowStartedAt: new Date(), expiresAt: new Date(Date.now() + 3_600_000)}}, {upsert: true});
    await sendRequest(`qanobody${Date.now()}@example.com`);
    const limited = await friendToast('That was a lot of friend requests in an hour').waitFor({timeout: 15000}).then(() => true, () => false);
    check('a request past the reader\'s count for the hour is refused with the limit\'s sentence', limited);
    check('…and neither refusal sent anything',
        await db.collection('friendships').countDocuments({requesterId: senderId}) === 1);
    await db.collection('ratelimits').deleteMany({key: requestKey});

    // The recipient should now see a badge without visiting /friends.
    await page.setViewportSize({width: 1440, height: 900});
    await page.goto(`${BASE}/`, {waitUntil: 'networkidle'});
    const badge = await page.locator('header [data-friend-requests="1"]').count();
    check('a pending friend request puts a dot on the avatar', badge === 1, String(badge));
    await page.getByRole('button', {name: /Account menu, 1 pending friend request/}).click();
    check('…and a count beside Friends in the account menu',
        await page.locator('[data-slot="dropdown-menu-content"] a[href="/friends"] span[aria-label="1 pending friend request"]').count() === 1);
    await page.keyboard.press('Escape');
    await shot('04-friend-badge');
    await second.close();

    // --- the owner (lib/lab/owner.ts): Strategies and Brain, and the lab at Learn ---
    const ownerPage = await browser.newPage({viewport: {width: 1440, height: 900}});
    await signUp(ownerPage, 'shell owner', {email: ownerEmail('shell')});
    const ownerRail = await ownerPage.$$eval('aside.rail nav a', (as) => as.map((a) => a.getAttribute('href')));
    check("the owner's rail lists the seven sections, Learn leading to the lab",
        ownerRail.join(',') === '/,/news,/trade,/portfolio,/strategies,/brain,/learn', ownerRail.join(','));
    await ownerPage.goto(`${BASE}/strategies`, {waitUntil: 'load'});
    check('a section of one page shows no tabs', ownerPage.url().endsWith('/strategies') && await ownerPage.locator('[data-section-tabs]').count() === 0, ownerPage.url());
    await ownerPage.goto(`${BASE}/culture`, {waitUntil: 'load'});
    const brainTabs = await ownerPage.$$eval('[data-section-tabs="brain"] a', (as) => as.map((a) => a.getAttribute('href')));
    check("…and the Brain section's tabs are both brains and the trading agent world", brainTabs.join(',') === '/brain,/culture,/agent-world', brainTabs.join(','));
    // A strategy watches SPY, so its page has content of its own with no quote key.
    await ownerPage.goto(`${BASE}/stocks/SPY`, {waitUntil: 'load'});
    check('a stock page lights Markets', await ownerPage.locator('aside.rail nav a[aria-current="page"]').getAttribute('data-rail') === 'markets');
    // ⌘K's Learn rows follow the reader's own glossary (lib/learn/where.ts searchGlossaryFor): the
    // owner's reaches the terms homed on the owner's pages. The palette listens from an effect.
    await ownerPage.goto(`${BASE}/glossary`, {waitUntil: 'networkidle'});
    await ownerPage.keyboard.press('Meta+k');
    await ownerPage.waitForSelector('[cmdk-input]', {timeout: 15000});
    await ownerPage.keyboard.type('thesis');
    await ownerPage.locator('[data-learn-hit="thesis"]').waitFor({timeout: 15000}).catch(() => {});
    check("⌘K offers the owner a glossary term homed on the owner's pages", await ownerPage.locator('[data-learn-hit="thesis"]').count() === 1);
    await ownerPage.close();

    // --- anyone but the owner: none of the owner's pages, routes, widgets or chips ---
    await page.setViewportSize({width: 1440, height: 900});
    for (const path of ['/brain', '/culture', '/strategies', '/strategies/golden-cross', '/agent-world', '/agent-world/office']) {
        await page.goto(`${BASE}${path}`, {waitUntil: 'load'});
        // A page with a loading state streams first and redirects in the browser.
        await page.waitForURL(HOME_URL, {timeout: 15000}).catch(() => {});
        check(`${path} sends anyone but the owner Home`, HOME_URL.test(page.url()), page.url());
    }
    const live = await page.request.get(`${BASE}/api/agent-world/live`);
    const csv = await page.request.get(`${BASE}/api/strategies/golden-cross/export`);
    check("the agent world's live poll and a strategy's CSV answer anyone else 401", live.status() === 401 && csv.status() === 401, `${live.status()} ${csv.status()}`);
    await page.goto(`${BASE}/dashboard`, {waitUntil: 'load'});
    const widgetIds = await page.$$eval('[data-widget-id]', (els) => els.map((el) => el.getAttribute('data-widget-id')));
    check('the default dashboard carries no brain tile', widgetIds.length > 0 && !widgetIds.includes('news-brain-tile'), widgetIds.join(','));
    const missions = await page.locator('[data-widget-id="getting-started"] li[data-done]').count();
    check("…and the first-week checklist leaves out the strategies' and the Navigator's steps", missions === 3, String(missions));
    await page.goto(`${BASE}/glossary`, {waitUntil: 'load'});
    const groups = await page.$$eval('[id^="learn-"]', (els) => els.map((el) => el.id));
    check("the glossary leaves out the groups homed on the owner's pages",
        groups.includes('learn-portfolio') && !groups.some((id) => ['learn-board', 'learn-brain', 'learn-rails', 'learn-culture', 'learn-agent-world'].includes(id)), groups.join(','));
    await page.goto(`${BASE}/`, {waitUntil: 'networkidle'});
    await page.keyboard.press('Meta+k');
    await page.waitForSelector('[cmdk-input]', {timeout: 15000});
    await page.keyboard.type('strat');
    await page.waitForTimeout(300);
    const stratHits = await page.locator('[data-page-hit]').count();
    for (let i = 0; i < 5; i++) await page.keyboard.press('Backspace');
    await page.keyboard.type('brain');
    await page.waitForTimeout(300);
    check('⌘K finds neither the strategies nor a brain for anyone else', stratHits === 0 && await page.locator('[data-page-hit]').count() === 0);
    // A Learn row opens /glossary#term, and this reader's glossary leaves the owner's groups out:
    // a term homed there (the brain's "thesis") is not offered, while their own terms still are.
    for (let i = 0; i < 5; i++) await page.keyboard.press('Backspace');
    await page.keyboard.type('thesis');
    await page.waitForTimeout(300);
    const thesisHits = await page.locator('[data-learn-hit]').count();
    for (let i = 0; i < 6; i++) await page.keyboard.press('Backspace');
    await page.keyboard.type('drawdown');
    await page.locator('[data-learn-hit="max-drawdown"]').waitFor({timeout: 15000}).catch(() => {});
    check("…nor a glossary term homed on the owner's pages, while the reader's own terms are still found",
        thesisHits === 0 && await page.locator('[data-learn-hit="max-drawdown"]').count() === 1, String(thesisHits));
    await page.keyboard.press('Escape');
    await page.getByRole('button', {name: 'Open Aero-AI Assistant'}).click();
    const chips = page.getByRole('button', {name: "What's new in my topics?"});
    await chips.waitFor({timeout: 15000}).catch(() => {});
    check("the chat offers anyone else no chip about the strategies or the brains",
        await chips.count() === 1
        && await page.getByRole('button', {name: 'How does a quant strategy decide?'}).count() === 0
        && await page.getByRole('button', {name: 'What is the culture brain seeing?'}).count() === 0);
    await page.keyboard.press('Escape');
    await shot('05-not-the-owner');

    // --- logout from the mobile drawer --------------------------------------------
    // Its Logout used to close the drawer and stay on the page; every logout button now goes
    // through one hook that lands on /sign-in only once the sign-out succeeded.
    await page.setViewportSize({width: 390, height: 844});
    await page.goto(`${BASE}/portfolio`, {waitUntil: 'networkidle'});
    await page.locator('button[aria-label="Open navigation"]').click();
    await page.waitForTimeout(400);
    await page.locator('[data-slot="sheet-content"] button:has-text("Logout")').click();
    await page.waitForURL(/\/sign-in/, {timeout: 15000}).catch(() => {});
    check('drawer logout lands on /sign-in', /\/sign-in/.test(page.url()), page.url());
    await page.goto(`${BASE}/portfolio`, {waitUntil: 'load'});
    check('…and the session is gone', /\/sign-in/.test(page.url()), page.url());

    // --- the front door, signed out ---------------------------------------------------
    await page.setViewportSize({width: 1440, height: 900});
    await page.goto(`${BASE}/`, {waitUntil: 'load'});
    check('signed out, "/" is the landing page under its own address',
        new URL(page.url()).pathname === '/' && await page.locator('[data-landing]').count() === 1, page.url());
    check('…with one h1, the sign-up button and no app chrome',
        await page.locator('h1').count() === 1 && await page.locator('a[data-landing-cta][href="/sign-up"]').count() === 1
        && await page.locator('aside.rail').count() === 0);
    check('…the three pillars and the not-advice line',
        await page.locator('#landing-news, #landing-learn, #landing-practise').count() === 3
        && /never gives financial advice/.test(await page.locator('[data-landing-disclaimer]').innerText()));
    // The front door describes only what every account can open (lib/learn/copy/landing.ts): the
    // strategies and both brains are the owner's alone, so no pillar names them.
    const OWNERS_ALONE = /strateg|navigator|narrative/i;
    const pillarsText = (await page.locator('#landing-news, #landing-learn, #landing-practise').allInnerTexts()).join(' ');
    check("…which name the account's measure against the S&P 500 and no page that is the owner's alone",
        /S&P 500/.test(pillarsText) && /poker night/i.test(pillarsText) && !OWNERS_ALONE.test(pillarsText), pillarsText.slice(0, 160));
    // The page's theme buttons (components/landing/ThemeDemo) each repaint it in one palette and
    // save nothing: a visitor has no account to save a theme to, so no cookie is written. A theme
    // is a palette and the motion choice — the app has one look — so <html> names no style.
    const themeOf = () => page.evaluate(() => ({
        palette: document.documentElement.getAttribute('data-palette'),
        styled: document.documentElement.hasAttribute('data-style'),
    }));
    const themeBefore = await themeOf();
    await page.locator('[data-theme-demo="gruvbox-dark"]').click();
    await page.waitForFunction(() => document.documentElement.dataset.palette === 'gruvbox-dark', null, {timeout: 5000}).catch(() => {});
    const themeAfter = await themeOf();
    check('a theme button repaints the page in its palette, saving nothing and naming no style',
        themeBefore.palette === 'quiet-cyber' && themeAfter.palette === 'gruvbox-dark' && !themeBefore.styled && !themeAfter.styled
        && !(await page.context().cookies()).some((c) => c.name === 'aero-theme'), JSON.stringify({before: themeBefore, after: themeAfter}));
    await shot('05-landing');
    await page.setViewportSize({width: 390, height: 844});
    await page.goto(`${BASE}/`, {waitUntil: 'load'});
    check('the landing page fits a phone without sideways scroll',
        await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth) <= 1);
    await page.locator('a[data-landing-cta]').click();
    await page.waitForURL(/\/sign-up/, {timeout: 15000}).catch(() => {});
    check('its button opens sign-up, whose logo leads back to it', /\/sign-up/.test(page.url())
        && await page.locator('a.auth-logo[href="/"]').count() === 1);
    // Beside the form (components/auth/AuthShell, the pillars' first points from md up).
    await page.setViewportSize({width: 1440, height: 900});
    const beside = await page.locator('.auth-right-section').innerText();
    check("…and the column beside the form says the same, with no page that is the owner's alone",
        /S&P 500/.test(beside) && !OWNERS_ALONE.test(beside), beside.slice(0, 160));
} catch (err) {
    check(`threw: ${err.message}`, false);
    await shot('99-error').catch(() => {});
} finally {
    await fetch(`${FINNHUB_STUB}/__search`).catch(() => {});
    await mongo.close().catch(() => {});
    await browser.close();
}

summary('shell');
