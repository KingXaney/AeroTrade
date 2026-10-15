// The shape of a lab unit (lib/learn/copy/lab/units/<track>.ts): one day's study in one of the
// three tracks, with the review cards and the problem it leaves behind. The bank is server-only —
// a problem's solution reaches the page only once the owner reveals it, and
// lib/lab/__tests__/guard.test.ts fails if a client file imports it.
//
// Markdown with KaTeX maths ($…$ and $$…$$), written through the `md` tag (./md.ts) so a
// backslash survives. Bodies are held to the 'lab' tier of lib/learn/banned.ts — the phrases that
// aim an instruction at money or a security — with code and maths stripped first; titles and
// one-liners to the 'copy' tier like every other label (lib/lab/__tests__/curriculum.test.ts).

import type {GlossaryKey} from "@/lib/learn/glossary";

export const LAB_TRACKS = ['cv', 'ml', 'quant'] as const;
export type LabTrack = (typeof LAB_TRACKS)[number];

export type LabSourceKind = 'paper' | 'course' | 'book' | 'blog' | 'code';
export type LabSource = {title: string; url: string; kind: LabSourceKind; year: number; note?: string};

export type LabCard = {
    // `${unitId}/${slug}`: stored on every review row, never renamed.
    id: string;
    front: string;
    back: string;
    tags: readonly string[];
};

export type LabProblemKind = 'derivation' | 'coding' | 'quant';
export type LabProblem = {
    // `${unitId}/p1`: stored on the owner's reveal row, never renamed.
    id: string;
    kind: LabProblemKind;
    title: string;
    statement: string;
    // Taken one at a time, each a step closer.
    hints: readonly string[];
    // Server-only until revealed.
    solution: string;
    // Present when the answer is one number: lib/games/answer.checkAnswer reads it, and
    // lib/lab/__tests__/problem-checks.ts computes it another way.
    answer?: string;
    tolerance?: number;
    unit?: string;
};

// One multiple-choice question of a unit's quiz: four options, one right. The answer index and
// the explanation stay on the server (lib/lab/quiz.quizPublic strips them); the quiz is scored
// there (lib/actions/lab.actions.answerQuiz) and a pass is what lets the unit be marked studied.
export type LabQuizQuestion = {
    // `${unitId}/q1`, a key for the page; never stored.
    id: string;
    prompt: string;
    options: readonly [string, string, string, string];
    answer: 0 | 1 | 2 | 3;
    why: string;
};

export type LabSections = {
    // What it is, in the field's own words.
    idea: string;
    // At least one displayed equation.
    maths: string;
    // One fenced python block: a sketch, never a package.
    code: string;
    // Why it matters now.
    whyNow: string;
    pitfalls: string;
};

export type LabUnit = {
    // The address (/learn/units/<id>) and the stamp; never renamed.
    id: string;
    track: LabTrack;
    title: string;
    // The syllabus row.
    oneLiner: string;
    readingMinutes: number;
    sections: LabSections;
    // 3–8, verified.
    sources: readonly LabSource[];
    // 5–8.
    cards: readonly LabCard[];
    // 1–2.
    problems: readonly LabProblem[];
    // 3–5 questions; passed with at most one wrong (lib/lab/quiz.QUIZ_MAX_WRONG).
    quiz: readonly LabQuizQuestion[];
    // The app's own metrics the unit leans on: printed beside it from the glossary, never
    // paraphrased in it.
    glossaryTerms?: readonly GlossaryKey[];
    // Unit ids, informational.
    prerequisites?: readonly string[];
};

// A syllabus row not yet written: shown greyed on the library, never today's unit.
export type LabPlanRow = {id: string; track: LabTrack; title: string; oneLiner: string};
