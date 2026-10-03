// How the shell learns the reader has just opened News, without a server round trip. The (root)
// layout does not re-render on a soft navigation, so after components/news/NewsSeenMarker stamps
// `newsSeenAt` the server-rendered dot would stay lit for the whole session — a "new since you
// last looked" dot that stays on while you look reads as broken. The marker announces the stamp
// on the window instead; the rail and the drawer (components/shell/useNewsSeen) clear their dot,
// and server truth returns on the next full load. A window Event, as lib/chat/ask.ts opens the
// chat: the shell is mounted once in the layout and the marker lives inside the pages.
// Client-safe, no React; a no-op without a window.

export const NEWS_SEEN_EVENT = 'aero:news-seen';

const windowOrNone = (): EventTarget | undefined => (typeof window === 'undefined' ? undefined : window);

export const announceNewsSeen = (target: EventTarget | undefined = windowOrNone()): void => {
    target?.dispatchEvent(new Event(NEWS_SEEN_EVENT));
};

export const subscribeNewsSeen = (handler: () => void, target: EventTarget | undefined = windowOrNone()): () => void => {
    if (!target) return () => {};
    target.addEventListener(NEWS_SEEN_EVENT, handler);
    return () => target.removeEventListener(NEWS_SEEN_EVENT, handler);
};
