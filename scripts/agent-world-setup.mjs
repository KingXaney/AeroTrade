// Sets up the trading agent world's Paperclip company, idempotently: run it once against a fresh
// Paperclip and again whenever an address, the heartbeat secret or a budget changes; each run makes
// what is missing and brings the rest to what is written here (a budget changed in Paperclip's UI is
// set back, so change it in AGENT_WORLD_ROLE_BUDGET_CENTS instead).
//
//   node scripts/agent-world-setup.mjs --base http://localhost:3100 --local-trusted \
//       --service-url http://localhost:8789 --app-url http://localhost:3000 --heartbeat-secret <secret>
//   node scripts/agent-world-setup.mjs --base https://paperclip.example.com --email you@example.com \
//       --password … --service-url … --app-url … --heartbeat-secret …   [--rotate-keys] [--print-json]
//
// What it makes, with what a real Paperclip v2026.1023.0 needs:
// - The company "Trading agent world" (3,000¢ a month) and its 14 http agents: the Head trader (the
//   root, its address the service's /paperclip/heartbeat), the Execution desk (AeroTrade's
//   /api/agent-world/paperclip/heartbeat) and the twelve desk roles, in a reporting tree. Paperclip
//   accepts only its own roles (no "manager"; no CEO is needed, and a CEO's first strategy would
//   wait for the board), so the desk uses general, researcher, qa and pm.
// - Every budget policy set to allow unpriced usage: each http wake records a zero-cost event
//   Paperclip cannot price, and the default policy stops the agent and the whole company on the first.
// - One API key per agent named agent-world, kept when one exists (Paperclip shows a key only when
//   it makes it); --rotate-keys makes new ones and revokes the old.
// - The routine "Weekly session", assigned to the Head trader, with an api trigger.
//
// It prints, once, the environment for AeroTrade (Vercel) and for the service. Keys go to stdout
// only, never to a file. In authenticated mode it signs in as the board user (Better Auth's
// /api/auth/sign-in/email) and sends the board's Origin with every write, as Paperclip's CSRF
// guard requires of a session.

const COMPANY_NAME = 'Trading agent world';
const COMPANY_DESCRIPTION = 'The trading agent world: a desk of twelve model roles that rates a few symbols each week, its Head trader and the Execution desk that records the owner\'s decision.';
const COMPANY_BUDGET_CENTS = 3000;
const KEY_NAME = 'agent-world';
const ROUTINE_TITLE = 'Weekly session';
const HEARTBEAT_HEADER = 'X-Agent-World-Heartbeat';
// How long Paperclip holds a wake open: the service's relay forwards to AeroTrade (5 s at most) and
// then closes the routine's issue under that same wake (5 s at most), so 20 s leaves room for both.
const TIMEOUT_MS = 20_000;
const REQUEST_TIMEOUT_MS = 15_000;

// The company's agents: [key, name (lib/agent-world/config.ts ROLES[].paperclip / PAPERCLIP_DESKS —
// copied, a script cannot import TypeScript), Paperclip role, title, reports to, budget ¢, address].
const AGENTS = [
    ['head-trader', 'Head trader', 'general', 'Runs each weekly session of the desk', null, 500, 'service'],
    ['execution-desk', 'Execution desk', 'general', "Records the owner's decision and the fills", 'head-trader', 100, 'app'],
    ['research-manager', 'Research manager', 'researcher', 'Weighs the debate and writes the plan', 'head-trader', 300, 'service'],
    ['trader', 'Trader', 'general', 'Turns the plan into a proposal', 'head-trader', 200, 'service'],
    ['portfolio-manager', 'Portfolio manager', 'pm', 'Names the rating the orders are built from', 'head-trader', 300, 'service'],
    ['market', 'Market analyst', 'researcher', 'Files the market report', 'research-manager', 200, 'service'],
    ['sentiment', 'Sentiment analyst', 'researcher', 'Files the sentiment report', 'research-manager', 200, 'service'],
    ['news', 'News analyst', 'researcher', 'Files the news report', 'research-manager', 200, 'service'],
    ['fundamentals', 'Fundamentals analyst', 'researcher', 'Files the fundamentals report', 'research-manager', 200, 'service'],
    ['bull', 'Bull researcher', 'researcher', 'Argues the case for the symbol', 'research-manager', 200, 'service'],
    ['bear', 'Bear researcher', 'researcher', 'Argues the case against it', 'research-manager', 200, 'service'],
    ['risk-aggressive', 'Aggressive risk analyst', 'qa', 'Weighs the proposal for taking the risk', 'portfolio-manager', 150, 'service'],
    ['risk-conservative', 'Conservative risk analyst', 'qa', 'Weighs the proposal for keeping risk down', 'portfolio-manager', 150, 'service'],
    ['risk-neutral', 'Neutral risk analyst', 'qa', 'Weighs the proposal between the two', 'portfolio-manager', 150, 'service'],
];
const DESKS = new Set(['head-trader', 'execution-desk']);
const ROLE_KEYS = AGENTS.map(([key]) => key).filter((key) => !DESKS.has(key));

const USAGE = `usage: node scripts/agent-world-setup.mjs --base <paperclip url> (--local-trusted | --email <e> --password <p>)
       --service-url <agent-world service> --app-url <AeroTrade> --heartbeat-secret <secret> [--rotate-keys] [--print-json]
Falls back to PAPERCLIP_URL, PAPERCLIP_BOARD_EMAIL, PAPERCLIP_BOARD_PASSWORD, AGENT_WORLD_SERVICE_URL, AEROTRADE_URL,
AGENT_WORLD_HEARTBEAT_SECRET; AGENT_WORLD_ROLE_BUDGET_CENTS ('{"market":250}') overrides budgets in cents.`;

const parseArgs = (argv) => {
    const flags = {};
    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        if (!arg.startsWith('--')) throw new Error(`unexpected argument ${arg}\n${USAGE}`);
        const [name, inline] = arg.slice(2).split(/=(.*)/s, 2);
        if (['local-trusted', 'rotate-keys', 'print-json', 'help'].includes(name)) {
            flags[name] = true;
        } else if (['base', 'email', 'password', 'service-url', 'app-url', 'heartbeat-secret'].includes(name)) {
            const value = inline ?? argv[++i];
            if (value === undefined || value.startsWith('--')) throw new Error(`--${name} needs a value\n${USAGE}`);
            flags[name] = value;
        } else {
            throw new Error(`unknown flag --${name}\n${USAGE}`);
        }
    }
    return flags;
};

const stripSlash = (url) => url.replace(/\/+$/, '');

const budgetsFrom = (raw) => {
    const budgets = Object.fromEntries(AGENTS.map(([key, , , , , cents]) => [key, cents]));
    if (!raw || raw.trim() === '') return budgets;
    let parsed;
    try { parsed = JSON.parse(raw); } catch { throw new Error('AGENT_WORLD_ROLE_BUDGET_CENTS is not JSON'); }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('AGENT_WORLD_ROLE_BUDGET_CENTS must be an object of key to cents');
    for (const [key, cents] of Object.entries(parsed)) {
        if (!(key in budgets)) throw new Error(`AGENT_WORLD_ROLE_BUDGET_CENTS: unknown key ${key} (one of ${Object.keys(budgets).join(', ')})`);
        if (!Number.isInteger(cents) || cents < 0) throw new Error(`AGENT_WORLD_ROLE_BUDGET_CENTS: ${key} must be a whole number of cents`);
        budgets[key] = cents;
    }
    return budgets;
};

// One Paperclip session: the board as local_trusted (no credentials) or a signed-in board user.
const connect = async ({base, email, password, localTrusted}) => {
    const origin = new URL(base).origin;
    let cookie = null;
    const request = async (method, path, body) => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
        try {
            const response = await fetch(`${base}${path}`, {
                method,
                headers: {
                    Accept: 'application/json',
                    ...(body !== undefined ? {'Content-Type': 'application/json'} : {}),
                    ...(cookie ? {Cookie: cookie, Origin: origin} : {}),
                },
                ...(body !== undefined ? {body: JSON.stringify(body)} : {}),
                signal: controller.signal,
            });
            const text = await response.text();
            let json = null;
            try { json = text ? JSON.parse(text) : null; } catch { /* not JSON */ }
            if (!response.ok) {
                const detail = typeof json?.error === 'string' ? json.error : typeof json?.message === 'string' ? json.message : text.slice(0, 200);
                const error = new Error(`${method} ${path}: HTTP ${response.status} ${detail}`);
                error.status = response.status;
                throw error;
            }
            return {status: response.status, json, headers: response.headers};
        } catch (error) {
            if (controller.signal.aborted) throw new Error(`${method} ${path}: no answer in ${REQUEST_TIMEOUT_MS / 1000} s`);
            throw error;
        } finally {
            clearTimeout(timer);
        }
    };
    const health = (await request('GET', '/api/health')).json ?? {};
    if (!localTrusted) {
        const signedIn = await request('POST', '/api/auth/sign-in/email', {email, password}).catch((error) => {
            throw new Error(`could not sign in as ${email}: ${error.message}`);
        });
        const cookies = signedIn.headers.getSetCookie?.() ?? [];
        cookie = cookies.map((line) => line.split(';')[0]).filter(Boolean).join('; ');
        if (!cookie) throw new Error('signed in, but Paperclip set no session cookie');
    } else if (health.deploymentMode && health.deploymentMode !== 'local_trusted') {
        throw new Error(`Paperclip at ${base} runs in ${health.deploymentMode} mode: pass --email and --password instead of --local-trusted`);
    }
    return {request, health};
};

const main = async () => {
    const flags = parseArgs(process.argv.slice(2));
    if (flags.help) {
        console.log(USAGE);
        return;
    }
    const base = stripSlash(flags.base ?? process.env.PAPERCLIP_URL ?? '');
    const email = flags.email ?? process.env.PAPERCLIP_BOARD_EMAIL ?? '';
    const password = flags.password ?? process.env.PAPERCLIP_BOARD_PASSWORD ?? '';
    const serviceUrl = stripSlash(flags['service-url'] ?? process.env.AGENT_WORLD_SERVICE_URL ?? '');
    const appUrl = stripSlash(flags['app-url'] ?? process.env.AEROTRADE_URL ?? '');
    const secret = flags['heartbeat-secret'] ?? process.env.AGENT_WORLD_HEARTBEAT_SECRET ?? '';
    const localTrusted = flags['local-trusted'] === true;
    const missing = [
        !base && '--base (or PAPERCLIP_URL)',
        !serviceUrl && '--service-url (or AGENT_WORLD_SERVICE_URL)',
        !appUrl && '--app-url (or AEROTRADE_URL)',
        !secret && '--heartbeat-secret (or AGENT_WORLD_HEARTBEAT_SECRET)',
        !localTrusted && (!email || !password) && '--local-trusted, or --email and --password (or PAPERCLIP_BOARD_EMAIL and PAPERCLIP_BOARD_PASSWORD)',
    ].filter(Boolean);
    if (missing.length > 0) throw new Error(`missing ${missing.join(', ')}\n${USAGE}`);
    const budgets = budgetsFrom(process.env.AGENT_WORLD_ROLE_BUDGET_CENTS);
    const {request} = await connect({base, email, password, localTrusted});

    const created = [];
    const updated = [];
    const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    const nameKey = (name) => String(name ?? '').trim().toLowerCase();

    // The company, found by its name.
    const companies = (await request('GET', '/api/companies')).json ?? [];
    let company = companies.find((row) => nameKey(row.name) === nameKey(COMPANY_NAME) && row.status !== 'archived');
    if (!company) {
        company = (await request('POST', '/api/companies', {name: COMPANY_NAME, description: COMPANY_DESCRIPTION, budgetMonthlyCents: COMPANY_BUDGET_CENTS})).json;
        created.push(`company ${COMPANY_NAME}`);
    }
    const cid = encodeURIComponent(company.id);

    // The agents, the Head trader first so every manager exists before its reports.
    const adapterConfigOf = (address) => ({
        url: address === 'app' ? `${appUrl}/api/agent-world/paperclip/heartbeat` : `${serviceUrl}/paperclip/heartbeat`,
        headers: {[HEARTBEAT_HEADER]: secret},
        timeoutMs: TIMEOUT_MS,
    });
    const existing = ((await request('GET', `/api/companies/${cid}/agents`)).json ?? []).filter((agent) => agent.status !== 'terminated');
    const ids = {};
    for (const [key, name, role, title, boss, , address] of AGENTS) {
        const want = {role, title, reportsTo: boss ? ids[boss] : null, adapterType: 'http', adapterConfig: adapterConfigOf(address), budgetMonthlyCents: budgets[key]};
        const found = existing.find((agent) => nameKey(agent.name) === nameKey(name));
        if (!found) {
            const agent = (await request('POST', `/api/companies/${cid}/agents`, {name, ...want})).json;
            ids[key] = agent.id;
            created.push(`agent ${name}`);
            continue;
        }
        ids[key] = found.id;
        const have = {
            role: found.role, title: found.title ?? null, reportsTo: found.reportsTo ?? null, adapterType: found.adapterType,
            adapterConfig: {url: found.adapterConfig?.url, headers: found.adapterConfig?.headers ?? {}, timeoutMs: found.adapterConfig?.timeoutMs},
            budgetMonthlyCents: found.budgetMonthlyCents,
        };
        const patch = Object.fromEntries(Object.entries(want).filter(([field, value]) => !same(have[field], value)));
        if (Object.keys(patch).length > 0) {
            await request('PATCH', `/api/agents/${encodeURIComponent(found.id)}`, patch);
            updated.push(`agent ${name} (${Object.keys(patch).join(', ')})`);
        }
    }

    // Budget policies: the amounts above, and unpriced usage allowed everywhere.
    const overview = (await request('GET', `/api/companies/${cid}/budgets/overview`)).json ?? {};
    const policies = overview.policies ?? [];
    const policyFor = (scopeType, scopeId) => policies.find((policy) => policy.scopeType === scopeType && policy.scopeId === scopeId);
    const wantPolicies = [
        ['company', company.id, COMPANY_NAME, policyFor('company', company.id)?.amount ?? COMPANY_BUDGET_CENTS],
        ...AGENTS.map(([key, name]) => ['agent', ids[key], name, budgets[key]]),
    ];
    for (const [scopeType, scopeId, label, amount] of wantPolicies) {
        const policy = policyFor(scopeType, scopeId);
        if (policy && policy.unpricedUsagePolicy === 'allow' && policy.amount === amount && policy.isActive === amount > 0) continue;
        await request('POST', `/api/companies/${cid}/budgets/policies`, {scopeType, scopeId, amount, isActive: amount > 0, hardStopEnabled: true, unpricedUsagePolicy: 'allow'});
        const why = [policy && policy.amount !== amount && `${amount}¢`, (!policy || policy.unpricedUsagePolicy !== 'allow') && 'unpriced usage allowed'].filter(Boolean).join(', ');
        (policy ? updated : created).push(`budget policy ${label}${why ? ` (${why})` : ''}`);
    }

    // One key per agent.
    const keys = {};
    for (const [key, name] of AGENTS) {
        const agentId = encodeURIComponent(ids[key]);
        const held = ((await request('GET', `/api/agents/${agentId}/keys`)).json ?? []).filter((row) => row.name === KEY_NAME && !row.revokedAt);
        if (held.length > 0 && !flags['rotate-keys']) {
            keys[key] = null;
            continue;
        }
        keys[key] = (await request('POST', `/api/agents/${agentId}/keys`, {name: KEY_NAME})).json.token;
        for (const old of held) await request('DELETE', `/api/agents/${agentId}/keys/${encodeURIComponent(old.id)}`);
        (held.length > 0 ? updated : created).push(`key for ${name}${held.length > 0 ? ' (rotated)' : ''}`);
    }

    // The routine, with an api trigger.
    const routines = (await request('GET', `/api/companies/${cid}/routines`)).json ?? [];
    let routine = routines.find((row) => nameKey(row.title) === nameKey(ROUTINE_TITLE) && row.status !== 'archived');
    if (!routine) {
        routine = (await request('POST', `/api/companies/${cid}/routines`, {
            title: ROUTINE_TITLE, description: 'The desk rates its universe once a week; AeroTrade runs the session and the owner decides.',
            assigneeAgentId: ids['head-trader'], concurrencyPolicy: 'skip_if_active', catchUpPolicy: 'skip_missed',
        })).json;
        created.push(`routine ${ROUTINE_TITLE}`);
    } else if (routine.assigneeAgentId !== ids['head-trader']) {
        await request('PATCH', `/api/routines/${encodeURIComponent(routine.id)}`, {assigneeAgentId: ids['head-trader']});
        updated.push(`routine ${ROUTINE_TITLE} (assignee)`);
    }
    const detail = (await request('GET', `/api/routines/${encodeURIComponent(routine.id)}`)).json ?? routine;
    let trigger = (detail.triggers ?? []).find((row) => row.kind === 'api' && !row.archived);
    if (!trigger) {
        const answer = (await request('POST', `/api/routines/${encodeURIComponent(routine.id)}/triggers`, {kind: 'api'})).json;
        trigger = answer?.trigger ?? answer;
        created.push(`api trigger on ${ROUTINE_TITLE}`);
    }

    const agentIds = AGENTS.map(([key]) => `${key}=${ids[key]}`).join(',');
    const roleKeys = Object.fromEntries(ROLE_KEYS.filter((key) => keys[key]).map((key) => [key, keys[key]]));
    const keptRoles = ROLE_KEYS.filter((key) => !keys[key]);
    if (flags['print-json']) {
        console.log(JSON.stringify({
            companyId: company.id, agentIds: ids, routineId: routine.id, triggerId: trigger?.id ?? null, created, updated,
            keys, vercel: {PAPERCLIP_URL: base, PAPERCLIP_API_KEY: keys['execution-desk'], PAPERCLIP_COMPANY_ID: company.id, AGENT_WORLD_PAPERCLIP_AGENT_IDS: agentIds},
            service: {PAPERCLIP_URL: base, PAPERCLIP_API_KEY: keys['head-trader'], PAPERCLIP_COMPANY_ID: company.id, PAPERCLIP_ROLE_KEYS: roleKeys},
        }, null, 2));
        return;
    }
    const kept = '# unchanged: an agent-world key exists (Paperclip shows a key only once); --rotate-keys makes a new one';
    const lines = [
        `Paperclip ${base}, company ${company.id}`,
        created.length > 0 ? `created: ${created.join('; ')}` : 'nothing to create',
        ...(updated.length > 0 ? [`updated: ${updated.join('; ')}`] : []),
        '',
        '# AeroTrade (Vercel, production)',
        `PAPERCLIP_URL=${base}`,
        keys['execution-desk'] ? `PAPERCLIP_API_KEY=${keys['execution-desk']}` : kept,
        `PAPERCLIP_COMPANY_ID=${company.id}`,
        `AGENT_WORLD_PAPERCLIP_AGENT_IDS=${agentIds}`,
        '',
        '# services/agent-world',
        `PAPERCLIP_URL=${base}`,
        keys['head-trader'] ? `PAPERCLIP_API_KEY=${keys['head-trader']}` : kept,
        `PAPERCLIP_COMPANY_ID=${company.id}`,
        keptRoles.length === ROLE_KEYS.length ? kept.replace('an agent-world key exists', 'every role keeps its agent-world key') : `PAPERCLIP_ROLE_KEYS=${JSON.stringify(roleKeys)}`,
        ...(keptRoles.length > 0 && keptRoles.length < ROLE_KEYS.length ? [`# PAPERCLIP_ROLE_KEYS leaves out ${keptRoles.join(', ')}, whose keys are unchanged`] : []),
    ];
    console.log(lines.join('\n'));
};

main().catch((error) => {
    console.error(`agent-world-setup: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
});
