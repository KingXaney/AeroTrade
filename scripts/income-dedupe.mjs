// The income ledger's repair, pure: an AccountIncome row is one credit, keyed by account, epoch,
// kind, date and symbol. In August and September 2026, before the unique index on that key
// existed in production, two runs of the income job could both insert a day's rows (preview
// deployments ran every cron against production until 2026-10-05), and the run that won the
// watermark then credited every row it found, copies included. This plans the undoing for one
// account: which rows are copies, what removing them takes off its cash and income totals, and
// what each snapshot that counted them loses.
// Plain JS with no imports: scripts/migrate-multi-account.mjs runs it under node, and
// lib/__tests__/income-dedupe.test.ts holds it.

// Within this, a rebuilt cash balance agrees with the stored one (lib/income/accrual CASH_TOLERANCE).
export const CASH_TOLERANCE = 0.01;

export const incomeRowKey = (row) => [row.accountId, row.epoch, row.kind, row.date, row.symbol ?? ''].join('|');

// The first row written keeps the key: the oldest createdAt, then the smaller id.
const firstWritten = (a, b) => {
    const at = new Date(a.createdAt ?? 0).getTime() - new Date(b.createdAt ?? 0).getTime();
    return at !== 0 ? at : String(a._id).localeCompare(String(b._id));
};

const round2 = (value) => Math.round(value * 100) / 100;

// rows: every AccountIncome row of the account, any epoch.
// account: {epoch (ms), incomeThrough ('YYYY-MM-DD' | null), cash, startingBalance}.
// tradeCash: Σ of the epoch's trades' cash effects (a sell's total in, a buy's total out).
// snapshots: the account's AccountSnapshot rows {_id, date, epoch?, incomeThrough?}.
export const planIncomeDedupe = ({rows, account, tradeCash, snapshots}) => {
    const byKey = new Map();
    for (const row of rows) {
        const key = incomeRowKey(row);
        const group = byKey.get(key) ?? [];
        group.push(row);
        byKey.set(key, group);
    }
    const copies = [];
    let distinctCredited = 0;
    for (const group of byKey.values()) {
        group.sort(firstWritten);
        copies.push(...group.slice(1));
        const kept = group[0];
        if (kept.epoch === account.epoch && account.incomeThrough !== null && kept.date <= account.incomeThrough) {
            distinctCredited += kept.amount;
        }
    }

    // Only the account's current epoch, dated on or before its watermark, can have reached its
    // cash: the job credits nothing past incomeThrough, and a reset deletes the old epoch's rows.
    const inWindow = copies.filter((row) => row.epoch === account.epoch && account.incomeThrough !== null && row.date <= account.incomeThrough);
    const expectedCash = account.startingBalance + tradeCash + distinctCredited;
    const agrees = (cash) => Math.abs(cash - expectedCash) <= CASH_TOLERANCE;
    const copiesTotal = inWindow.reduce((sum, row) => sum + row.amount, 0);

    // Which books does the account keep? The job before this repair credited every row it found,
    // copies included ('credited'); the job after it counts each key once, so a copy written
    // since has reached neither cash nor any snapshot ('uncredited'). Neither: something else is
    // wrong with the account, and nothing is applied.
    const mode = agrees(account.cash - copiesTotal) ? 'credited' : agrees(account.cash) ? 'uncredited' : null;
    const credited = mode === 'credited' ? inWindow : [];
    const interest = credited.filter((row) => row.kind === 'interest').reduce((sum, row) => sum + row.amount, 0);
    const dividends = credited.filter((row) => row.kind === 'dividend').reduce((sum, row) => sum + row.amount, 0);
    const total = interest + dividends;

    // A snapshot's cash holds every row of its epoch dated on or before its own incomeThrough.
    const snapshotFixes = [];
    for (const snapshot of snapshots) {
        if (!snapshot.incomeThrough) continue;
        if (snapshot.epoch !== undefined && snapshot.epoch !== null && snapshot.epoch !== account.epoch) continue;
        const delta = credited.filter((row) => row.date <= snapshot.incomeThrough).reduce((sum, row) => sum + row.amount, 0);
        if (delta !== 0) snapshotFixes.push({_id: snapshot._id, date: snapshot.date, delta});
    }

    return {
        remove: copies.map((row) => row._id),
        copies: copies.length,
        mode,
        credited: {interest: round2(interest), dividends: round2(dividends), total: round2(total), exact: {interest, dividends, total}},
        snapshots: snapshotFixes,
        cashAfter: account.cash - total,
        expectedCash,
        reconciles: mode !== null,
    };
};
