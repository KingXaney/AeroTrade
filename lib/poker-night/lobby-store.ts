// The poker night lobby's one read (app/(root)/poker-night/page.tsx): the table where the reader
// holds a seat, their open tables, the open tables friends chose to show, their recent nights and
// the name and look they sit down with — each read here, shaped by the pure lib/poker-night/lobby.
// Also Home's poker night panel (getHomePokerNight), from the same reads, fewer rows. Server-only
// (on the poker-night server guard's list) and a plain module, never 'use server': it takes a user id.

import {getAcceptedFriendIds} from "@/lib/friends/store";
import {envOf, pokerNightEnabled, type Env} from "@/lib/poker-night/env";
import {shareUrlFor} from "@/lib/poker-night/links";
import {
    HOME_LIMITS, homePokerNight, LOBBY_LIMITS, profileOf, shapeLobby, type HomePokerNight, type LobbyProfile, type LobbySections,
} from "@/lib/poker-night/lobby";
import {getPokerNightPrefs} from "@/lib/poker-night/prefs-store";
import {readRecentResults} from "@/lib/poker-night/results-store";
import {listOpenRooms, listSeatedRooms} from "@/lib/poker-night/store";

export type LobbyView = LobbySections & {profile: LobbyProfile};

const logged = <T>(env: Env, where: string, what: string, fallback: T) => (error: unknown): T => {
    console.error(`poker night: ${where} ${what} read failed`, {env, message: error instanceof Error ? error.message : String(error)});
    return fallback;
};

// A section whose read failed is left out, as an empty one is: the lobby still opens, and a table
// can still be started. `accountName` is the session's, for the name a reader with nothing saved
// sits down as; `requestOrigin` builds the share links outside production (links.shareUrlFor). The
// time is read here, never in the page's render.
export const getLobbyView = async (
    userId: string, opts: {accountName: string | null; requestOrigin: string | null},
): Promise<LobbyView> => {
    const env = envOf();
    const now = Date.now();
    const failed = <T>(what: string, fallback: T) => logged(env, "the lobby's", what, fallback);
    // One row over each list's length: a duplicate code still leaves a full list. Recent nights read
    // as many more as the open tables that may be left out of them.
    const [mine, friends, results, seated, saved] = await Promise.all([
        listOpenRooms(env, [userId], {friendsOnly: false, limit: LOBBY_LIMITS.open + 1, now}).catch(failed('open tables', [])),
        getAcceptedFriendIds(userId)
            .then((ids) => listOpenRooms(env, ids, {friendsOnly: true, limit: LOBBY_LIMITS.friends + 1, now}))
            .catch(failed("friends' tables", [])),
        readRecentResults(env, userId, LOBBY_LIMITS.recent + LOBBY_LIMITS.open).catch(failed('recent nights', [])),
        listSeatedRooms(env, userId, {limit: LOBBY_LIMITS.seated, now}).catch(failed('seated tables', [])),
        getPokerNightPrefs(userId),
    ]);
    const sections = shapeLobby({
        userId, mine, friends, results, seated, now,
        shareUrl: (code) => shareUrlFor(code, {env, requestOrigin: opts.requestOrigin}),
    });
    return {...sections, profile: profileOf(saved, opts.accountName, userId)};
};

// Home's poker night panel (app/(root)/page.tsx streams it under Suspense): the tables the reader
// holds a seat at or hosts, and friends' open tables, a few of each (lobby.homePokerNight); null
// with the kill switch on or when there is no row, so Home draws no box. Three bounded reads in
// parallel (friends' after the friend list), each read for its own list's few rows plus the ones
// the others may take out of it; a failed one counts as empty.
export const getHomePokerNight = async (userId: string): Promise<HomePokerNight | null> => {
    if (!pokerNightEnabled()) return null;
    const env = envOf();
    const now = Date.now();
    const failed = <T>(what: string, fallback: T) => logged(env, "Home's", what, fallback);
    const [mine, friends, seated] = await Promise.all([
        listOpenRooms(env, [userId], {friendsOnly: false, limit: HOME_LIMITS.tables + 1, now}).catch(failed('open tables', [])),
        getAcceptedFriendIds(userId)
            .then((ids) => listOpenRooms(env, ids, {friendsOnly: true, limit: HOME_LIMITS.friends + LOBBY_LIMITS.seated, now}))
            .catch(failed("friends' tables", [])),
        listSeatedRooms(env, userId, {limit: LOBBY_LIMITS.seated, now}).catch(failed('seated tables', [])),
    ]);
    return homePokerNight({userId, mine, friends, seated, now});
};
