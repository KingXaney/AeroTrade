import Link from "next/link";
import {requireUserId} from "@/lib/auth/session";
import {STRATEGIES, STRATEGIES_DISCLAIMER} from "@/lib/strategies/catalog";
import {GLOSSARY} from "@/lib/learn/glossary";
import {GLOSSARY_GROUPS} from "@/lib/learn/where";
import {LEARN_PAGE_COPY} from "@/lib/learn/copy/learn";
import MicroLabel from "@/components/primitives/MicroLabel";
import PageTitle from "@/components/primitives/PageTitle";
import Panel from "@/components/primitives/Panel";
import SectionHeading from "@/components/primitives/SectionHeading";

// The glossary as a page: every definition the app shows inline, grouped by where the
// number lives, with a link to go and look at the real one. Reference material, so it
// sits in the sidebar rather than the header; the ⌘K palette deep-links to an entry.

const LearnPage = async () => {
    await requireUserId();

    return (
        <div className="space-y-4">
            <PageTitle
                title="Learn"
                subtitle={LEARN_PAGE_COPY.subtitle}
                note={LEARN_PAGE_COPY.note}
            />

            <Panel id="learn-strategies">
                <SectionHeading>{LEARN_PAGE_COPY.strategiesHeading}</SectionHeading>
                <ul className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3">
                    {STRATEGIES.map((def) => (
                        <li key={def.id} className="min-w-0">
                            <Link href={`/strategies/${def.id}`} className="font-heading text-sm font-semibold text-fg hover:text-brand transition-colors">
                                {def.name}
                            </Link>
                            <p className="text-xs text-fg-soft mt-0.5">{def.explainer.beginnerLine}</p>
                            <MicroLabel as="p" className="mt-0.5 normal-case tracking-normal">{def.family} · {def.explainer.summary}</MicroLabel>
                        </li>
                    ))}
                </ul>
            </Panel>

            {GLOSSARY_GROUPS.map((group) => (
                <Panel key={group.id} id={`learn-${group.id}`}>
                    <div className="flex items-center justify-between gap-3 mb-4">
                        <SectionHeading spacing="none">{group.label}</SectionHeading>
                        <Link href={group.home.href} className="font-mono text-[11px] text-brand hover:underline">
                            {group.home.label} →
                        </Link>
                    </div>
                    <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                        {group.keys.map((key) => {
                            const entry = GLOSSARY[key];
                            return (
                                <div key={key} id={key} className="scroll-mt-24 min-w-0" data-learn-entry={key}>
                                    <dt className="font-heading text-xs font-semibold text-fg">{entry.term}</dt>
                                    <dd className="text-xs text-fg-muted leading-relaxed">
                                        {entry.long}
                                        {entry.formula && (
                                            <span className="block font-mono text-[10px] text-fg-muted/80 mt-0.5">{entry.formula}</span>
                                        )}
                                        {entry.seeAlso && entry.seeAlso.length > 0 && (
                                            <span className="block mt-0.5 font-mono text-[10px] text-fg-muted">
                                                See also:{' '}
                                                {entry.seeAlso.map((other, i) => (
                                                    <span key={other}>
                                                        {i > 0 ? ', ' : ''}
                                                        <a href={`#${other}`} className="text-brand hover:underline">{GLOSSARY[other as keyof typeof GLOSSARY]?.term ?? other}</a>
                                                    </span>
                                                ))}
                                            </span>
                                        )}
                                    </dd>
                                </div>
                            );
                        })}
                    </dl>
                </Panel>
            ))}

            <MicroLabel as="p" className="text-center">
                {STRATEGIES_DISCLAIMER}
            </MicroLabel>
        </div>
    );
};

export default LearnPage;
