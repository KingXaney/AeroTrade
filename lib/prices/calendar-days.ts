// Calendar-day arithmetic on 'YYYY-MM-DD' strings. Done in UTC on purpose: these are
// calendar labels, not instants, so no timezone or DST can move a date by a day.

export const addCalendarDays = (date: string, days: number): string => {
    const [y, m, d] = date.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
};

// Every calendar day from `from` to `to`, inclusive; empty when `from` is after `to`.
export const eachCalendarDay = (from: string, to: string): string[] => {
    const days: string[] = [];
    for (let day = from; day <= to; day = addCalendarDays(day, 1)) days.push(day);
    return days;
};
