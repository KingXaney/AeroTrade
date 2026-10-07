// Which deployment a poker night request runs in. A Vercel preview shares production's database
// (AGENTS, jobs), so every room query, index, Ably channel and rate-limit key carries this, and a
// preview build can never open, or write to, a production table. Also the feature's kill switch.
// Pure: it reads only the record it is handed, process.env by default.

export const ENVS = ['production', 'preview', 'development'] as const;
export type Env = (typeof ENVS)[number];

type EnvVars = Readonly<Record<string, string | undefined>>;

// VERCEL_ENV names production and previews; anything else — a local dev server, the QA harness, a
// local `next start`, `vercel dev` — is development.
export const envOf = (vars: EnvVars = process.env): Env => {
    const name = vars.VERCEL_ENV;
    return name === 'production' || name === 'preview' ? name : 'development';
};

export const isEnv = (value: unknown): value is Env => typeof value === 'string' && (ENVS as readonly string[]).includes(value);

// The feature's kill switch: POKER_NIGHT_ENABLED=false turns every table route into a 503
// 'unavailable' (and, from P3, shows the lobby's note). Anything else, unset included, is on.
export const pokerNightEnabled = (vars: EnvVars = process.env): boolean => vars.POKER_NIGHT_ENABLED?.trim().toLowerCase() !== 'false';
