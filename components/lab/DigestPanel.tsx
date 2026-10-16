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
    // Layout only, as Panel's: h-full in a grid cell, scroll-mt under the fixed header.
    className?: string;
};

const DigestPanel = ({id, digest, day, hrefPrefix, more, className}: Props) => (
    <Panel id={id} aria-labelledby={`${id}-heading`} pad={4} className={className} data-lab-digest={day}>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <SectionHeading id={`${id}-heading`} spacing="none">{LAB_COPY.digestHeading}</SectionHeading>
            <MicroLabel>{LAB_COPY.digestCaveat(day)}</MicroLabel>
        </div>
        {digest.headline && <p className="mb-2 font-heading text-base font-semibold text-fg" data-digest-headline>{digest.headline}</p>}
        <ol className="list-decimal space-y-1.5 pl-5">
            {digest.bullets.map((bullet, i) => (
                <li key={i} className="text-sm leading-normal text-fg-soft" data-digest-bullet>
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
            <div className="mt-2">
                <Link href={more.href} className="label-type text-xs text-brand hover:underline">{more.label}</Link>
            </div>
        )}
    </Panel>
);

export default DigestPanel;
