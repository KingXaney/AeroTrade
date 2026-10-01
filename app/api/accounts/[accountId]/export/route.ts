import {headers} from "next/headers";
import {NextResponse} from "next/server";
import {auth} from "@/lib/better-auth/auth";
import PaperTrade from "@/database/models/paper-trade.model";
import {epochTrades, getOwnedAccount} from "@/lib/trading/account";
import {csvField} from "@/lib/trading/csv";

const slugify = (name: string): string =>
    name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'strategy';

// Full trade history of one strategy account's current epoch as a CSV download. Deliberately
// bypasses getTradeHistory's 50-row cap — exports are complete by definition — but not the
// epoch: rows from before the account's inceptionAt (a reset that crashed before deleting
// them) are no more this account's than they are on /portfolio.
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

    const trades = await PaperTrade.find(epochTrades(userId, String(account._id), account.inceptionAt)).sort({createdAt: 1, _id: 1}).lean();

    const header = ['date', 'symbol', 'company', 'side', 'quantity', 'price', 'total', 'realized_pnl', 'source', 'reason'];
    const rows = trades.map((t) => [
        new Date(t.createdAt).toISOString(),
        t.symbol,
        t.company || t.symbol,
        t.side,
        t.quantity,
        t.price,
        t.total,
        typeof t.realizedPnl === 'number' ? t.realizedPnl : '',
        t.source ?? '',   // blank = placed before the field existed; not reconstructable, so not guessed
        t.reason ?? '',   // the learner's own note or an automated caller's reason; csvField neutralises formulas
    ].map(csvField).join(','));
    const csv = [header.map(csvField).join(','), ...rows].join('\n') + '\n';

    return new NextResponse(csv, {
        headers: {
            'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition': `attachment; filename="${slugify(account.name || 'strategy')}-trades.csv"`,
        },
    });
}
