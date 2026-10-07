// The end of the night: every player who sat, by net (ties share a place), what they brought in and
// finished with, the table's shown name, the hands and the minutes, and the clipboard text, which
// keeps to the copy's own wording.

import {describe, expect, it} from 'vitest';
import {SUMMARY_COPY} from '@/lib/learn/copy/poker-night';
import {forceClose} from '@/lib/poker-night/engine';
import {nightDate, summarize, summaryText} from '@/lib/poker-night/summary';
import type {TableState} from '@/lib/poker-night/types';
import {peopleIds, peopleView, publicView} from '@/lib/poker-night/views';
import {A, C, R, X, deal, moves, pidOf, runOut, table, T0} from './fixtures';

const viewOf = (s: TableState, removed: string[] = []) => ({
    ...publicView(s),
    ...peopleView(Object.fromEntries(peopleIds(s).map((pid) => [pid, {name: pid.toUpperCase(), avatar: 'v1:fox:tangerine:none:none'}])), removed),
    code: 'K7QXM4',
});

const three = () => table({0: 1000, 1: 1000, 2: 1000}, {lastBigBlind: 0});

describe('the night summary', () => {
    it('ranks everyone by net once the table has closed', () => {
        let s = deal(three(), {holes: {0: 'AhKh', 1: '7c2d', 2: 'QsQd'}, board: '2c5d9hJs3c'});
        s = moves(s, R(100), C, C, X, X, X, X, X, X, X, X, X);
        expect(s.hand!.result).not.toBeNull();
        const closed = forceClose(s, s.hand!.result!.completedAt + 1000);
        const summary = summarize({view: viewOf(closed, [pidOf(1)]), startedAt: T0, endedAt: T0 + 134 * 60_000, me: pidOf(2)});
        expect(summary.table).toBe('Table K7QXM4');
        expect(summary.hands).toBe(1);
        expect(summary.minutes).toBe(134);
        expect(summary.standings.map((r) => [r.pid, r.net, r.place])).toEqual([[pidOf(2), 200, 1], [pidOf(0), -100, 2], [pidOf(1), -100, 2]]);
        expect(summary.standings[0]).toMatchObject({me: true, chipsIn: 1000, finished: 1200, name: 'P2'});
        expect(summary.standings[2].removed).toBe(true);
        expect(summary.balanced).toBe(true);
        expect(summary.broughtIn).toBe(3000);
    });

    it('names the table by its own name when it has one', () => {
        const s = three();
        s.settings.name = 'Friday game';
        expect(summarize({view: viewOf(s), startedAt: T0, endedAt: T0}).table).toBe('Friday game');
    });

    it('writes the clipboard text from the copy', () => {
        const s = three();
        const summary = summarize({view: viewOf(s), startedAt: T0, endedAt: T0 + 45 * 60_000});
        const text = summaryText(summary, 'Oct 7, 2026');
        expect(text).toBe(SUMMARY_COPY.text({
            table: 'Table K7QXM4', date: 'Oct 7, 2026', hands: 0, minutes: 45,
            standings: summary.standings.map((r) => ({name: r.name, net: r.net, removed: r.removed})),
        }));
        expect(text.split('\n')).toHaveLength(2 + 3 + 1);
    });

    it('gives the night\'s awards from the ledger\'s counters and the room\'s throws', () => {
        let s = deal(three(), {holes: {0: 'AhKh', 1: '7c2d', 2: 'QsQd'}, board: '2c5d9hJs3c'});
        s = moves(s, R(100), C, C, X, X, X, X, X, X, X, X, X);
        const closed = forceClose(s, s.hand!.result!.completedAt + 1000);
        const throws = new Map([
            [pidOf(0), {thrown: {tomato: 2, rose: 1}, received: {}}],
            [pidOf(1), {thrown: {rose: 1}, received: {tomato: 2}}],
            [pidOf(2), {thrown: {}, received: {rose: 2}}],
        ]);
        const summary = summarize({view: viewOf(closed), startedAt: T0, endedAt: T0 + 60_000, me: pidOf(1), counters: closed.ledger, throws});
        const who = (id: string) => summary.awards.find((a) => a.id === id)?.winners.map((w) => w.pid);
        // Queens win the one pot of 300: the biggest pot, the most hands and the highest stack; nobody
        // was all in, so that award is not shown.
        expect(summary.awards.map((a) => [a.id, a.value])).toEqual([
            ['biggest-pot', 300], ['most-won', 1], ['highest-stack', 1200], ['tomato-magnet', 2], ['most-roses', 1],
        ]);
        expect(who('biggest-pot')).toEqual([pidOf(2)]);
        expect(who('tomato-magnet')).toEqual([pidOf(1)]);
        // A tie names everyone, in the standings' order (by net: P2, then P0 and P1).
        expect(who('most-roses')).toEqual([pidOf(0), pidOf(1)]);
        expect(summary.awards.find((a) => a.id === 'tomato-magnet')!.winners[0]).toEqual({pid: pidOf(1), name: 'P1', avatar: 'v1:fox:tangerine:none:none', me: true});
        // Names, looks and figures only: no counter rides along.
        for (const award of summary.awards) {
            expect(Object.keys(award).sort()).toEqual(['id', 'value', 'winners']);
            for (const w of award.winners) expect(Object.keys(w).sort()).toEqual(['avatar', 'me', 'name', 'pid']);
        }
        expect(JSON.stringify(summary)).not.toMatch(/peakChips|biggestWin|allIns|"wins"|thrown|received/);

        const text = summaryText(summary, 'Oct 7, 2026');
        expect(text.split('\n')).toHaveLength(2 + 3 + 5 + 1);
        expect(text).toContain(SUMMARY_COPY.award('most-roses', ['P0', 'P1'], 1));
    });

    it('counts an all-in for both players, and a summary with no counters has no awards', () => {
        let s = deal(table({0: 1000, 1: 1000}, {lastBigBlind: 0}), {holes: {0: 'AhAd', 1: 'KcKd'}, board: '2c5d9hJs3c'});
        s = runOut(moves(s, A, C));
        expect(s.hand!.result).not.toBeNull();
        const summary = summarize({view: viewOf(s), startedAt: T0, endedAt: T0, counters: s.ledger});
        const allIns = summary.awards.find((a) => a.id === 'most-all-ins')!;
        expect(allIns.value).toBe(1);
        expect(allIns.winners.map((w) => w.pid)).toEqual([pidOf(0), pidOf(1)]);
        expect(summary.awards.find((a) => a.id === 'biggest-pot')).toMatchObject({value: 2000, winners: [{pid: pidOf(0)}]});
        expect(summary.awards.some((a) => a.id === 'tomato-magnet' || a.id === 'most-roses')).toBe(false);
        expect(summarize({view: viewOf(s), startedAt: T0, endedAt: T0}).awards).toEqual([]);
    });

    it('prints the date in a named time zone', () => {
        expect(nightDate(Date.UTC(2026, 9, 7, 23, 30), 'UTC')).toBe('Oct 7, 2026');
        expect(nightDate(Date.UTC(2026, 9, 7, 23, 30), 'Asia/Tokyo')).toBe('Oct 8, 2026');
    });
});
