// How the trading agent world reads its environment. Pure: every reader takes the record it is
// handed, process.env by default, so the page, the routes, the actions, the job and the tests read
// one rule. The only module that names the feature's secrets; nothing here is ever NEXT_PUBLIC.

import {
    AGENT_WORLD_ENABLED_ENV,
    AGENT_WORLD_UNIVERSE,
    MAX_UNIVERSE,
    PAPERCLIP_DESKS,
    ROLE_IDS,
    SYMBOL_PATTERN,
    type ApprovalMode,
    type PaperclipAgentKey,
} from "@/lib/agent-world/config";
import {siteUrl} from "@/lib/site";

type Env = Readonly<Record<string, string | undefined>>;

const text = (value: string | undefined): string => (value ?? '').trim();
const filled = (value: string | undefined): boolean => text(value).length > 0;
const stripSlash = (url: string): string => url.replace(/\/+$/, '');

// Which deployment this is. A Vercel preview shares production's database, so every session row,
// index and account name carries it (the rule of lib/poker-night/env.ts, kept apart so this
// feature imports nothing of poker night).
export const AGENT_WORLD_ENVS = ['production', 'preview', 'development'] as const;
export type AgentWorldEnv = (typeof AGENT_WORLD_ENVS)[number];
export const agentWorldEnv = (env: Env = process.env): AgentWorldEnv =>
    env.VERCEL_ENV === 'production' || env.VERCEL_ENV === 'preview' ? env.VERCEL_ENV : 'development';

// The service that runs the desk (services/agent-world) and the secret both sides sign with.
export const agentWorldService = (env: Env = process.env): {url: string; secret: string} | null =>
    filled(env.AGENT_WORLD_SERVICE_URL) && filled(env.AGENT_WORLD_SERVICE_SECRET)
        ? {url: stripSlash(text(env.AGENT_WORLD_SERVICE_URL)), secret: text(env.AGENT_WORLD_SERVICE_SECRET)}
        : null;

// What Paperclip's Execution desk sends in X-Agent-World-Heartbeat when it wakes this app.
export const agentWorldHeartbeatSecret = (env: Env = process.env): string | null =>
    filled(env.AGENT_WORLD_HEARTBEAT_SECRET) ? text(env.AGENT_WORLD_HEARTBEAT_SECRET) : null;

// owner (the default): a decided session waits for an owner's Approve or Decline on the page;
// auto: its orders go without a pause.
export const approvalMode = (env: Env = process.env): ApprovalMode =>
    text(env.AGENT_WORLD_APPROVAL).toLowerCase() === 'auto' ? 'auto' : 'owner';

const emailsOf = (value: string | undefined): string[] =>
    (value ?? '').split(',').map((email) => email.trim().toLowerCase()).filter((email) => email.length > 0);

// Who may start a session by hand and decide one: AGENT_WORLD_OWNER_EMAILS, else the lab's owners
// (the app's one owner). Only the owner sees the trading agent world at all (lib/lab/owner.ts).
export const agentWorldOwnerEmails = (env: Env = process.env): string[] => {
    const own = emailsOf(env.AGENT_WORLD_OWNER_EMAILS);
    return own.length > 0 ? own : emailsOf(env.LAB_OWNER_EMAILS);
};

export const isAgentWorldOwner = (email: string | null | undefined, env: Env = process.env): boolean =>
    typeof email === 'string' && email.trim().length > 0 && agentWorldOwnerEmails(env).includes(email.trim().toLowerCase());

// Why nothing runs, or null when the desk may run: switched off, no service to run it, or owner
// approval with nobody to approve (every session would lapse).
export type AgentWorldOff = 'disabled' | 'unconfigured' | 'no-approver';
export const agentWorldOff = (env: Env = process.env): AgentWorldOff | null => {
    if (text(env[AGENT_WORLD_ENABLED_ENV]).toLowerCase() === 'false') return 'disabled';
    if (agentWorldService(env) === null) return 'unconfigured';
    if (approvalMode(env) === 'owner' && agentWorldOwnerEmails(env).length === 0) return 'no-approver';
    return null;
};

// The symbols a session rates: AGENT_WORLD_UNIVERSE (comma-separated tickers), else the default.
// Anything that is not a ticker is dropped, duplicates once, at most MAX_UNIVERSE kept.
export const agentWorldUniverse = (env: Env = process.env): string[] => {
    const listed = [...new Set(text(env.AGENT_WORLD_UNIVERSE).split(',').map((s) => s.trim().toUpperCase()).filter((s) => SYMBOL_PATTERN.test(s)))];
    return (listed.length > 0 ? listed : [...AGENT_WORLD_UNIVERSE]).slice(0, MAX_UNIVERSE);
};

// Where the service sends a session's events: this deployment's own address.
export const agentWorldCallbackUrl = (env: Env = process.env): string =>
    `${filled(env.AGENT_WORLD_CALLBACK_ORIGIN) ? stripSlash(text(env.AGENT_WORLD_CALLBACK_ORIGIN)) : siteUrl(env)}/api/agent-world/events`;

// The Paperclip company: its API (with the Execution desk agent's key), the company, and the board
// a person opens. Null when any of the three is missing: the company layer is then left out.
export type PaperclipSettings = {url: string; apiKey: string; companyId: string; boardUrl: string};
export const paperclipSettings = (env: Env = process.env): PaperclipSettings | null => {
    if (!filled(env.PAPERCLIP_URL) || !filled(env.PAPERCLIP_API_KEY) || !filled(env.PAPERCLIP_COMPANY_ID)) return null;
    const url = stripSlash(text(env.PAPERCLIP_URL));
    return {url, apiKey: text(env.PAPERCLIP_API_KEY), companyId: text(env.PAPERCLIP_COMPANY_ID), boardUrl: filled(env.PAPERCLIP_BOARD_URL) ? stripSlash(text(env.PAPERCLIP_BOARD_URL)) : url};
};

const PAPERCLIP_KEYS: readonly string[] = [...ROLE_IDS, ...Object.keys(PAPERCLIP_DESKS)];
const UUIDISH = /^[0-9a-fA-F-]{8,64}$/;

// An optional pin of the company's agent ids, "market=<id>,head-trader=<id>,…"; anything not
// pinned is found by name (config's ROLES[].paperclip, PAPERCLIP_DESKS) each session.
export const paperclipAgentIdsFromEnv = (env: Env = process.env): Partial<Record<PaperclipAgentKey, string>> => {
    const out: Partial<Record<PaperclipAgentKey, string>> = {};
    for (const pair of text(env.AGENT_WORLD_PAPERCLIP_AGENT_IDS).split(',')) {
        const [key, id] = pair.split('=').map((part) => part?.trim() ?? '');
        if (key && id && PAPERCLIP_KEYS.includes(key) && UUIDISH.test(id)) out[key as PaperclipAgentKey] = id;
    }
    return out;
};
