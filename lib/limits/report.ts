// The one call a provider module makes when a service refuses it: classify the refusal and
// file it (lib/limits/record.ts), or do nothing. Import-light on purpose — the price, news and
// culture source modules are pure-ish and unit-tested with a stubbed fetch, so the recorder is
// loaded only when a hit is reported and only where a database is configured; a test or a
// keyless dev server reports into the void. Never throws: the caller is already handling a
// failure.

import type {LimitKind, LimitProviderId} from "@/lib/limits/registry";

export type LimitReport = {status?: number; message?: string} | Error | string;

export const reportLimit = async (provider: LimitProviderId, signal: LimitReport, jobId?: string): Promise<LimitKind | null> => {
    if (!process.env.MONGODB_URI) return null;
    try {
        const {recordLimitIf} = await import("@/lib/limits/record");
        return await recordLimitIf(provider, signal, jobId);
    } catch (error) {
        console.error(`Could not report a limit hit for ${provider}:`, error);
        return null;
    }
};

// A failed response as the classifier reads it: its status and the first words of its body.
export const responseSignal = async (response: Response, context: string): Promise<{status: number; message: string}> => {
    const body = await response.text().catch(() => '');
    return {status: response.status, message: `${context}: HTTP ${response.status} ${response.statusText} ${body.replace(/\s+/g, ' ').slice(0, 160)}`.trim()};
};
