import {NextResponse} from "next/server";
import {getSessionUser} from "@/lib/auth/session";
import {getAccountExport} from "@/lib/trading/ledger";
import {csvDownloadHeaders, tradesCsv, tradesCsvFilename} from "@/lib/trading/csv";

// Full trade history of one paper account's current epoch as a CSV download, read by
// getAccountExport (the whole epoch, not the trade log's page). The rows are written by
// tradesCsv, which the quant strategies' export (/api/strategies/[slug]/export) shares.
export async function GET(request: Request, {params}: {params: Promise<{accountId: string}>}) {
    const userId = (await getSessionUser())?.id;
    if (!userId) {
        return NextResponse.json({error: 'Not authenticated'}, {status: 401});
    }

    const {accountId} = await params;
    const exported = await getAccountExport(userId, accountId);
    if (!exported) {
        return NextResponse.json({error: 'Account not found'}, {status: 404});
    }

    return new NextResponse(tradesCsv(exported.trades), {
        headers: csvDownloadHeaders(tradesCsvFilename(exported.name || 'account')),
    });
}
