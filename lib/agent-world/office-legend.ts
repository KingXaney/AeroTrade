// The office's legend: what a seat is doing, what moves on the floor, the clock it keeps and how to
// read it, every figure from lib/agent-world/config.ts and lib/agent-world/office.ts, every sentence
// from lib/learn/copy/agent-world-office.ts. Mechanism only. Pure.

import {OFFICE_REPLAY_MS, POLL_IDLE_MS, POLL_LIVE_MS} from "@/lib/agent-world/config";
import {OFFICE_WINDOWS} from "@/lib/agent-world/office";
import {OFFICE_LEGEND_COPY as L} from "@/lib/learn/copy/agent-world-office";

export type OfficeLegend = {summary: string; sections: {heading: string; lines: string[]}[]};

const seconds = (ms: number): number => Math.round(ms / 1000);

export const officeLegend = (): OfficeLegend => ({
    summary: L.summary,
    sections: [
        {heading: L.seatsHeading, lines: [L.idle, L.waiting, L.fetching, L.busy, L.talking, L.filed, L.done, L.stopped]},
        {heading: L.movesHeading, lines: [L.planes, L.fallback, L.papers, L.cards, L.lamp, L.tickets, L.board]},
        {
            heading: L.clockHeading,
            lines: [
                L.polling(seconds(POLL_LIVE_MS), seconds(POLL_IDLE_MS)),
                L.replay(seconds(OFFICE_REPLAY_MS)),
                L.windows(seconds(OFFICE_WINDOWS.talk)),
                L.daylight,
            ],
        },
        {heading: L.readingHeading, lines: [L.keyboard, L.fallbackMap, L.caveat, L.figures, L.noRank]},
    ],
});
