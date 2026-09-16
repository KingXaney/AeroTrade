// NYSE regular-session hours, computed for an instant. Pure and Intl-based: the app
// already establishes the pattern in getEasternDateString (lib/utils.ts), and a
// hand-rolled UTC offset would be wrong for half the year. Nine surfaces used to say
// "live" at 3 a.m. on a Sunday; this is what lets them stop.

export type MarketState = 'open' | 'closed';
export type ClosedReason = 'pre-open' | 'after-close' | 'weekend' | 'holiday';

export type MarketStatus = {
    at: number;                  // the instant this status was computed for (epoch ms)
    state: MarketState;
    reason: 'regular' | ClosedReason;
    holiday: string | null;      // the holiday's name when reason is 'holiday'
    easternDate: string;         // 'YYYY-MM-DD' in America/New_York for the instant asked about
    nextOpen: number | null;     // epoch ms of the next regular open (today's, when we are before it)
    nextClose: number | null;    // epoch ms when the current session ends; null when closed
};

const ZONE = 'America/New_York';
const OPEN_MINUTES = 9 * 60 + 30;
const CLOSE_MINUTES = 16 * 60;
const HALF_DAY_CLOSE_MINUTES = 13 * 60;
const SEARCH_DAYS = 14;              // longest run of closed days is a 4-day weekend

// ---- Calendar ----------------------------------------------------------------
// MAINTENANCE: NYSE publishes the next year's holidays each autumn. Add the new year
// here (full closures + early closes) before January, or every day past the last
// entry silently counts as a trading day. Observed dates are the actual closure day.
export const NYSE_HOLIDAYS: Readonly<Record<string, string>> = {
    // 2025
    '2025-01-01': "New Year's Day",
    '2025-01-09': 'National Day of Mourning',
    '2025-01-20': 'Martin Luther King Jr. Day',
    '2025-02-17': "Presidents' Day",
    '2025-04-18': 'Good Friday',
    '2025-05-26': 'Memorial Day',
    '2025-06-19': 'Juneteenth',
    '2025-07-04': 'Independence Day',
    '2025-09-01': 'Labor Day',
    '2025-11-27': 'Thanksgiving',
    '2025-12-25': 'Christmas',
    // 2026
    '2026-01-01': "New Year's Day",
    '2026-01-19': 'Martin Luther King Jr. Day',
    '2026-02-16': "Presidents' Day",
    '2026-04-03': 'Good Friday',
    '2026-05-25': 'Memorial Day',
    '2026-06-19': 'Juneteenth',
    '2026-07-03': 'Independence Day (observed)',
    '2026-09-07': 'Labor Day',
    '2026-11-26': 'Thanksgiving',
    '2026-12-25': 'Christmas',
    // 2027
    '2027-01-01': "New Year's Day",
    '2027-01-18': 'Martin Luther King Jr. Day',
    '2027-02-15': "Presidents' Day",
    '2027-03-26': 'Good Friday',
    '2027-05-31': 'Memorial Day',
    '2027-06-18': 'Juneteenth (observed)',
    '2027-07-05': 'Independence Day (observed)',
    '2027-09-06': 'Labor Day',
    '2027-11-25': 'Thanksgiving',
    '2027-12-24': 'Christmas (observed)',
};

// 1:00 p.m. ET closes.
export const NYSE_HALF_DAYS: ReadonlySet<string> = new Set([
    '2025-07-03', '2025-11-28', '2025-12-24',
    '2026-11-27', '2026-12-24',
    '2027-11-26',
]);

// ---- Eastern wall clock ---------------------------------------------------------
const PARTS = new Intl.DateTimeFormat('en-US', {
    timeZone: ZONE, hourCycle: 'h23', weekday: 'short',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
});
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

type Eastern = {date: string; weekday: number; minutes: number};   // minutes since midnight, fractional seconds included

export const easternParts = (at: Date): Eastern => {
    const p: Record<string, string> = {};
    for (const part of PARTS.formatToParts(at)) p[part.type] = part.value;
    return {
        date: `${p.year}-${p.month}-${p.day}`,
        weekday: WEEKDAYS.indexOf(p.weekday),
        minutes: Number(p.hour) * 60 + Number(p.minute) + Number(p.second) / 60,
    };
};

// Minutes since the epoch as read off a wall clock, ignoring zones — lets two wall
// times be subtracted directly.
const wallMinutes = (date: string, minutes: number): number => {
    const [y, m, d] = date.split('-').map(Number);
    return Date.UTC(y, m - 1, d) / 60_000 + minutes;
};

// The instant at which the Eastern wall clock reads `date` `hh:mm`. Guess in UTC, read
// the Eastern wall time that guess produced, and correct by the difference; the second
// pass settles a guess that straddled a DST change.
export const easternToInstant = (date: string, hh: number, mm: number): number => {
    const target = wallMinutes(date, hh * 60 + mm);
    let guess = target * 60_000;
    for (let i = 0; i < 2; i++) {
        const seen = easternParts(new Date(guess));
        const diff = wallMinutes(seen.date, seen.minutes) - target;
        if (Math.abs(diff) < 1 / 60) break;
        guess -= Math.round(diff * 60_000);
    }
    return guess;
};

const shiftDate = (date: string, days: number): string => {
    const [y, m, d] = date.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
};
const weekdayOf = (date: string): number => new Date(`${date}T00:00:00Z`).getUTCDay();

export const isTradingDay = (date: string): boolean => {
    const wd = weekdayOf(date);
    return wd !== 0 && wd !== 6 && !(date in NYSE_HOLIDAYS);
};

export const closeMinutesFor = (date: string): number => (NYSE_HALF_DAYS.has(date) ? HALF_DAY_CLOSE_MINUTES : CLOSE_MINUTES);

// Next regular open strictly after `fromDate` at `fromMinutes` (or today's, if it is
// still ahead). Null only if the calendar has no trading day within the search window.
const nextOpenFrom = (date: string, minutes: number): number | null => {
    if (isTradingDay(date) && minutes < OPEN_MINUTES) return easternToInstant(date, 9, 30);
    for (let i = 1; i <= SEARCH_DAYS; i++) {
        const candidate = shiftDate(date, i);
        if (isTradingDay(candidate)) return easternToInstant(candidate, 9, 30);
    }
    return null;
};

export const marketStatus = (at: Date = new Date()): MarketStatus => {
    const {date, weekday, minutes} = easternParts(at);
    const holiday = NYSE_HOLIDAYS[date] ?? null;
    const trading = isTradingDay(date);
    const close = closeMinutesFor(date);

    if (trading && minutes >= OPEN_MINUTES && minutes < close) {
        return {at: at.getTime(), state: 'open', reason: 'regular', holiday: null, easternDate: date, nextOpen: nextOpenFrom(date, close), nextClose: easternToInstant(date, Math.floor(close / 60), close % 60)};
    }
    const reason: ClosedReason = holiday ? 'holiday' : (weekday === 0 || weekday === 6) ? 'weekend' : minutes < OPEN_MINUTES ? 'pre-open' : 'after-close';
    return {at: at.getTime(), state: 'closed', reason, holiday, easternDate: date, nextOpen: nextOpenFrom(date, minutes), nextClose: null};
};

export const isMarketOpen = (at: Date = new Date()): boolean => marketStatus(at).state === 'open';
export const nextOpen = (at: Date = new Date()): number | null => marketStatus(at).nextOpen;

// ---- Copy ---------------------------------------------------------------------
const TIME = new Intl.DateTimeFormat('en-US', {timeZone: ZONE, hour: 'numeric', minute: '2-digit'});
const DAY = new Intl.DateTimeFormat('en-US', {timeZone: ZONE, weekday: 'short'});

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
