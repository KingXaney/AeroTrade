// The lab's bank: every authored unit, with the syllabus they belong to. Server-only in use
// (lib/lab/__tests__/guard.test.ts); the page's own sentences are ../lab.ts, which a client may read. The plan (./plan.ts) is the order; a unit is authored when
// one of the track files carries its id.

import {CV_UNITS} from "@/lib/learn/copy/lab/units/cv";
import {ML_UNITS} from "@/lib/learn/copy/lab/units/ml";
import {QUANT_UNITS} from "@/lib/learn/copy/lab/units/quant";
import {LAB_PLAN} from "@/lib/learn/copy/lab/plan";
import type {LabPlanRow, LabUnit} from "@/lib/learn/copy/lab/types";

export {LAB_PLAN};
export type {LabCard, LabPlanRow, LabProblem, LabSource, LabTrack, LabUnit} from "@/lib/learn/copy/lab/types";
export {LAB_TRACKS} from "@/lib/learn/copy/lab/types";

export const LAB_UNITS: readonly LabUnit[] = [...CV_UNITS, ...ML_UNITS, ...QUANT_UNITS];

const BY_ID: ReadonlyMap<string, LabUnit> = new Map(LAB_UNITS.map((unit) => [unit.id, unit]));

export const unitById = (id: unknown): LabUnit | null => (typeof id === 'string' ? BY_ID.get(id) ?? null : null);

// The syllabus rows no unit is written for yet.
export const plannedRows = (): LabPlanRow[] => LAB_PLAN.filter((row) => !BY_ID.has(row.id));
