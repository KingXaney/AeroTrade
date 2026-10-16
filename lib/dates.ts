// Calendar dates as the app keys them: 'YYYY-MM-DD' labels. "Today" is read in America/New_York,
// because market days, snapshots and job runs are Eastern days, not the server's; moving a label
// is done in UTC, because a label is not an instant and no timezone or DST may move it by a day.
// Pure and client-safe — it imports nothing.

// Today's date in America/New_York as 'YYYY-MM-DD' (en-CA locale formats ISO-style).
// Snapshot rows are keyed on market days, not server-timezone days.
export const getEasternDateString = (date: Date = new Date()) =>
    new Intl.DateTimeFormat('en-CA', {timeZone: 'America/New_York'}).format(date);

// The Monday of the given ET date's week, as 'YYYY-MM-DD'. Weekly-budget claims
// (AI navigator) key on this so a mid-week re-fire can't grant a fresh budget.
export const getEasternWeekKey = (easternDate: string): string => {
    const d = new Date(easternDate + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
    return d.toISOString().slice(0, 10);
};

// A 'YYYY-MM-DD' label moved by whole calendar days (negative goes back). The one date-label
// arithmetic in the app: done in UTC on purpose, so no timezone or DST can move a date by a day.
export const addCalendarDays = (date: string, days: number): string => {
    const [y, m, d] = date.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
};

// Whole calendar days from `from` to `to`: negative when `to` is earlier. In UTC, like
// addCalendarDays, so a DST change never makes a day 23 or 25 hours long.
export const calendarDaysBetween = (from: string, to: string): number => {
    const utc = (date: string) => {
        const [y, m, d] = date.split('-').map(Number);
        return Date.UTC(y, m - 1, d);
    };
    return Math.round((utc(to) - utc(from)) / 86_400_000);
};

// Every calendar day from `from` to `to`, inclusive; empty when `from` is after `to`.
export const eachCalendarDay = (from: string, to: string): string[] => {
    const days: string[] = [];
    for (let day = from; day <= to; day = addCalendarDays(day, 1)) days.push(day);
    return days;
};
