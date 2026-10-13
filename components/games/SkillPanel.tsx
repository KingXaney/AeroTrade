import Link from "next/link";
import {MIN_ATTEMPTS, practiceHref, type SkillView} from "@/lib/games/arithmetic-skill";
import {ARITHMETIC_COPY} from "@/lib/learn/copy/games";
import SkillResetButton from "@/components/games/SkillResetButton";
import {actionButton} from "@/components/primitives/ActionButton";
import MicroLabel from "@/components/primitives/MicroLabel";
import Panel from "@/components/primitives/Panel";
import SectionHeading from "@/components/primitives/SectionHeading";

// Where the reader is slow: the kinds of problem that take them longest against their own
// average (lib/games/arithmetic-skill.weakCells), each with its figures, and the one way to a
// practice round on exactly those kinds. Server-rendered from the aggregate the round action
// folds into and revalidates, so it is fresh after every round.
const SkillPanel = ({view}: {view: SkillView}) => (
    <Panel id="arithmetic-skill" aria-labelledby="arithmetic-skill-heading" data-arithmetic-skill>
        <SectionHeading id="arithmetic-skill-heading" spacing="sm">{ARITHMETIC_COPY.skillHeading}</SectionHeading>
        <p className="text-sm leading-relaxed text-fg-soft">{ARITHMETIC_COPY.skillLead}</p>
        {view.weak.length > 0 ? (
            <ul className="mt-3 space-y-2" data-skill-rows>
                {view.weak.map((row) => (
                    <li key={row.cell} className="text-sm" data-skill-row={row.cell}>
                        <span className="text-fg">{ARITHMETIC_COPY.cellLabel(row.cell)}</span>
                        <MicroLabel as="p" className="mt-0.5 normal-case tracking-normal">{ARITHMETIC_COPY.skillRow(row.meanMs / 1000, row.ratio, row.n, row.slips)}</MicroLabel>
                    </li>
                ))}
            </ul>
        ) : (
            <p className="mt-3 text-sm text-fg-muted" data-skill-empty={view.mostTried >= MIN_ATTEMPTS ? 'even' : 'few'}>
                {view.mostTried >= MIN_ATTEMPTS ? ARITHMETIC_COPY.skillEven : ARITHMETIC_COPY.skillFew}
            </p>
        )}
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
            {view.weak.length > 0 && (
                <Link href={practiceHref(view.weak.map((row) => row.cell))} className={actionButton({variant: 'secondary', size: 'sm'})} data-skill-practice>
                    {ARITHMETIC_COPY.practiceThese}
                </Link>
            )}
            {view.rounds > 0 && <MicroLabel data-skill-count={view.problems}>{ARITHMETIC_COPY.skillCount(view.problems, view.rounds)}</MicroLabel>}
            {view.rounds > 0 && <SkillResetButton/>}
        </div>
    </Panel>
);

export default SkillPanel;
