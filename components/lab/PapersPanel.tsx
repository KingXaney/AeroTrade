import type {LabTrack} from "@/lib/learn/copy/lab/types";
import type {LabPaperView} from "@/lib/lab/papers/view";
import {LAB_COPY, LAB_TRACK_LABELS} from "@/lib/learn/copy/lab";
import Disclosure from "@/components/primitives/Disclosure";
import MicroLabel from "@/components/primitives/MicroLabel";
import Panel from "@/components/primitives/Panel";
import {rowCard} from "@/components/primitives/RowCard";
import SectionHeading from "@/components/primitives/SectionHeading";

// One field's papers of the day: a row each, its number (the one the digest cites), its title
// linked to its arXiv abstract page — an address built from the id, never one a feed sent —
// the first authors, its category and upvotes, and the abstract in one disclosure.
const PapersPanel = ({track, papers}: {track: LabTrack; papers: LabPaperView[]}) => (
    <Panel id={`lab-papers-${track}`} aria-labelledby={`lab-papers-${track}-heading`}>
        <div className="mb-3 flex items-center justify-between gap-3">
            <SectionHeading id={`lab-papers-${track}-heading`} spacing="none">{LAB_TRACK_LABELS[track]}</SectionHeading>
            <MicroLabel>{LAB_COPY.trackPapers(papers.length)}</MicroLabel>
        </div>
        <ol className="space-y-2">
            {papers.map((paper) => (
                <li key={paper.id} id={`paper-${paper.id}`} className={rowCard({className: 'px-3 py-2'})} data-lab-paper={paper.id}>
                    <div className="flex items-start gap-3">
                        <MicroLabel as="span" className="mt-0.5 w-8 shrink-0 font-mono">[{paper.n}]</MicroLabel>
                        <div className="min-w-0 flex-1">
                            <a href={paper.links.abs} target="_blank" rel="noopener noreferrer" className="text-sm text-fg hover:text-brand hover:underline" data-paper-abs={paper.id}>{paper.title}</a>
                            <MicroLabel as="p" className="mt-0.5 normal-case tracking-normal">
                                {paper.authors.join(', ')}{paper.moreAuthors > 0 ? ` ${LAB_COPY.moreAuthors(paper.moreAuthors)}` : ''}
                                {paper.primary ? ` · ${paper.primary}` : ''}
                                {paper.upvotes !== null ? ` · ${LAB_COPY.upvotes(paper.upvotes)}` : ''}
                                {paper.links.hf ? <> · <a href={paper.links.hf} target="_blank" rel="noopener noreferrer" className="text-brand hover:underline" data-paper-hf={paper.id}>{LAB_COPY.onHf}</a></> : null}
                            </MicroLabel>
                            {paper.abstract && (
                                <Disclosure summary={LAB_COPY.abstractLabel} className="mt-1">
                                    <p className="mt-1 text-sm leading-relaxed text-fg-soft">{paper.abstract}</p>
                                </Disclosure>
                            )}
                        </div>
                    </div>
                </li>
            ))}
        </ol>
    </Panel>
);

export default PapersPanel;
