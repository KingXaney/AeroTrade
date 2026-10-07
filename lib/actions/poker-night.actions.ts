'use server';

import {after} from "next/server";
import {revalidatePath} from "next/cache";
import {z} from "zod";
import {getCurrentUserId, getSessionUser} from "@/lib/auth/session";
import {takeRateLimit} from "@/lib/rate-limit";
import {upsertPreferences} from "@/lib/settings/preferences-store";
import {LOBBY_COPY, POKER_NIGHT_COPY, POKER_NIGHT_ERRORS} from "@/lib/learn/copy/poker-night";
import type {ActionResult} from "@/lib/actions/types";
import {AVATAR_MAX_LENGTH, isAvatar} from "@/lib/poker-night/avatar";
import {normalizeCode} from "@/lib/poker-night/code";
import {checkConfig, DEFAULT_CONFIG, GameConfigSchema, mergeConfig} from "@/lib/poker-night/config";
import {envOf, pokerNightEnabled} from "@/lib/poker-night/env";
import {NAME_INPUT_MAX, TABLE_NAME_INPUT_MAX} from "@/lib/poker-night/input";
import {LIMITS, pnKey, RATE_LIMITS} from "@/lib/poker-night/limits";
import {configIssueText, profileOf} from "@/lib/poker-night/lobby";
import {cleanName, cleanTableName} from "@/lib/poker-night/names";
import {PersonalLookSchema, TableLookSchema} from "@/lib/poker-night/personal";
import {getPokerNightPrefs} from "@/lib/poker-night/prefs-store";
import {tableStep} from "@/lib/poker-night/room";
import {unreadRefusal} from "@/lib/poker-night/room-doc";
import {afterCommit, countActiveHosted, getRoomByCode, insertRoom, mutateRoom} from "@/lib/poker-night/store";

// The poker night lobby's writes (/poker-night): start a table, end one of the reader's own, and
// save the name and look the reader sits down with. Lobby only — the table at /play/CODE never
// calls a server action (they run one at a time per client and change their ids on every deploy):
// it talks to the route handlers under app/api/poker-night/[code]/. Each action reads the session
// itself; none takes a user id.

export type CreateResult = {success: true; code: string} | {success: false; message: string};

// What a new table may be set up with: any of the game's settings (lib/poker-night/config, checked
// whole once laid over the defaults), its name and whether friends see it in their lobby. Nothing
// at all is a table with the defaults ("Start a table").
const CreateInput = z.strictObject({
    name: z.string().max(TABLE_NAME_INPUT_MAX).optional(),
    config: z.strictObject(GameConfigSchema.shape).partial().optional(),
    showToFriends: z.boolean().optional(),
});

// My look: the name and avatar, and optionally the personal look (any of its fields, each one of
// ours) and the scene and felt the reader's new tables open with.
const ProfileInput = z.strictObject({
    name: z.string().max(NAME_INPUT_MAX),
    avatar: z.string().max(AVATAR_MAX_LENGTH).refine(isAvatar, 'not an avatar'),
    look: PersonalLookSchema.optional(),
    table: TableLookSchema.optional(),
});

const failed = (message: string) => ({success: false as const, message});

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

// A new table with the reader seated at seat 0 as host, with the table's chip cap (room.newRoom),
// under the name and look they saved, else their first name and the look their id rolls, in the
// scene and felt they saved for their tables (else the casino and its emerald felt). Counted
// by the create rate limit, and refused while they host LIMITS.hostOpenTables open tables (two
// creates at once may both pass: one table over). The page then opens /play/CODE?invite=1.
export const createPokerNight = async (input: unknown = {}): Promise<CreateResult> => {
    const parsed = CreateInput.safeParse(input ?? {});
    if (!parsed.success) return failed(POKER_NIGHT_ERRORS.bad_request);
    if (!pokerNightEnabled()) return failed(POKER_NIGHT_COPY.off);
    const checked = checkConfig(mergeConfig(DEFAULT_CONFIG, parsed.data.config ?? {}));
    if (!checked.ok) return failed(configIssueText(checked.issues));
    const env = envOf();
    try {
        const user = await getSessionUser();
        if (!user) return failed(LOBBY_COPY.signedOut);
        if (!(await takeRateLimit(pnKey.create(env, user.id), RATE_LIMITS.create.limit, RATE_LIMITS.create.windowMs))) {
            return failed(LOBBY_COPY.tooFast);
        }
        const now = Date.now();
        if ((await countActiveHosted(env, user.id, now)) >= LIMITS.hostOpenTables) return failed(POKER_NIGHT_ERRORS.host_cap);
        const profile = profileOf(await getPokerNightPrefs(user.id), user.name, user.id);
        // No name sent (Start a table): the host's, "Ana's poker night"; a blank one shows the code.
        const name = parsed.data.name !== undefined
            ? cleanTableName(parsed.data.name) ?? ''
            : profile.name ? cleanTableName(POKER_NIGHT_COPY.tableNameDefault(profile.name)) ?? '' : '';
        const room = await insertRoom({
            env,
            host: {userId: user.id, name: profile.name, avatar: profile.avatar},
            config: checked.config,
            settings: {name, showToFriends: parsed.data.showToFriends ?? false, scene: profile.table.scene, felt: profile.table.felt},
            at: now,
        });
        return {success: true, code: room.core.code};
    } catch (error) {
        console.error('poker night: starting a table failed', {env, message: messageOf(error)});
        return failed(LOBBY_COPY.unreachable);
    }
};

// The host ends the night at one of their open tables from the lobby: the engine's host op 'end',
// through mutateRoom like any move — a hand in play finishes first, then the table closes and
// everyone is cashed out. Only the table's host (the account the role sits with now) may.
export const closePokerNight = async (input: unknown): Promise<ActionResult> => {
    const code = normalizeCode(input);
    if (!code) return failed(POKER_NIGHT_ERRORS.not_found);
    const env = envOf();
    try {
        const userId = await getCurrentUserId();
        if (!userId) return failed(LOBBY_COPY.signedOut);
        const read = await getRoomByCode(env, code);
        if (!read.ok) return failed(POKER_NIGHT_ERRORS[read.why === 'gone' ? 'not_found' : unreadRefusal(read.why)]);
        const core = read.room.core;
        if (core.hostUserId !== userId) return failed(POKER_NIGHT_ERRORS.not_host);
        if (core.state.status !== 'closed' && !core.state.closing) {
            const r = await mutateRoom(
                {env, id: core.id}, tableStep({type: 'host', by: core.state.hostPid, op: {op: 'end'}}), {receivedAt: Date.now(), label: 'host'},
            );
            // The results the close sets off (every account's night), after the answer.
            after(() => afterCommit(r));
            if (!r.ok) return failed(POKER_NIGHT_ERRORS[r.code]);
        }
        revalidatePath('/poker-night');
        return {success: true, message: LOBBY_COPY.ended};
    } catch (error) {
        console.error('poker night: ending a table failed', {code, env, message: messageOf(error)});
        return failed(LOBBY_COPY.unreachable);
    }
};

// The name and look the reader sits down with at every table they join from now on
// (user-preferences.pokerNight), and with them, when sent, their personal look (replaced whole: the
// fields sent are the look) and their new tables' scene and felt. A blank name is unset: the reader
// then sits as their first name. A table they are at already keeps the look they sat down with; it
// changes there, between hands.
export const savePokerNightProfile = async (input: unknown): Promise<ActionResult> => {
    const parsed = ProfileInput.safeParse(input);
    if (!parsed.success) return failed(POKER_NIGHT_ERRORS.bad_request);
    const env = envOf();
    try {
        const userId = await getCurrentUserId();
        if (!userId) return failed(LOBBY_COPY.signedOut);
        if (!(await takeRateLimit(pnKey.look(env, userId), RATE_LIMITS.look.limit, RATE_LIMITS.look.windowMs))) return failed(LOBBY_COPY.tooFast);
        const name = cleanName(parsed.data.name);
        const {look, table} = parsed.data;
        await upsertPreferences(userId, {
            $set: {
                'pokerNight.avatar': parsed.data.avatar,
                ...(name !== null ? {'pokerNight.name': name} : {}),
                ...(look !== undefined ? {'pokerNight.look': look} : {}),
                ...(table !== undefined ? {'pokerNight.table': table} : {}),
                updatedAt: new Date(),
            },
            ...(name === null ? {$unset: {'pokerNight.name': 1}} : {}),
        });
        revalidatePath('/poker-night');
        return {success: true, message: LOBBY_COPY.saved};
    } catch (error) {
        console.error('poker night: saving a look failed', {env, message: messageOf(error)});
        return failed(LOBBY_COPY.unreachable);
    }
};
