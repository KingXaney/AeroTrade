// Server-only: the papers feed's writes (the weekday job) and its one read (the lab page).

import {cache} from "react";
import {connectToDatabase} from "@/database/mongoose";
import LabDay, {type LabDayDoc} from "@/database/models/lab-day.model";
import {addCalendarDays} from "@/lib/dates";
import type {LabDayRecord, LabDayStored, LabDigest} from "@/lib/lab/papers/day";

// The job's write: the day's papers, upserted under the run's day — a re-run replaces the day
// and clears its digest, so a digest never describes papers it was not written over.
export const saveLabDay = async (record: LabDayRecord): Promise<void> => {
    await connectToDatabase();
    await LabDay.updateOne(
        {day: record.day},
        {$set: {papers: record.papers, counts: record.counts, digest: null, fetchedAt: new Date()}, $setOnInsert: {createdAt: new Date()}},
        {upsert: true},
    );
};

export const saveLabDigest = async (day: string, digest: LabDigest, modelName: string): Promise<void> => {
    await connectToDatabase();
    await LabDay.updateOne({day}, {$set: {digest: {...digest, model: modelName, writtenAt: new Date()}}});
};

// The ids stored in the last `days` days up to and including `today`: what "new" is measured
// against, so a paper shown once is not shown again when a feed lists it a second day.
export const readSeenIds = async (today: string, days: number): Promise<string[]> => {
    await connectToDatabase();
    const docs = await LabDay.find({day: {$gte: addCalendarDays(today, -days), $lte: today}}).select('papers.id').lean<Array<{papers: Array<{id: string}>}>>();
    return [...new Set(docs.flatMap((doc) => doc.papers.map((p) => p.id)))];
};

type LeanDay = Pick<LabDayDoc, 'day' | 'papers' | 'counts' | 'digest' | 'fetchedAt'>;

// The latest stored day on or before `today`: today's once the morning job has run, else the
// last one (shown as stale). Null before the first run. A failed read reads as none.
export const getLatestLabDay = cache(async (today: string): Promise<LabDayStored | null> => {
    try {
        await connectToDatabase();
        const doc = await LabDay.findOne({day: {$lte: today}}).sort({day: -1}).select('day papers counts digest fetchedAt').lean<LeanDay | null>();
        if (!doc) return null;
        return {
            day: doc.day,
            papers: doc.papers.map((p) => ({
                id: p.id, title: p.title, abstract: p.abstract, authors: [...p.authors], categories: [...p.categories],
                primary: p.primary, track: p.track, published: p.published, source: p.source, upvotes: p.upvotes ?? null,
            })),
            counts: {listed: doc.counts?.listed ?? 0, hf: doc.counts?.hf ?? 0, novel: doc.counts?.novel ?? 0, kept: doc.counts?.kept ?? doc.papers.length},
            digest: doc.digest
                ? {headline: doc.digest.headline, bullets: doc.digest.bullets.map((b) => ({text: b.text, papers: [...b.papers]})), model: doc.digest.model, writtenAt: new Date(doc.digest.writtenAt).toISOString()}
                : null,
            fetchedAt: new Date(doc.fetchedAt).toISOString(),
        };
    } catch (error) {
        console.error('lab papers read failed', error);
        return null;
    }
});
