// A finished hand as the table shows it until the next deal: who won what (each winner's total over
// every pot, and with two or three boards, board by board), each shown hand's name on each board, and
// which cards play — on each board, the five cards that play of the players who won a share of it,
// lifted and glowing; every other card on the boards and in the shown hands dimmed. Pure and
// client-safe: read from the view's own result (lib/poker-night/view-types HandResultView) with the
// server's own functions (variants.readShown, pots.paidParts), so the page shows exactly what the
// server decided. The animations (lib/poker-night/choreography) only time it. And, while a street is
// bet, each seat's last move on it (streetTags), which its plate keeps once the tag's pop is over.

import {ACTION_COPY, HAND_COPY, TABLE_COPY} from '@/lib/learn/copy/poker-night';
import type {Card} from '@/lib/poker/cards';
import {ENTRY_FLAGS, ENTRY_KINDS, STREETS} from '@/lib/poker-night/config';
import {describeHand, type HandDescription} from '@/lib/poker-night/hand-name';
import {paidParts} from '@/lib/poker-night/pots';
import {BANNER} from '@/lib/poker-night/stage';
import type {EntryKind} from '@/lib/poker-night/types';
import {playsBoardFor, readShown} from '@/lib/poker-night/variants';
import type {HandView, TableView} from '@/lib/poker-night/view-types';

// A shown hand: its cards; on the first board its five cards that play, its name and whether it plays
// the board; on every board, its five cards that play and its name (none before the flop); whether
// any pot paid it.
export type ShownLook = {
    seat: number; cards: Card[]; best: Card[]; description: HandDescription | null; playsBoard: boolean; winner: boolean;
    reads: {best: Card[]; description: HandDescription}[];
};
export type WinnerLook = {seat: number; amount: number; description: HandDescription | null; playsBoard: boolean};
// One board's share of the result: who won chips on it (the most first, then by seat, each with what
// their hand makes on that board) and the cards that play there for them.
export type BoardLook = {index: number; winners: WinnerLook[]; playing: Card[]};

export type ResultLook = {
    handNo: number;
    showdown: boolean;
    winners: WinnerLook[]; // over every pot and board, the most chips first, then by seat
    shown: ShownLook[]; // in show order
    playing: Card[]; // the cards that play, every board's together
    // Board by board: one entry a board at a showdown on two or three; one otherwise.
    boards: BoardLook[];
};

const byAmount = (a: WinnerLook, b: WinnerLook): number => b.amount - a.amount || a.seat - b.seat;

// The result of the view's hand, or null while there is none.
export const resultLook = (hand: Pick<HandView, 'no' | 'variant' | 'boards' | 'result'> | null): ResultLook | null => {
    const result = hand?.result;
    if (!hand || !result) return null;
    // Each board's shares, over every pot (a pot paid uncontested is one part, whatever the boards).
    const parts = result.pots.map((pot) => paidParts(pot));
    const boardCount = Math.max(1, ...parts.map((p) => p.length));
    const byBoard = Array.from({length: boardCount}, () => new Map<number, number>());
    const totals = new Map<number, number>();
    for (const pot of parts) {
        for (const part of pot) {
            part.winners.forEach((seat, j) => {
                const share = part.shares[j];
                byBoard[part.board].set(seat, (byBoard[part.board].get(seat) ?? 0) + share);
                totals.set(seat, (totals.get(seat) ?? 0) + share);
            });
        }
    }
    const first = hand.boards[0] ?? [];
    const shown = result.hands.map((h): ShownLook => {
        const read = readShown(hand.variant, hand.boards, h);
        const reads = read.reads.map((r) => ({best: r.best, description: describeHand(r.value)}));
        const top = read.reads[0] ?? null;
        return {
            seat: read.seat, cards: read.cards, best: top?.best ?? [],
            description: reads[0]?.description ?? null,
            playsBoard: top !== null && playsBoardFor(hand.variant, first, top.value),
            winner: totals.has(read.seat), reads,
        };
    });
    const bySeat = new Map(shown.map((s) => [s.seat, s]));
    const look = (seat: number, amount: number, board: number): WinnerLook => {
        const s = bySeat.get(seat);
        return {seat, amount, description: s?.reads[board]?.description ?? (board === 0 ? s?.description ?? null : null), playsBoard: board === 0 && (s?.playsBoard ?? false)};
    };
    const winners = [...totals.entries()].filter(([, amount]) => amount > 0).map(([seat, amount]) => look(seat, amount, 0)).sort(byAmount);
    const boards = byBoard.map((shares, index): BoardLook => {
        const won = [...shares.entries()].filter(([, amount]) => amount > 0).map(([seat, amount]) => look(seat, amount, index)).sort(byAmount);
        const playing = result.showdown ? [...new Set(won.flatMap((w) => bySeat.get(w.seat)?.reads[index]?.best ?? (index === 0 ? bySeat.get(w.seat)?.best ?? [] : [])))] : [];
        return {index, winners: won, playing};
    });
    // With one board the winners' total over every pot, as it always was: a winner whose share of a
    // pot was nothing still lights the cards that won it.
    const playing = result.showdown
        ? boardCount === 1 ? [...new Set(shown.filter((s) => s.winner).flatMap((s) => s.best))] : [...new Set(boards.flatMap((b) => b.playing))]
        : [];
    return {handNo: hand.no, showdown: result.showdown, winners, shown, playing, boards};
};

// How a card is drawn while a showdown's result shows: one of the cards that play, or dimmed; null
// outside a showdown (an uncontested pot shows nothing).
export const cardLook = (look: ResultLook | null, card: Card): 'win' | 'dim' | null => {
    if (!look || !look.showdown || look.playing.length === 0) return null;
    return look.playing.includes(card) ? 'win' : 'dim';
};

// The board whose lift lights a card (choreography's reveal lifts each board in turn): the first it
// plays on, else the first board.
export const liftBoardOf = (look: ResultLook | null, card: Card): number => {
    if (!look) return 0;
    const k = look.boards.findIndex((b) => b.playing.includes(card));
    return k < 0 ? 0 : k;
};

// Who played a seat in the view's hand: the result's gone list first (a player cashed out as the
// hand completed, or a seat taken by someone new in the pause), else whoever sits there now — so a
// result never names the wrong player. A view from an older server has no gone list.
export const playerAt = (table: Pick<TableView, 'seats' | 'hand'>, seat: number): string | null => {
    const gone = (table.hand?.result?.gone ?? []).find(([s]) => s === seat);
    return gone ? gone[1] : table.seats[seat]?.pid ?? null;
};

// The seat the viewer played in the view's hand, for the banner's "You win": their seat, only while
// the result says it was theirs (playerAt) — someone who takes a winner's seat in the pause is not
// told they won. Null for a watcher.
export const viewerSeatIn = (table: Pick<TableView, 'seats' | 'hand'>, mySeat: number | null, myPid: string | null): number | null =>
    mySeat !== null && myPid !== null && playerAt(table, mySeat) === myPid ? mySeat : null;

// Whether the winner's banner shows for this hand: once it is complete, with this hand's result and
// someone paid. TableScreen asks too: while it shows, the line under the board (the next deal's
// countdown, the pause) goes where lib/poker-night/stage.bannerPlan puts it.
export const bannerShows = (hand: Pick<HandView, 'no' | 'phase'> | null, look: ResultLook | null): boolean =>
    !!hand && hand.phase === 'complete' && !!look && look.handNo === hand.no && look.winners.length > 0;

// Whether one player won every board's share of every pot (a part of no chips aside): a scoop,
// which the banner says in one line.
export const scoopOf = (look: ResultLook): number | null => {
    if (look.boards.length < 2 || look.winners.length !== 1) return null;
    return look.boards.every((b) => b.winners.length === 1 && b.winners[0].seat === look.winners[0].seat) ? look.winners[0].seat : null;
};

// The banner's words (the first BANNER.rows lines): for each winner it names, the most chips first,
// the head — "You win 70" for the viewer, "Ana wins 1,200" for anyone else, under their seat's name
// when the people have not arrived — and the hand's name ("Full house, threes full of fives", with
// "Plays the board" when it does), or null when no hand was shown. With two or three boards at a
// showdown, a line a board — "Board 2: Ana wins 600", or its chips player by player — under the hand
// of the board's largest winner; or one line, with no hand, when one player won every board
// ("Ana wins every board: 1,800"). seat: whose look the full banner draws; board: the board a line is
// about, null for the whole hand; short: the head without its chips, where the banner has no room for
// it whole ("Board 2: Ana", "Ana wins", "You win every board" — each seat's "+N" says the chips), in
// three parts so that a cut banner never cuts inside a number or a board's name, and a name only to an
// ellipsis on the narrowest screens. lib/poker-night/stage.bannerPlan sizes the banner from these,
// and components/poker-night/WinnerReveal draws them.
export type ShortHead = {lead: string; name: string; tail: string};
export type BannerLine = {key: string; seat: number; board: number | null; mine: boolean; head: string; short: ShortHead; hand: string | null};
export const bannerLines = (look: ResultLook, nameOf: (seat: number) => string | null, mySeat: number | null): BannerLine[] => {
    const name = (seat: number) => nameOf(seat) ?? TABLE_COPY.seat(seat);
    const handOf = (w: WinnerLook) => (w.description ? (w.playsBoard ? `${HAND_COPY.label(w.description)} · ${HAND_COPY.playsBoard}` : HAND_COPY.label(w.description)) : null);
    if (look.showdown && look.boards.length > 1) {
        const scoop = scoopOf(look);
        if (scoop !== null) {
            const w = look.winners[0];
            const mine = scoop === mySeat;
            const head = mine ? TABLE_COPY.bannerScoopYou(w.amount) : TABLE_COPY.bannerScoop(name(scoop), w.amount);
            const short = mine ? {lead: TABLE_COPY.bannerShortEveryYou, name: '', tail: ''} : {lead: '', name: TABLE_COPY.bannerShortNames([name(scoop)]), tail: TABLE_COPY.bannerShortEvery};
            return [{key: `all:${scoop}`, seat: scoop, board: null, mine, head, short, hand: null}];
        }
        return look.boards.filter((b) => b.winners.length > 0).slice(0, BANNER.rows).map((b) => {
            const top = b.winners[0];
            const mine = b.winners.length === 1 && top.seat === mySeat;
            const head = b.winners.length === 1
                ? mine ? TABLE_COPY.bannerBoardYou(b.index, top.amount) : TABLE_COPY.bannerBoard(b.index, name(top.seat), top.amount)
                : TABLE_COPY.bannerBoardSplit(b.index, b.winners.map((w) => ({name: w.seat === mySeat ? null : name(w.seat), amount: w.amount})));
            const short = {lead: TABLE_COPY.bannerShortBoard(b.index), name: TABLE_COPY.bannerShortNames(b.winners.map((w) => (w.seat === mySeat ? null : name(w.seat)))), tail: ''};
            return {key: `board:${b.index}`, seat: top.seat, board: b.index, mine, head, short, hand: handOf(top)};
        });
    }
    return look.winners.slice(0, BANNER.rows).map((w) => {
        const mine = w.seat === mySeat;
        const head = mine ? TABLE_COPY.bannerYou(w.amount) : TABLE_COPY.banner(name(w.seat), w.amount);
        const short = mine ? {lead: TABLE_COPY.bannerShortYou, name: '', tail: ''} : {lead: '', name: TABLE_COPY.bannerShortNames([name(w.seat)]), tail: TABLE_COPY.bannerShortWins};
        return {key: `seat:${w.seat}`, seat: w.seat, board: null, mine, head, short, hand: handOf(w)};
    });
};

// ── the moves of the street ──
//
// What each seat did last on the street being bet, as its tag says it ("Call 40", "Raise to 340", "All
// in 1,200") once the tag's pop is over (components/poker-night/Seat draws it still, data-tag-still),
// so a glance at the table mid-street shows every seat's move: read from the view's log tail, the last
// check, call, bet or raise per seat on the hand's own street. The blinds, antes and posts carry none
// (the blinds' marks and the bet lines say them), nor a fold (the plate says Folded), a refund or a
// card thrown away (Triple T); a raise or an all-in says its total. Nothing between streets' bets
// (a new street starts with none) or once the hand is complete. The tail is the log's last few
// entries, so in a long street at a full table the earliest movers may carry none.
export type StillTag = {kind: EntryKind; amount: number; allIn: boolean; text: string};
const STILL_KINDS = new Set<EntryKind>(['check', 'call', 'bet', 'raise']);
export const streetTags = (hand: Pick<HandView, 'phase' | 'street' | 'logTail'> | null): Map<number, StillTag> => {
    const out = new Map<number, StillTag>();
    if (!hand || hand.phase === 'complete' || hand.phase === 'discard') return out;
    const street = STREETS.indexOf(hand.street);
    for (const [seat, kindIndex, amount, to, flags, entryStreet] of hand.logTail) {
        const kind = ENTRY_KINDS[kindIndex] as EntryKind | undefined;
        if (kind === undefined || seat < 0 || entryStreet !== street) continue;
        if (!STILL_KINDS.has(kind)) {
            // A fold (or a refund) after a seat's move takes its tag away.
            if (kind === 'fold') out.delete(seat);
            continue;
        }
        const allIn = (flags & ENTRY_FLAGS.allIn) !== 0;
        const shown = kind === 'raise' || allIn ? to : amount;
        out.set(seat, {kind, amount: shown, allIn, text: ACTION_COPY.tag(kind, shown, allIn)});
    }
    return out;
};
