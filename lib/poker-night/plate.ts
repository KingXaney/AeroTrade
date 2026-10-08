// A seat plate's status word: what a plate says when its player is not simply playing — folded, all
// in, away, sitting out, out of chips, leaving; "Next hand" only while a hand the seat is not in is
// being played; "Waiting for chips" while a request waits for the host; "No chips yet" for a seat
// that never had chips here (a newcomer whose first request was taken back or declined — never "Out
// of chips"); "Shown to you" over a hand shown to the viewer alone; else how the player is connected,
// when they are not here. components/poker-night/Seat draws it (hanging under the plate, or on it
// where lib/poker-night/stage.flagRoom finds no room: SeatRing) and says it in the plate's name.
// Pure and client-safe.

import {ASK_COPY, TABLE_COPY} from '@/lib/learn/copy/poker-night';
import type {Presence, SeatView} from '@/lib/poker-night/view-types';

export type PlateFacts = {
    live: boolean; // a hand is being played
    presence: Presence; // the viewer's own seat is 'here'
    awaitingChips: boolean; // a request for chips waits for the host
    neverBought: boolean; // no chips bought here yet (no ledger row)
    discarding: boolean; // Triple T: still to throw a card away
    shownAlone: boolean; // the seat's hand turned up for the viewer alone
};

export const plateStatus = (v: Pick<SeatView, 'state'>, f: PlateFacts): string | null => {
    if (f.shownAlone) return ASK_COPY.shownTag;
    if (v.state === 'in-hand' || (f.discarding && v.state === 'all-in')) {
        if (f.discarding) return TABLE_COPY.discarding;
        return f.presence === 'here' ? null : TABLE_COPY.presence[f.presence];
    }
    if (v.state === 'busted' && f.awaitingChips) return TABLE_COPY.awaitingChips;
    if (v.state === 'busted' && f.neverBought) return TABLE_COPY.noChipsFlag;
    if (v.state === 'waiting') return f.live ? TABLE_COPY.status.waiting : f.presence === 'here' ? null : TABLE_COPY.presence[f.presence];
    return TABLE_COPY.status[v.state];
};
