// The game widgets the owner may put on Lab › Today (lib/lab/todo.ts turns each into an item of
// the list; lib/lab/layout.ts is where they sit and how wide): the games hub's cards, poker night
// and the sites outside the app. Client-safe and import-free: the ids are the stored preference
// (user-preferences.learn.labLayout, and the older learn.labWidgets list), so an id is never
// renamed; the words are LAB_WIDGET_TITLES and LAB_WIDGET_BLURBS in lib/learn/copy/lab.ts.

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
    // Material Symbols name, on the arranging view's handles and in its library.
    icon: string;
    // The game a kept round must name (lib/games/rounds GameId).
    game?: LabWidgetGame;
    // The site, keyed as GAMES_COPY.outside.links is.
    site?: LabOutsideSite;
};

export const LAB_WIDGETS: readonly LabWidget[] = [
    {id: 'daily-puzzle', kind: 'puzzle', doneBy: 'solve', href: '/games/puzzle', icon: 'extension'},
    {id: 'arithmetic', kind: 'game', doneBy: 'round', href: '/games/arithmetic', icon: 'calculate', game: 'arithmetic'},
    {id: 'kelly', kind: 'game', doneBy: 'round', href: '/games/kelly', icon: 'toll', game: 'kelly'},
    {id: 'market-making', kind: 'game', doneBy: 'round', href: '/games/market-making', icon: 'price_change', game: 'market-making'},
    {id: 'correlation', kind: 'game', doneBy: 'round', href: '/games/correlation', icon: 'scatter_plot', game: 'correlation'},
    {id: 'poker-night', kind: 'table', doneBy: 'manual', href: '/poker-night', icon: 'celebration'},
    {id: 'lichess', kind: 'outside', doneBy: 'manual', href: 'https://lichess.org/training', icon: 'chess', site: 'lichess'},
    {id: 'monkeytype', kind: 'outside', doneBy: 'manual', href: 'https://monkeytype.com', icon: 'keyboard', site: 'monkeytype'},
    {id: 'codeforces', kind: 'outside', doneBy: 'manual', href: 'https://codeforces.com/problemset', icon: 'code', site: 'codeforces'},
    {id: 'leetcode', kind: 'outside', doneBy: 'manual', href: 'https://leetcode.com/problemset/', icon: 'terminal', site: 'leetcode'},
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
