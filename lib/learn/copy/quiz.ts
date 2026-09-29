// Copy for the Daily quiz widget (components/dashboard/widgets/DailyQuiz.tsx): one question a
// day about a strategy's recent signal board. The questions ask what the rule decided and why;
// the answers are the stored record, so nothing here predicts or judges. It counts the days a
// learner answered and nothing else — no streak, no score, no reward. Held to the 'copy' tier
// of lib/learn/banned.ts by quiz-copy.test.ts; the "why" options are the reason decoder's
// glosses (lib/learn/copy/reasons.ts), held to the 'advice' tier there and in quiz.test.ts.
//
// Import-free of server code and of lib/learn/quiz.ts's values (types only), so the client
// widget can render it without pulling the builder, the catalog or zod into its bundle.

import type {DailyQuiz} from "@/lib/learn/quiz";
import {shortDate} from "@/lib/learn/copy/portfolio";
import {STATE_LABEL} from "@/lib/strategies/views";

export const DAILY_QUIZ_COPY = {
    optionsLabel: 'Your answer',
    verdictLabel: 'The rule\'s verdict',
    reasonLabel: 'The reason it gave',
    boardLink: 'See the whole board',
    emptyTitle: 'No question today',
    saving: 'Counting…',
    notSaved: 'Your answer could not be counted just now',
    notSignedIn: 'Not authenticated',
    stale: 'That was an earlier day\'s question; a reload brings today\'s',
};

export const quizEyebrow = (quiz: Pick<DailyQuiz, 'strategyName' | 'runDate'>): string =>
    `${quiz.strategyName} · ${shortDate(quiz.runDate)}`;

export const quizPrompt = (quiz: Pick<DailyQuiz, 'template' | 'symbol' | 'verdict'>): string => {
    const verdict = quiz.verdict ? STATE_LABEL[quiz.verdict] : '';
    switch (quiz.template) {
        case 'which-verdict':
            return `What did the rule decide for ${quiz.symbol ?? ''}?`;
        case 'why-this-verdict':
            return `The rule marked ${quiz.symbol ?? ''} “${verdict}”. Which reading explains that verdict?`;
        case 'which-symbol':
            return `Which of these did the rule mark “${verdict}”?`;
    }
};

export const quizOutcome = (matched: boolean): string => (matched ? 'Matched the rule' : 'Not this time');

// Omitted at zero: a count that has not started is not information.
export const daysAnsweredLine = (days: number): string | null => (days > 0 ? `Days answered: ${days}` : null);

export const quizBoardHref = (strategyId: string): string => `/strategies/${encodeURIComponent(strategyId)}`;

export const quizEmptyDescription = (windowDays: number): string =>
    `The question comes from a strategy's signal board of the last ${windowDays} days, and none is on record yet.`;
