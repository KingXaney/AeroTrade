// The night's awards (lib/poker-night/awards): each shown only when its data exists, every name on
// a tie in the order given, the room's stored throws read only for what they can mean, the
// pictures one plain code point each, and the celebration the same on every screen.

import {describe, expect, it} from 'vitest';
import {
    AWARD_IDS, AWARD_POINTS, awardGlyph, CELEBRATION, celebrationBits, nightAwards, throwCountsOf, type NightCounters, type ThrowTally,
} from '@/lib/poker-night/awards';
import {THROWABLES} from '@/lib/poker-night/emotes';

const ANA = 'AnaAnaAna00';
const BEN = 'BenBenBen00';
const CY = 'CyCyCyCy000';

const row = (pid: string, over: Partial<NightCounters> = {}): NightCounters =>
    ({pid, hands: 10, wins: 0, biggestWin: 0, allIns: 0, peakChips: 0, ...over});

const throwsOf = (entries: Record<string, Partial<ThrowTally>>) =>
    new Map(Object.entries(entries).map(([pid, t]) => [pid, {thrown: t.thrown ?? {}, received: t.received ?? {}}]));

describe('the night awards', () => {
    it('shows none when nothing happened', () => {
        expect(nightAwards([], [], new Map())).toEqual([]);
        expect(nightAwards([ANA, BEN], [row(ANA, {hands: 0, peakChips: 2000}), row(BEN, {hands: 0, peakChips: 2000})], new Map())).toEqual([]);
    });

    it('gives each award to the highest figure, in the registry\'s order', () => {
        const counters = [
            row(ANA, {wins: 7, biggestWin: 1200, allIns: 1, peakChips: 3100}),
            row(BEN, {wins: 4, biggestWin: 2400, allIns: 3, peakChips: 4200}),
            row(CY, {wins: 2, biggestWin: 300, allIns: 0, peakChips: 2000}),
        ];
        const throws = throwsOf({
            [ANA]: {thrown: {tomato: 3, rose: 2}},
            [BEN]: {thrown: {rose: 1}, received: {tomato: 2, rose: 2}},
            [CY]: {received: {tomato: 1, rose: 1}},
        });
        expect(nightAwards([ANA, BEN, CY], counters, throws)).toEqual([
            {id: 'biggest-pot', pids: [BEN], value: 2400},
            {id: 'most-won', pids: [ANA], value: 7},
            {id: 'highest-stack', pids: [BEN], value: 4200},
            {id: 'most-all-ins', pids: [BEN], value: 3},
            {id: 'tomato-magnet', pids: [BEN], value: 2},
            {id: 'most-roses', pids: [ANA], value: 2},
        ]);
    });

    it('lists every name on a tie, in the order the players are given', () => {
        const counters = [row(CY, {wins: 3, allIns: 2}), row(ANA, {wins: 3, allIns: 2}), row(BEN, {wins: 1, allIns: 2})];
        const awards = nightAwards([ANA, BEN, CY], counters, throwsOf({[ANA]: {received: {tomato: 1}}, [CY]: {received: {tomato: 1}}}));
        expect(awards).toEqual([
            {id: 'most-won', pids: [ANA, CY], value: 3},
            {id: 'most-all-ins', pids: [ANA, BEN, CY], value: 2},
            {id: 'tomato-magnet', pids: [ANA, CY], value: 1},
        ]);
    });

    it('drops each award whose data does not exist', () => {
        // No all-ins, no tomato landed, no rose given: three awards, not six.
        const awards = nightAwards([ANA, BEN], [row(ANA, {wins: 1, biggestWin: 40, peakChips: 2020}), row(BEN, {peakChips: 1980})],
            throwsOf({[ANA]: {thrown: {cake: 2}}, [BEN]: {received: {cake: 2, rose: 1}}}));
        expect(awards.map((a) => a.id)).toEqual(['biggest-pot', 'most-won', 'highest-stack']);
    });

    it('counts a stack only for a player dealt a hand, since a buy-in alone sets the peak', () => {
        const awards = nightAwards([ANA, BEN], [row(ANA, {hands: 0, peakChips: 9000}), row(BEN, {hands: 3, peakChips: 2500})], new Map());
        expect(awards).toEqual([{id: 'highest-stack', pids: [BEN], value: 2500}]);
    });

    it('reads nobody it was not given: a row the night let go of wins nothing', () => {
        const awards = nightAwards([ANA], [row(ANA, {wins: 1}), row(BEN, {wins: 9})], throwsOf({[BEN]: {received: {tomato: 5}, thrown: {rose: 5}}}));
        expect(awards).toEqual([{id: 'most-won', pids: [ANA], value: 1}]);
        expect(nightAwards([ANA], [], new Map())).toEqual([]);
    });

    it('ignores a figure that is not a count above zero', () => {
        const awards = nightAwards([ANA, BEN], [row(ANA, {wins: Number.NaN, allIns: -2}), row(BEN, {wins: Number.POSITIVE_INFINITY})], new Map());
        expect(awards).toEqual([]);
    });
});

describe('the room\'s stored throws', () => {
    it('reads each player\'s throws and catches by throwable', () => {
        expect(throwCountsOf({[ANA]: {thrown: {tomato: 2, rose: 1}}, [BEN]: {received: {tomato: 2}}, [CY]: {received: {rose: 1}}})).toEqual(new Map([
            [ANA, {thrown: {tomato: 2, rose: 1}, received: {}}],
            [BEN, {thrown: {}, received: {tomato: 2}}],
            [CY, {thrown: {}, received: {rose: 1}}],
        ]));
    });

    it('keeps only a pid, a registry throwable and a whole count above zero', () => {
        const read = throwCountsOf({
            [ANA]: {thrown: {tomato: 1.5, rose: -1, brick: 4, cake: '3', egg: 2}, received: [1, 2]},
            'not-a-pid': {thrown: {tomato: 1}},
            ['__proto__']: {thrown: {tomato: 1}},
            [BEN]: 'everything',
            [CY]: {thrown: null, received: {soda: Number.MAX_SAFE_INTEGER + 1, fish: 1}},
        });
        expect(read).toEqual(new Map([
            [ANA, {thrown: {egg: 2}, received: {}}],
            [CY, {thrown: {}, received: {fish: 1}}],
        ]));
    });

    it('reads nothing from a document with no counts, or a broken one', () => {
        for (const raw of [undefined, null, 0, 'awards', [], [{thrown: {tomato: 1}}]]) expect(throwCountsOf(raw).size, String(raw)).toBe(0);
    });
});

describe('the pictures', () => {
    it('are one emoji code point each, from Emoji 12.0 or earlier, with no joiner or selector', () => {
        // Trophy, glowing star, crown, fire, tomato and rose: each drawn as an emoji on its own.
        const ALLOWED = new Set([0x1f3c6, 0x1f31f, 0x1f451, 0x1f525, 0x1f345, 0x1f339]);
        expect(Object.keys(AWARD_POINTS).sort()).toEqual([...AWARD_IDS].sort());
        for (const id of AWARD_IDS) {
            const glyph = awardGlyph(id);
            expect([...glyph], id).toHaveLength(1);
            expect(ALLOWED.has(glyph.codePointAt(0)!), id).toBe(true);
            expect(glyph, id).not.toMatch(/[‍︎️]|[\u{1f3fb}-\u{1f3ff}]/u);
        }
        expect(new Set(AWARD_IDS.map(awardGlyph)).size).toBe(AWARD_IDS.length);
    });

    it('draw the throws\' awards with the throwables themselves', () => {
        expect(AWARD_POINTS['tomato-magnet']).toBe(THROWABLES.tomato.point);
        expect(AWARD_POINTS['most-roses']).toBe(THROWABLES.rose.point);
    });
});

describe('the celebration', () => {
    it('throws the same pieces for the same table, and others for another', () => {
        const bits = celebrationBits('K7QXM4');
        expect(bits).toEqual(celebrationBits('K7QXM4'));
        expect(bits).not.toEqual(celebrationBits('B2CDE9'));
        expect(bits).toHaveLength(CELEBRATION.pieces);
        expect(bits.map((b) => b.key)).toEqual(Array.from({length: CELEBRATION.pieces}, (_, i) => i));
    });

    it('keeps every piece within its spread, its turn and its wait', () => {
        for (const seed of ['K7QXM4', 'B2CDE9', 'ZZZZZZ', '']) {
            for (const b of celebrationBits(seed)) {
                for (const n of [b.x, b.y, b.rot, b.wait]) expect(Number.isInteger(n)).toBe(true);
                expect(Math.abs(b.x)).toBeLessThanOrEqual(CELEBRATION.spreadX);
                expect(b.y).toBeGreaterThanOrEqual(-CELEBRATION.rise);
                expect(b.y).toBeLessThanOrEqual(CELEBRATION.fall);
                expect(Math.abs(b.rot)).toBeLessThanOrEqual(CELEBRATION.turn);
                expect(b.wait).toBeGreaterThanOrEqual(0);
                expect(b.wait).toBeLessThanOrEqual(CELEBRATION.waitMs);
            }
        }
    });
});
