import {describe, expect, it} from 'vitest';
import {
    CATEGORY_LABELS,
    CATEGORY_ORDER,
    DATA_KEYS,
    DATA_KEY_DEPS,
    LAZY_DATA_KEYS,
    SPAN_LABELS,
    WIDGETS,
    WIDGET_IDS,
    WIDGET_SPANS,
    clampSpan,
    isWidgetAvailable,
    isWidgetId,
    resolveDataKeys,
    type DataKey,
    type WidgetId,
} from '@/lib/dashboard/widgets';
import {DEFAULT_LAYOUT} from '@/lib/dashboard/layout';

const defs = Object.values(WIDGETS);
const spanSet = new Set<number>(WIDGET_SPANS);
const dataKeySet = new Set<string>(DATA_KEYS);

describe('registry invariants', () => {
    it('has 31 unique ids whose table keys match their id field', () => {
        expect(WIDGET_IDS).toHaveLength(31);
        expect(new Set(WIDGET_IDS).size).toBe(31);
        expect(Object.keys(WIDGETS).sort()).toEqual([...WIDGET_IDS].sort());
        for (const id of WIDGET_IDS) {
            expect(WIDGETS[id].id).toBe(id);
        }
    });

    it('defaultSpan is one of the widget\'s own spans', () => {
        for (const def of defs) {
            expect(def.spans, def.id).toContain(def.defaultSpan);
        }
    });

    it('spans are sorted ascending, unique and a subset of WIDGET_SPANS', () => {
        for (const def of defs) {
            expect(def.spans.length, def.id).toBeGreaterThan(0);
            expect([...def.spans], def.id).toEqual([...new Set(def.spans)].sort((a, b) => a - b));
            for (const span of def.spans) {
                expect(spanSet.has(span), `${def.id} span ${span}`).toBe(true);
            }
        }
    });

    it('link chrome implies an in-app href', () => {
        for (const def of defs) {
            if (def.chrome === 'link') {
                expect(def.href, def.id).toMatch(/^\//);
            }
        }
    });

    it('data keys are known and unique per widget', () => {
        for (const def of defs) {
            expect(new Set(def.dataKeys).size, def.id).toBe(def.dataKeys.length);
            for (const key of def.dataKeys) {
                expect(dataKeySet.has(key), `${def.id} key ${key}`).toBe(true);
            }
        }
    });

    it('every widget has a title, description, icon and positive minHeight', () => {
        for (const def of defs) {
            expect(def.title.trim(), def.id).not.toBe('');
            expect(def.description.trim(), def.id).not.toBe('');
            expect(def.icon, def.id).toMatch(/^[a-z_]+$/);
            expect(def.minHeight, def.id).toBeGreaterThan(0);
        }
    });

    it('categories are known and WIDGET_IDS is grouped in CATEGORY_ORDER', () => {
        const ranks = WIDGET_IDS.map((id) => CATEGORY_ORDER.indexOf(WIDGETS[id].category));
        for (const rank of ranks) {
            expect(rank).toBeGreaterThanOrEqual(0);
        }
        expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
        expect(new Set(CATEGORY_ORDER).size).toBe(CATEGORY_ORDER.length);
    });

    it('topics lead the library and every category has a label', () => {
        expect(CATEGORY_ORDER[0]).toBe('topics');
        expect(Object.keys(CATEGORY_LABELS).sort()).toEqual([...CATEGORY_ORDER].sort());
        for (const label of Object.values(CATEGORY_LABELS)) {
            expect(label.trim()).not.toBe('');
        }
    });

    it('the topics widgets are plain panels flagged as new', () => {
        const topics = defs.filter((d) => d.category === 'topics').map((d) => d.id).sort();
        expect(topics).toEqual(['topic-briefs', 'topics-latest', 'topics-overview']);
        for (const id of topics) {
            expect(WIDGETS[id].chrome, id).toBe('panel');
            expect(WIDGETS[id].isNew, id).toBe(true);
        }
        expect(defs.filter((d) => d.isNew).map((d) => d.id).sort()).toEqual(topics);
        expect(WIDGETS['topics-latest'].dataKeys).toEqual(['topicsLatest']);
        expect(WIDGETS['topic-briefs'].dataKeys).toEqual(['topicsOverview']);
    });

    it('TradingView widgets embed without data of our own', () => {
        const tv = defs.filter((d) => d.id.startsWith('tv-'));
        expect(tv).toHaveLength(6);
        for (const def of tv) {
            expect(def.dataKeys, def.id).toEqual([]);
            expect(def.isClient, def.id).toBe(true);
            expect(def.wideOnTablet, def.id).toBe(true);
            expect(def.chrome, def.id).toBe(def.id === 'tv-ticker-tape' ? 'panel-sm' : 'panel-lg');
        }
    });

    it('matches the plan table for the special cases', () => {
        expect(WIDGETS['quick-trade'].dataKeys).toEqual(['activeAccount']);
        expect(WIDGETS['strategy-comparison'].availability).toBe('multiAccount');
        expect(WIDGETS['brain-status'].availability).toBe('advanced');
        for (const id of ['portfolio-snapshot', 'watchlist-movers', 'friends-rank', 'news-brain-tile'] as const) {
            expect(WIDGETS[id].chrome, id).toBe('link');
        }
        for (const id of ['account-summary', 'analytics-stats', 'leaderboard', 'ai-navigator', 'brain-status'] as const) {
            expect(WIDGETS[id].chrome, id).toBe('bare');
        }
        const heavy = defs.filter((d) => d.heavy).map((d) => d.id).sort();
        expect(heavy).toEqual(['market-news', 'tv-crypto-screener', 'tv-market-screener', 'watchlist-movers']);
        expect(defs.filter((d) => d.availability !== 'always').map((d) => d.id).sort())
            .toEqual(['brain-status', 'strategy-comparison']);
    });

    it('default spans follow the plan table', () => {
        const expected: Record<WidgetId, number> = {
            'topics-overview': 4, 'topics-latest': 8, 'topic-briefs': 6,
            'portfolio-snapshot': 4, 'watchlist-movers': 4, 'friends-rank': 4, 'news-brain-tile': 12,
            'tv-heatmap': 8, 'tv-top-stories': 4, 'tv-ticker-tape': 12, 'tv-market-screener': 12,
            'tv-crypto-screener': 8, 'tv-forex': 6,
            'account-summary': 12, 'top-holdings': 8, 'open-positions': 12, 'recent-trades': 6,
            'performance-chart': 8, 'analytics-stats': 12, 'strategy-comparison': 12,
            leaderboard: 6,
            'ai-navigator': 4, 'weekly-decisions': 6, 'active-theses': 6, 'narrative-leaderboard': 12,
            'knowledge-graph': 12, 'second-opinion': 6, 'brain-status': 12,
            'quick-trade': 4, 'market-news': 6, 'quick-links': 4,
        };
        for (const id of WIDGET_IDS) {
            expect(WIDGETS[id].defaultSpan, id).toBe(expected[id]);
        }
    });
});

describe('data key graph', () => {
    it('DATA_KEY_DEPS covers every key with known, non-self deps', () => {
        expect(Object.keys(DATA_KEY_DEPS).sort()).toEqual([...DATA_KEYS].sort());
        for (const key of DATA_KEYS) {
            for (const dep of DATA_KEY_DEPS[key]) {
                expect(dataKeySet.has(dep), `${key} -> ${dep}`).toBe(true);
                expect(dep, key).not.toBe(key);
            }
        }
    });

    it('has no dependency cycles', () => {
        const visiting = new Set<DataKey>();
        const done = new Set<DataKey>();
        const visit = (key: DataKey) => {
            expect(visiting.has(key), `cycle through ${key}`).toBe(false);
            if (done.has(key)) return;
            visiting.add(key);
            DATA_KEY_DEPS[key].forEach(visit);
            visiting.delete(key);
            done.add(key);
        };
        DATA_KEYS.forEach(visit);
    });

    it('lazy keys are known and match the plan', () => {
        expect([...LAZY_DATA_KEYS].sort()).toEqual(['analytics', 'brainStatus', 'movers', 'news', 'topicsLatest']);
        for (const key of LAZY_DATA_KEYS) {
            expect(dataKeySet.has(key)).toBe(true);
        }
    });

    it('no eager key depends on a lazy key', () => {
        for (const key of DATA_KEYS) {
            if (LAZY_DATA_KEYS.includes(key)) continue;
            for (const dep of DATA_KEY_DEPS[key]) {
                expect(LAZY_DATA_KEYS.includes(dep), `${key} -> ${dep}`).toBe(false);
            }
        }
    });

    it('SPAN_LABELS labels every span', () => {
        expect(Object.keys(SPAN_LABELS).map(Number).sort((a, b) => a - b)).toEqual([...WIDGET_SPANS]);
        expect(SPAN_LABELS).toEqual({3: 'XS', 4: 'S', 6: 'M', 8: 'L', 12: 'XL'});
    });
});

describe('isWidgetId', () => {
    it('accepts registry ids only', () => {
        expect(isWidgetId('tv-heatmap')).toBe(true);
        expect(isWidgetId('nope')).toBe(false);
        expect(isWidgetId('toString')).toBe(false);
        expect(isWidgetId('__proto__')).toBe(false);
        expect(isWidgetId(3)).toBe(false);
        expect(isWidgetId(null)).toBe(false);
        expect(isWidgetId(undefined)).toBe(false);
    });
});

describe('clampSpan', () => {
    it('keeps an allowed span', () => {
        expect(clampSpan('tv-heatmap', 8)).toBe(8);
        expect(clampSpan('portfolio-snapshot', 3)).toBe(3);
    });

    it('snaps to the nearest allowed span', () => {
        expect(clampSpan('portfolio-snapshot', 12)).toBe(6);  // spans [3, 4, 6]
        expect(clampSpan('tv-heatmap', 1)).toBe(6);           // spans [6, 8, 12]
        expect(clampSpan('tv-heatmap', 11)).toBe(12);
        expect(clampSpan('leaderboard', 100)).toBe(12);
    });

    it('breaks ties toward the smaller span', () => {
        expect(clampSpan('tv-heatmap', 7)).toBe(6);    // 6 vs 8
        expect(clampSpan('tv-heatmap', 10)).toBe(8);   // 8 vs 12
        expect(clampSpan('leaderboard', 5)).toBe(4);   // 4 vs 6
    });

    it('gives unknown ids the full row', () => {
        expect(clampSpan('nope', 4)).toBe(12);
        expect(clampSpan('', 3)).toBe(12);
    });
});

describe('isWidgetAvailable', () => {
    const single = {accountCount: 1, advanced: false};
    const multi = {accountCount: 2, advanced: false};
    const advanced = {accountCount: 1, advanced: true};

    it('always-widgets ignore the context', () => {
        expect(isWidgetAvailable(WIDGETS['tv-heatmap'], single)).toBe(true);
        expect(isWidgetAvailable(WIDGETS['tv-heatmap'], {accountCount: 0, advanced: false})).toBe(true);
    });

    it('multiAccount needs more than one account', () => {
        expect(isWidgetAvailable(WIDGETS['strategy-comparison'], single)).toBe(false);
        expect(isWidgetAvailable(WIDGETS['strategy-comparison'], multi)).toBe(true);
    });

    it('advanced needs the advanced flag', () => {
        expect(isWidgetAvailable(WIDGETS['brain-status'], single)).toBe(false);
        expect(isWidgetAvailable(WIDGETS['brain-status'], multi)).toBe(false);
        expect(isWidgetAvailable(WIDGETS['brain-status'], advanced)).toBe(true);
    });
});

describe('resolveDataKeys', () => {
    it('is empty for no widgets', () => {
        expect(resolveDataKeys([])).toEqual({eager: [], lazy: [], needsActiveAccount: false});
    });

    it('closes recent-trades over the active account and portfolios', () => {
        const result = resolveDataKeys(['recent-trades']);
        expect(new Set(result.eager)).toEqual(new Set(['trades', 'activeAccount', 'portfolios']));
        expect(result.lazy).toEqual([]);
        expect(result.needsActiveAccount).toBe(true);
    });

    it('keeps a lazy key and its dependencies out of the eager pass', () => {
        expect(resolveDataKeys(['watchlist-movers'])).toEqual({eager: [], lazy: ['movers'], needsActiveAccount: false});
    });

    it('splits performance-chart into an eager account pass and lazy analytics', () => {
        const result = resolveDataKeys(['performance-chart']);
        expect(new Set(result.eager)).toEqual(new Set(['activeAccount', 'portfolios']));
        expect(result.lazy).toEqual(['analytics']);
        expect(result.needsActiveAccount).toBe(true);
    });

    it('resolves the default layout to the plan\'s key sets', () => {
        const result = resolveDataKeys(DEFAULT_LAYOUT.widgets.map((w) => w.id));
        expect(new Set(result.eager)).toEqual(new Set(['portfolios', 'leaderboard', 'theses', 'suggestions', 'topicsOverview']));
        expect(result.lazy).toEqual(['movers', 'topicsLatest']);
        expect(result.needsActiveAccount).toBe(false);
    });

    it('dedupes keys shared by several widgets', () => {
        const result = resolveDataKeys(['friends-rank', 'leaderboard', 'performance-chart', 'analytics-stats']);
        expect(result.eager.filter((k) => k === 'leaderboard')).toHaveLength(1);
        expect(result.lazy).toEqual(['analytics']);
    });

    it('orders keys by declaration order for stable output', () => {
        const result = resolveDataKeys(['recent-trades', 'friends-rank', 'portfolio-snapshot']);
        expect(result.eager).toEqual(['portfolios', 'leaderboard', 'activeAccount', 'trades']);
    });

    it('skips ids that are not in the registry', () => {
        expect(resolveDataKeys(['nope' as WidgetId])).toEqual({eager: [], lazy: [], needsActiveAccount: false});
    });

    it('quick-trade is account scoped', () => {
        const result = resolveDataKeys(['quick-trade']);
        expect(new Set(result.eager)).toEqual(new Set(['activeAccount', 'portfolios']));
        expect(result.needsActiveAccount).toBe(true);
    });
});
