'use client';

import {useCallback, useEffect, useRef, useSyncExternalStore, useTransition} from "react";
import {usePathname, useRouter, useSearchParams} from "next/navigation";
import {toast} from "sonner";
import {UNREACHABLE_MESSAGE} from "@/lib/action-toast";
import {SWITCH_COPY} from "@/lib/learn/copy/portfolio";
import {switchHref, switchView} from "@/lib/trading/account-switch";
import {switchTarget} from "@/components/trading/accounts/switch-store";
import type {ActionResult} from "@/lib/actions/types";

// The write is a few milliseconds of server work; one that has not answered by then has failed.
const WRITE_TIMEOUT_MS = 10_000;
// However slowly the page then arrives, its controls are not held longer than this.
const PAGE_PATIENCE_MS = 20_000;

const serverTarget = () => null;

// The write: one POST that sets the HTTP-only cookie and renders nothing
// (app/api/accounts/active/route.ts). A dropped or stalled connection reads as a refusal with
// its sentence; nothing here throws.
const writeActiveAccount = async (accountId: string): Promise<ActionResult> => {
    try {
        const response = await fetch('/api/accounts/active', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({accountId}),
            signal: AbortSignal.timeout(WRITE_TIMEOUT_MS),
        });
        const body = await response.json().catch(() => null) as ActionResult | null;
        return body ?? {success: false, message: SWITCH_COPY.failed};
    } catch {
        return {success: false, message: UNREACHABLE_MESSAGE};
    }
};

// What every part of a page that knows the active account reads: which account to show now
// (`shownId` — the one being opened, from the click on) and whether the page is still the old
// one (`pending`). The same answer in the header's menu, the comparison rows, the heading and
// the account's panels, because the target lives outside React (switch-store.ts).
export const useAccountSwitch = (activeId: string): {shownId: string; pending: boolean} => {
    const target = useSyncExternalStore(switchTarget.subscribe, switchTarget.get, serverTarget);
    // The page is the account that was asked for: the switch is over.
    useEffect(() => {
        if (target !== null && target === activeId) switchTarget.set(null);
    }, [target, activeId]);
    return switchView(activeId, target);
};

// Makes another account the active one and shows the page on it: the account switcher's menu and
// the comparison table's rows. The cookie is written by one request that renders nothing, then
// the page is asked for once — a refresh, or, where ?account= named the old account (it outranks
// the cookie), the address without it. A pick of the account already shown, or one made
// mid-switch, does nothing.
//
// The instance that was asked owns the switch it started: it ends it when the page arrives on
// some other account, when its patience runs out, and when it unmounts — a reader who leaves the
// page mid-switch finds no account still "opening" on the next one, and is never told that a
// switch which worked had failed.
const useSwitchAccount = (activeId: string) => {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const {shownId, pending} = useAccountSwitch(activeId);
    const [navigating, startTransition] = useTransition();
    const asked = useRef<string | null>(null);
    const patience = useRef<ReturnType<typeof setTimeout> | null>(null);
    const wasNavigating = useRef(false);

    // Ends the switch this instance started, if it is still the one under way.
    const end = useCallback(() => {
        if (patience.current) clearTimeout(patience.current);
        patience.current = null;
        const id = asked.current;
        asked.current = null;
        if (id !== null && switchTarget.get() === id) switchTarget.set(null);
    }, []);

    // Unmounted mid-switch (the reader went elsewhere): the write goes on, the pending state does not.
    useEffect(() => end, [end]);

    // The page came back. If it is the account asked for, useAccountSwitch has cleared the
    // target already; if it is some other one (the one asked for was deleted in another tab),
    // the switch is over all the same, and the controls show what the page shows.
    useEffect(() => {
        if (navigating) {
            wasNavigating.current = true;
            return;
        }
        if (!wasNavigating.current) return;
        wasNavigating.current = false;
        end();
    }, [navigating, end]);

    const switchTo = async (id: string) => {
        if (pending || id === activeId) return;
        asked.current = id;
        switchTarget.set(id);
        patience.current = setTimeout(end, WRITE_TIMEOUT_MS + PAGE_PATIENCE_MS);

        // Outside any transition: React holds every other navigation behind a pending one.
        const result = await writeActiveAccount(id);
        // Left the page, or ran out of patience, while the write was out: nothing here to show it on.
        if (asked.current !== id) return;
        if (!result.success) {
            end();
            toast.error(result.message || SWITCH_COPY.failed);
            return;
        }
        // `navigating` is true from here until the new page has committed. `scroll: false`:
        // a change of search parameters is the one refresh-like navigation the router scrolls
        // for. (Taking the parameter out through the history API and refreshing was tried: the
        // router then scrolls the page to its top.)
        startTransition(() => {
            const href = switchHref(pathname, searchParams.toString());
            if (href) router.replace(href, {scroll: false});
            else router.refresh();
        });
    };

    return {shownId, pending, switchTo};
};

export default useSwitchAccount;
