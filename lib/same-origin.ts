// Whether a POST came from one of the app's own pages: what a route handler that changes
// something checks before it reads anything (a server action has Next's own origin check; a
// route handler has none). Pure and client-safe.

type HeaderReader = {get(name: string): string | null};

// Sec-Fetch-Site, which a browser sets and a page cannot, says so when present; an older
// browser's Origin must then equal the request's own origin. Neither header means the request
// did not come from a browser page we can vouch for: refused.
export const sameOriginRequest = (headers: HeaderReader, url: string): boolean => {
    const site = headers.get('sec-fetch-site');
    if (site !== null) return site.trim().toLowerCase() === 'same-origin';
    const origin = headers.get('origin');
    if (origin === null) return false;
    try {
        return origin.trim() === new URL(url).origin;
    } catch {
        return false;
    }
};
