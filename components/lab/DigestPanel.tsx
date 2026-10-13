import Link from "next/link";
import type {LabDigestView} from "@/lib/lab/papers/view";
import {LAB_COPY} from "@/lib/learn/copy/lab";
import MicroLabel from "@/components/primitives/MicroLabel";
import Panel from "@/components/primitives/Panel";
import SectionHeading from "@/components/primitives/SectionHeading";

// The day's digest, as the model wrote it and the parser kept it: the headline and bullets as
// text nodes under the AI caveat (never markdown, never HTML), each bullet's citations as "[n]"
// links to the paper rows — the page's own addresses, never a link the model wrote.
type Props = {
    id: string;
    digest: LabDigestView;
    day: string;
    // The address a cited paper's "[n]" points at, the id appended: "#paper-" on the Papers
    // view, the Papers view's own address on Today.
    hrefPrefix: string;
    more?: {href: string; label: string};
};

const DigestPanel = ({id, digest, day, hrefPrefix, more}: Props) => (
    <Panel id={id} aria-labelledby={`${id}-heading`} data-lab-digest={day}>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
            <SectionHeading id={`${id}-heading`} spacing="none">{LAB_COPY.digestHeading}</SectionHeading>
            <MicroLabel>{LAB_COPY.digestCaveat(day)}</MicroLabel>
        </div>
        {digest.headline && <p className="mb-3 font-heading text-base font-semibold text-fg" data-digest-headline>{digest.headline}</p>}
        <ol className="list-decimal space-y-2 pl-5">
            {digest.bullets.map((bullet, i) => (
                <li key={i} className="text-sm leading-relaxed text-fg-soft" data-digest-bullet>
                    {bullet.text}
                    {' '}
                    <span className="whitespace-nowrap">
                        {bullet.refs.map((ref) => (
                            <a key={ref.id} href={`${hrefPrefix}${ref.id}`} title={ref.title} className="ml-1 font-mono text-xs text-brand hover:underline" data-digest-ref={ref.id}>[{ref.n}]</a>
                        ))}
                    </span>
                </li>
            ))}
        </ol>
        {more && (
            <div className="mt-3">
                <Link href={more.href} className="label-type text-xs text-brand hover:underline">{more.label}</Link>
            </div>
        )}
    </Panel>
);

export default DigestPanel;
