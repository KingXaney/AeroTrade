// A seat plate's status word: what each state says, "Waiting for chips" while a request waits, "No
// chips yet" — never "Out of chips" — for a seat that never had chips here, "Shown to you" over a
// hand shown to the viewer alone, and the connection only when the player is not simply playing.

import {describe, expect, it} from 'vitest';
import {ASK_COPY, TABLE_COPY} from '@/lib/learn/copy/poker-night';
import {plateStatus, type PlateFacts} from '@/lib/poker-night/plate';

const facts = (f: Partial<PlateFacts> = {}): PlateFacts => ({
    live: false, presence: 'here', awaitingChips: false, neverBought: false, discarding: false, shownAlone: false, ...f,
});

describe('a plate\'s status word', () => {
    it('says a seat that never had chips here "No chips yet", one that ran out "Out of chips", one waiting on the host "Waiting for chips"', () => {
        expect(plateStatus({state: 'busted'}, facts({neverBought: true}))).toBe(TABLE_COPY.noChipsFlag);
        expect(plateStatus({state: 'busted'}, facts())).toBe(TABLE_COPY.status.busted);
        expect(plateStatus({state: 'busted'}, facts({awaitingChips: true}))).toBe(TABLE_COPY.awaitingChips);
        expect(plateStatus({state: 'busted'}, facts({awaitingChips: true, neverBought: true}))).toBe(TABLE_COPY.awaitingChips);
        expect(TABLE_COPY.noChipsFlag).toBe('No chips yet');
        expect(plateStatus({state: 'busted'}, facts({neverBought: true}))).not.toBe(TABLE_COPY.status.busted);
    });

    it('says the rest by state, the connection only for a player simply playing or waiting between hands', () => {
        expect(plateStatus({state: 'in-hand'}, facts())).toBeNull();
        expect(plateStatus({state: 'in-hand'}, facts({presence: 'offline'}))).toBe(TABLE_COPY.presence.offline);
        expect(plateStatus({state: 'in-hand'}, facts({presence: 'hidden'}))).toBe(TABLE_COPY.presence.hidden);
        expect(plateStatus({state: 'waiting'}, facts({live: true}))).toBe(TABLE_COPY.status.waiting);
        expect(plateStatus({state: 'waiting'}, facts())).toBeNull();
        expect(plateStatus({state: 'waiting'}, facts({presence: 'offline'}))).toBe(TABLE_COPY.presence.offline);
        for (const state of ['folded', 'all-in', 'sitting-out', 'away', 'leaving'] as const) expect(plateStatus({state}, facts())).toBe(TABLE_COPY.status[state]);
        expect(plateStatus({state: 'in-hand'}, facts({discarding: true}))).toBe(TABLE_COPY.discarding);
        expect(plateStatus({state: 'all-in'}, facts({discarding: true}))).toBe(TABLE_COPY.discarding);
        expect(plateStatus({state: 'folded'}, facts({shownAlone: true}))).toBe(ASK_COPY.shownTag);
    });
});
