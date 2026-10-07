// The poker night lobby's one read (app/(root)/poker-night/page.tsx): the reader's open tables, the
// open tables friends chose to show, the reader's recent nights and the name and look they sit down
// with — each read here, shaped by the pure lib/poker-night/lobby. Server-only (on the poker-night
// server guard's list) and a plain module, never 'use server': it takes a user id.

import {getAcceptedFriendIds} from "@/lib/friends/store";
import {envOf} from "@/lib/poker-night/env";
import {shareUrlFor} from "@/lib/poker-night/links";
import {LOBBY_LIMITS, profileOf, shapeLobby, type LobbyProfile, type LobbySections} from "@/lib/poker-night/lobby";
import {getPokerNightPrefs} from "@/lib/poker-night/prefs-store";
import {readRecentResults} from "@/lib/poker-night/results-store";
import {listOpenRooms} from "@/lib/poker-night/store";

export type LobbyView = LobbySections & {profile: LobbyProfile};

// A section whose read failed is left out, as an empty one is: the lobby still opens, and a table
// can still be started. `accountName` is the session's, for the name a reader with nothing saved
// sits down as; `requestOrigin` builds the share links outside production (links.shareUrlFor). The
// time is read here, never in the page's render.
export const getLobbyView = async (
    userId: string, opts: {accountName: string | null; requestOrigin: string | null},
): Promise<LobbyView> => {
    const env = envOf();
    const now = Date.now();
    const logged = <T>(what: string, fallback: T) => (error: unknown): T => {
        console.error(`poker night: the lobby's ${what} read failed`, {env, message: error instanceof Error ? error.message : String(error)});
        return fallback;
    };
    // One row over each list's length: a duplicate code still leaves a full list. Recent nights read
    // as many more as the open tables that may be left out of them.
    const [mine, friends, results, saved] = await Promise.all([
        listOpenRooms(env, [userId], {friendsOnly: false, limit: LOBBY_LIMITS.open + 1, now}).catch(logged('open tables', [])),
        getAcceptedFriendIds(userId)
            .then((ids) => listOpenRooms(env, ids, {friendsOnly: true, limit: LOBBY_LIMITS.friends + 1, now}))
            .catch(logged("friends' tables", [])),
        readRecentResults(env, userId, LOBBY_LIMITS.recent + LOBBY_LIMITS.open).catch(logged('recent nights', [])),
        getPokerNightPrefs(userId),
    ]);
    const sections = shapeLobby({
        userId, mine, friends, results, now,
        shareUrl: (code) => shareUrlFor(code, {env, requestOrigin: opts.requestOrigin}),
    });
    return {...sections, profile: profileOf(saved, opts.accountName, userId)};
};
