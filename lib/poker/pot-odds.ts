// Pot odds: what calling a bet costs against what the pot pays, and the shares that follow from it.
// The pot is what is in the middle before the bet; the bet is what a call must match. Pure.

export const POT_ODDS_LIMIT = 1_000_000;

export type PotOddsInput = {pot: number; bet: number; equity: number | null};

export type PotOddsIssue = 'pot' | 'bet' | 'equity';

export type PotOdds = {
    // The equity a call needs to break even: bet / (pot + 2·bet).
    breakEven: number;
    // The odds the pot lays the caller, (pot + bet) : bet, as the first term with the bet as 1.
    odds: number;
    // The share of a range the defender continues with so a bluff of this size breaks even: pot / (pot + bet).
    minimumDefense: number;
    // The share of the time a bluff of this size needs the other side to fold: bet / (pot + bet).
    bluffFolds: number;
    // A call's expected result at the given equity: equity · (pot + 2·bet) − bet.
    callResult: number | null;
};

export const validatePotOdds = ({pot, bet, equity}: PotOddsInput): PotOddsIssue[] => {
    const issues: PotOddsIssue[] = [];
    if (!(pot > 0 && pot <= POT_ODDS_LIMIT)) issues.push('pot');
    if (!(bet > 0 && bet <= POT_ODDS_LIMIT)) issues.push('bet');
    if (equity !== null && !(equity >= 0 && equity <= 1)) issues.push('equity');
    return issues;
};

export const potOdds = ({pot, bet, equity}: PotOddsInput): PotOdds => ({
    breakEven: bet / (pot + 2 * bet),
    odds: (pot + bet) / bet,
    minimumDefense: pot / (pot + bet),
    bluffFolds: bet / (pot + bet),
    callResult: equity === null ? null : equity * (pot + 2 * bet) - bet,
});
