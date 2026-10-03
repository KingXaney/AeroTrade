'use client';

import {potOdds, validatePotOdds} from "@/lib/poker/pot-odds";
import {POT_ODDS_COPY} from "@/lib/learn/copy/poker";
import {useSessionState} from "@/components/poker/session-store";
import WhatTheseMean from "@/components/learn/WhatTheseMean";
import MicroLabel from "@/components/primitives/MicroLabel";
import Panel from "@/components/primitives/Panel";
import SectionHeading from "@/components/primitives/SectionHeading";
import StatTile from "@/components/primitives/StatTile";
import Term from "@/components/primitives/Term";
import TextField from "@/components/primitives/TextField";

type Inputs = {pot: string; bet: string; equity: string};

const numberOf = (text: string): number => (text.trim() === '' ? Number.NaN : Number(text));

// Pot odds from a pot and a bet, and a call's expected result once an equity is given. Arithmetic
// only, so it runs on the page as it is typed.
const PotOddsTab = () => {
    const [inputs, setInputs] = useSessionState<Inputs>('poker:pot-odds:inputs', () => ({pot: '100', bet: '50', equity: ''}));
    const pot = numberOf(inputs.pot);
    const bet = numberOf(inputs.bet);
    const equityText = inputs.equity.trim();
    const equity = equityText === '' ? null : Number(equityText) / 100;
    const issues = validatePotOdds({pot, bet, equity});
    const odds = issues.length === 0 ? potOdds({pot, bet, equity}) : null;

    const field = (key: keyof Inputs, label: string) => (
        <label className="block space-y-1">
            <MicroLabel as="span" className="block">{label}</MicroLabel>
            <TextField type="number" inputMode="decimal" min={0} step="any" value={inputs[key]} className="w-full" data-pot-odds-field={key}
                       onChange={(event) => {
                           const text = event.target.value;
                           setInputs((previous) => ({...previous, [key]: text}));
                       }}/>
        </label>
    );

    return (
        <div className="space-y-4" data-poker-tab="pot-odds">
            <Panel aria-labelledby="pot-odds-heading">
                <SectionHeading id="pot-odds-heading" spacing="sm">{POT_ODDS_COPY.heading}</SectionHeading>
                <p className="mb-4 max-w-2xl text-sm leading-relaxed text-fg-soft">{POT_ODDS_COPY.lead}</p>
                <div className="grid max-w-2xl grid-cols-1 gap-4 sm:grid-cols-3">
                    {field('pot', POT_ODDS_COPY.potLabel)}
                    {field('bet', POT_ODDS_COPY.betLabel)}
                    {field('equity', POT_ODDS_COPY.equityLabel)}
                </div>
                {issues.length > 0 && (
                    <ul className="mt-3 space-y-0.5 text-xs text-warning" data-pot-odds-issues>
                        {issues.map((issue) => <li key={issue}>{POT_ODDS_COPY.issue(issue)}</li>)}
                    </ul>
                )}
                {odds && (
                    <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5" data-pot-odds-result
                         data-break-even={odds.breakEven.toFixed(6)} data-minimum-defense={odds.minimumDefense.toFixed(6)}>
                        <StatTile label={<Term k="pot-odds">{POT_ODDS_COPY.breakEvenLabel}</Term>} value={POT_ODDS_COPY.share(odds.breakEven)} hint={POT_ODDS_COPY.breakEvenHow(pot, bet)} valueClass="text-2xl"/>
                        <StatTile label={<Term k="pot-odds">{POT_ODDS_COPY.oddsLabel}</Term>} value={POT_ODDS_COPY.odds(odds.odds)} hint={POT_ODDS_COPY.oddsHow(pot, bet)}/>
                        <StatTile label={<Term k="minimum-defense-frequency">{POT_ODDS_COPY.minimumDefenseLabel}</Term>} value={POT_ODDS_COPY.share(odds.minimumDefense)} hint={POT_ODDS_COPY.minimumDefenseHow(pot, bet)}/>
                        <StatTile label={POT_ODDS_COPY.bluffFoldsLabel} value={POT_ODDS_COPY.share(odds.bluffFolds)} hint={POT_ODDS_COPY.bluffFoldsHow(pot, bet)}/>
                        {odds.callResult !== null && equity !== null ? (
                            <StatTile label={<Term k="expected-value">{POT_ODDS_COPY.callResultLabel}</Term>} value={POT_ODDS_COPY.callResult(odds.callResult)}
                                      hint={POT_ODDS_COPY.callResultHow(equity, pot, bet)}
                                      valueClass={odds.callResult > 0 ? 'text-positive' : odds.callResult < 0 ? 'text-negative' : undefined}/>
                        ) : (
                            <StatTile label={<Term k="expected-value">{POT_ODDS_COPY.callResultLabel}</Term>} value="—" hint={POT_ODDS_COPY.noEquity}/>
                        )}
                    </div>
                )}
                <WhatTheseMean id="pot-odds-terms" keys={['pot-odds', 'minimum-defense-frequency', 'expected-value']}/>
            </Panel>
        </div>
    );
};

export default PotOddsTab;
