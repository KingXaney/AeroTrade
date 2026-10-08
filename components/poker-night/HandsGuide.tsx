// The Hands guide (P2): the ten hand rankings strongest first, each with a five-card example whose
// cards that make the hand are lifted; ties and kickers, with two hands only a kicker separates; and
// the games a table deals. No hooks and nothing server-only, so the lobby's Hands tab
// (app/(root)/poker-night, ?tab=hands) renders it on the server and the table's Hands drawer
// (HandsDrawer) in the browser. The examples are lib/poker-night/hands-guide's; every definition is
// the glossary's own short, quoted word for word under its <Term> (invariant 12), and the lines
// around them are HANDS_COPY.
//
// Phone first: an example's five cards sit on their own line under the ranking's name, 34 px wide in
// the narrowest list, 40 px from a 248 px list (a 320 px phone's drawer) and 44 px from 288 px (a
// container query, so the lobby's column and a drawer size them by their own width), and the name
// moves beside them only where both fit. With `focus` (at the table) the rankings come first — what a
// player opens Hands mid-game to check — then ties and kickers, then the table's own game under "At
// this table", before any other. The cards are drawn in the viewer's card face and colours, from
// LOOKS_CSS through the sample's own data attributes — the drawer is portaled out of the room that
// carries the viewer's.

import type {ReactNode} from "react";
import MicroLabel from "@/components/primitives/MicroLabel";
import RowCard from "@/components/primitives/RowCard";
import SectionHeading from "@/components/primitives/SectionHeading";
import Term from "@/components/primitives/Term";
import PlayingCard from "@/components/poker-night/PlayingCard";
import {GLOSSARY} from "@/lib/learn/glossary";
import {HAND_COPY, HANDS_COPY} from "@/lib/learn/copy/poker-night";
import type {Card} from "@/lib/poker/cards";
import {cardsThatMake, guideGames, KICKER_EXAMPLE, RANKING_EXAMPLES, type GuideGame, type GuideGameEntry} from "@/lib/poker-night/hands-guide";
import type {CardFaceId} from "@/lib/poker-night/looks";
import {DEFAULT_PERSONAL_LOOK} from "@/lib/poker-night/personal";
import {cn} from "@/lib/utils";

type Level = 'h2' | 'h3';

type Props = {
    // The game the table deals, put first under "At this table"; none in the lobby.
    focus?: GuideGame | null;
    face?: CardFaceId;
    four?: boolean; // the four-colour deck
    // The sections' heading level: h2 on the lobby's page, h3 in the table's drawer.
    level?: Level;
    className?: string;
};

type Look = {face: CardFaceId; four: boolean};

// Five cards, the ones that make the hand lifted (the card's 'win' state); one picture for a screen
// reader, named card by card with the ones that make the hand last — only this hand's own.
const Cards = ({cards, makes, look}: {cards: readonly Card[]; makes: readonly Card[]; look: Look}) => {
    const own = cardsThatMake(cards, makes);
    return (
        <span role="img" aria-label={HANDS_COPY.example(cards, own)} data-guide-cards=""
              className="pn-sample shrink-0 pt-2 [--pn-card-w:34px] @min-[15.5rem]:[--pn-card-w:40px] @2xs:[--pn-card-w:44px]"
              data-pn-face={look.face} data-pn-colours={look.four ? 'four' : 'two'}>
            {cards.map((card) => <PlayingCard key={card} card={card} state={own.includes(card) ? 'win' : null}/>)}
        </span>
    );
};

// A heading one level under the section's (a game's name inside "The games").
const SubHeading = ({level, id, children}: {level: Level; id?: string; children: ReactNode}) => {
    const Tag = level === 'h2' ? 'h3' : 'h4';
    return <Tag id={id} className="heading-type text-xs">{children}</Tag>;
};

const Rankings = ({level, look}: {level: Level; look: Look}) => (
    <section aria-labelledby="hands-rankings" className="@container mb-6 break-inside-avoid space-y-3" data-guide-section="rankings">
        <SectionHeading as={level} id="hands-rankings" spacing="none"><Term k="hand-rankings">{HANDS_COPY.heading}</Term></SectionHeading>
        <p className="text-sm leading-relaxed text-fg-soft">{GLOSSARY['hand-rankings'].short}</p>
        <p className="text-xs leading-relaxed text-fg-muted">{HANDS_COPY.lead}</p>
        <ol className="space-y-2" data-hand-rankings="">
            {RANKING_EXAMPLES.map((example, i) => {
                const name = HANDS_COPY.categories[example.slot];
                const label = HAND_COPY.label(example.description);
                return (
                    <RowCard as="li" key={example.slot} data-ranking={example.slot}
                             className="flex flex-col gap-1 px-3 py-2.5 @md:flex-row @md:items-center @md:justify-between @md:gap-4">
                        <div className="flex min-w-0 items-baseline gap-2">
                            <span aria-hidden="true" className="w-5 shrink-0 font-mono text-xs text-fg-muted">{i + 1}</span>
                            <div className="min-w-0">
                                <p className="text-sm font-medium text-fg">{name}</p>
                                {label !== name && <p className="text-xs text-fg-muted">{label}</p>}
                            </div>
                        </div>
                        <Cards cards={example.cards} makes={example.makes} look={look}/>
                    </RowCard>
                );
            })}
        </ol>
    </section>
);

const Ties = ({level, look}: {level: Level; look: Look}) => (
    <section aria-labelledby="hands-ties" className="@container mb-6 break-inside-avoid space-y-3" data-guide-section="ties">
        <SectionHeading as={level} id="hands-ties" spacing="none">{HANDS_COPY.tiesHeading}</SectionHeading>
        <p className="text-sm leading-relaxed text-fg-soft"><Term k="kicker"/>: {GLOSSARY.kicker.short}</p>
        <div className="space-y-2" data-guide-kicker="">
            {([[HANDS_COPY.firstHand, KICKER_EXAMPLE.first], [HANDS_COPY.secondHand, KICKER_EXAMPLE.second]] as const).map(([label, cards]) => (
                <RowCard key={label} className="flex flex-col gap-1 px-3 py-2.5 @md:flex-row @md:items-center @md:justify-between @md:gap-4">
                    <MicroLabel as="p">{label}</MicroLabel>
                    <Cards cards={cards} makes={KICKER_EXAMPLE.makes} look={look}/>
                </RowCard>
            ))}
        </div>
        <p className="text-xs leading-relaxed text-fg-muted">{HANDS_COPY.kickerCaption}</p>
        <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-fg-soft marker:text-fg-muted">
            {HANDS_COPY.ties.map((line) => <li key={line}>{line}</li>)}
        </ul>
    </section>
);

// One game: its name as its glossary entry, the entry's short, then what it is like at this table.
const Game = ({game, heading, here}: {game: GuideGameEntry; heading: (id: string, children: ReactNode) => ReactNode; here: boolean}) => {
    const copy = HANDS_COPY.games[game.id];
    return (
        <article id={game.anchor} aria-labelledby={`${game.anchor}-name`} className="scroll-mt-24 space-y-2" data-guide-game={game.id}
                 {...(here ? {'data-guide-here': ''} : {})}>
            {here && <MicroLabel as="p" tone="brand">{HANDS_COPY.atThisTable}</MicroLabel>}
            {heading(`${game.anchor}-name`, <Term k={game.term}>{copy.name}</Term>)}
            <p className="text-sm leading-relaxed text-fg-soft">{GLOSSARY[game.term].short}</p>
            <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-fg-soft marker:text-fg-muted">
                {copy.facts.map((line) => <li key={line}>{line}</li>)}
            </ul>
        </article>
    );
};

const HandsGuide = ({focus = null, face = DEFAULT_PERSONAL_LOOK.cardFace, four = DEFAULT_PERSONAL_LOOK.fourColour, level = 'h2', className}: Props) => {
    const look: Look = {face, four};
    const {here, others} = guideGames(focus);
    return (
        <div className={cn('text-fg', className)} data-hands-guide="">
            <Rankings level={level} look={look}/>
            <Ties level={level} look={look}/>
            {/* At the table: the game it deals, after the rankings and before any other game, its name
                at the sections' own level. */}
            {here && (
                <div className="mb-6 break-inside-avoid" data-guide-section="here">
                    <Game game={here} here heading={(id, children) => <SectionHeading as={level} id={id} spacing="none">{children}</SectionHeading>}/>
                </div>
            )}
            {others.length > 0 && (
                <section aria-labelledby="hands-games" className="mb-6 break-inside-avoid space-y-4" data-guide-section="games">
                    <SectionHeading as={level} id="hands-games" spacing="none">{HANDS_COPY.gamesHeading}</SectionHeading>
                    {others.map((game) => (
                        <Game key={game.id} game={game} here={false} heading={(id, children) => <SubHeading level={level} id={id}>{children}</SubHeading>}/>
                    ))}
                </section>
            )}
        </div>
    );
};

export default HandsGuide;
