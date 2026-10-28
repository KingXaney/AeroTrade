import {NextResponse} from "next/server";
import {getOwnerUserId} from "@/lib/auth/session";
import {getStrategyLedger} from "@/lib/strategies/page-store";
import {csvDownloadHeaders, tradesCsv, tradesCsvFilename} from "@/lib/trading/csv";
import {getEasternDateString} from "@/lib/dates";

// One quant strategy's live fills as a CSV download: its system account's current epoch, in
// the account export's columns (tradesCsv), named for the strategy and the Eastern date. The
// account belongs to the sentinel owner, so the account export's ownership check can never
// pass for it; the app's owner may read these (lib/lab/owner.ts), as only they have the strategy pages.
export async function GET(_request: Request, {params}: {params: Promise<{slug: string}>}) {
    if (!(await getOwnerUserId())) {
        return NextResponse.json({error: 'Not authenticated'}, {status: 401});
    }

    const {slug} = await params;
    const ledger = await getStrategyLedger(slug);
    if (!ledger) {
        return NextResponse.json({error: 'Strategy not found'}, {status: 404});
    }

    return new NextResponse(tradesCsv(ledger.trades), {
        headers: csvDownloadHeaders(tradesCsvFilename(ledger.def.id, getEasternDateString())),
    });
}
