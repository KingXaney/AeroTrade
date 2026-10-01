// The four profile answers the sign-up form collects, held to the lists the form offers. They
// travel only into the welcome email's prompt, and the form can send nothing else — so an answer
// outside its list means the action was called directly, and the sign-up is refused before any
// counter is spent or any account exists.

import countryList from 'react-select-country-list';
import {INVESTMENT_GOALS, PREFERRED_INDUSTRIES, RISK_TOLERANCE_OPTIONS} from '@/lib/constants';

export type SignUpProfile = {
    country: string;
    investmentGoals: string;
    riskTolerance: string;
    preferredIndustry: string;
};

export const SIGN_UP_PROFILE_INVALID_MESSAGE = 'Choose your country, investment goal, risk tolerance and industry from the lists.';

// The codes CountrySelectField offers: it lists countryList().getData() and stores each value.
const COUNTRY_CODES: ReadonlySet<string> = new Set(countryList().getValues());
const valuesOf = (options: ReadonlyArray<{value: string}>): ReadonlySet<string> => new Set(options.map((o) => o.value));
const GOALS = valuesOf(INVESTMENT_GOALS);
const RISKS = valuesOf(RISK_TOLERANCE_OPTIONS);
const INDUSTRIES = valuesOf(PREFERRED_INDUSTRIES);

const pick = (value: unknown, allowed: ReadonlySet<string>): string | null =>
    typeof value === 'string' && allowed.has(value) ? value : null;

// Only the four answers come back, so nothing else the caller sent can ride along into the event.
export const signUpProfile = (input: unknown): SignUpProfile | null => {
    if (!input || typeof input !== 'object') return null;
    const raw = input as Record<string, unknown>;
    const country = pick(raw.country, COUNTRY_CODES);
    const investmentGoals = pick(raw.investmentGoals, GOALS);
    const riskTolerance = pick(raw.riskTolerance, RISKS);
    const preferredIndustry = pick(raw.preferredIndustry, INDUSTRIES);
    if (!country || !investmentGoals || !riskTolerance || !preferredIndustry) return null;
    return {country, investmentGoals, riskTolerance, preferredIndustry};
};
