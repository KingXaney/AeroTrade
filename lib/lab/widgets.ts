// The game widgets the owner may put on Lab › Today (lib/lab/todo.ts turns each into an item of
// the list): the games hub's cards, poker night and the sites outside the app. Client-safe and
// import-free: the ids are the stored preference (user-preferences.learn.labWidgets), so an id
// is never renamed; the words are LAB_WIDGET_TITLES in lib/learn/copy/lab.ts.

export const LAB_WIDGET_IDS = [
    'daily-puzzle', 'arithmetic', 'kelly', 'market-making', 'correlation', 'poker-night',
    'lichess', 'monkeytype', 'codeforces', 'leetcode',
] as const;

export type LabWidgetId = (typeof LAB_WIDGET_IDS)[number];

export type LabWidgetKind = 'puzzle' | 'game' | 'table' | 'outside';
// How the item is ticked: a solved puzzle row, a kept round of the game that day, or by hand.
export type LabWidgetDoneBy = 'solve' | 'round' | 'manual';
export type LabWidgetGame = 'arithmetic' | 'kelly' | 'market-making' | 'correlation';
export type LabOutsideSite = 'lichess' | 'monkeytype' | 'codeforces' | 'leetcode';

export type LabWidget = {
    id: LabWidgetId;
    kind: LabWidgetKind;
    doneBy: LabWidgetDoneBy;
    href: string;
    // The game a kept round must name (lib/games/rounds GameId).
    game?: LabWidgetGame;
    // The site, keyed as GAMES_COPY.outside.links is.
    site?: LabOutsideSite;
};

export const LAB_WIDGETS: readonly LabWidget[] = [
    {id: 'daily-puzzle', kind: 'puzzle', doneBy: 'solve', href: '/games/puzzle'},
    {id: 'arithmetic', kind: 'game', doneBy: 'round', href: '/games/arithmetic', game: 'arithmetic'},
    {id: 'kelly', kind: 'game', doneBy: 'round', href: '/games/kelly', game: 'kelly'},
    {id: 'market-making', kind: 'game', doneBy: 'round', href: '/games/market-making', game: 'market-making'},
    {id: 'correlation', kind: 'game', doneBy: 'round', href: '/games/correlation', game: 'correlation'},
    {id: 'poker-night', kind: 'table', doneBy: 'manual', href: '/poker-night'},
    {id: 'lichess', kind: 'outside', doneBy: 'manual', href: 'https://lichess.org/training', site: 'lichess'},
    {id: 'monkeytype', kind: 'outside', doneBy: 'manual', href: 'https://monkeytype.com', site: 'monkeytype'},
    {id: 'codeforces', kind: 'outside', doneBy: 'manual', href: 'https://codeforces.com/problemset', site: 'codeforces'},
    {id: 'leetcode', kind: 'outside', doneBy: 'manual', href: 'https://leetcode.com/problemset/', site: 'leetcode'},
];

// What Today shows before the owner has chosen: the puzzle alone.
export const DEFAULT_LAB_WIDGETS: readonly LabWidgetId[] = ['daily-puzzle'];

export const isLabWidgetId = (value: unknown): value is LabWidgetId => typeof value === 'string' && (LAB_WIDGET_IDS as readonly string[]).includes(value);

export const labWidget = (id: LabWidgetId): LabWidget => LAB_WIDGETS.find((widget) => widget.id === id) as LabWidget;

// The known ids among `ids`, once each, in the registry's order.
export const normalizeLabWidgets = (ids: readonly unknown[]): LabWidgetId[] => {
    const wanted = new Set(ids.filter(isLabWidgetId));
    return LAB_WIDGET_IDS.filter((id) => wanted.has(id));
};

// The stored preference read back: absent means the default; an empty list means none.
export const labWidgetsFrom = (stored: readonly unknown[] | null | undefined): LabWidgetId[] =>
    stored == null ? [...DEFAULT_LAB_WIDGETS] : normalizeLabWidgets(stored);
