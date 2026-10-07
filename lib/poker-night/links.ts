// Where a table lives and the link the host shares. Production links name the app's one public
// address (lib/site.siteUrl); everywhere else — a preview, a local server — the link is built from
// the origin the request arrived at, because a preview's BETTER_AUTH_URL may name production, and
// a preview's link must open the preview's own table. Pure.

import {siteUrl} from '@/lib/site';
import type {Env} from '@/lib/poker-night/env';

export const tablePath = (code: string): string => `/play/${code}`;

type HeaderReader = {get(name: string): string | null};

const HOST = /^[a-z0-9.-]+(:\d{1,5})?$|^\[[0-9a-f:.]+\](:\d{1,5})?$/i;

// An http(s) origin, or null for anything else (a path, a javascript: URL, an origin with a path).
export const cleanOrigin = (raw: string | null | undefined): string | null => {
    if (!raw) return null;
    try {
        const url = new URL(raw);
        if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
        return url.origin;
    } catch {
        return null;
    }
};

// The origin a server component's request arrived at, from its headers (a page has no request
// URL): the forwarded host and protocol a proxy such as Vercel's sets, else the Host header.
export const originFromHeaders = (headers: HeaderReader): string | null => {
    const host = (headers.get('x-forwarded-host') ?? headers.get('host'))?.split(',')[0].trim() ?? '';
    if (!HOST.test(host)) return null;
    const proto = headers.get('x-forwarded-proto')?.split(',')[0].trim().toLowerCase();
    return cleanOrigin(`${proto === 'https' || proto === 'http' ? proto : 'http'}://${host}`);
};

export const shareUrlFor = (code: string, {env, requestOrigin}: {env: Env; requestOrigin: string | null}): string => {
    const origin = env === 'production' ? siteUrl({VERCEL_ENV: 'production'}) : cleanOrigin(requestOrigin) ?? siteUrl();
    return `${origin}${tablePath(code)}`;
};
