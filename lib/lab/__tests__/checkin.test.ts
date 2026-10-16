// The check-in at the top of Today: the greeting's period from the Eastern hour, the day's
// label, today's focus with yesterday's note for today offered until one is written, and
// yesterday read from the rows — what counted and what was left of the widgets.

import {describe, expect, it} from 'vitest';
import {buildCheckIn, buildYesterday, dayLabel, FOCUS_MAX, NOTE_MAX, periodOf, type YesterdayInput} from '@/lib/lab/checkin';
import {LAB_COPY} from '@/lib/learn/copy/lab';
import {findBanned} from '@/lib/learn/banned';

const yesterday = (over: Partial<YesterdayInput> = {}): YesterdayInput => ({
    widgets: ['daily-puzzle', 'arithmetic', 'poker-night', 'lichess'],
    unitStudied: null,
    unitPending: 'Transformer internals',
    cardsGraded: 0,
    problemClosed: false,
    puzzleSolved: false,
    played: [],
    ticked: [],
    ...over,
});

describe('periodOf and dayLabel', () => {
    it('splits the day at noon and six', () => {
        expect(periodOf(0)).toBe('morning');
        expect(periodOf(11)).toBe('morning');
        expect(periodOf(12)).toBe('afternoon');
        expect(periodOf(17)).toBe('afternoon');
        expect(periodOf(18)).toBe('evening');
        expect(periodOf(23)).toBe('evening');
    });

    it('names the day in full, from the label alone', () => {
        expect(dayLabel('2026-10-16')).toBe('Friday, October 16');
        expect(dayLabel('2026-01-01')).toBe('Thursday, January 1');
    });

    it('greets by the first name, or alone', () => {
        expect(LAB_COPY.checkIn.greeting.morning('Ada Lovelace')).toBe('Good morning, Ada.');
        expect(LAB_COPY.checkIn.greeting.evening('')).toBe('Good evening.');
        expect(LAB_COPY.checkIn.greeting.afternoon(undefined)).toBe('Good afternoon.');
    });
});

describe('buildYesterday', () => {
    it('lists what counted and what was left, the unit first, then each widget', () => {
        expect(buildYesterday(yesterday())).toEqual({done: [], left: ['Study Transformer internals', 'The puzzle', 'Arithmetic sprint', 'Poker night', 'Lichess puzzles']});
        expect(buildYesterday(yesterday({unitStudied: 'DINOv2', cardsGraded: 3, problemClosed: true, puzzleSolved: true, played: ['arithmetic'], ticked: ['lichess']}))).toEqual({
            done: ['Studied DINOv2', '3 cards graded', 'The problem', 'The puzzle', 'Arithmetic sprint', 'Lichess puzzles'],
            left: ['Poker night'],
        });
    });

    it('says one card, and leaves out a unit when nothing is written', () => {
        expect(buildYesterday(yesterday({cardsGraded: 1, unitPending: null, widgets: []}))).toEqual({done: ['1 card graded'], left: []});
    });

    it('ticks a game by its own round only', () => {
        expect(buildYesterday(yesterday({played: ['kelly'], widgets: ['arithmetic']})).left).toEqual(['Study Transformer internals', 'Arithmetic sprint']);
    });
});

describe('buildCheckIn', () => {
    const notes = {today: {day: '2026-10-16', focus: null, notes: null, next: null}, yesterday: {day: '2026-10-15', focus: 'Old', notes: 'n', next: 'Finish the DINOv2 unit'}};

    it('offers yesterday\'s note for today until a focus is written', () => {
        const view = buildCheckIn({today: '2026-10-16', hour: 9, notes, yesterday: null});
        expect(view).toEqual({period: 'morning', dateLabel: 'Friday, October 16', focus: null, plan: 'Finish the DINOv2 unit', yesterday: null});
        const written = buildCheckIn({today: '2026-10-16', hour: 20, notes: {...notes, today: {...notes.today, focus: 'Cards first'}}, yesterday: null});
        expect(written.focus).toBe('Cards first');
        expect(written.plan).toBeNull();
        expect(written.period).toBe('evening');
    });

    it('takes no notes at all, and draws yesterday only when given one', () => {
        expect(buildCheckIn({today: '2026-10-16', hour: 13, notes: {today: null, yesterday: null}, yesterday: yesterday({widgets: []})}))
            .toEqual({period: 'afternoon', dateLabel: 'Friday, October 16', focus: null, plan: null, yesterday: {done: [], left: ['Study Transformer internals']}});
    });

    it('bounds a note', () => {
        expect(FOCUS_MAX).toBe(160);
        expect(NOTE_MAX).toBe(1000);
    });

    it('speaks in the descriptive voice', () => {
        for (const text of buildYesterday(yesterday({unitStudied: 'U', cardsGraded: 2, problemClosed: true})).done) expect(findBanned(text, 'copy'), text).toEqual([]);
    });
});
