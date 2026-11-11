// The account a click asked for, between the click and the page that shows it (null: none).
// One value for the whole tab, outside React, because the controls that start a switch (the
// header's menu, the comparison rows) and the parts that answer it (the heading, the account's
// panels) are separate client islands with server-rendered markup between them.
// Read with useSyncExternalStore (useSwitchAccount.ts); the rules are lib/trading/account-switch.ts.

let target: string | null = null;
const listeners = new Set<() => void>();

export const switchTarget = {
    get: (): string | null => target,
    set: (next: string | null): void => {
        if (next === target) return;
        target = next;
        for (const listener of listeners) listener();
    },
    subscribe: (listener: () => void): (() => void) => {
        listeners.add(listener);
        return () => {
            listeners.delete(listener);
        };
    },
};
