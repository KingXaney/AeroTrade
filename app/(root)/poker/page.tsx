import type {Metadata} from "next";
import {requireUserId} from "@/lib/auth/session";
import {POKER_COPY} from "@/lib/learn/copy/poker";
import EquityTab from "@/components/poker/EquityTab";
import PotOddsTab from "@/components/poker/PotOddsTab";
import PushFoldTab from "@/components/poker/PushFoldTab";
import RiverTab from "@/components/poker/RiverTab";
import PageTitle from "@/components/primitives/PageTitle";
import Tabs from "@/components/primitives/Tabs";

export const metadata: Metadata = {title: "Poker solver"};

// The poker solver: equity, heads-up push or fold, pot odds and the river, one view at a time (?tab=). Every
// figure is worked out in the browser — a Web Worker when it starts, else the page thread — so the
// page reads nothing on the server beyond the session. `?engine=main` forces the page thread, for QA.

const TAB_IDS = ['equity', 'push-fold', 'pot-odds', 'river'] as const;
type TabId = (typeof TAB_IDS)[number];
const isTab = (value: unknown): value is TabId => typeof value === 'string' && (TAB_IDS as readonly string[]).includes(value);

type PokerPageProps = {searchParams: Promise<{tab?: string; engine?: string}>};

const PokerPage = async ({searchParams}: PokerPageProps) => {
    await requireUserId();
    const params = await searchParams;
    const tab: TabId = isTab(params.tab) ? params.tab : 'equity';
    const engine = params.engine === 'main' ? 'main' : 'auto';
    const query = (id: TabId) => {
        const parts = [id === 'equity' ? null : `tab=${id}`, engine === 'main' ? 'engine=main' : null].filter(Boolean);
        return parts.length > 0 ? `/poker?${parts.join('&')}` : '/poker';
    };
    const tabs = TAB_IDS.map((id) => ({id, label: POKER_COPY.tabs[id], href: query(id)}));

    return (
        <div className="space-y-4" data-poker-page={tab}>
            <PageTitle title={POKER_COPY.title} subtitle={POKER_COPY.subtitle}/>
            <Tabs tabs={tabs} active={tab} label={POKER_COPY.tabsLabel}/>
            {tab === 'equity' && <EquityTab engine={engine}/>}
            {tab === 'push-fold' && <PushFoldTab engine={engine}/>}
            {tab === 'pot-odds' && <PotOddsTab/>}
            {tab === 'river' && <RiverTab engine={engine}/>}
            <p className="text-xs text-fg-muted">{POKER_COPY.note}</p>
        </div>
    );
};

export default PokerPage;
