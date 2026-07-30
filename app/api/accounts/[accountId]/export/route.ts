import {headers} from "next/headers";
import {NextResponse} from "next/server";
import {auth} from "@/lib/better-auth/auth";
import PaperTrade from "@/database/models/paper-trade.model";
import {getOwnedAccount} from "@/lib/trading/account";

// RFC 4180 quoting: wrap in quotes when the value contains a comma, quote or newline.
const csvField = (value: string | number): string => {
    const s = String(value);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const slugify = (name: string): string =>
    name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'strategy';

// Full trade history of one strategy account as a CSV download. Deliberately
// bypasses getTradeHistory's 50-row cap — exports are complete by definition.
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

    const trades = await PaperTrade.find({accountId: String(account._id)}).sort({createdAt: 1}).lean();

    const header = ['date', 'symbol', 'company', 'side', 'quantity', 'price', 'total', 'realized_pnl'];
    const rows = trades.map((t) => [
        new Date(t.createdAt).toISOString(),
        t.symbol,
        t.company || t.symbol,
        t.side,
        t.quantity,
        t.price,
        t.total,
        typeof t.realizedPnl === 'number' ? t.realizedPnl : '',
    ].map(csvField).join(','));
    const csv = [header.join(','), ...rows].join('\n') + '\n';

    return new NextResponse(csv, {
        headers: {
            'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition': `attachment; filename="${slugify(account.name || 'strategy')}-trades.csv"`,
        },
    });
}
