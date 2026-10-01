'use client';

import {useEffect, useState} from "react";
import {cn, getEasternDateString} from "@/lib/utils";
import type {BridgeLineKey, ReturnBridge as Bridge} from "@/lib/trading/learn/bridge";
import type {GlossaryKey} from "@/lib/learn/glossary";
import {BRIDGE_COPY, signedMoney} from "@/lib/learn/copy/portfolio";
import Panel from "@/components/primitives/Panel";
import SectionHeading from "@/components/primitives/SectionHeading";
import EmptyState from "@/components/primitives/EmptyState";
import Term from "@/components/primitives/Term";
import WhatTheseMean from "@/components/learn/WhatTheseMean";

// "Where the return came from": the account's total return split into price moves on shares
// still held, results locked in by sells, interest and dividends — lines that add up to the
// Total Return figure to the cent (lib/trading/learn/bridge.ts, computed on the server).
//
// While the income share is a question worth asking (a gain, some income), the split waits
// behind one guess: what share came from interest and dividends. The guess is kept in this
// browser only, per account, and read in an effect after mount — never during render, so the
// server HTML and the first client render agree. A stored guess skips the slider.

const TERM_OF: Partial<Record<BridgeLineKey, GlossaryKey>> = {
    price: 'unrealized-pnl',
    realized: 'realized-pnl',
    interest: 'income',
    dividends: 'income',
};

const STEP = 5;
const storageKey = (accountId: string) => `aerotrade:return-guess:${accountId}`;

type Guess = {pct: number; date: string};

const readGuess = (accountId: string): Guess | null => {
    try {
        const raw = window.localStorage.getItem(storageKey(accountId));
        if (!raw) return null;
        const parsed = JSON.parse(raw) as Partial<Guess>;
        if (typeof parsed.pct !== 'number' || !Number.isFinite(parsed.pct) || typeof parsed.date !== 'string') return null;
        return {pct: Math.min(100, Math.max(0, parsed.pct)), date: parsed.date};
    } catch {
        return null;
    }
};

const writeGuess = (accountId: string, guess: Guess | null) => {
    try {
        if (guess) window.localStorage.setItem(storageKey(accountId), JSON.stringify(guess));
        else window.localStorage.removeItem(storageKey(accountId));
    } catch {
        // Storage can be blocked (private windows); the guess then lasts for this visit only.
    }
};

const amountClass = (cents: number) => (cents > 0 ? 'text-positive' : cents < 0 ? 'text-negative' : 'text-fg-muted');

const BridgeLines = ({bridge}: {bridge: Bridge}) => {
    const widest = Math.max(1, ...bridge.lines.map((line) => Math.abs(line.cents)));
    const unpricedNote = BRIDGE_COPY.unpriced(bridge.unpriced, bridge.holdings);
    return (
        <div className="mt-3">
            <ul className="divide-y divide-line-strong/15" data-testid="bridge-lines">
                {bridge.lines.map((line) => {
                    const term = TERM_OF[line.key];
                    const label = BRIDGE_COPY.line[line.key];
                    return (
                        <li key={line.key} data-bridge-line={line.key} data-cents={line.cents}
                            className="grid grid-cols-[minmax(0,1fr)_5rem_auto] items-center gap-3 py-2 text-sm">
                            <span className="text-fg min-w-0">
                                {term ? <Term k={term}>{label}</Term> : label}
                                {line.key === 'price' && unpricedNote && (
                                    <span className="ml-2 font-mono text-[10px] text-fg-muted">{unpricedNote}</span>
                                )}
                            </span>
                            <span className="h-1.5 rounded-full bg-surface-3/60 overflow-hidden" aria-hidden="true">
                                <span className={cn('block h-full rounded-full', line.cents >= 0 ? 'bg-positive/70' : 'bg-negative/70')}
                                      style={{width: `${(Math.abs(line.cents) / widest) * 100}%`}} />
                            </span>
                            <span className={cn('font-mono text-right', amountClass(line.cents))}>{signedMoney(line.cents / 100)}</span>
                        </li>
                    );
                })}
            </ul>
            <div className="flex items-baseline justify-between gap-3 border-t border-line-strong/30 pt-2 mt-1 text-sm" data-bridge-total data-cents={bridge.totalCents}>
                <span className="font-semibold text-fg"><Term k="total-return">{BRIDGE_COPY.total}</Term></span>
                <span className={cn('font-mono font-semibold', amountClass(bridge.totalCents))}>{signedMoney(bridge.totalCents / 100)}</span>
            </div>
        </div>
    );
};

const ReturnBridge = ({accountId, bridge}: {accountId: string; bridge: Bridge | null}) => {
    const [guess, setGuess] = useState<Guess | null>(null);
    const [draft, setDraft] = useState(0);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- browser-only storage, read after hydration so server and client HTML agree
        setGuess(readGuess(accountId));
    }, [accountId]);

    const asks = bridge !== null && bridge.incomeShare !== null;
    const showSplit = bridge !== null && (!asks || guess !== null);

    const reveal = () => {
        const next = {pct: draft, date: getEasternDateString()};
        writeGuess(accountId, next);
        setGuess(next);
    };
    const again = () => {
        writeGuess(accountId, null);
        setGuess(null);
    };

    return (
        <Panel id="return-bridge" aria-labelledby="return-bridge-heading">
            <SectionHeading id="return-bridge-heading" spacing="sm">{BRIDGE_COPY.heading}</SectionHeading>
            {bridge === null ? (
                <EmptyState title={BRIDGE_COPY.emptyTitle} description={BRIDGE_COPY.emptyDescription} className="p-0" />
            ) : (
                <>
                    {asks && guess === null && (
                        <div data-bridge-guess-form>
                            <label htmlFor="bridge-guess" className="block text-sm text-fg">
                                {BRIDGE_COPY.guessPrompt(signedMoney(bridge.totalCents / 100))}
                            </label>
                            <div className="mt-3 flex items-center gap-3">
                                <input
                                    id="bridge-guess"
                                    type="range"
                                    min={0}
                                    max={100}
                                    step={STEP}
                                    value={draft}
                                    aria-label={BRIDGE_COPY.sliderLabel}
                                    onChange={(e) => setDraft(Number(e.target.value))}
                                    className="flex-1 accent-brand"
                                />
                                <output htmlFor="bridge-guess" className="font-mono text-sm text-fg w-10 text-right">{draft}%</output>
                                <button type="button" id="bridge-reveal" onClick={reveal}
                                        className="font-mono text-[11px] font-bold uppercase tracking-[0.08em] px-3 py-1.5 rounded-md bg-brand/10 text-brand hover:bg-brand/20">
                                    {BRIDGE_COPY.reveal}
                                </button>
                            </div>
                        </div>
                    )}
                    {asks && guess !== null && bridge.incomeShare !== null && (
                        <p className="font-mono text-[11px] text-fg-muted" data-bridge-guess>
                            {BRIDGE_COPY.guessed({guess: guess.pct, date: guess.date, share: bridge.incomeShare, other: bridge.total - bridge.income})}
                            {' · '}
                            <button type="button" id="bridge-guess-again" onClick={again} className="text-brand hover:underline">
                                {BRIDGE_COPY.guessAgain}
                            </button>
                        </p>
                    )}
                    {showSplit && (
                        <>
                            <BridgeLines bridge={bridge} />
                            <WhatTheseMean keys={['total-return', 'unrealized-pnl', 'realized-pnl', 'income']} />
                        </>
                    )}
                </>
            )}
        </Panel>
    );
};

export default ReturnBridge;
