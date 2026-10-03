import type {Metadata} from "next";
import Link from "next/link";
import {requireUserId} from "@/lib/auth/session";
import {readGameSummary} from "@/lib/games/store";
import {ARCHIVE_COPY, MARKET_COPY} from "@/lib/learn/copy/games";
import MarketMakingGame from "@/components/games/MarketMakingGame";
import WhatTheseMean from "@/components/learn/WhatTheseMean";
import PageTitle from "@/components/primitives/PageTitle";
import Panel from "@/components/primitives/Panel";

export const metadata: Metadata = {title: "Market making"};

// The market-making game: the game runs in the browser from a seed, and the server replays its quotes to
// keep the profit and loss. The page reads the reader's record and last games.
const MarketMakingPage = async () => {
    const userId = await requireUserId();
    const summary = await readGameSummary(userId, 'market-making', 'market-making');

    return (
        <div className="mx-auto max-w-3xl space-y-4" data-game-page="market-making">
            <Link href="/games" className="label-type text-xs text-brand hover:underline">← {ARCHIVE_COPY.back}</Link>
            <PageTitle title={MARKET_COPY.title} subtitle={MARKET_COPY.subtitle}/>
            <Panel pad={6}>
                <MarketMakingGame summary={summary}/>
                <WhatTheseMean id="market-making-terms" keys={['fair-value', 'bid-ask-spread', 'adverse-selection']}/>
            </Panel>
        </div>
    );
};

export default MarketMakingPage;
