// Switching the active paper account, as the client sees it: what address to ask for once the
// cookie is written, and what to show between the click and the new page. Pure and client-safe;
// the hook is components/trading/accounts/useSwitchAccount.ts, the write
// app/api/accounts/active/route.ts.

// The address to move to after a switch, or null when the page only needs asking for again.
// ?account= outranks the cookie the switch wrote (lib/trading/active-account.ts), so on a
// deep-linked address the switch would silently do nothing unless the parameter goes; every
// other parameter (the trade desk's symbol and view) stays.
export const switchHref = (pathname: string, search: string): string | null => {
    const params = new URLSearchParams(search);
    if (!params.has('account')) return null;
    params.delete('account');
    const rest = params.toString();
    return rest ? `${pathname}?${rest}` : pathname;
};

// `activeId` is the account the page was rendered for; `target` the one a click asked for
// (null: none). Until the page arrives the controls already show the target — the row picked,
// the name in the heading — and everything of the old account is marked as on its way out.
export const switchView = (activeId: string, target: string | null): {shownId: string; pending: boolean} => ({
    shownId: target ?? activeId,
    pending: target !== null && target !== activeId,
});
