'use server';

import {revalidatePath} from "next/cache";
import {z} from "zod";
import {getCurrentUser} from "@/lib/auth/session";
import {isBrokerOwner} from "@/lib/broker/config";
import {deleteBrokerLink, getBrokerLink, recordBrokerSync, saveBrokerLink, setBrokerLinkStatus} from "@/lib/broker/store";
import {syncBrokerLink} from "@/lib/broker/sync";
import {getEasternDateString} from "@/lib/dates";
import {BROKER_COPY} from "@/lib/learn/copy/broker";
import {takeRateLimit} from "@/lib/rate-limit";
import {getOwnedAccount} from "@/lib/trading/accounts";

// The Alpaca link's writes (docs/specs/2026-10-24-alpaca-broker-link.md). Every action: the
// signed-in user with their email, the broker owner gate (lib/broker/config.isBrokerOwner), one
// rate limit, zod on what the client sent, then /settings revalidated. The keys never pass
// through here: the sync reads them from the server's environment.

export type BrokerActionResult = {success: true; message: string} | {success: false; message: string};

const ACTIONS_PER_MINUTE = 20;

const begin = async (): Promise<{userId: string} | {refused: string}> => {
    const user = await getCurrentUser();
    if (!user) return {refused: BROKER_COPY.notSignedIn};
    if (!isBrokerOwner(user.email)) return {refused: BROKER_COPY.notOwner};
    if (!(await takeRateLimit(`broker:${user.id}`, ACTIONS_PER_MINUTE, 60_000))) return {refused: BROKER_COPY.tooFast};
    return {userId: user.id};
};

const refresh = () => revalidatePath('/settings');

const LinkInput = z.object({accountId: z.string().regex(/^[a-f0-9]{24}$/)}).strict();
const PauseInput = z.object({paused: z.boolean()}).strict();

export const linkBrokerAccount = async (input: unknown): Promise<BrokerActionResult> => {
    const gate = await begin();
    if ('refused' in gate) return {success: false, message: gate.refused};
    const parsed = LinkInput.safeParse(input);
    if (!parsed.success) return {success: false, message: BROKER_COPY.invalid};
    try {
        if (!(await getOwnedAccount(gate.userId, parsed.data.accountId))) return {success: false, message: BROKER_COPY.notYours};
        await saveBrokerLink(gate.userId, parsed.data.accountId);
        refresh();
        return {success: true, message: BROKER_COPY.linkedToast};
    } catch (error) {
        console.error('Error linking Alpaca:', error);
        return {success: false, message: BROKER_COPY.notSaved};
    }
};

export const setBrokerPaused = async (input: unknown): Promise<BrokerActionResult> => {
    const gate = await begin();
    if ('refused' in gate) return {success: false, message: gate.refused};
    const parsed = PauseInput.safeParse(input);
    if (!parsed.success) return {success: false, message: BROKER_COPY.invalid};
    try {
        if (!(await setBrokerLinkStatus(gate.userId, parsed.data.paused ? 'paused' : 'active'))) return {success: false, message: BROKER_COPY.noLink};
        refresh();
        return {success: true, message: parsed.data.paused ? BROKER_COPY.pausedToast : BROKER_COPY.resumedToast};
    } catch (error) {
        console.error('Error pausing Alpaca:', error);
        return {success: false, message: BROKER_COPY.notSaved};
    }
};

export const unlinkBroker = async (): Promise<BrokerActionResult> => {
    const gate = await begin();
    if ('refused' in gate) return {success: false, message: gate.refused};
    try {
        if (!(await deleteBrokerLink(gate.userId))) return {success: false, message: BROKER_COPY.noLink};
        refresh();
        return {success: true, message: BROKER_COPY.unlinkedToast};
    } catch (error) {
        console.error('Error unlinking Alpaca:', error);
        return {success: false, message: BROKER_COPY.notSaved};
    }
};

// One sync now: orders only while Alpaca's market is open, a preview otherwise; recorded either way.
export const syncBrokerNow = async (): Promise<BrokerActionResult> => {
    const gate = await begin();
    if ('refused' in gate) return {success: false, message: gate.refused};
    try {
        const link = await getBrokerLink(gate.userId);
        if (!link) return {success: false, message: BROKER_COPY.noLink};
        const day = getEasternDateString();
        const outcome = await syncBrokerLink(link, {execute: true, day});
        await recordBrokerSync(gate.userId, {...outcome, day, at: new Date()});
        refresh();
        return outcome.kind === 'skipped' ? {success: false, message: outcome.summary} : {success: true, message: outcome.summary};
    } catch (error) {
        console.error('Error syncing Alpaca:', error);
        return {success: false, message: BROKER_COPY.notSaved};
    }
};
