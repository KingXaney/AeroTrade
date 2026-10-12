'use client';

// The host's "Sit out next hand" for another player, one way in two places — the bank's rows
// (BankPanel) and the host drawer's More menu (HostDrawer): it sends the engine's host op 'sit-out'
// (from the next deal while the player is in the hand in play, at once between hands), notes the
// hand it was asked during in the map TableOverlays keeps for both (the view never says who asked,
// so this browser's note is what turns the offer into "Sits out from the next hand."), and says how
// it went. Nothing takes it back: dealing a player back in is theirs alone.

import {useState} from "react";
import {toast} from "sonner";
import {useRoom} from "@/components/poker-night/room-controller";
import {HOST_COPY} from "@/lib/learn/copy/poker-night";

// The host's sit-outs still waiting on a hand, by player: the hand number they were asked during.
export type HostSitOuts = {
    waiting: Readonly<Record<string, number>>;
    onWaiting: (pid: string, handNo: number | null) => void;
};

export const useHostSitOut = ({onWaiting}: Pick<HostSitOuts, 'onWaiting'>) => {
    const room = useRoom();
    const [busy, setBusy] = useState<string | null>(null);
    const sitOut = async (pid: string, name: string) => {
        const view = room.view;
        if (busy !== null || !view) return;
        setBusy(pid);
        const live = view.hand !== null && view.hand.phase !== 'complete' ? view.hand.no : null;
        const r = await room.send({type: 'host', op: {op: 'sit-out', pid}});
        setBusy(null);
        if (!r.ok) {
            toast.error(r.message);
            return;
        }
        // Still in the hand in play: it waits for the next deal; else it is done at once.
        const after = r.view.seats.find((s) => s !== null && s.pid === pid) ?? null;
        const waits = after !== null && after.state !== 'sitting-out' && live !== null;
        onWaiting(pid, waits ? live : null);
        toast.message(waits ? HOST_COPY.satOut(name) : HOST_COPY.satOutNow(name));
    };
    return {busy, sitOut};
};
