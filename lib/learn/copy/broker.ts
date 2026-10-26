// Every sentence of the Alpaca link (Settings › Broker, its actions, the sync's summaries).
// Pure; held to the 'copy' tier by lib/learn/__tests__/broker-copy.test.ts — the mirror copies an
// automated strategy's paper holdings and the page describes what it did, never what to do.

import {MIRROR_DRIFT_BAND, MIRROR_MAX_ORDERS, MIRROR_MIN_ORDER_DOLLARS} from "@/lib/broker/config";
import type {MirrorSkip} from "@/lib/broker/plan";

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

export const BROKER_COPY = {
    sectionLabel: 'Broker',
    lead: 'Mirror one of your paper accounts into your Alpaca account: each sync sizes the Alpaca account to the same holdings, by weight, at Alpaca\'s own prices and fills.',
    disclaimer: 'An experiment that copies an automated strategy\'s paper holdings into a brokerage account — not financial advice.',

    // The connection.
    connectionHeading: 'Alpaca',
    paperBadge: 'Paper',
    liveBadge: 'Live — real money',
    liveWarning: 'This is a live account: its orders spend real money.',
    noKeys: 'Not connected. The server needs your Alpaca paper keys in its environment (ALPACA_API_KEY_ID and ALPACA_API_SECRET_KEY); the page connects on the next load.',
    liveLocked: 'Live trading is locked: ALPACA_MODE says live, but ALPACA_LIVE_ENABLED is not yes, so nothing is sent.',
    accountLine: (last4: string, status: string): string => `Account ••••${last4} · ${status.toLowerCase()}`,
    unreachable: (message: string): string => `Alpaca did not answer: ${message}`,
    equity: 'Equity',
    cash: 'Cash',
    buyingPower: 'Buying power',

    // The link.
    linkHeading: 'Mirrored account',
    linkLead: 'The paper account the Alpaca account follows, one at a time; the brains keep trading it as before.',
    selectLabel: 'Paper account to mirror',
    linkButton: 'Link',
    relinkButton: 'Mirror this account instead',
    linkedLine: (name: string, since: string): string => `Mirroring ${name} since ${since}`,
    tradedBy: (who: string): string => `traded by ${who}`,
    pausedLine: 'Paused: the weekday sync passes this link by until it is resumed.',
    syncNow: 'Sync now',
    pause: 'Pause',
    resume: 'Resume',
    unlink: 'Unlink',
    unlinkNote: 'Unlinking stops the syncs; the Alpaca account keeps what it holds.',
    schedule: `Synced weekdays at 11:15 ET, after the brains' Monday runs. Outside market hours a sync only previews. A difference under $${MIRROR_MIN_ORDER_DOLLARS} or ${MIRROR_DRIFT_BAND * 100}% of equity is left alone; at most ${MIRROR_MAX_ORDERS} orders a sync.`,
    noAccounts: 'No paper account to mirror yet.',

    // The comparison, the syncs and Alpaca's orders.
    comparisonHeading: 'Weights: your paper account and Alpaca',
    symbolColumn: 'Symbol',
    paperColumn: 'Paper',
    alpacaColumn: 'Alpaca',
    syncsHeading: 'Last syncs',
    noSyncs: 'No sync yet.',
    ordersHeading: 'Alpaca\'s recent orders',
    noOrders: 'No order at Alpaca yet.',
    previewBadge: 'Preview — nothing sent',
    skippedBadge: 'Skipped',
    alreadySent: 'already sent today',
    skipReason: {
        'not-tradable': 'Alpaca cannot trade it',
        'no-asset': 'unknown to Alpaca',
        'no-price': 'no price to size whole shares',
        'under-one-share': 'under one share',
        'over-cap': 'past the order cap',
    } satisfies Record<MirrorSkip['reason'], string>,

    // The sync's notes and summary line (the page's rows and the job's stamp).
    noteNoKeys: 'no Alpaca keys on the server',
    noteLiveLocked: 'live trading is locked',
    noteSourceMissing: 'the mirrored paper account is gone',
    noteClosed: 'the market is closed',
    noteBlocked: (status: string): string => `the Alpaca account cannot trade (${status.toLowerCase()})`,
    summary: ({kind, note, planned = 0, sent = 0, failed = 0, skipped = 0}: {kind: 'executed' | 'preview' | 'skipped'; note?: string; planned?: number; sent?: number; failed?: number; skipped?: number}): string => {
        if (kind === 'skipped') return `Alpaca mirror skipped: ${note ?? 'nothing to read'}`;
        const aside = skipped > 0 ? `; ${plural(skipped, 'symbol', 'symbols')} left out` : '';
        if (planned === 0) return `Alpaca mirror: in line with the paper account, nothing to send${aside}`;
        if (kind === 'preview') return `Alpaca mirror: ${plural(planned, 'order', 'orders')} planned, none sent${note ? ` (${note})` : ''}${aside}`;
        return `Alpaca mirror: ${plural(sent, 'order', 'orders')} sent${failed > 0 ? `, ${failed} refused` : ''}${aside}`;
    },
    jobLine: (links: number, lines: readonly string[]): string =>
        links === 0 ? 'Broker mirror: no active link' : `Broker mirror: ${lines.join(' · ')}`,

    // The actions' answers.
    linkedToast: 'Linked. The next sync mirrors this account.',
    pausedToast: 'Paused. The weekday sync passes this link by.',
    resumedToast: 'Resumed. The next weekday sync mirrors it again.',
    unlinkedToast: 'Unlinked. The Alpaca account keeps what it holds.',
    notSignedIn: 'Sign in first.',
    notOwner: 'Only the owner can link Alpaca.',
    invalid: 'That request could not be read.',
    tooFast: 'That was a lot of requests at once — wait a moment.',
    notSaved: 'That did not save. Try again.',
    notYours: 'That account is not one of yours.',
    noLink: 'No account is linked.',
} as const;
