import {cn} from "@/lib/utils";
import type {ReasonClause} from "@/lib/learn/reasons";
import Term from "@/components/primitives/Term";

// A decoded reason (lib/learn/reasons.ts decodeReason), clause by clause: the rule's own
// words in mono, carrying the glossary definition as a title where one applies, and the
// plain-English reading beneath. Presentational and client-safe (no hooks, no server
// imports), so a client component can render it as well as the server panels. Renders
// nothing for a reason the grammar does not know; the raw reason is always shown by the
// caller, so there is nothing to apologise for. A clause that is the whole of the reason
// the caller already printed ("signal, but no open slot") keeps its label for screen
// readers only, so the eye does not read the same words twice in a row.

type Props = {
    clauses: readonly ReasonClause[];
    // The reason exactly as the caller shows it just above.
    quoted?: string;
    className?: string;
};

const ReasonGloss = ({clauses, quoted, className}: Props) => {
    if (clauses.length === 0) return null;
    return (
        <dl data-reason-gloss className={cn('space-y-1.5', className)}>
            {clauses.map((clause, index) => (
                <div key={`${index}-${clause.text}`}>
                    <dt className={cn('font-mono text-[10px] text-fg-soft break-words', clause.text === quoted?.trim() && 'sr-only')}>
                        {clause.term ? <Term k={clause.term}>{clause.text}</Term> : clause.text}
                    </dt>
                    <dd className="text-[11px] text-fg-muted leading-snug">{clause.gloss}</dd>
                </div>
            ))}
        </dl>
    );
};

export default ReasonGloss;
