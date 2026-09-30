import {headers} from "next/headers";
import {NextResponse} from "next/server";
import {auth} from "@/lib/better-auth/auth";
import {getStrategyLedger} from "@/lib/strategies/queries";
import {csvDownloadHeaders, tradesCsv, tradesCsvFilename} from "@/lib/trading/csv";
import {getEasternDateString} from "@/lib/utils";

// One quant strategy's live fills as a CSV download: its system account's current epoch, in
// the account export's columns (tradesCsv), named for the strategy and the Eastern date. The
// account belongs to the sentinel owner, so the account export's ownership check can never
// pass for it; any signed-in user may read these, as every strategy page shows them.
export async function GET(_request: Request, {params}: {params: Promise<{slug: string}>}) {
    const session = await auth.api.getSession({headers: await headers()});
    if (!session?.user?.id) {
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
