import type {Metadata} from "next";
import {headers} from "next/headers";
import {redirect} from "next/navigation";
import {getSessionUser} from "@/lib/auth/session";
import {HANDS_COPY, POKER_NIGHT_COPY} from "@/lib/learn/copy/poker-night";
import {pokerNightEnabled} from "@/lib/poker-night/env";
import {HANDS_TERMS} from "@/lib/poker-night/hands-guide";
import {LOOKS_CSS} from "@/lib/poker-night/looks";
import {originFromHeaders} from "@/lib/poker-night/links";
import {getLobbyView} from "@/lib/poker-night/lobby-store";
import WhatTheseMean from "@/components/learn/WhatTheseMean";
import HandsGuide from "@/components/poker-night/HandsGuide";
import FriendsTables from "@/components/poker-night/lobby/FriendsTables";
import JoinWithCode from "@/components/poker-night/lobby/JoinWithCode";
import MyLookPanel from "@/components/poker-night/lobby/MyLookPanel";
import OpenTables from "@/components/poker-night/lobby/OpenTables";
import QuickStart from "@/components/poker-night/lobby/QuickStart";
import RecentNights from "@/components/poker-night/lobby/RecentNights";
import ResumeTable from "@/components/poker-night/lobby/ResumeTable";
import EmptyState from "@/components/primitives/EmptyState";
import PageTitle from "@/components/primitives/PageTitle";
import Panel from "@/components/primitives/Panel";
import Tabs from "@/components/primitives/Tabs";

// The browser tab's title; app/layout.tsx appends the app's name.
export const metadata: Metadata = {title: "Poker night"};

// The poker night lobby, a page of the Learn section, in two views kept in the URL (?tab=):
//   Play  — first, while the reader holds a seat at an open table, "You are seated at …" with
//           Rejoin (lobby.resumeOf); then start a table (one tap, or set up first), join one with
//           a code, the reader's open tables, the ones friends chose to show, their recent nights
//           and the name and look they sit down with. One read (lib/poker-night/lobby-store),
//           shaped by lib/poker-night/lobby; a section with nothing in it is not drawn.
//   Hands — the Hands guide (components/poker-night/HandsGuide over lib/poker-night/hands-guide):
//           the rankings with an example each, ties and kickers, the games. It reads nothing, and
//           shows with the kill switch on too.
// The table itself is /play/CODE, full screen and outside this shell. My look and the guide draw
// cards, avatars, chips and scenes in the table's own colours, so the page injects LOOKS_CSS as the
// (play) layout does.

const TAB_IDS = ['play', 'hands'] as const;
type TabId = (typeof TAB_IDS)[number];
const isTab = (value: unknown): value is TabId => typeof value === 'string' && (TAB_IDS as readonly string[]).includes(value);

const TABS = TAB_IDS.map((id) => ({id, label: HANDS_COPY.tabs[id], href: id === 'play' ? '/poker-night' : `/poker-night?tab=${id}`}));

type PokerNightPageProps = {searchParams: Promise<{tab?: string}>};

const PlayView = async ({userId, accountName}: {userId: string; accountName: string}) => {
    const view = await getLobbyView(userId, {accountName, requestOrigin: originFromHeaders(await headers())});
    if (!pokerNightEnabled()) {
        return (
            <>
                <EmptyState size="panel" icon="celebration" title={POKER_NIGHT_COPY.off}/>
                {view.recent && <RecentNights nights={view.recent}/>}
            </>
        );
    }
    return (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {view.resume && <ResumeTable table={view.resume}/>}
            <QuickStart hostName={view.profile.name} canCreate={view.canCreate}/>
            <JoinWithCode/>
            {view.open && <OpenTables tables={view.open}/>}
            {view.friends && <FriendsTables tables={view.friends}/>}
            {view.recent && <RecentNights nights={view.recent}/>}
            <MyLookPanel profile={view.profile}/>
        </div>
    );
};

// The guide in one panel, two columns from a wide screen, with the one "What these mean" for the
// terms it quotes (the chat is mounted here, so their Ask links work). Below lg — a phone either way
// up — its line and each Ask link are full 44 px targets.
const PHONE_TARGETS = 'max-lg:[&>summary]:min-h-11 max-lg:[&_[data-ask]]:inline-flex max-lg:[&_[data-ask]]:min-h-11 max-lg:[&_[data-ask]]:items-center';

const HandsView = () => (
    <Panel aria-labelledby="hands-rankings" data-poker-night-hands="">
        <HandsGuide level="h2" className="lg:columns-2 lg:gap-10"/>
        <WhatTheseMean keys={HANDS_TERMS} className={PHONE_TARGETS}/>
    </Panel>
);

const PokerNightPage = async ({searchParams}: PokerNightPageProps) => {
    // The signed-in gate, and the account's name: a reader with nothing saved sits as their first name.
    const user = await getSessionUser();
    if (!user) redirect('/sign-in');
    const params = await searchParams;
    const tab: TabId = isTab(params.tab) ? params.tab : 'play';

    return (
        <div className="space-y-4" data-poker-night-page={tab} {...(tab === 'play' ? {'data-poker-night-lobby': ''} : {})}>
            {/* The looks' colours (lib/poker-night/looks): a whitelisted registry of literals, never user input. */}
            <style id="pn-looks" dangerouslySetInnerHTML={{__html: LOOKS_CSS}}/>
            <PageTitle title={POKER_NIGHT_COPY.title} subtitle={POKER_NIGHT_COPY.subtitle} note={POKER_NIGHT_COPY.note}/>
            <Tabs tabs={TABS} active={tab} label={HANDS_COPY.tabsLabel} size="md"/>
            {tab === 'hands' ? <HandsView/> : <PlayView userId={user.id} accountName={user.name}/>}
        </div>
    );
};

export default PokerNightPage;
