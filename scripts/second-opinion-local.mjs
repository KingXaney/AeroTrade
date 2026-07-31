// Ask Claude for a second opinion using your Claude subscription (Pro/Max)
// instead of the paid API, then write it straight into the database so the
// deployed /brain page renders it.
//
// It shells out to the Claude Code CLI in headless mode, which is authenticated
// with your Claude account — so the usage comes out of your plan, and no
// ANTHROPIC_API_KEY is involved. Everything runs on your machine; nothing about
// your subscription is exposed to the website.
//
// Setup (once):
//   npm install -g @anthropic-ai/claude-code
//   claude            # log in with your Claude account, then /exit
// Sign in normally — `claude auth login --console` would bill the API instead.
// One thing this script cannot police: an `apiKeyHelper` in ~/.claude/settings.json
// outranks your subscription and no environment scrubbing disables it. If you
// have one, `claude auth status` will show which credential is really in use.
//
// Run:
//   npm run opinion:local                 # single-user database: picks that user
//   npm run opinion:local -- --user you@example.com
//   OPINION_MODEL=sonnet npm run opinion:local
//
// Unattended (cron/launchd), where no browser login is possible:
//   claude setup-token                    # one-year OAuth token tied to your plan
//   CLAUDE_CODE_OAUTH_TOKEN=... npm run opinion:local
// Re-mint the token before it expires or the job goes quiet.
//
// The prompt and the text rules are imported from the app itself, so this path
// asks exactly the same question as the API path.
import 'dotenv/config';
import mongoose from 'mongoose';
import {spawn} from 'node:child_process';
import {tmpdir} from 'node:os';
// This script imports the app's TypeScript directly so the prompt and the text
// rules cannot drift from the server paths. Node strips types natively from
// 22.18; older versions die at import with an opaque syntax error, so the check
// runs first and the imports are deferred behind it.
const MIN_NODE_MAJOR = 22;
const MIN_NODE_MINOR = 18;
const [nodeMajor, nodeMinor] = process.versions.node.split('.').map(Number);
if (nodeMajor < MIN_NODE_MAJOR || (nodeMajor === MIN_NODE_MAJOR && nodeMinor < MIN_NODE_MINOR)) {
    console.error(`ERROR: Node ${MIN_NODE_MAJOR}.${MIN_NODE_MINOR}+ required (you have ${process.versions.node}) — this script loads the app's TypeScript directly.`);
    process.exit(1);
}

const {buildStandaloneSecondOpinionPrompt} = await import('../lib/brain/prompts.ts');
const {
    CLI_MODEL_LABEL,
    SECOND_OPINION_HEADLINE_COUNT,
    SECOND_OPINION_MAX_CHARS,
    SECOND_OPINION_NARRATIVE_COUNT,
    SECOND_OPINION_THESIS_COUNT,
    stripMarkdownLinks,
} = await import('../lib/brain/opinion-text.ts');

const JOB_ID = 'claude-second-opinion';
const CLI_TIMEOUT_MS = 10 * 60 * 1000;
// Claude Code picks a credential by precedence, and your subscription login is
// LAST. In -p mode an API key in the environment is used with no prompt at all —
// and dotenv has just loaded the app's .env into this process. So every variable
// that outranks the subscription is stripped from the child's environment.
// CLAUDE_CODE_OAUTH_TOKEN is deliberately kept: it *is* subscription auth.
// Set OPINION_ALLOW_API_KEY=1 to deliberately bill the API instead.
const SUBSCRIPTION_ONLY_ENV_BLOCKLIST = [
    'ANTHROPIC_API_KEY',
    'ANTHROPIC_AUTH_TOKEN',
    'CLAUDE_CODE_USE_BEDROCK',
    'CLAUDE_CODE_USE_VERTEX',
    'CLAUDE_CODE_USE_FOUNDRY',
];

const argFor = (name) => {
    const prefix = `--${name}=`;
    const inline = process.argv.find((a) => a.startsWith(prefix));
    if (inline) return inline.slice(prefix.length);
    const idx = process.argv.indexOf(`--${name}`);
    return idx !== -1 ? process.argv[idx + 1] : undefined;
};

const safeAvg = (sum, weight) => (Math.abs(weight) < 1e-9 ? 0 : sum / weight);
const round2 = (n) => Number((n ?? 0).toFixed(2));

// Mirrors lib/brain/opinion.ts gatherOpinionContext, using the raw driver
// because this script cannot resolve the app's "@/" path aliases.
async function gatherContext(db) {
    const [thesisDocs, narrativeDocs, latestSet, headlines] = await Promise.all([
        db.collection('brainentities').find({thesisSince: {$ne: null}}).sort({weightSlow: -1})
            .limit(SECOND_OPINION_THESIS_COUNT).toArray(),
        db.collection('brainentities').find({}).sort({weightSlow: -1}).limit(SECOND_OPINION_NARRATIVE_COUNT).toArray(),
        db.collection('suggestionsets').findOne({userId: 'global'}, {sort: {date: -1}}),
        // datetime is unix SECONDS and is not indexed — project narrowly so the
        // top-K sort stays cheap.
        db.collection('newsitems')
            .find({}, {projection: {headline: 1, source: 1, sourceType: 1, publishedDate: 1, _id: 0}})
            .sort({datetime: -1}).limit(SECOND_OPINION_HEADLINE_COUNT).toArray(),
    ]);

    return {
        theses: thesisDocs.map((e) => ({
            name: e.displayName,
            type: e.type,
            weightSlow: round2(e.weightSlow),
            sentimentSlow: round2(safeAvg(e.sentimentSumSlow ?? 0, e.weightSlow ?? 0)),
            activeSinceMs: e.thesisSince ? new Date(e.thesisSince).getTime() : null,
        })),
        narratives: narrativeDocs.map((e) => ({
            key: e.key,
            type: e.type,
            displayName: e.displayName,
            weightSlow: round2(e.weightSlow),
            sentimentSlow: round2(safeAvg(e.sentimentSumSlow ?? 0, e.weightSlow ?? 0)),
            thesisActive: Boolean(e.thesisSince),
        })),
        decisions: latestSet
            ? {
                date: latestSet.date,
                kind: latestSet.kind ?? 'executed',
                items: (latestSet.items ?? []).map((i) => ({
                    symbol: i.symbol,
                    action: i.action,
                    targetWeightPct: Math.round((i.targetWeight ?? 0) * 100),
                    reasons: i.reasons ?? [],
                })),
            }
            : null,
        headlines: headlines.map((h) => ({
            headline: h.headline,
            source: h.source,
            kind: h.sourceType,
            date: h.publishedDate,
        })),
    };
}

// Whose /brain page should show this? Opinions are stored per user.
async function resolveUserId(db) {
    const wanted = argFor('user') || process.env.OPINION_USER;
    const users = await db.collection('user').find({}, {projection: {_id: 1, id: 1, email: 1, name: 1}}).toArray();
    const idOf = (u) => u.id || u._id?.toString() || '';

    if (wanted) {
        const match = users.find((u) => idOf(u) === wanted || (u.email || '').toLowerCase() === wanted.toLowerCase());
        if (!match) throw new Error(`No user matches "${wanted}". Known: ${users.map((u) => u.email).join(', ') || '(none)'}`);
        return idOf(match);
    }
    if (users.length === 0) throw new Error('No users in the database — sign up in the app first.');
    if (users.length > 1) {
        throw new Error(`Several users exist — pick one with --user <email>: ${users.map((u) => u.email).join(', ')}`);
    }
    return idOf(users[0]);
}

const childEnv = () => {
    const env = {...process.env};
    if (process.env.OPINION_ALLOW_API_KEY !== '1') {
        for (const key of SUBSCRIPTION_ONLY_ENV_BLOCKLIST) delete env[key];
    }
    return env;
};

// Run outside the repo so a stray tool call cannot reach project files.
const runClaude = (args, timeoutMs) => new Promise((resolve, reject) => {
    const child = spawn(process.env.CLAUDE_BIN || 'claude', args, {cwd: tmpdir(), env: childEnv(), stdio: ['ignore', 'pipe', 'pipe']});
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
        child.kill('SIGTERM');
        reject(new Error(`Claude Code did not answer within ${Math.round(timeoutMs / 60000)} minutes`));
    }, timeoutMs);

    child.stdout.on('data', (chunk) => {stdout += chunk;});
    child.stderr.on('data', (chunk) => {stderr += chunk;});
    child.on('error', (err) => {
        clearTimeout(timer);
        reject(err.code === 'ENOENT'
            ? new Error('Claude Code CLI not found. Install it with:\n  npm install -g @anthropic-ai/claude-code\nthen run `claude` once to log in with your Claude account.')
            : err);
    });
    child.on('close', (code) => {
        clearTimeout(timer);
        resolve({code, stdout: stdout.trim(), stderr: stderr.trim()});
    });
});

// An unrecognised flag makes the CLI exit before doing any work — so a version
// older than one of these options must not silently look like a Claude failure.
const looksLikeUnknownFlag = (stderr) => /unknown (option|argument|flag)|unrecognized|did you mean/i.test(stderr);

// Flag sets from most to least protective. --safe-mode matters more than it
// looks: without it the CLI loads ~/.claude/CLAUDE.md, and a market critique
// written under a global coding-standards prompt is a worse critique.
const flagPlans = (model) => {
    const base = ['-p'];
    const modelFlags = model ? ['--model', model] : [];
    const effort = process.env.OPINION_EFFORT ? ['--effort', process.env.OPINION_EFFORT] : [];
    return [
        [...base, '--safe-mode', '--disallowedTools', '*', '--disable-slash-commands',
            '--max-turns', '1', '--output-format', 'json', ...modelFlags, ...effort],
        [...base, '--safe-mode', '--output-format', 'json', ...modelFlags],
        [...base, '--output-format', 'json', ...modelFlags],
        [...base, ...modelFlags],
    ];
};

// The JSON envelope is the only reliable success signal: in text mode a run that
// fails mid-answer prints the partial text followed by an error, which reads as
// a perfectly plausible opinion.
const readAnswer = (stdout, expectJson) => {
    if (!expectJson) return stdout; // last-resort plan; no envelope was requested

    let parsed;
    try {
        parsed = JSON.parse(stdout);
    } catch {
        // JSON was requested and something else arrived — that is a failed run,
        // not an opinion. Storing stdout here is how a stack trace ends up on
        // the Brain page over Claude's name.
        throw new Error(`Claude Code returned unparseable output: ${stdout.slice(0, 300)}`);
    }
    if (!parsed || typeof parsed !== 'object' || !('result' in parsed)) {
        throw new Error('Claude Code returned JSON without a result field — treating the run as failed.');
    }
    if (parsed.is_error || (parsed.subtype && parsed.subtype !== 'success')) {
        throw new Error(`Claude Code reported ${parsed.subtype || 'an error'}: ${String(parsed.result).slice(0, 300)}`);
    }
    return String(parsed.result ?? '').trim();
};

async function askClaude(prompt) {
    const plans = flagPlans(process.env.OPINION_MODEL ?? 'opus');
    let lastFailure = '';

    for (const [index, flags] of plans.entries()) {
        const {code, stdout, stderr} = await runClaude([...flags, prompt], CLI_TIMEOUT_MS);
        if (code === 0) return readAnswer(stdout, flags.includes('--output-format'));

        lastFailure = `exit ${code}${stderr ? `: ${stderr.slice(0, 400)}` : ''}`;
        // Only a flag-compatibility failure is worth retrying — an auth or model
        // error would fail identically every time.
        if (!looksLikeUnknownFlag(stderr) || index === plans.length - 1) break;
        console.warn('WARN: your Claude Code version rejected an option; retrying with fewer flags.');
        if (!plans[index + 1].includes('--safe-mode')) {
            console.warn('WARN: falling back to a run without --safe-mode — your ~/.claude/CLAUDE.md will be loaded into the analysis. Upgrade Claude Code for a cleaner (and cheaper) result.');
        }
    }
    throw new Error(`Claude Code failed (${lastFailure}). If it mentions login, run \`claude\` once and sign in with your Claude account.`);
}

async function main() {
    const uri = process.env.MONGODB_URI;
    if (!uri) {
        console.error('ERROR: MONGODB_URI must be set in .env');
        process.exit(1);
    }

    await mongoose.connect(uri, {bufferCommands: false});
    const db = mongoose.connection.db;

    try {
        const userId = await resolveUserId(db);
        const context = await gatherContext(db);
        if (context.narratives.length === 0) {
            throw new Error('The brain is empty — run the brain update job before asking for an opinion.');
        }

        const prompt = buildStandaloneSecondOpinionPrompt(context);
        console.log(`Asking Claude Code (${context.theses.length} active thesis/theses, ${context.headlines.length} headlines, ${prompt.length} chars)…`);

        const answer = await askClaude(prompt);
        if (!answer) throw new Error('Claude Code returned no text — run `claude` once to check you are logged in.');

        const opinionMd = stripMarkdownLinks(answer).slice(0, SECOND_OPINION_MAX_CHARS);
        const now = new Date();

        // On a database where the app has never written an opinion, these
        // collections have no indexes yet — without them a racing upsert can
        // leave two rows and the page would read an arbitrary one. Default index
        // names only, so this is a no-op once Mongoose has created them.
        for (const [collection, key] of [['secondopinions', 'scope'], ['jobruns', 'jobId']]) {
            try {
                await db.collection(collection).createIndex({[key]: 1}, {unique: true});
            } catch (error) {
                console.warn(`WARN: could not ensure the ${collection}.${key} index: ${error.message}`);
            }
        }

        await db.collection('secondopinions').updateOne(
            {scope: userId},
            {$set: {opinionMd, modelUsed: CLI_MODEL_LABEL, source: 'cli', generatedAt: now, requestedBy: userId}},
            {upsert: true},
        );
        await db.collection('jobruns').updateOne(
            {jobId: JOB_ID},
            {$set: {lastRunAt: now, lastMessage: `Second opinion via Claude Code (${opinionMd.length} chars)`}},
            {upsert: true},
        );

        console.log(`OK: opinion saved for user ${userId} (${opinionMd.length} chars). Open /brain to read it.`);
    } finally {
        await mongoose.disconnect();
    }
}

main().catch((error) => {
    console.error(`ERROR: ${error.message}`);
    process.exit(1);
});
