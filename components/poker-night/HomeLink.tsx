// The way out of a table to AeroTrade's front door, "Back to AeroTrade": "/" is the app's Home for
// an account and — through proxy.ts's rewrite — the landing page for a guest, so no guest is ever
// sent to sign in by a way back (the lobby, /poker-night, is gated). Always a full page load, never
// a client navigation: the table's realtime connection, wake lock and sounds end with the page, and
// the proxy sees the request. No hooks, so the (play) group's server pages draw it too.

import type {ComponentProps} from "react";

export const HOME_HREF = '/';

// A plain anchor, not next/link, on purpose (above).
export const HomeLink = (props: Omit<ComponentProps<'a'>, 'href'>) => <a href={HOME_HREF} {...props}/>;

// The same from a handler: the leave dialog's "Leave and go", once the leave has landed.
export const goHome = (): void => {
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- a full page load on purpose (above)
    window.location.assign(HOME_HREF);
};
