// The order of the /topics rail and the dashboard's Topics widget: the most unseen articles
// first, then the most recently updated, a topic with no article yet last among its ties.
// Returns a new array; the input is left as it was. Pure and client-safe.
type RailTopic = {unseenCount: number; latest: {datetime: number} | null};

export const sortTopicsForRail = <T extends RailTopic>(topics: readonly T[]): T[] =>
    [...topics].sort((a, b) =>
        b.unseenCount - a.unseenCount || (b.latest?.datetime ?? 0) - (a.latest?.datetime ?? 0));
