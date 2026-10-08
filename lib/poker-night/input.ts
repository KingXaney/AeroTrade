// What a poker night request may say, as strict zod schemas: an unknown key, a fractional chip, a
// seat past the ninth or an id of the wrong shape is a 400 before anything is read. Pure and
// client-safe, so the table's fetch helper can type its bodies from the same schemas.
//
// Every action carries an actionId the client makes once per intent and reuses on a retry: the room
// keeps the last 40 it applied, so a double tap or a retried request is one action. Identity never
// comes from a body — `by` is the pid the room found for the request's own identity.

import {z} from 'zod';
import {AVATAR_MAX_LENGTH, isAvatar} from '@/lib/poker-night/avatar';
import {GAME_CONFIG_SHAPE, RoomSettingsSchema, TABLE_LIMITS} from '@/lib/poker-night/config';
import {PHRASE_IDS, REACTION_IDS, THROW_IDS, type ReactionId, type ThrowId} from '@/lib/poker-night/emotes';
import {cleanTableName} from '@/lib/poker-night/names';
import type {HostOp, Move, PreAction, TableAction} from '@/lib/poker-night/types';

// A client-made id: a UUID, or 16 to 36 characters of base64url.
export const ACTION_ID = /^[A-Za-z0-9_-]{16,36}$/;
// A player's public handle in a room: 8 random bytes of base64url.
export const PID = /^[A-Za-z0-9_-]{11}$/;
// A name as typed, before cleanName keeps at most 48 units of it.
export const NAME_INPUT_MAX = 64;
// A table name as typed, before cleanTableName keeps at most 40 units of it.
export const TABLE_NAME_INPUT_MAX = 160;

const actionId = z.string().regex(ACTION_ID);
const pid = z.string().regex(PID);
const count = z.int().min(0);
const chips = z.int().min(1);
const buyIn = z.int().min(1).max(TABLE_LIMITS.buyIn.max);
const seat = z.int().min(0).max(TABLE_LIMITS.seats.max - 1);
const rawName = z.string().max(NAME_INPUT_MAX);
const avatar = z.string().max(AVATAR_MAX_LENGTH).refine(isAvatar, 'not an avatar');

// POST join. A blank name sits as the avatar's face name; no seat takes the first free one; no
// buy-in takes the table's cap. joinId, like an actionId, is made once per intent and reused on a
// retry: a browser with no identity yet is given the guest that id names (lib/poker-night/
// guest-token.guestIdForJoin), so a double tap or a retry after a lost answer is one guest and one
// row, whichever request lands first.
export const JoinSchema = z.strictObject({
    joinId: actionId,
    name: rawName,
    avatar,
    as: z.enum(['player', 'watcher']),
    seat: seat.optional(),
    buyIn: buyIn.optional(),
});
export type JoinBody = z.infer<typeof JoinSchema>;
// What the room's join step reads of it (the joinId is the route's).
export type JoinInput = Omit<JoinBody, 'joinId'>;

const MoveSchema = z.discriminatedUnion('kind', [
    z.strictObject({kind: z.enum(['fold', 'check', 'call', 'all-in'])}),
    z.strictObject({kind: z.literal('raise'), to: chips}),
]);

const PreSchema = z.discriminatedUnion('kind', [
    z.strictObject({kind: z.enum(['check-fold', 'check', 'call-any'])}),
    z.strictObject({kind: z.literal('call'), amount: chips}),
]);

// The host's config changes: any field but the seat count, checked whole by the engine once laid
// over the current config.
const ConfigPatchSchema = z.strictObject(GAME_CONFIG_SHAPE).omit({seats: true}).partial();

// The room's settings, at once; a table name is cleaned before the engine sees it.
const SettingsPatchSchema = RoomSettingsSchema.extend({name: z.string().max(TABLE_NAME_INPUT_MAX)}).partial();

const HostOpSchema = z.discriminatedUnion('op', [
    z.strictObject({op: z.enum(['start', 'pause', 'resume', 'end'])}),
    z.strictObject({op: z.literal('config'), patch: ConfigPatchSchema}),
    z.strictObject({op: z.literal('settings'), patch: SettingsPatchSchema}),
    z.strictObject({op: z.enum(['approve', 'deny', 'kick']), pid}),
    // Sit a player out; nothing takes one back but the player's own sit-in.
    z.strictObject({op: z.literal('sit-out'), pid}),
]);

// POST action. The table's moves go to the engine; profile, unban, hand-over and claim-host are the
// room's own (lib/poker-night/room.actionStep). leave-after: leave once the hand in play completes
// (on), or stay (off). withdraw: take back one's own request for chips. ask: ask a player to see
// their cards of the hand just completed; reply: answer an ask from `to` — show them alone ('one'),
// everyone ('all') or no ('none'). allow-asks: "Let others ask to see my cards".
export const ActionSchema = z.discriminatedUnion('type', [
    z.strictObject({actionId, type: z.literal('act'), turn: count, move: MoveSchema}),
    z.strictObject({actionId, type: z.literal('pre'), pre: PreSchema.nullable()}),
    z.strictObject({actionId, type: z.literal('sit'), seat, buyIn}),
    z.strictObject({actionId, type: z.enum(['leave', 'sit-out', 'sit-in', 'show', 'withdraw'])}),
    z.strictObject({actionId, type: z.literal('leave-after'), on: z.boolean()}),
    z.strictObject({actionId, type: z.literal('ask'), to: pid}),
    z.strictObject({actionId, type: z.literal('reply'), to: pid, show: z.enum(['one', 'all', 'none'])}),
    z.strictObject({actionId, type: z.literal('allow-asks'), on: z.boolean()}),
    z.strictObject({actionId, type: z.literal('claim-host')}),
    z.strictObject({actionId, type: z.literal('buy'), amount: buyIn}),
    z.strictObject({actionId, type: z.literal('host'), op: HostOpSchema}),
    z.strictObject({actionId, type: z.literal('profile'), name: rawName.optional(), avatar: avatar.optional()}),
    z.strictObject({actionId, type: z.enum(['unban', 'hand-over']), pid}),
]);
export type ActionInput = z.infer<typeof ActionSchema>;

// The actions the room handles itself rather than the engine.
export type RoomActionInput = Extract<ActionInput, {type: 'profile' | 'unban' | 'hand-over' | 'claim-host'}>;
export type TableActionInput = Exclude<ActionInput, RoomActionInput>;

export const isRoomAction = (input: ActionInput): input is RoomActionInput =>
    input.type === 'profile' || input.type === 'unban' || input.type === 'hand-over' || input.type === 'claim-host';

// POST tick: the clock leader's nudge, with a presence beat while the page is visible.
export const TickSchema = z.strictObject({beat: z.strictObject({hidden: z.boolean()}).optional()});
export type TickInput = z.infer<typeof TickSchema>;

// POST emote: a reaction, a phrase or a throw at another player, each item an id from
// lib/poker-night/emotes' registries (never free text). emotes.parseEmote reads the same shape by
// hand for the browser; input.test holds the two to each other.
export const EmoteSchema = z.discriminatedUnion('kind', [
    z.strictObject({kind: z.literal('react'), item: z.enum(REACTION_IDS as [ReactionId, ...ReactionId[]])}),
    z.strictObject({kind: z.literal('say'), item: z.enum(PHRASE_IDS)}),
    z.strictObject({kind: z.literal('throw'), item: z.enum(THROW_IDS as [ThrowId, ...ThrowId[]]), to: pid}),
]);
export type {EmoteInput} from '@/lib/poker-night/emotes';

const moveOf = (m: z.infer<typeof MoveSchema>): Move => (m.kind === 'raise' ? {kind: 'raise', to: m.to} : {kind: m.kind});

const preOf = (p: z.infer<typeof PreSchema> | null): PreAction | null =>
    p === null ? null : p.kind === 'call' ? {kind: 'call', amount: p.amount} : {kind: p.kind};

const hostOpOf = (op: z.infer<typeof HostOpSchema>): HostOp => {
    switch (op.op) {
        case 'config':
            return {op: 'config', patch: {...op.patch}};
        case 'settings': {
            const {name, ...rest} = op.patch;
            return {op: 'settings', patch: name === undefined ? {...rest} : {...rest, name: cleanTableName(name) ?? ''}};
        }
        case 'approve': case 'deny': case 'kick':
            return {op: op.op, pid: op.pid};
        case 'sit-out':
            return {op: 'sit-out', pid: op.pid};
        default:
            return {op: op.op};
    }
};

// The engine's action for a parsed request by player `by`, stamped with the time it arrived.
export const toTableAction = (input: TableActionInput, by: string, at: number): TableAction => {
    switch (input.type) {
        case 'act':
            return {type: 'act', by, turn: input.turn, move: moveOf(input.move), at};
        case 'pre':
            return {type: 'pre', by, pre: preOf(input.pre), at};
        case 'sit':
            return {type: 'sit', by, seat: input.seat, buyIn: input.buyIn, at};
        case 'buy':
            return {type: 'buy', by, amount: input.amount, at};
        case 'host':
            return {type: 'host', by, op: hostOpOf(input.op), at};
        case 'leave-after':
            return {type: 'leave-after', by, on: input.on, at};
        case 'ask':
            return {type: 'ask', by, to: input.to, at};
        case 'reply':
            return {type: 'reply', by, to: input.to, show: input.show, at};
        case 'allow-asks':
            return {type: 'allow-asks', by, on: input.on, at};
        default:
            return {type: input.type, by, at};
    }
};

// ── query strings ──

const SEQ = /^(0|[1-9][0-9]{0,14})$/;

// A version number from a query string: a whole number, else null.
export const parseSeq = (raw: string | null): number | null => (raw !== null && SEQ.test(raw) ? Number(raw) : null);

type QueryReader = {get(name: string): string | null};

// GET state?since=<seq>&esince=<emoteSeq>&nsince=<nudge>: what the client already has.
export const parseStateQuery = (params: QueryReader): {since: number | null; esince: number | null; nsince: number | null} =>
    ({since: parseSeq(params.get('since')), esince: parseSeq(params.get('esince')), nsince: parseSeq(params.get('nsince'))});

export type DetailQuery = {part: 'log'; hand: number | null} | {part: 'history'; before: number | null} | {part: 'bank'};

// GET detail?part=log&hand=n | part=history&before=n | part=bank; null for anything else.
export const parseDetailQuery = (params: QueryReader): DetailQuery | null => {
    switch (params.get('part')) {
        case 'log':
            return {part: 'log', hand: parseSeq(params.get('hand'))};
        case 'history':
            return {part: 'history', before: parseSeq(params.get('before'))};
        case 'bank':
            return {part: 'bank'};
        default:
            return null;
    }
};
