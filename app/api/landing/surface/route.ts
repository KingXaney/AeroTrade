import {connection} from "next/server";
import {getMomentumSurface} from "@/lib/landing/surface-store";

// The landing page's momentum terrain as JSON: SPY's normalised momentum over the last year by
// lookback (lib/landing/momentum-surface.ts), read through lib/landing/surface-store.ts — Tiingo
// first once a token is set, else the stored SPY bars — and memoised per ET day on the last bar.
// Public on purpose — the page it feeds is the signed-out front door, proxy.ts leaves /api alone,
// and nothing here is about a reader.
//
// Cached five minutes by browsers and the CDN (the plan's static surface.json had the same
// Cache-Control), served stale for an hour while a fresh copy is fetched. A day with nothing to
// draw is a 404 nobody caches: the first night that stores a year of SPY must show on the next
// visit, not a minute later.

export const runtime = 'nodejs'; // mongoose needs Node, not edge

const FRESH = {'Cache-Control': 'public, max-age=300, s-maxage=300, stale-while-revalidate=3600'};
const NONE = {'Cache-Control': 'no-store'};

export async function GET() {
    // Request time only, never the build: it reads the database or Tiingo. connection() rather than
    // `dynamic = 'force-dynamic'`, which would turn the Tiingo fetch inside into no-store and defeat
    // its hour-long cache (lib/prices/tiingo.ts).
    await connection();
    const surface = await getMomentumSurface();
    if (!surface) return Response.json({error: 'unavailable'}, {status: 404, headers: NONE});
    return Response.json(surface, {headers: FRESH});
}
