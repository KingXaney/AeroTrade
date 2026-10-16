// The check-in at the top of Lab › Today (pure): the day's label and the greeting's period by the
// Eastern hour, today's focus with yesterday's note for today, and what yesterday held — what
// counted, read from the rows the day's work left, and what was left of the widgets. The day's
// notes are the owner's own words (database/models/lab-note.model.ts), bounded here; nothing in
// this module is stored. components/lab/CheckIn draws it.

import {LAB_COPY, LAB_WIDGET_TITLES} from "@/lib/learn/copy/lab";
import {labWidget, type LabWidgetId} from "@/lib/lab/widgets";

export type DayPeriod = 'morning' | 'afternoon' | 'evening';

export const periodOf = (hour: number): DayPeriod => (hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening');

// "Thursday, October 16" for a 'YYYY-MM-DD' label; read in UTC so no zone moves the day.
export const dayLabel = (day: string): string =>
    new Intl.DateTimeFormat('en-US', {weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC'}).format(new Date(`${day}T00:00:00Z`));

// What a note may hold: one line for the focus, a paragraph of notes.
export const FOCUS_MAX = 160;
export const NOTE_MAX = 1000;

// One day's note, as stored: absent fields read as null.
export type LabNote = {day: string; focus: string | null; notes: string | null; next: string | null};

export type YesterdayInput = {
    widgets: readonly LabWidgetId[];
    // The unit marked studied (or revisited) yesterday, by title; null for none.
    unitStudied: string | null;
    // Today's unit, which was yesterday's too when none was studied then; null when nothing is written.
    unitPending: string | null;
    cardsGraded: number;
    problemClosed: boolean;
    puzzleSolved: boolean;
    // The games with a kept round yesterday (lib/games/rounds GameId), and the manual items ticked.
    played: readonly string[];
    ticked: readonly string[];
};

export type YesterdayView = {done: string[]; left: string[]};

// What counted yesterday and what was left: the unit, the cards, the problem, then each widget on
// the page by its own tick — the puzzle's solve, a game's round, a manual tick.
export const buildYesterday = (input: YesterdayInput): YesterdayView => {
    const copy = LAB_COPY.checkIn;
    const played = new Set(input.played);
    const ticked = new Set(input.ticked);
    const done: string[] = [];
    const left: string[] = [];
    if (input.unitStudied) done.push(copy.unitDone(input.unitStudied));
    else if (input.unitPending) left.push(copy.unitLeft(input.unitPending));
    if (input.cardsGraded > 0) done.push(copy.cards(input.cardsGraded));
    if (input.problemClosed) done.push(copy.problem);
    for (const id of input.widgets) {
        const widget = labWidget(id);
        const title = widget.kind === 'puzzle' ? copy.puzzle : LAB_WIDGET_TITLES[id];
        const was = widget.kind === 'puzzle' ? input.puzzleSolved
            : widget.kind === 'game' ? widget.game !== undefined && played.has(widget.game)
                : ticked.has(id);
        (was ? done : left).push(title);
    }
    return {done, left};
};

export type CheckInView = {
    period: DayPeriod;
    dateLabel: string;
    focus: string | null;
    // Yesterday's note for today, offered until a focus is written.
    plan: string | null;
    // Null until the owner has a day behind them, so a first day opens without an empty look back.
    yesterday: YesterdayView | null;
};

export type CheckInInput = {
    today: string;
    hour: number;
    notes: {today: LabNote | null; yesterday: LabNote | null};
    yesterday: YesterdayInput | null;
};

export const buildCheckIn = ({today, hour, notes, yesterday}: CheckInInput): CheckInView => {
    const focus = notes.today?.focus ?? null;
    return {
        period: periodOf(hour),
        dateLabel: dayLabel(today),
        focus,
        plan: focus ? null : notes.yesterday?.next ?? null,
        yesterday: yesterday ? buildYesterday(yesterday) : null,
    };
};
