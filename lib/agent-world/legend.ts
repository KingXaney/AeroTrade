// The /agent-world legend: how a session runs, the desk, the ratings and the rails, the decision,
// the company, the data and the schedule — every figure read from lib/agent-world/config.ts, every
// sentence from lib/learn/copy/agent-world.ts, so a moved constant moves the legend
// (lib/agent-world/__tests__/legend.test.ts swaps them for sentinels). Mechanism only. Pure.

import {
    AGENT_WORLD_ENABLED_ENV,
    AGENT_WORLD_MODELS,
    AGENT_WORLD_RAILS,
    AGENT_WORLD_STARTING_BALANCE,
    BUDGET_HARD_PCT,
    BUDGET_SOFT_PCT,
    DATA_CATEGORIES,
    DATA_TOOLS,
    DEBATE_ROUNDS,
    LAPSE_HOURS,
    LAPSE_WEEKDAY,
    POLL_IDLE_MS,
    POLL_LIVE_MS,
    RATING_TARGET_WEIGHTS,
    REPLAY_MS,
    RISK_ROUNDS,
    ROLES,
    SESSION_SCHEDULE,
    SESSION_WAIT_ROUND_MINUTES,
    SESSION_WAIT_ROUNDS,
    TEAM_IDS,
    type ApprovalMode,
} from "@/lib/agent-world/config";
import {AGENT_WORLD_LEGEND_COPY as L, DATA_CATEGORY_COPY, ROLE_COPY, TEAM_COPY, vendorLabel} from "@/lib/learn/copy/agent-world";

type LegendSection = {heading: string; lines: string[]};
export type AgentWorldLegend = {summary: string; sections: LegendSection[]};

const pct = (fraction: number): string => `${Number((fraction * 100).toFixed(1))}%`;
const money = (dollars: number): string => dollars.toLocaleString('en-US', {style: 'currency', currency: 'USD', maximumFractionDigits: 0});
const clock = (hour: number, minute: number): string => `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;

// "Analysts (Market analyst, …), then Research (…), then Trading (Trader), …": a team whose one role
// carries its own name is named once.
const teamsText = (): string => TEAM_IDS.map((team) => {
    const names = ROLES.filter((role) => role.team === team).map((role) => ROLE_COPY[role.id].name);
    return names.length === 1 && names[0] === TEAM_COPY[team] ? TEAM_COPY[team] : `${TEAM_COPY[team]} (${names.join(', ')})`;
}).join(', then ');

// The table, word by word, mid-sentence: "Buy 20%, Overweight 12%, Hold keeps the position, …".
const weightsText = (): string => {
    const w = RATING_TARGET_WEIGHTS;
    return [
        `Buy ${pct(w.Buy as number)}`,
        `Overweight ${pct(w.Overweight as number)}`,
        'Hold keeps the position',
        `Underweight ${pct(w.Underweight as number)} of a holding`,
        `Sell ${pct(w.Sell as number)}`,
    ].join(', ');
};

// Each category's providers in the order its fullest chain asks them, the categories in their order.
const chainsText = (): string => DATA_CATEGORIES.map((category) => {
    const chains = DATA_TOOLS.filter((tool) => tool.category === category).map((tool): readonly string[] => tool.chain);
    const fullest = chains.reduce<readonly string[]>((longest, chain) => (chain.length > longest.length ? chain : longest), []);
    return `${DATA_CATEGORY_COPY[category].toLowerCase()} from ${fullest.map(vendorLabel).join(' then ')}`;
}).join('; ');

export const agentWorldLegend = (mode: ApprovalMode, symbols: readonly string[]): AgentWorldLegend => ({
    summary: L.summary,
    sections: [
        {heading: L.sessionHeading, lines: [L.session(symbols.length, symbols.join(', ')), L.account(money(AGENT_WORLD_STARTING_BALANCE)), L.kinds]},
        {heading: L.deskHeading, lines: [L.order(teamsText()), L.parallel, L.rounds(DEBATE_ROUNDS, RISK_ROUNDS), L.models(AGENT_WORLD_MODELS.quick, AGENT_WORLD_MODELS.deep)]},
        {
            heading: L.ratingsHeading,
            lines: [
                L.scale(weightsText()),
                L.rails(pct(AGENT_WORLD_RAILS.maxPositionWeight), pct(AGENT_WORLD_RAILS.minCashWeight), pct(AGENT_WORLD_RAILS.rebalanceBand)),
                L.once,
            ],
        },
        {
            heading: L.decisionHeading,
            lines: [
                mode === 'owner' ? L.approvalOwner : L.approvalAuto,
                L.lapse(LAPSE_WEEKDAY.day, clock(LAPSE_WEEKDAY.hour, LAPSE_WEEKDAY.minute), LAPSE_HOURS),
                L.open,
            ],
        },
        {heading: L.companyHeading, lines: [L.company(BUDGET_SOFT_PCT, BUDGET_HARD_PCT), L.costs, L.issue]},
        {heading: L.dataHeading, lines: [L.data(chainsText()), L.pointInTime]},
        {
            heading: L.scheduleHeading,
            lines: [
                L.schedule(SESSION_SCHEDULE.day, SESSION_SCHEDULE.retryDay, clock(SESSION_SCHEDULE.hour, SESSION_SCHEDULE.minute)),
                L.wait(SESSION_WAIT_ROUNDS * SESSION_WAIT_ROUND_MINUTES),
                L.polling(POLL_LIVE_MS / 1000, POLL_IDLE_MS / 1000),
                L.replay(REPLAY_MS / 1000),
                L.killSwitch(AGENT_WORLD_ENABLED_ENV),
            ],
        },
    ],
});
