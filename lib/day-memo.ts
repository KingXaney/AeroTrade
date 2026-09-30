// A small in-process memo that lives for one ET day. Pure; the request-path reads that keep
// one (Luck or skill, Time in the market, "since thesis", the Daily quiz, the digest's lesson)
// each put what their answer depends on into the key — the data's own stamp, never only the
// clock — so a read taken before a price job lands is not pinned for the rest of the day.
//
// Entries are kept until the day turns, at most `limit` of them, the oldest dropped first.
// `day` is any string that names the period (an ET date; the digest passes its run id).

export type DayMemo<T> = {
    get: (key: string, day: string) => T | undefined;
    set: (key: string, day: string, value: T) => void;
};

export const createDayMemo = <T>(limit: number): DayMemo<T> => {
    let current = '';
    const entries = new Map<string, T>();
    const turn = (day: string) => {
        if (day !== current) {
            entries.clear();
            current = day;
        }
    };
    return {
        get: (key, day) => {
            turn(day);
            return entries.get(key);
        },
        set: (key, day, value) => {
            turn(day);
            entries.delete(key);
            entries.set(key, value);
            while (entries.size > limit) {
                const oldest = entries.keys().next().value;
                if (oldest === undefined) break;
                entries.delete(oldest);
            }
        },
    };
};

// The memo's usual shape: the cached value, else `load()` — stored only when `keep` says the
// answer is one worth keeping (a failed or half-stored read is simply read again next time).
export const remember = async <T>(
    memo: DayMemo<T>,
    key: string,
    day: string,
    load: () => Promise<T>,
    keep: (value: T) => boolean = () => true,
): Promise<T> => {
    const cached = memo.get(key, day);
    if (cached !== undefined) return cached;
    const value = await load();
    if (keep(value)) memo.set(key, day, value);
    return value;
};
