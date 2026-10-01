// The NYSE session in words: the market-status pill in the header ("Open · closes 4:00 PM
// ET"), its tooltip, and the order ticket's note on when a queued order would fill. The
// clock itself is lib/prices/market-hours.ts; these only read the status it computes.
// The test holds every line to the 'copy' tier of lib/learn/banned.ts.

import {easternParts, ZONE, type MarketStatus} from "@/lib/prices/market-hours";

const TIME = new Intl.DateTimeFormat('en-US', {timeZone: ZONE, hour: 'numeric', minute: '2-digit'});
const DAY = new Intl.DateTimeFormat('en-US', {timeZone: ZONE, weekday: 'short'});

// "Mon 9:30 AM ET" / "today 9:30 AM ET": when a real broker would fill an order placed
// now, or null while the session is open. The holiday is named when that is the reason.
export const describeQueuedFill = (status: MarketStatus): string | null => {
    if (status.state === 'open' || !status.nextOpen) return null;
    const sameDay = easternParts(new Date(status.nextOpen)).date === status.easternDate;
    const when = `${sameDay ? 'today' : DAY.format(status.nextOpen)} ${TIME.format(status.nextOpen)} ET`;
    return status.holiday ? `${when} (${status.holiday})` : when;
};

// "Open · closes 4:00 PM ET" / "Closed · opens Mon 9:30 AM ET" / "Closed · Thanksgiving · opens Fri 9:30 AM ET".
export const describeMarketStatus = (status: MarketStatus): string => {
    if (status.state === 'open') {
        return status.nextClose ? `Open · closes ${TIME.format(status.nextClose)} ET` : 'Open';
    }
    const parts = ['Closed'];
    if (status.holiday) parts.push(status.holiday);
    if (status.nextOpen) {
        const sameDay = easternParts(new Date(status.nextOpen)).date === status.easternDate;
        parts.push(`opens ${sameDay ? 'today' : DAY.format(status.nextOpen)} ${TIME.format(status.nextOpen)} ET`);
    }
    return parts.join(' · ');
};

export const MARKET_COPY = {
    // The pill's tooltip.
    openTitle: 'NYSE regular session',
    closedTitle: 'Outside NYSE regular hours — quotes are the last close, not live',
} as const;
