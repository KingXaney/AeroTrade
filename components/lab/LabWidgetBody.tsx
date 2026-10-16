import type {DailyPuzzleCardView} from "@/lib/games/store";
import type {LabWidgetCard} from "@/lib/lab/view";
import type {LabWidgetId} from "@/lib/lab/widgets";
import {ARITHMETIC_COPY, CORRELATION_COPY, GAMES_COPY, KELLY_COPY, MARKET_COPY} from "@/lib/learn/copy/games";
import {LAB_COPY} from "@/lib/learn/copy/lab";
import {POKER_NIGHT_COPY} from "@/lib/learn/copy/poker-night";
import DailyPuzzleCard from "@/components/games/DailyPuzzleCard";
import {GameCardBody} from "@/components/games/GameCard";
import {actionButton} from "@/components/primitives/ActionButton";

// What a game widget's card says under its title, frameless: the games hub's own card body for
// a scored game (with its record) and poker night, the daily puzzle's card, and a line with the
// link for a site outside the app. Today's grid (components/lab/LabWidgets) draws it inside a
// Panel; the arranging view (components/lab/LabArrange) inside the editing shell. No "What these
// mean" and no "Ask in chat" on a widget (invariant 12).

type GameWords = {body: string; recordLabel: string; print: (n: number) => string};

const GAME_WORDS: Partial<Record<LabWidgetId, GameWords>> = {
    arithmetic: {body: ARITHMETIC_COPY.cardBody, recordLabel: ARITHMETIC_COPY.cardSprint, print: (n) => n.toLocaleString('en-US')},
    kelly: {body: KELLY_COPY.cardBody, recordLabel: KELLY_COPY.recordLabel, print: KELLY_COPY.money},
    'market-making': {body: MARKET_COPY.cardBody, recordLabel: MARKET_COPY.recordLabel, print: MARKET_COPY.signed},
    correlation: {body: CORRELATION_COPY.cardBody, recordLabel: CORRELATION_COPY.recordLabel, print: (n) => (n / 1000).toFixed(3)},
};

const LabWidgetBody = ({widget, puzzle}: {widget: LabWidgetCard; puzzle: DailyPuzzleCardView | null}) => {
    if (widget.kind === 'puzzle') {
        return puzzle ? <DailyPuzzleCard card={puzzle}/> : <p className="text-sm text-fg-muted">{GAMES_COPY.noPuzzleYet}</p>;
    }
    if (widget.kind === 'outside' && widget.site) {
        const link = GAMES_COPY.outside.links[widget.site];
        return (
            <>
                <p className="text-sm leading-relaxed text-fg-soft">{link.body}</p>
                <div className="mt-auto pt-5">
                    <a href={widget.href} target="_blank" rel="noopener noreferrer" className={actionButton({variant: 'secondary', size: 'md'})} data-outside-link={widget.site}>{LAB_COPY.list.open} ↗</a>
                </div>
            </>
        );
    }
    if (widget.kind === 'table') {
        return <GameCardBody body={POKER_NIGHT_COPY.cardBody} stats={[]} href={widget.href} cta={POKER_NIGHT_COPY.cardCta}/>;
    }
    const words = GAME_WORDS[widget.id];
    return (
        <GameCardBody
            body={words?.body ?? ''}
            stats={words ? [{label: words.recordLabel, value: widget.record === null ? '—' : words.print(widget.record), hint: widget.record === null ? ARITHMETIC_COPY.cardNone : undefined}] : []}
            href={widget.href}
            cta={ARITHMETIC_COPY.play}
        />
    );
};

export default LabWidgetBody;
