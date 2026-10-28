import type {Metadata} from "next";
import {redirect} from "next/navigation";
import OfficeApp from "@/components/agent-world/office/OfficeApp";
import OfficeLegend from "@/components/agent-world/office/OfficeLegend";
import WhatTheseMean from "@/components/learn/WhatTheseMean";
import {isAgentWorldOwner} from "@/lib/agent-world/env";
import {getOfficeView} from "@/lib/agent-world/office-store";
import {getCurrentUser} from "@/lib/auth/session";
import {formatEasternTimestamp} from "@/lib/format";
import {AGENT_WORLD_COPY} from "@/lib/learn/copy/agent-world";
import {OFFICE_COPY, OFFICE_TERMS, type OfficeTermsGroup} from "@/lib/learn/copy/agent-world-office";
import {GLOSSARY} from "@/lib/learn/glossary";

// The browser tab's title; app/layout.tsx appends the app's name.
export const metadata: Metadata = {title: OFFICE_COPY.title};

// The office: the trading agent world's newest session as one floor of fourteen seats, live or
// played back. Everyone signed in watches; the owners (AGENT_WORLD_OWNER_EMAILS, else
// LAB_OWNER_EMAILS) start sessions and decide them from here too. ?engine=2d draws the floor plan.
// The page composes lib/agent-world/office-store's one read and nothing else; the glossary arrives
// in the client as server-rendered slots, and with no chat on this page no "Ask in chat" link.
type OfficePageProps = {searchParams: Promise<{engine?: string}>};

const OfficePage = async ({searchParams}: OfficePageProps) => {
    const user = await getCurrentUser();
    if (!user) redirect('/sign-in');
    const params = await searchParams;
    const view = await getOfficeView();
    const enabled = view.off === null;
    const terms = Object.fromEntries(
        (Object.entries(OFFICE_TERMS) as [OfficeTermsGroup, readonly string[]][]).map(([group, keys]) => [group, <WhatTheseMean key={group} keys={keys} ask={false} />]),
    ) as Record<OfficeTermsGroup, React.ReactNode>;
    return (
        <OfficeApp
            initial={view.live}
            owner={isAgentWorldOwner(user.email)}
            enabled={enabled}
            offNote={view.off ? AGENT_WORLD_COPY.off[view.off] : null}
            ratingTitle={GLOSSARY['desk-rating'].short}
            extras={{
                sessionsToDate: view.totals.sessions,
                costToDateCents: view.totals.spentCents,
                record: view.record ? {totalReturnPct: view.record.totalReturnPct, benchmarkReturnPct: view.record.benchmarkReturnPct, since: view.record.since} : null,
                nextSessionAt: enabled ? view.nextSessionAt : null,
            }}
            career={view.career}
            budgets={view.budgets}
            nextSessionNote={enabled ? AGENT_WORLD_COPY.nextSession(formatEasternTimestamp(view.nextSessionAt)) : null}
            engine={params.engine === '2d' ? '2d' : 'auto'}
            terms={terms}
            legend={<OfficeLegend />}
        />
    );
};

export default OfficePage;
