import {headers} from "next/headers";
import {NextResponse} from "next/server";
import {auth} from "@/lib/better-auth/auth";
import PaperTrade from "@/database/models/paper-trade.model";
import {epochTrades, getOwnedAccount} from "@/lib/trading/account";
import {csvDownloadHeaders, tradesCsv, tradesCsvFilename, type CsvTrade} from "@/lib/trading/csv";

// Full trade history of one strategy account's current epoch as a CSV download. Deliberately
// bypasses getTradeHistory's 50-row cap — exports are complete by definition — but not the
// epoch: rows from before the account's inceptionAt (a reset that crashed before deleting
// them) are no more this account's than they are on /portfolio. The rows are written by
// tradesCsv, which the quant strategies' export (/api/strategies/[slug]/export) shares.
export async function GET(request: Request, {params}: {params: Promise<{accountId: string}>}) {
    const session = await auth.api.getSession({headers: await headers()});
    const userId = session?.user?.id;
    if (!userId) {
        return NextResponse.json({error: 'Not authenticated'}, {status: 401});
    }

    const {accountId} = await params;
    const account = await getOwnedAccount(userId, accountId);
    if (!account) {
        return NextResponse.json({error: 'Account not found'}, {status: 404});
    }

    const trades = await PaperTrade.find(epochTrades(userId, String(account._id), account.inceptionAt)).sort({createdAt: 1, _id: 1}).lean<CsvTrade[]>();

    return new NextResponse(tradesCsv(trades), {
        headers: csvDownloadHeaders(tradesCsvFilename(account.name || 'strategy')),
    });
}
