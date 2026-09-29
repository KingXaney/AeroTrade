// The one way a page opens the chat with a question already typed. A typed input and
// a pure template: every prompt the app can generate is app-authored, so the banned
// list can be asserted over it and no scraped text (a headline, an entity name) can
// enter a prompt through this door. Prefill only — nothing here ever sends.
//
// A window CustomEvent rather than a React context: the chat widget is mounted once
// through a portal in the (root) layout and the links that call this live inside server
// components on five different pages. Client-safe, no React.

export type AskInput =
    | {kind: 'term'; term: string; value?: string}
    | {kind: 'reason'; reason: string; symbol?: string; strategy?: string}
    | {kind: 'figure'; label: string; value: string; where: string};

export const ASK_EVENT = 'aero:ask';
export const ASK_MAX_CHARS = 280;

// Newlines and control characters never reach the composer; a long reason is cut.
const clean = (text: string): string => text.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();

const clip = (text: string): string => (text.length <= ASK_MAX_CHARS ? text : `${text.slice(0, ASK_MAX_CHARS - 1)}…`);

export const buildAskPrompt = (input: AskInput): string => {
    switch (input.kind) {
        case 'term':
            return clip(input.value
                ? `What does "${clean(input.term)}" mean, and what does ${clean(input.value)} say in my case?`
                : `What does "${clean(input.term)}" mean here?`);
        case 'reason': {
            const who = input.strategy ? ` from the ${clean(input.strategy)} strategy` : '';
            const what = input.symbol ? ` for ${clean(input.symbol)}` : '';
            return clip(`Explain this reason${who}${what}: ${clean(input.reason)}`);
        }
        case 'figure':
            return clip(`What does ${clean(input.label)} mean, and what does ${clean(input.value)} say about ${clean(input.where)}?`);
    }
};

type AskDetail = {text: string};

const isAskDetail = (value: unknown): value is AskDetail =>
    typeof value === 'object' && value !== null && typeof (value as {text?: unknown}).text === 'string';

export const askAdvisor = (text: string, target: EventTarget | undefined = typeof window === 'undefined' ? undefined : window): void => {
    if (!target) return;
    target.dispatchEvent(new CustomEvent<AskDetail>(ASK_EVENT, {detail: {text: clip(clean(text))}}));
};

// Any same-origin script can dispatch the event, so the payload is validated before it
// touches the composer: a string, cleaned and clipped, or nothing.
export const subscribeAsk = (handler: (text: string) => void, target: EventTarget | undefined = typeof window === 'undefined' ? undefined : window): () => void => {
    if (!target) return () => {};
    const listener = (event: Event) => {
        const detail = (event as CustomEvent<unknown>).detail;
        if (!isAskDetail(detail)) return;
        const text = clip(clean(detail.text));
        if (text) handler(text);
    };
    target.addEventListener(ASK_EVENT, listener);
    return () => target.removeEventListener(ASK_EVENT, listener);
};
