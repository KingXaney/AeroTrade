// The lab page's one read: the owner's rows beside the bank, shaped by lib/lab/view. Cached per
// request so the page and its panels share it. Server-only.

import {cache} from "react";
import {getEasternDateString} from "@/lib/dates";
import {cardRefs, LAB_PLAN, LAB_UNITS} from "@/lib/lab/registry";
import {readCardRows, readRevealed, readSessionDays, readStudied} from "@/lib/lab/store";
import {getLatestLabDay} from "@/lib/lab/papers/store";
import {shapeLabView, type LabView} from "@/lib/lab/view";

export const getLabView = cache(async (userId: string, today: string = getEasternDateString()): Promise<LabView> => {
    const [studied, revealed, sessionDays, cardRows, labDay] = await Promise.all([readStudied(userId), readRevealed(userId), readSessionDays(userId), readCardRows(userId), getLatestLabDay(today)]);
    return shapeLabView({today, units: LAB_UNITS, plan: LAB_PLAN, cards: cardRefs(), studied, revealed, sessionDays, cardRows, labDay});
});

// A unit page's read: the unit's own study row and its neighbours in the track.
export const getUnitProgress = cache(async (userId: string, unitId: string): Promise<{studiedOn: string | null; lastDay: string | null}> => {
    const studied = await readStudied(userId);
    const row = studied.find((r) => r.unitId === unitId);
    return {studiedOn: row?.day ?? null, lastDay: row?.lastDay ?? null};
});
