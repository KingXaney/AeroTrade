import {GAMES_COPY} from "@/lib/learn/copy/games";
import Panel from "@/components/primitives/Panel";
import {rowCard} from "@/components/primitives/RowCard";
import SectionHeading from "@/components/primitives/SectionHeading";

// Two sites outside the app that train in the same spirit. Fixed addresses from the copy, each
// a plain outbound anchor; nothing is read from them and nothing of the reader's goes to them.
const OutsideLinks = () => (
    <Panel id="games-outside" aria-labelledby="games-outside-heading" className="flex flex-col">
        <SectionHeading id="games-outside-heading">{GAMES_COPY.outside.heading}</SectionHeading>
        <p className="text-sm leading-relaxed text-fg-soft">{GAMES_COPY.outside.lead}</p>
        <ul className="mt-4 space-y-2">
            {(Object.entries(GAMES_COPY.outside.links) as [string, {title: string; body: string; href: string}][]).map(([id, link]) => (
                <li key={id} className={rowCard({className: 'px-3 py-2'})}>
                    <a href={link.href} target="_blank" rel="noopener noreferrer" className="text-sm text-fg hover:text-brand hover:underline" data-outside-link={id}>{link.title}</a>
                    <p className="mt-0.5 text-xs text-fg-muted">{link.body}</p>
                </li>
            ))}
        </ul>
    </Panel>
);

export default OutsideLinks;
