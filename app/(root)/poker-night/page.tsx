import type {Metadata} from "next";
import {headers} from "next/headers";
import {redirect} from "next/navigation";
import {getSessionUser} from "@/lib/auth/session";
import {POKER_NIGHT_COPY} from "@/lib/learn/copy/poker-night";
import {pokerNightEnabled} from "@/lib/poker-night/env";
import {LOOKS_CSS} from "@/lib/poker-night/looks";
import {originFromHeaders} from "@/lib/poker-night/links";
import {getLobbyView} from "@/lib/poker-night/lobby-store";
import FriendsTables from "@/components/poker-night/lobby/FriendsTables";
import JoinWithCode from "@/components/poker-night/lobby/JoinWithCode";
import MyLookPanel from "@/components/poker-night/lobby/MyLookPanel";
import OpenTables from "@/components/poker-night/lobby/OpenTables";
import QuickStart from "@/components/poker-night/lobby/QuickStart";
import RecentNights from "@/components/poker-night/lobby/RecentNights";
import EmptyState from "@/components/primitives/EmptyState";
import PageTitle from "@/components/primitives/PageTitle";

// The browser tab's title; app/layout.tsx appends the app's name.
export const metadata: Metadata = {title: "Poker night"};

// The poker night lobby, a page of the Learn section: start a table (one tap, or set up first),
// join one with a code, the reader's open tables, the ones friends chose to show, their recent
// nights and the name and look they sit down with. One read (lib/poker-night/lobby-store), shaped
// by lib/poker-night/lobby; a section with nothing in it is not drawn. The table itself is
// /play/CODE, full screen and outside this shell. My look draws avatars, card backs, chips and scenes
// in the table's own colours, so the page injects LOOKS_CSS as the (play) layout does.
const PokerNightPage = async () => {
    // The signed-in gate, and the account's name: a reader with nothing saved sits as their first name.
    const user = await getSessionUser();
    if (!user) redirect('/sign-in');
    const view = await getLobbyView(user.id, {accountName: user.name, requestOrigin: originFromHeaders(await headers())});
    const enabled = pokerNightEnabled();

    return (
        <div className="space-y-4" data-poker-night-lobby="">
            {/* The looks' colours (lib/poker-night/looks): a whitelisted registry of literals, never user input. */}
            <style id="pn-looks" dangerouslySetInnerHTML={{__html: LOOKS_CSS}}/>
            <PageTitle title={POKER_NIGHT_COPY.title} subtitle={POKER_NIGHT_COPY.subtitle} note={POKER_NIGHT_COPY.note}/>
            {enabled ? (
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                    <QuickStart hostName={view.profile.name} canCreate={view.canCreate}/>
                    <JoinWithCode/>
                    {view.open && <OpenTables tables={view.open}/>}
                    {view.friends && <FriendsTables tables={view.friends}/>}
                    {view.recent && <RecentNights nights={view.recent}/>}
                    <MyLookPanel profile={view.profile}/>
                </div>
            ) : (
                <>
                    <EmptyState size="panel" icon="celebration" title={POKER_NIGHT_COPY.off}/>
                    {view.recent && <RecentNights nights={view.recent}/>}
                </>
            )}
        </div>
    );
};

export default PokerNightPage;
