// The reason decoder: turns the terse strings a strategy writes on its orders, board rows
// and data issues ("enter: RSI(2) 3.4 < 10 with close 123.45 above SMA200 110.00") into
// clauses a learner can read — each one quoting its slice of the reason verbatim, glossed
// in plain English (lib/learn/copy/reasons.ts) and tagged with the glossary entry that
// defines it or the engine rail it turned on.
//
// REASON_GRAMMAR is an ordered list of anchored templates, one per string shape the eight
// rules, planOrders and the engine emit (the round-trip test holds the list to exactly
// that). Glosses interpolate the rule's own parameters through findParam, its slot count
// and drift band, and the engine's CASH_FLOOR and STALE_SKIP_FRACTION, so a parameter
// change moves the prose with it.
//
// NAVIGATOR_GRAMMAR does the same for the AI Navigator (decodeNavigatorReason): every string
// scoreUniverse, diffToOrders and the weekly job's kept-position fallback write, glossed with
// lib/navigator/config.ts and the brain's slow half-life. It is a separate list because the
// two engines share one shape ("rebalance +3.8% drift toward 12.0% target") under different
// bands, so the caller, who knows which engine wrote the string, picks the grammar.
//
// Pure and client-importable. Never throws and never builds a RegExp from its input
// (invariant 2): the chat's explain tool passes it model- and user-supplied text, and a
// string it does not recognise, a truncated one included, comes back whole as `unknown`.

import type {GlossaryKey} from '@/lib/learn/glossary';
import {REASON_GLOSS, shareText, type LegSplit} from '@/lib/learn/copy/reasons';
import {NAVIGATOR_GLOSS, thesisSubject} from '@/lib/learn/copy/navigator';
import {HALF_LIFE_SLOW_DAYS} from '@/lib/brain/config';
import {
    ELIGIBILITY_LOOKBACK_DAYS,
    ENTRY_SCORE_THRESHOLD,
    EXIT_SCORE_THRESHOLD,
    HARD_STOP_DRAWDOWN,
    MAX_POSITION_WEIGHT,
    MAX_POSITIONS,
    MIN_ARTICLES_FOR_ELIGIBILITY,
    MIN_CASH_WEIGHT,
    MIN_DISTINCT_SOURCES,
    MIN_HOLDING_TRADING_DAYS,
    MIN_PRICE_BARS,
    MOMENTUM_MIX,
    REBALANCE_BAND,
    SCORE_WEIGHTS,
    VOLATILITY_HAIRCUT,
} from '@/lib/navigator/config';
import {TOP_QUINTILE_FRACTION} from '@/lib/navigator/scoring';
import {strategyBySlug} from '@/lib/strategies/catalog';
import {CASH_FLOOR, DEFAULT_DRIFT_BAND, STALE_SKIP_FRACTION} from '@/lib/strategies/config';
import {findParam} from '@/lib/strategies/params';
import type {StrategyDefinition, StrategyId} from '@/lib/strategies/types';

// The lib/strategies/config.ts constant a clause turns on, by its name there.
type EngineRail = 'CASH_FLOOR' | 'DEFAULT_DRIFT_BAND' | 'STALE_SKIP_FRACTION';

// The lib/navigator/config.ts constant a Navigator clause turns on, by its name there.
type NavigatorRail =
    | 'SCORE_WEIGHTS' | 'MOMENTUM_MIX' | 'VOLATILITY_HAIRCUT' | 'MIN_ARTICLES_FOR_ELIGIBILITY'
    | 'EXIT_SCORE_THRESHOLD' | 'HARD_STOP_DRAWDOWN' | 'REBALANCE_BAND' | 'MAX_POSITION_WEIGHT' | 'ENTRY_SCORE_THRESHOLD';

// The lib/culture/config.ts constant a culture picker's clause turns on (lib/learn/culture-reasons.ts).
type CultureRail = 'CULTURE_PROFILES' | 'CULTURE_MOMENTUM_MIX' | 'CULTURE_VOLATILITY_HAIRCUT' | 'CULTURE_RAILS' | 'MIN_PRICE_BARS';

export type ReasonClause = {
    // A verbatim slice of the reason.
    text: string;
    gloss: string;
    term?: GlossaryKey;
    rail?: EngineRail | NavigatorRail | CultureRail;
};

export type DecodedReason = {clauses: ReasonClause[]; unknown: string[]};

export type Decode = (match: RegExpExecArray, def: StrategyDefinition | undefined) => ReasonClause[] | null;

export type ReasonTemplate = {
    id: string;
    // The rule that writes this shape; its catalog definition supplies the parameters when
    // the caller passed none, or passed another strategy's.
    owner?: StrategyId;
    pattern: RegExp;
    decode: Decode;
};

// Longer than anything the engine writes (a stale-day list of forty tickers is ~250).
export const MAX_REASON_CHARS = 500;

const SYMBOL = '[A-Z][A-Z0-9.\\-]*';
const PRICE = '\\d+\\.\\d{2}';
export const SIGNED_PCT = '[+-]\\d+\\.\\d%';
export const PCT = '\\d+\\.\\d%';
const DATE = '\\d{4}-\\d{2}-\\d{2}';

export const anchored = (source: string): RegExp => new RegExp(`^${source}$`);

const INVESTED = shareText(1 - CASH_FLOOR);
const FLOOR = shareText(CASH_FLOOR);

const bandOf = (def: StrategyDefinition | undefined): string => shareText(def?.driftBand ?? DEFAULT_DRIFT_BAND);
const slotsOf = (def: StrategyDefinition | undefined): number | null => (def ? def.slots : null);
export const unsigned = (pct: string): string => (pct.startsWith('+') || pct.startsWith('-') ? pct.slice(1) : pct);

// The indicator a "needs N bars" note is waiting on, per rule.
const HISTORY_TERM: Partial<Record<StrategyId, GlossaryKey>> = {
    'golden-cross': 'sma200',
    'rsi2-mean-reversion': 'sma200',
    'momentum-12-1': 'momentum-12-1',
    'low-volatility': 'vol63',
    'donchian-breakout': 'high55',
};

const LEG_PARAM: Record<string, string> = {SPY: 'spyWeight', AGG: 'aggWeight'};

// Board notes, also read inside a "held but …; kept" data issue.
const NOTE_GRAMMAR: readonly ReasonTemplate[] = [
    {
        id: 'note-stale',
        pattern: anchored(`stale: no bar for (${DATE})`),
        decode: (m) => [{text: m[0], gloss: REASON_GLOSS.staleNote(m[1]), term: 'close'}],
    },
    {
        id: 'note-left-universe',
        pattern: anchored('left the universe'),
        decode: (m) => [{text: m[0], gloss: REASON_GLOSS.leftUniverseNote()}],
    },
    {
        id: 'note-no-open-slot',
        pattern: anchored('signal, but no open slot'),
        decode: (m, def) => [{text: m[0], gloss: REASON_GLOSS.noOpenSlot(slotsOf(def))}],
    },
    {
        id: 'note-needs-bars',
        pattern: anchored('needs (\\d+) bars( with highs/lows)?'),
        decode: (m, def) => {
            const term = m[2] ? 'high55' : def ? HISTORY_TERM[def.id] : undefined;
            return [{text: m[0], gloss: REASON_GLOSS.needsBars(m[1], m[2] !== undefined), ...(term ? {term} : {})}];
        },
    },
];

export const decodeWith = (
    templates: readonly ReasonTemplate[],
    text: string,
    def: StrategyDefinition | undefined,
): ReasonClause[] | null => {
    for (const template of templates) {
        const match = template.pattern.exec(text);
        if (!match) continue;
        const owned = template.owner && def?.id !== template.owner ? strategyBySlug(template.owner) : def;
        const clauses = template.decode(match, owned);
        if (clauses) return clauses;
    }
    return null;
};

export const REASON_GRAMMAR: readonly ReasonTemplate[] = [
    // ---- Buy & Hold SPY --------------------------------------------------------------
    {
        id: 'buy-and-hold-initial',
        owner: 'buy-and-hold-spy',
        pattern: anchored(`initial deployment: buy and hold (${SYMBOL})`),
        decode: (m) => [
            {text: 'initial deployment', gloss: REASON_GLOSS.initialDeployment(m[1], INVESTED, FLOOR), rail: 'CASH_FLOOR'},
            {text: `buy and hold ${m[1]}`, gloss: REASON_GLOSS.holdForever(m[1]), term: 'benchmark'},
        ],
    },

    // ---- 60/40 -----------------------------------------------------------------------
    {
        id: 'sixty-forty-leg',
        owner: 'sixty-forty',
        pattern: anchored(`(enter|quarterly rebalance): (${SYMBOL}) (unpriced|${PCT}) → (${PCT}) target`),
        decode: (m, def) => {
            const [, verb, symbol, current, target] = m;
            const key = LEG_PARAM[symbol];
            const share = def && key ? findParam(def, key) : null;
            const split: LegSplit | null = share === null ? null : {share: shareText(share), invested: INVESTED, floor: FLOOR};
            return [
                verb === 'enter'
                    ? {text: verb, gloss: REASON_GLOSS.legEnter(symbol)}
                    : {text: verb, gloss: REASON_GLOSS.legRebalance(bandOf(def)), term: 'drift', rail: 'DEFAULT_DRIFT_BAND'},
                {
                    text: `${symbol} ${current}`,
                    gloss: current === 'unpriced' ? REASON_GLOSS.legUnpriced(symbol) : REASON_GLOSS.legWeight(symbol, current),
                    term: 'weight',
                },
                {text: `→ ${target} target`, gloss: REASON_GLOSS.legTarget(target, split), term: 'target', rail: 'CASH_FLOOR'},
            ];
        },
    },

    // ---- Golden cross ----------------------------------------------------------------
    {
        id: 'golden-cross',
        owner: 'golden-cross',
        pattern: anchored(`(enter|hold|exit): SMA(\\d+) (${PRICE}) (>|≤) SMA(\\d+) (${PRICE})(?: \\((${SIGNED_PCT})\\))?`),
        decode: (m, def) => {
            const [, verb, fast, fastValue, op, slow, slowValue, spread] = m;
            const action: ReasonClause = verb === 'enter'
                ? {text: verb, gloss: REASON_GLOSS.trendEnter(def?.slots ?? 0)}
                : verb === 'hold'
                    ? {text: verb, gloss: REASON_GLOSS.trendHold(bandOf(def)), rail: 'DEFAULT_DRIFT_BAND'}
                    : {text: verb, gloss: REASON_GLOSS.trendExit()};
            const clauses: ReasonClause[] = [
                action,
                {
                    text: `SMA${fast} ${fastValue} ${op} SMA${slow} ${slowValue}`,
                    gloss: op === '>'
                        ? REASON_GLOSS.trendOn(fast, fastValue, slow, slowValue)
                        : REASON_GLOSS.trendOff(fast, fastValue, slow, slowValue),
                    term: 'trend-on',
                },
            ];
            if (spread) {
                clauses.push({text: `(${spread})`, gloss: REASON_GLOSS.spread(unsigned(spread), !spread.startsWith('-')), term: 'spread'});
            }
            return clauses;
        },
    },

    // ---- Dual momentum ---------------------------------------------------------------
    {
        id: 'dual-momentum-pick',
        owner: 'dual-momentum',
        pattern: anchored(
            `monthly: (${SYMBOL}) 12m (${SIGNED_PCT}) (>|≤) T-bill (${SIGNED_PCT})`
            + `(?: (and ≥|but <) (${SYMBOL}) (${SIGNED_PCT}))? → (${SYMBOL})( \\(absolute momentum off\\))?`,
        ),
        decode: (m, def) => {
            const [, symbol, ret, op, bill, relation, other, otherRet, pick, off] = m;
            const clauses: ReasonClause[] = [
                {text: 'monthly', gloss: REASON_GLOSS.gemCheck(def ? findParam(def, 'lookback') : null), term: 'r12'},
                {
                    text: `${symbol} 12m ${ret} ${op} T-bill ${bill}`,
                    gloss: op === '>' ? REASON_GLOSS.gemStocksOn(symbol, ret, bill) : REASON_GLOSS.gemStocksOff(symbol, ret, bill),
                    term: 'above-hurdle',
                },
            ];
            if (relation) {
                clauses.push({
                    text: `${relation} ${other} ${otherRet}`,
                    gloss: relation === 'and ≥' ? REASON_GLOSS.gemHome(symbol, other, otherRet) : REASON_GLOSS.gemAbroad(symbol, other, otherRet),
                    term: 'pick',
                });
            }
            clauses.push({text: `→ ${pick}${off ?? ''}`, gloss: off ? REASON_GLOSS.gemBonds(pick) : REASON_GLOSS.gemPick(pick)});
            return clauses;
        },
    },
    {
        id: 'dual-momentum-rotate',
        owner: 'dual-momentum',
        pattern: anchored(`exit: rotated to (${SYMBOL})`),
        decode: (m) => [{text: `rotated to ${m[1]}`, gloss: REASON_GLOSS.gemRotate(m[1]), term: 'pick'}],
    },

    // ---- 12-1 momentum ---------------------------------------------------------------
    {
        id: 'momentum-select',
        owner: 'momentum-12-1',
        pattern: anchored(`(monthly|hold): ranked #(\\d+)/(\\d+) by 12-1 return \\((${SIGNED_PCT})\\)`),
        decode: (m, def) => {
            const [, verb, position, total, ret] = m;
            const lookback = def ? findParam(def, 'lookback') : null;
            const skip = def ? findParam(def, 'skip') : null;
            const slots = def?.slots ?? 0;
            return [
                {text: verb, gloss: verb === 'hold' ? REASON_GLOSS.rankedHold(slots) : REASON_GLOSS.rankedEnter(slots)},
                {text: `ranked #${position}/${total}`, gloss: REASON_GLOSS.momentumRank(position, total), term: 'momentum-rank'},
                {
                    text: `12-1 return (${ret})`,
                    gloss: REASON_GLOSS.momentumReturn(ret, lookback !== null && skip !== null ? {lookback, skip} : null),
                    term: 'momentum-12-1',
                },
            ];
        },
    },
    {
        id: 'momentum-exit',
        owner: 'momentum-12-1',
        pattern: anchored(`exit: fell to #(\\d+)/(\\d+) \\((${SIGNED_PCT})\\)`),
        decode: (m, def) => [{
            text: `fell to #${m[1]}/${m[2]} (${m[3]})`,
            gloss: REASON_GLOSS.momentumExit(m[1], m[2], m[3], def?.slots ?? 0),
            term: 'momentum-rank',
        }],
    },

    // ---- Low volatility --------------------------------------------------------------
    {
        id: 'low-volatility-select',
        owner: 'low-volatility',
        pattern: anchored(`(monthly|hold): (\\d+)-day realised vol (${PCT}) ranks #(\\d+)/(\\d+) lowest`),
        decode: (m, def) => {
            const [, verb, days, vol, position, total] = m;
            const slots = def?.slots ?? 0;
            return [
                {text: verb, gloss: verb === 'hold' ? REASON_GLOSS.rankedHold(slots) : REASON_GLOSS.rankedEnter(slots)},
                {text: `${days}-day realised vol ${vol}`, gloss: REASON_GLOSS.lowVolReading(days, vol), term: 'vol63'},
                {text: `ranks #${position}/${total} lowest`, gloss: REASON_GLOSS.lowVolRank(position, total), term: 'vol-rank'},
            ];
        },
    },
    {
        id: 'low-volatility-exit',
        owner: 'low-volatility',
        pattern: anchored(`exit: vol rank fell to #(\\d+)/(\\d+) \\((${PCT})\\)`),
        decode: (m, def) => [{
            text: `vol rank fell to #${m[1]}/${m[2]} (${m[3]})`,
            gloss: REASON_GLOSS.lowVolExit(m[1], m[2], m[3], def?.slots ?? 0),
            term: 'vol-rank',
        }],
    },

    // ---- RSI-2 mean reversion --------------------------------------------------------
    {
        id: 'rsi2-enter',
        owner: 'rsi2-mean-reversion',
        pattern: anchored(`enter: RSI\\((\\d+)\\) (\\d+\\.\\d) < (\\d+(?:\\.\\d+)?) with close (${PRICE}) above SMA(\\d+) (${PRICE})`),
        decode: (m, def) => {
            const [, period, value, level, close, length, average] = m;
            return [
                {text: 'enter', gloss: REASON_GLOSS.rsiEnter(def?.slots ?? 0, def ? findParam(def, 'exitSma') : null)},
                {text: `RSI(${period}) ${value} < ${level}`, gloss: REASON_GLOSS.rsiReading(period, value, level), term: 'rsi2'},
                {text: `close ${close} above SMA${length} ${average}`, gloss: REASON_GLOSS.rsiTrend(close, length, average), term: 'above-sma200'},
            ];
        },
    },
    {
        id: 'rsi2-exit',
        owner: 'rsi2-mean-reversion',
        pattern: anchored(`exit: close (${PRICE}) > SMA(\\d+) (${PRICE})`),
        decode: (m) => [
            {text: 'exit', gloss: REASON_GLOSS.rsiExit()},
            {text: `close ${m[1]} > SMA${m[2]} ${m[3]}`, gloss: REASON_GLOSS.rsiExitSignal(m[1], m[2], m[3]), term: 'sma5'},
        ],
    },

    // ---- Donchian breakout -----------------------------------------------------------
    {
        id: 'donchian-enter',
        owner: 'donchian-breakout',
        pattern: anchored(`enter: close (${PRICE}) broke the (\\d+)-day high (${PRICE}) \\((${SIGNED_PCT})\\)`),
        decode: (m, def) => {
            const [, close, days, high, size] = m;
            return [
                {text: 'enter', gloss: REASON_GLOSS.breakoutEnter(def?.slots ?? 0, def ? findParam(def, 'exitChannel') : null)},
                {text: `close ${close} broke the ${days}-day high ${high}`, gloss: REASON_GLOSS.breakoutLevel(close, days, high), term: 'high55'},
                {text: `(${size})`, gloss: REASON_GLOSS.breakoutSize(unsigned(size)), term: 'vs-high'},
            ];
        },
    },
    {
        id: 'donchian-exit',
        owner: 'donchian-breakout',
        pattern: anchored(`exit: close (${PRICE}) < (\\d+)-day low (${PRICE})`),
        decode: (m) => [
            {text: 'exit', gloss: REASON_GLOSS.breakoutExit()},
            {text: `close ${m[1]} < ${m[2]}-day low ${m[3]}`, gloss: REASON_GLOSS.breakoutExitLevel(m[1], m[2], m[3]), term: 'low20'},
        ],
    },

    // ---- planOrders and the engine -----------------------------------------------------
    {
        id: 'rebalance-drift',
        pattern: anchored(`rebalance ([+-]\\d+\\.\\d)% drift toward (\\d+\\.\\d)% target`),
        decode: (m, def) => {
            const [, drift, target] = m;
            const magnitude = `${unsigned(drift)}%`;
            return [
                {text: 'rebalance', gloss: REASON_GLOSS.rebalanceBand(bandOf(def)), rail: 'DEFAULT_DRIFT_BAND'},
                {
                    text: `${drift}% drift`,
                    gloss: drift.startsWith('-') ? REASON_GLOSS.rebalanceOver(magnitude) : REASON_GLOSS.rebalanceUnder(magnitude),
                    term: 'drift',
                },
                {text: `toward ${target}% target`, gloss: REASON_GLOSS.rebalanceTarget(`${target}%`), term: 'target'},
            ];
        },
    },
    {
        id: 'engine-left-universe',
        pattern: anchored('left the strategy universe'),
        decode: (m) => [{text: m[0], gloss: REASON_GLOSS.leftStrategyUniverse()}],
    },
    {
        id: 'engine-stale-day',
        pattern: anchored(`(\\d+)/(\\d+) symbols stale: [A-Z0-9., \\-]*`),
        decode: (m) => [{
            text: `${m[1]}/${m[2]} symbols stale`,
            gloss: REASON_GLOSS.staleDay(m[1], m[2], shareText(STALE_SKIP_FRACTION)),
            rail: 'STALE_SKIP_FRACTION',
        }],
    },
    {
        id: 'skip-cash-floor',
        pattern: anchored('cash floor'),
        decode: (m) => [{text: m[0], gloss: REASON_GLOSS.cashFloor(FLOOR), rail: 'CASH_FLOOR'}],
    },
    {
        id: 'skip-below-one-share',
        pattern: anchored('below one share'),
        decode: (m) => [{text: m[0], gloss: REASON_GLOSS.belowOneShare()}],
    },
    {
        id: 'skip-stale',
        pattern: anchored('stale( target)?'),
        decode: (m) => [{text: m[0], gloss: REASON_GLOSS.staleOrder()}],
    },
    {
        id: 'skip-unpriced',
        pattern: anchored('unpriced( target)?'),
        decode: (m) => [{text: m[0], gloss: REASON_GLOSS.unpricedOrder()}],
    },
    {
        id: 'skip-duplicate-target',
        pattern: anchored('duplicate target'),
        decode: (m) => [{text: m[0], gloss: REASON_GLOSS.duplicateTarget()}],
    },

    // ---- Board notes -------------------------------------------------------------------
    ...NOTE_GRAMMAR,

    // ---- Data issues -------------------------------------------------------------------
    {
        id: 'issue-held-but-kept',
        pattern: anchored(`(${SYMBOL}): held but (.+); kept`),
        decode: (m, def) => {
            const note = decodeWith(NOTE_GRAMMAR, m[2], def);
            return note ? [{text: `${m[1]}: held`, gloss: REASON_GLOSS.heldButKept(m[1])}, ...note] : null;
        },
    },
    {
        id: 'issue-purchase-deferred',
        owner: 'buy-and-hold-spy',
        pattern: anchored(`(${SYMBOL}): stale: no bar for (${DATE}); initial purchase deferred`),
        decode: (m) => [
            {text: `stale: no bar for ${m[2]}`, gloss: REASON_GLOSS.staleNote(m[2]), term: 'close'},
            {text: 'initial purchase deferred', gloss: REASON_GLOSS.purchaseDeferred(m[1])},
        ],
    },
    {
        id: 'issue-rebalance-deferred',
        pattern: anchored(`${SYMBOL}(?:, ${SYMBOL})*: stale: no bar for (${DATE}); (quarterly )?rebalance deferred`),
        decode: (m) => [
            {text: `stale: no bar for ${m[1]}`, gloss: REASON_GLOSS.staleNote(m[1]), term: 'close'},
            {text: `${m[2] ?? ''}rebalance deferred`, gloss: REASON_GLOSS.rebalanceDeferred(m[2] !== undefined)},
        ],
    },
    {
        id: 'issue-return-unavailable',
        owner: 'dual-momentum',
        pattern: anchored(`(${SYMBOL})/(${SYMBOL}) (\\d+)-bar total return unavailable; rebalance deferred`),
        decode: (m) => [{
            text: `${m[3]}-bar total return unavailable`,
            gloss: REASON_GLOSS.returnUnavailable(m[1], m[2], m[3]),
            term: 'r12',
        }],
    },
    {
        id: 'issue-hurdle-missing',
        owner: 'dual-momentum',
        pattern: anchored(`(${SYMBOL}) history missing; hurdle 0`),
        decode: (m) => [{text: m[0], gloss: REASON_GLOSS.hurdleMissing(m[1]), term: 't-bill-rate'}],
    },
];

// ---- The AI Navigator ----------------------------------------------------------------------

// A score weight or momentum mix share as the config spells it: 0.2 → "0.20".
const weightText = (weight: number): string => weight.toFixed(2);

type Horizon = keyof typeof MOMENTUM_MIX;

// 'r126' → 126 sessions → 6 months: the horizon names scoring.ts prints.
const sessionsOf = (horizon: Horizon): number => Number(horizon.slice(1));
const monthsOf = (sessions: number): number => Math.round(sessions / 21);

const horizonsByWeight = (): Horizon[] =>
    (Object.keys(MOMENTUM_MIX) as Horizon[]).sort((a, b) => MOMENTUM_MIX[b] - MOMENTUM_MIX[a]);

// "6-month change 0.50, 12-month 0.30, 3-month 0.20", heaviest first.
const mixText = (): string => horizonsByWeight()
    .map((horizon, i) => `${monthsOf(sessionsOf(horizon))}-month${i === 0 ? ' change' : ''} ${weightText(MOMENTUM_MIX[horizon])}`)
    .join(', ');

const shortestHorizon = (): number => Math.min(...(Object.keys(MOMENTUM_MIX) as Horizon[]).map(sessionsOf));

const EXIT_CLAUSE = (): ReasonClause => ({text: 'exit', gloss: NAVIGATOR_GLOSS.exit(MIN_HOLDING_TRADING_DAYS)});

export const NAVIGATOR_GRAMMAR: readonly ReasonTemplate[] = [
    // ---- scoreUniverse ---------------------------------------------------------------
    {
        id: 'nav-news-rank',
        pattern: anchored('slow news weight (\\d+\\.\\d) \\(rank (\\d+)/(\\d+)\\)'),
        decode: (m) => [
            {text: `slow news weight ${m[1]}`, gloss: NAVIGATOR_GLOSS.newsWeight(m[1], HALF_LIFE_SLOW_DAYS), term: 'news-weight'},
            {text: `(rank ${m[2]}/${m[3]})`, gloss: NAVIGATOR_GLOSS.newsRank(m[2], m[3], weightText(SCORE_WEIGHTS.newsSlow)), rail: 'SCORE_WEIGHTS'},
        ],
    },
    {
        // Written by scoreUniverse (lib/navigator/scoring.ts) for a symbol the brain has no
        // entity for: news neutral, outside the news rank.
        id: 'nav-news-neutral',
        pattern: anchored('no brain coverage — news neutral'),
        decode: (m) => [{text: m[0], gloss: NAVIGATOR_GLOSS.newsNeutral(weightText(SCORE_WEIGHTS.newsSlow)), term: 'news-weight', rail: 'SCORE_WEIGHTS'}],
    },
    {
        id: 'nav-momentum',
        pattern: anchored(`(\\d+)-month momentum (${SIGNED_PCT})`),
        decode: (m) => {
            const horizon = horizonsByWeight().find((h) => String(monthsOf(sessionsOf(h))) === m[1]);
            if (!horizon) return null;
            const sessions = sessionsOf(horizon);
            return [{
                text: m[0],
                gloss: NAVIGATOR_GLOSS.momentum(m[2], sessions, monthsOf(sessions), weightText(SCORE_WEIGHTS.momentumLong), mixText()),
                rail: 'MOMENTUM_MIX',
            }];
        },
    },
    {
        id: 'nav-momentum-missing',
        pattern: anchored('insufficient price history for momentum'),
        decode: (m) => [{text: m[0], gloss: NAVIGATOR_GLOSS.momentumMissing(shortestHorizon() + 1), rail: 'MOMENTUM_MIX'}],
    },
    {
        // The entity key the thesis belongs to (a ticker, 'sector:…' or 'theme:…'), or
        // "active" when scoring was given none.
        id: 'nav-thesis',
        pattern: anchored('thesis ([A-Za-z0-9.:\\-]{1,64})'),
        decode: (m) => [{
            text: m[0],
            gloss: NAVIGATOR_GLOSS.thesis(m[1] === 'active' ? null : thesisSubject(m[1]), weightText(SCORE_WEIGHTS.thesis)),
            term: 'thesis',
            rail: 'SCORE_WEIGHTS',
        }],
    },
    {
        id: 'nav-sector-standing',
        pattern: anchored('([A-Za-z][A-Za-z &\\-]{0,40}) sector standing (-?\\d+\\.\\d)'),
        decode: (m) => [{text: m[0], gloss: NAVIGATOR_GLOSS.sectorStanding(m[1], m[2], weightText(SCORE_WEIGHTS.sectorSlow)), rail: 'SCORE_WEIGHTS'}],
    },
    {
        id: 'nav-trend-cap',
        pattern: anchored('below 200d MA — capped'),
        decode: (m) => [{text: m[0], gloss: NAVIGATOR_GLOSS.trendCap(), term: 'sma200'}],
    },
    {
        id: 'nav-vol-haircut',
        pattern: anchored('high volatility haircut'),
        decode: (m) => [{
            text: m[0],
            gloss: NAVIGATOR_GLOSS.volHaircut(shareText(TOP_QUINTILE_FRACTION), String(VOLATILITY_HAIRCUT)),
            term: 'vol63',
            rail: 'VOLATILITY_HAIRCUT',
        }],
    },
    {
        id: 'nav-ineligible',
        pattern: anchored('ineligible \\((\\d+) articles, (\\d+) sources, (\\d+) bars\\)'),
        decode: (m) => [{
            text: m[0],
            gloss: NAVIGATOR_GLOSS.ineligible(
                {articles: MIN_ARTICLES_FOR_ELIGIBILITY, sources: MIN_DISTINCT_SOURCES, days: ELIGIBILITY_LOOKBACK_DAYS, bars: MIN_PRICE_BARS},
                m[1], m[2], m[3],
            ),
            rail: 'MIN_ARTICLES_FOR_ELIGIBILITY',
        }],
    },

    // ---- diffToOrders ----------------------------------------------------------------
    {
        id: 'nav-exit-score',
        pattern: anchored('exit: (score (-?\\d+\\.\\d{2}) below exit threshold -?\\d+(?:\\.\\d+)?)'),
        decode: (m) => [
            EXIT_CLAUSE(),
            {text: m[1], gloss: NAVIGATOR_GLOSS.exitScore(m[2], String(EXIT_SCORE_THRESHOLD)), rail: 'EXIT_SCORE_THRESHOLD'},
        ],
    },
    {
        id: 'nav-exit-thesis',
        pattern: anchored('exit: thesis broken'),
        decode: () => [EXIT_CLAUSE(), {text: 'thesis broken', gloss: NAVIGATOR_GLOSS.thesisBroken(), term: 'thesis'}],
    },
    {
        id: 'nav-hard-stop',
        pattern: anchored('exit: (hard stop -?(\\d+)% vs cost)'),
        decode: (m) => [
            EXIT_CLAUSE(),
            {text: m[1], gloss: NAVIGATOR_GLOSS.hardStop(`${m[2]}%`, shareText(HARD_STOP_DRAWDOWN)), rail: 'HARD_STOP_DRAWDOWN'},
        ],
    },
    {
        // The strategies' planOrders writes the same shape under its own band; this template
        // is reached only through decodeNavigatorReason.
        id: 'nav-rebalance',
        pattern: anchored('rebalance ([+-]\\d+\\.\\d)% drift toward (\\d+\\.\\d)% target'),
        decode: (m) => {
            const [, drift, target] = m;
            const magnitude = `${unsigned(drift)}%`;
            return [
                {text: 'rebalance', gloss: NAVIGATOR_GLOSS.rebalanceBand(shareText(REBALANCE_BAND), MIN_HOLDING_TRADING_DAYS), rail: 'REBALANCE_BAND'},
                {
                    text: `${drift}% drift`,
                    gloss: drift.startsWith('-') ? NAVIGATOR_GLOSS.rebalanceOver(magnitude) : NAVIGATOR_GLOSS.rebalanceUnder(magnitude),
                },
                {
                    text: `toward ${target}% target`,
                    gloss: NAVIGATOR_GLOSS.target(`${target}%`, shareText(MAX_POSITION_WEIGHT), shareText(MIN_CASH_WEIGHT)),
                    term: 'position-cap',
                    rail: 'MAX_POSITION_WEIGHT',
                },
            ];
        },
    },
    {
        id: 'nav-enter',
        pattern: anchored('enter: (score (-?\\d+\\.\\d{2}))'),
        decode: (m) => [
            {text: 'enter', gloss: NAVIGATOR_GLOSS.enter()},
            {
                text: m[1],
                gloss: NAVIGATOR_GLOSS.enterScore(m[2], String(ENTRY_SCORE_THRESHOLD), MAX_POSITIONS, String(EXIT_SCORE_THRESHOLD)),
                rail: 'ENTRY_SCORE_THRESHOLD',
            },
        ],
    },
    {
        // lib/navigator/store buildHoldItems (allocator.ts HOLDING_REASON).
        id: 'nav-holding',
        pattern: anchored('holding — no exit trigger'),
        decode: (m) => [{text: m[0], gloss: NAVIGATOR_GLOSS.holding()}],
    },
];

// ---- Entry points ------------------------------------------------------------------------

export const decodeGuarded = (reason: string, decode: (text: string) => ReasonClause[] | null): DecodedReason => {
    const text = typeof reason === 'string' ? reason.trim() : '';
    if (!text) return {clauses: [], unknown: []};
    if (text.length > MAX_REASON_CHARS) return {clauses: [], unknown: [text]};
    const clauses = decode(text);
    return clauses ? {clauses, unknown: []} : {clauses: [], unknown: [text]};
};

export const decodeReason = (reason: string, opts: {def?: StrategyDefinition} = {}): DecodedReason =>
    decodeGuarded(reason, (text) => decodeWith(REASON_GRAMMAR, text, opts.def));

// A reason the AI Navigator wrote (a SuggestionSet item's `reasons`).
export const decodeNavigatorReason = (reason: string): DecodedReason =>
    decodeGuarded(reason, (text) => decodeWith(NAVIGATOR_GRAMMAR, text, undefined));

// Every clause of every reason a decision lists, in order; a reason the grammar does not
// know adds nothing (the raw reason is printed beside the gloss either way).
export const glossNavigatorReasons = (reasons: readonly string[]): ReasonClause[] =>
    reasons.flatMap((reason) => decodeNavigatorReason(reason).clauses);
