'use client';

import type {ReactNode} from "react";
import DecisionPanel from "@/components/agent-world/DecisionPanel";
import {seatDot, seatEdge} from "@/components/agent-world/office/office-look";
import SafeMarkdown from "@/components/primitives/SafeMarkdown";
import {Sheet, SheetContent} from "@/components/primitives/Sheet";
import SectionHeading from "@/components/primitives/SectionHeading";
import {iconButton} from "@/components/primitives/iconButton";
import {AGENT_WORLD_MODELS, ROLES, type RoleId, type WorkerId} from "@/lib/agent-world/config";
import {activeRun} from "@/lib/agent-world/live";
import type {CareerStats, OfficeState} from "@/lib/agent-world/office";
import {OFFICE_SEATS} from "@/lib/agent-world/office-layout";
import type {OfficeBudgets} from "@/lib/agent-world/office-store";
import {elapsedText, formatCents, formatTokens} from "@/lib/agent-world/page-view";
import type {LiveView, RunView} from "@/lib/agent-world/types";
import {AGENT_WORLD_COPY, ROLE_COPY, TEAM_COPY, vendorLabel} from "@/lib/learn/copy/agent-world";
import {DESK_COPY, DOSSIER_COPY, WORKER_STATUS_COPY, workerName, type OfficeTermsGroup} from "@/lib/learn/copy/agent-world-office";
import {cn} from "@/lib/utils";

// A seat's file: who it is (its role, its team, its desk, the model it runs on), what it is doing
// now, what this session and the last finished sessions took (calls, tokens, cost, fetches by
// provider, time busy), the newest text it filed or spoke (model text, as written), its budget in
// the company, and the terms. The Execution desk's file holds the owner's decision box.

const isDesk = (id: WorkerId): id is 'head-trader' | 'execution-desk' => id === 'head-trader' || id === 'execution-desk';
const TEAM_OF = new Map(ROLES.map((role) => [role.id, role.team]));
const DEEP: ReadonlySet<WorkerId> = new Set(['research-manager', 'portfolio-manager']);

const durationText = (ms: number): string => {
    const seconds = Math.max(0, Math.round(ms / 1000));
    if (seconds < 3600) return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
    return `${Math.floor(seconds / 3600)}h ${String(Math.floor((seconds % 3600) / 60)).padStart(2, '0')}m`;
};

const latestText = (run: RunView | null, role: RoleId): string | null => {
    if (!run) return null;
    if (role === 'bull' || role === 'bear') return run.debate.filter((turn) => turn.side === role).at(-1)?.text ?? null;
    if (role === 'risk-aggressive' || role === 'risk-conservative' || role === 'risk-neutral') return run.risk.filter((turn) => turn.role === role).at(-1)?.text ?? null;
    return run.reports[role] ?? null;
};

const Figure = ({label, value}: {label: string; value: string}) => (
    <div className="min-w-0">
        <dt className="label-type text-[10px] text-fg-muted">{label}</dt>
        <dd className="font-mono text-sm tabular-nums text-fg">{value}</dd>
    </div>
);

type Props = {
    id: WorkerId | null;
    office: OfficeState;
    view: LiveView;
    career: CareerStats;
    budgets: OfficeBudgets;
    owner: boolean;
    enabled: boolean;
    ratingTitle: string;
    terms: Partial<Record<OfficeTermsGroup, ReactNode>>;
    onClose: () => void;
    onDecided: () => void;
};

const OfficeDossier = ({id, office, view, career, budgets, owner, enabled, ratingTitle, terms, onClose, onDecided}: Props) => {
    const worker = id ? office.workers.find((w) => w.id === id) ?? null : null;
    const open = id !== null && worker !== null;
    const name = id ? workerName(id) : '';
    return (
        <Sheet open={open} onOpenChange={(next) => !next && onClose()} modal={false}>
            {open && id && worker && (
                <SheetContent title={name} side="right" className="w-[26rem] max-w-[94vw] overflow-y-auto text-fg" data-office-dossier={id}
                    onInteractOutside={(event) => event.preventDefault()}>
                    <DossierBody id={id} worker={worker} office={office} view={view} career={career} budgets={budgets} owner={owner} enabled={enabled} ratingTitle={ratingTitle} terms={terms} onClose={onClose} onDecided={onDecided} />
                </SheetContent>
            )}
        </Sheet>
    );
};

const DossierBody = ({id, worker, office, view, career, budgets, owner, enabled, ratingTitle, terms, onClose, onDecided}: Omit<Props, 'id'> & {id: WorkerId; worker: OfficeState['workers'][number]}) => {
    const seat = OFFICE_SEATS.find((s) => s.id === id);
    const desk = isDesk(id);
    const team = desk ? null : TEAM_OF.get(id);
    const name = workerName(id);
    const line = desk ? DESK_COPY[id].line : ROLE_COPY[id].line;
    const models = view.session?.models ?? AGENT_WORLD_MODELS;
    const run = activeRun(view, office.symbol);
    const stats = worker.stats;
    const text = desk ? null : latestText(run, id);
    const termsGroup: OfficeTermsGroup = desk ? id : (team ?? 'analysts');
    const roleCareer = desk ? null : career.roles[id];
    const budget = budgets.status === 'ok' ? budgets.agents[id] ?? null : null;
    const from = career.from ? new Date(career.from).toISOString().slice(0, 10) : null;

    return (
        <div className="space-y-5 p-5">
            <div className="flex items-start gap-3">
                <span aria-hidden="true" className={cn('mt-1 h-10 w-1.5 shrink-0 rounded-full', seatEdge(id))} />
                <div className="min-w-0 flex-1">
                    <p className="label-type text-[10px] text-fg-muted">
                        {seat ? DOSSIER_COPY.desk(seat.desk, OFFICE_SEATS.length) : ''}{team ? ` · ${TEAM_COPY[team]}` : ''}
                    </p>
                    <h2 className="font-heading text-lg font-semibold text-fg">{name}</h2>
                    <p className="mt-1 text-sm text-fg-soft">{line}</p>
                    {!desk && (
                        <p className="mt-1 text-xs text-fg-muted">
                            {DOSSIER_COPY.model} · {DEEP.has(id) ? DOSSIER_COPY.tiers.deep : DOSSIER_COPY.tiers.quick} · <span className="font-mono">{DEEP.has(id) ? models.deep : models.quick}</span>
                        </p>
                    )}
                </div>
                <button type="button" onClick={onClose} aria-label={DOSSIER_COPY.close} data-office-dossier-close className={iconButton}>
                    <span className="material-symbols-outlined text-lg" aria-hidden="true">close</span>
                </button>
            </div>

            <section>
                <SectionHeading size="sm">{DOSSIER_COPY.rightNow}</SectionHeading>
                <div className="flex items-center gap-2 text-sm">
                    <span aria-hidden="true" className={cn('size-2 rounded-full', seatDot(worker.status))} />
                    <span className="font-medium text-fg" data-office-dossier-status={worker.status}>{WORKER_STATUS_COPY[worker.status]}</span>
                    {worker.symbol && <span className="font-mono text-xs text-fg-muted">{DOSSIER_COPY.on} {worker.symbol}</span>}
                    {worker.since !== null && <span className="font-mono text-xs tabular-nums text-fg-muted">{DOSSIER_COPY.since} {elapsedText(worker.since, null, office.now)}</span>}
                </div>
                <p className="mt-1 text-sm text-fg-soft" data-office-dossier-task>{worker.task}</p>
            </section>

            {id === 'execution-desk' ? (
                <section data-office-decision>
                    {office.mode === 'replay' || !view.session ? (
                        <p className="text-sm text-fg-muted">{DOSSIER_COPY.replaying}</p>
                    ) : (
                        <DecisionPanel session={view.session} owner={owner} enabled={enabled} now={office.now} ratingTitle={ratingTitle} onDecided={onDecided} />
                    )}
                </section>
            ) : null}

            {id === 'head-trader' && office.issue.identifier && (
                <section>
                    <SectionHeading size="sm">{DOSSIER_COPY.thisSession}</SectionHeading>
                    <p className="text-sm text-fg-soft">
                        {office.issue.url ? <a href={office.issue.url} target="_blank" rel="noopener noreferrer" className="font-mono underline decoration-dotted">{office.issue.identifier}</a> : <span className="font-mono">{office.issue.identifier}</span>}
                    </p>
                </section>
            )}

            {!desk && (
                <section data-office-session-figures>
                    <SectionHeading size="sm">{DOSSIER_COPY.thisSession}</SectionHeading>
                    <dl className="grid grid-cols-3 gap-x-3 gap-y-2">
                        <Figure label={DOSSIER_COPY.figures.calls} value={stats.calls.toLocaleString('en-US')} />
                        <Figure label={DOSSIER_COPY.figures.tokens} value={`${formatTokens(stats.tokensIn)} / ${formatTokens(stats.tokensOut)}`} />
                        <Figure label={DOSSIER_COPY.figures.cost} value={formatCents(stats.costCents)} />
                        <Figure label={DOSSIER_COPY.figures.fetches} value={stats.fetches.toLocaleString('en-US')} />
                        <Figure label={DOSSIER_COPY.figures.busy} value={durationText(stats.atWorkMs)} />
                        <Figure label={DOSSIER_COPY.figures.texts} value={stats.texts.toLocaleString('en-US')} />
                    </dl>
                    {stats.vendors.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                            {stats.vendors.map((v) => <span key={v.vendor} className="rounded border border-line px-1.5 py-0.5 font-mono text-[10px] text-fg-soft">{vendorLabel(v.vendor)} ×{v.count}</span>)}
                        </div>
                    )}
                </section>
            )}

            {!desk && (
                <section>
                    <SectionHeading size="sm">{DOSSIER_COPY.latest}</SectionHeading>
                    {text ? (
                        <div className="space-y-2">
                            <p className="text-[11px] text-fg-muted" data-office-caveat-file>{AGENT_WORLD_COPY.caveat}</p>
                            <div className="max-h-72 overflow-y-auto rounded-md border border-line bg-surface-1/60 p-3" data-office-latest>
                                <SafeMarkdown className="prose-sm text-xs leading-relaxed text-fg-soft">{text}</SafeMarkdown>
                            </div>
                        </div>
                    ) : <p className="text-sm text-fg-muted">{DOSSIER_COPY.noText(name)}</p>}
                </section>
            )}

            <section data-office-career>
                <SectionHeading size="sm">{DOSSIER_COPY.career}</SectionHeading>
                <p className="mb-2 text-xs text-fg-muted">{career.sessions > 0 && from ? DOSSIER_COPY.careerSince(from, career.sessions) : DOSSIER_COPY.careerNone}</p>
                {roleCareer && career.sessions > 0 && (
                    <dl className="grid grid-cols-3 gap-x-3 gap-y-2">
                        <Figure label={DOSSIER_COPY.figures.sessions} value={String(roleCareer.sessions)} />
                        <Figure label={DOSSIER_COPY.figures.runs} value={String(roleCareer.runs)} />
                        <Figure label={DOSSIER_COPY.figures.texts} value={String(roleCareer.texts)} />
                        <Figure label={DOSSIER_COPY.figures.calls} value={roleCareer.calls.toLocaleString('en-US')} />
                        <Figure label={DOSSIER_COPY.figures.tokens} value={formatTokens(roleCareer.tokens)} />
                        <Figure label={DOSSIER_COPY.figures.cost} value={formatCents(roleCareer.costCents)} />
                        <Figure label={DOSSIER_COPY.figures.fetches} value={String(roleCareer.fetches)} />
                        <Figure label={DOSSIER_COPY.figures.busy} value={durationText(roleCareer.atWorkMs)} />
                        {roleCareer.favourite && <Figure label={DOSSIER_COPY.figures.favourite} value={DOSSIER_COPY.favourite(vendorLabel(roleCareer.favourite.vendor), Math.round(roleCareer.favourite.share * 100))} />}
                    </dl>
                )}
                {id === 'head-trader' && career.sessions > 0 && (
                    <dl className="grid grid-cols-2 gap-x-3 gap-y-2">
                        <Figure label={DOSSIER_COPY.figures.sessions} value={String(career.desks['head-trader'].sessions)} />
                        <Figure label={DOSSIER_COPY.figures.cost} value={formatCents(career.desks['head-trader'].costCents)} />
                    </dl>
                )}
                {id === 'execution-desk' && career.sessions > 0 && (
                    <div className="space-y-2">
                        <p className="text-sm text-fg-soft">{DOSSIER_COPY.decided(career.desks['execution-desk'].decided.approved, career.desks['execution-desk'].decided.declined, career.desks['execution-desk'].decided.lapsed)}</p>
                        <dl className="grid grid-cols-2 gap-x-3">
                            <Figure label={DOSSIER_COPY.figures.tickets} value={String(career.desks['execution-desk'].tickets)} />
                            <Figure label={DOSSIER_COPY.figures.filled} value={String(career.desks['execution-desk'].filled)} />
                        </dl>
                    </div>
                )}
            </section>

            <section data-office-budget>
                <SectionHeading size="sm">{DOSSIER_COPY.company}</SectionHeading>
                {budgets.status === 'unconfigured' && <p className="text-xs text-fg-muted">{DOSSIER_COPY.budgetUnknown}</p>}
                {budgets.status === 'unreachable' && <p className="text-xs text-fg-muted">{DOSSIER_COPY.budgetUnreachable}</p>}
                {budgets.status === 'ok' && budget && (
                    <div className="space-y-1.5">
                        {budget.capCents > 0 ? (
                            <>
                                <p className="text-sm text-fg-soft">{DOSSIER_COPY.budgetLine(formatCents(budget.spentCents), formatCents(budget.capCents))}</p>
                                <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-3" aria-hidden="true">
                                    <div className={cn('h-full rounded-full', (budget.share ?? 0) >= 0.8 ? 'bg-warning' : 'bg-brand/70')} style={{width: `${Math.min(100, Math.round((budget.share ?? 0) * 100))}%`}} />
                                </div>
                            </>
                        ) : <p className="text-xs text-fg-muted">{DOSSIER_COPY.noCap}</p>}
                        {budget.status === 'paused' && <p className="text-xs text-warning">{DOSSIER_COPY.paused}</p>}
                    </div>
                )}
            </section>

            {terms[termsGroup]}
        </div>
    );
};

export default OfficeDossier;
