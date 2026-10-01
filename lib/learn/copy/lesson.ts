// Copy for Today's lesson (components/dashboard/widgets/TodaysLesson.tsx): a first from the
// learner's own account, a followed strategy's rebalance, or a concept today's topic articles
// used. Every sentence describes what happened or what a term measures — none says what to do
// — and is held to the 'copy' tier of lib/learn/banned.ts by lesson-copy.test.ts on a grid of
// rows. A rebalance is described by the catalog's cadence and the StrategyState outcome only;
// the beginner line is never quoted here (it belongs to the strategy header, the wide
// quant-strategies widget and /learn). A term the lesson defines is quoted from the glossary
// ("Win rate: …", GLOSSARY[key].short), never restated in the lesson's own words, so the two
// cannot drift apart; the lesson's own sentences carry only the row's facts.
//
// Import-free of server code: the widget renders it on the server, the Got it button on the client.

import {GLOSSARY, type GlossaryKey} from "@/lib/learn/glossary";
import {DRAWDOWN_MOMENT_THRESHOLD, type Moment} from "@/lib/learn/moments";
import {pctOneDecimal, shortDate, signedMoney} from "@/lib/learn/copy/portfolio";
import {describeNextRebalance} from "@/lib/strategies/calendar";
import {strategyBySlug} from "@/lib/strategies/catalog";
import type {Cadence} from "@/lib/strategies/types";

const MONEY = new Intl.NumberFormat('en-US', {style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2});
// Dividends are declared to the tenth of a cent and beyond (as on the Income panel).
const PER_SHARE = new Intl.NumberFormat('en-US', {style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 6});
const QUANTITY = new Intl.NumberFormat('en-US', {maximumFractionDigits: 4});

const money = (amount: number): string => MONEY.format(amount);
const qty = (n: number): string => QUANTITY.format(n);
const shares = (n: number): string => `${qty(n)} ${n === 1 ? 'share' : 'shares'}`;
// 'Win rate: Sells that locked in a profit, as a share of all sells.' — the glossary's own line.
const defined = (key: GlossaryKey): string => `${GLOSSARY[key].term}: ${GLOSSARY[key].short}`;

export type MomentCopy = {
    label: string;
    title: string;
    // The row's own numbers, one line.
    figure: string;
    body: readonly string[];
    // Glossary entries the widget shows as titled labels (never a disclosure on a widget).
    terms: readonly GlossaryKey[];
    href: string;
    linkLabel: string;
};

export const LESSON_COPY = {
    accountLabel: 'From your account',
    strategyLabel: 'A strategy you follow',
    feedLabel: 'In your topics today',
    dayLabel: 'Term of the day',
    noMatches: 'Nothing in your topics used a glossary term today',
    termsLabel: 'Terms here',
    learnLink: 'More on the Learn page',
    gotIt: 'Got it',
    saving: 'Saving…',
    notSaved: 'That could not be saved just now',
    notSignedIn: 'Not authenticated',
    invalid: 'Not a lesson this app shows',
};

export const lessonCountLine = (count: number): string => `${count} of today's articles in your topics used this term`;

export const lessonLearnHref = (key: GlossaryKey): string => `/learn#${encodeURIComponent(key)}`;

const CADENCE_LINE: Record<Exclude<Cadence, 'daily'>, string> = {
    monthly: 'It re-runs its rule on the first trading day of each month and trades only then; between those days it keeps what it has.',
    quarterly: 'It resets its weights to their targets on the first trading day of each quarter; between those days the weights drift with prices.',
    once: 'It bought once, on its first run, and has kept what it bought ever since.',
};

const CADENCE_TERMS: Record<Exclude<Cadence, 'daily'>, readonly GlossaryKey[]> = {
    monthly: ['target', 'weight'],
    quarterly: ['target', 'weight', 'drift'],
    once: ['weight'],
};

const fillCopy = (moment: Extract<Moment, {kind: 'first-fill'}>): MomentCopy => {
    const {fill} = moment;
    const verb = fill.side === 'buy' ? 'Bought' : 'Sold';
    return {
        label: LESSON_COPY.accountLabel,
        title: 'Your first paper trade',
        figure: `${verb} ${qty(fill.quantity)} ${fill.symbol} at ${money(fill.price)} · ${shortDate(fill.date)}`,
        body: [
            defined('market-order'),
            fill.side === 'buy'
                ? `The price paid is now the average cost of the ${fill.symbol} shares held.`
                : 'A sale is measured against the average cost of the shares it closed.',
            'Every fill in the trade log on /portfolio opens to a receipt: the cash that moved and the shares before and after.',
        ],
        terms: ['market-order', 'avg-cost'],
        href: '/portfolio',
        linkLabel: 'Open the trade log',
    };
};

const sellCopy = (moment: Extract<Moment, {kind: 'first-sell'}>): MomentCopy => {
    const {sell} = moment;
    const realized = sell.realizedPnl === null ? '' : ` · realized ${signedMoney(sell.realizedPnl)}`;
    return {
        label: LESSON_COPY.accountLabel,
        title: 'Your first sell',
        figure: `Sold ${qty(sell.quantity)} ${sell.symbol} at ${money(sell.price)}${realized} · ${shortDate(sell.date)}`,
        body: [
            defined('realized-pnl'),
            `${defined('win-rate')} This is the first sell it counts.`,
            defined('unrealized-pnl'),
        ],
        terms: ['realized-pnl', 'win-rate', 'unrealized-pnl'],
        href: '/portfolio',
        linkLabel: 'Open the trade log',
    };
};

const dividendCopy = (moment: Extract<Moment, {kind: 'first-dividend'}>): MomentCopy => {
    const {dividend: d} = moment;
    const arithmetic = d.quantity !== null && d.perShare !== null
        ? `${shares(d.quantity)} × ${PER_SHARE.format(d.perShare)} = ${money(d.amount)}`
        : money(d.amount);
    return {
        label: LESSON_COPY.accountLabel,
        title: 'Your first dividend',
        figure: `${d.symbol}: ${arithmetic} · paid ${shortDate(d.date)}`,
        body: [
            d.exDate
                ? `The account held ${d.symbol} at the close before its ex-dividend date, ${shortDate(d.exDate)}, so the payment came to it.`
                : `The account held ${d.symbol} at the close before its ex-dividend date, so the payment came to it.`,
            'It arrives as cash on the pay date, like the interest on idle cash: income, not a trade, so the trade count and win rate stay as they were.',
            'The Income panel on /portfolio opens each dividend to its arithmetic.',
        ],
        terms: ['ex-date', 'pay-date', 'income'],
        href: '/portfolio#income',
        linkLabel: 'Open the Income panel',
    };
};

const drawdownCopy = (moment: Extract<Moment, {kind: 'first-drawdown'}>): MomentCopy => {
    const {drawdown: w} = moment;
    const crossesYear = w.peakDate.slice(0, 4) !== w.date.slice(0, 4);
    const fallPct = w.pct * 100;
    const recoveryPct = (w.peakValue / w.value - 1) * 100;
    return {
        label: LESSON_COPY.accountLabel,
        title: `Your account's first ${Math.round(DRAWDOWN_MOMENT_THRESHOLD * 100)}% drop`,
        figure: `${pctOneDecimal(-fallPct)} from the ${shortDate(w.peakDate, crossesYear)} high of ${money(w.peakValue)} · ${shortDate(w.date, crossesYear)}`,
        body: [
            defined('max-drawdown'),
            `From ${Math.abs(Math.round(fallPct * 10) / 10).toFixed(1)}% down, it takes ${pctOneDecimal(recoveryPct)} to get back to the old high.`,
            'The Max drawdown tile on /portfolio dates the largest fall, with SPY over the same days.',
        ],
        terms: ['max-drawdown', 'recovery'],
        href: '/portfolio',
        linkLabel: 'Open the chart',
    };
};

const rebalanceCopy = (moment: Extract<Moment, {kind: 'rebalance'}>): MomentCopy => {
    const {rebalance: r} = moment;
    const def = strategyBySlug(r.strategyId);
    const cadence: Exclude<Cadence, 'daily'> = def && def.cadence !== 'daily' ? def.cadence : 'monthly';
    const name = def?.name ?? r.strategyId;
    const next = cadence === 'once' ? [] : [`The next check: ${describeNextRebalance(cadence, r.date)}.`];
    return {
        label: LESSON_COPY.strategyLabel,
        title: `${name}: rebalance check`,
        figure: `${r.traded ? 'Orders placed' : 'No orders'} · ${shortDate(r.date)}`,
        body: [
            CADENCE_LINE[cadence],
            r.traded
                ? 'This check placed orders; the strategy\'s page lists each one with the reason the rule gave.'
                : 'This check left every holding as it was.',
            ...next,
        ],
        terms: CADENCE_TERMS[cadence],
        href: `/strategies/${r.strategyId}`,
        linkLabel: 'Open the strategy',
    };
};

export const momentCopy = (moment: Moment): MomentCopy => {
    switch (moment.kind) {
        case 'first-fill':
            return fillCopy(moment);
        case 'first-sell':
            return sellCopy(moment);
        case 'first-dividend':
            return dividendCopy(moment);
        case 'first-drawdown':
            return drawdownCopy(moment);
        case 'rebalance':
            return rebalanceCopy(moment);
    }
};
