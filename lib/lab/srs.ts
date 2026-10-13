// Spaced repetition for the lab's review cards: an SM-2 variant, deterministic (no fuzz), pure.
// A card's state is one row per owner and card (database/models/lab-card-state.model.ts); a card
// with no row is new, and becomes due the day after its unit is marked studied (lib/lab/schedule).

import {addCalendarDays} from "@/lib/dates";

export const GRADES = ['again', 'hard', 'good', 'easy'] as const;
export type Grade = (typeof GRADES)[number];

export type CardState = {
    ease: number;
    intervalDays: number;
    // 'YYYY-MM-DD' (ET), the day the card is next due.
    dueOn: string;
    reps: number;
    lapses: number;
};

export const EASE_START = 2.5;
export const EASE_MIN = 1.3;
export const EASE_MAX = 3.0;
export const INTERVAL_MAX_DAYS = 365;
export const FIRST_INTERVAL = 1;
export const SECOND_INTERVAL = 6;
export const EASY_FIRST_INTERVAL = 4;
export const HARD_FACTOR = 1.2;
export const EASY_BONUS = 1.3;
export const EASE_AGAIN = -0.2;
export const EASE_HARD = -0.15;
export const EASE_EASY = 0.15;

const clampEase = (ease: number): number => Math.min(EASE_MAX, Math.max(EASE_MIN, Math.round(ease * 100) / 100));
const clampInterval = (days: number): number => Math.min(INTERVAL_MAX_DAYS, Math.max(0, days));

export const newCardState = (dueOn: string): CardState => ({ease: EASE_START, intervalDays: 0, dueOn, reps: 0, lapses: 0});

// The next state after a grade given today. Never mutates `state`.
//   again: the card is relearned — interval 0 (due today), reps 0, a lapse, ease −0.2.
//   hard:  the interval grows a little (×1.2, at least one day more), ease −0.15.
//   good:  1 day, then 6, then × ease.
//   easy:  4 days first, else more than good (× ease × 1.3), ease +0.15.
export const grade = (state: CardState, g: Grade, today: string): CardState => {
    const prev = state.intervalDays;
    const good = state.reps === 0 ? FIRST_INTERVAL : state.reps === 1 ? SECOND_INTERVAL : Math.round(prev * state.ease);
    let ease = state.ease;
    let interval: number;
    let reps = state.reps + 1;
    let lapses = state.lapses;
    switch (g) {
        case 'again':
            ease = clampEase(ease + EASE_AGAIN);
            interval = 0;
            reps = 0;
            lapses += 1;
            break;
        case 'hard':
            ease = clampEase(ease + EASE_HARD);
            interval = state.reps === 0 ? FIRST_INTERVAL : Math.max(prev + 1, Math.round(prev * HARD_FACTOR));
            break;
        case 'good':
            interval = good;
            break;
        case 'easy':
            ease = clampEase(ease + EASE_EASY);
            interval = state.reps === 0 ? EASY_FIRST_INTERVAL : Math.max(good + 1, Math.round(prev * state.ease * EASY_BONUS));
            break;
    }
    interval = clampInterval(interval);
    return {ease, intervalDays: interval, dueOn: addCalendarDays(today, interval), reps, lapses};
};

export const isDue = (state: CardState, today: string): boolean => state.dueOn <= today;
