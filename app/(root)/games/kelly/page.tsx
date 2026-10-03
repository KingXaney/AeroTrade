import type {Metadata} from "next";
import Link from "next/link";
import {requireUserId} from "@/lib/auth/session";
import {readGameSummary} from "@/lib/games/store";
import {ARCHIVE_COPY, KELLY_COPY} from "@/lib/learn/copy/games";
import KellyGame from "@/components/games/KellyGame";
import WhatTheseMean from "@/components/learn/WhatTheseMean";
import PageTitle from "@/components/primitives/PageTitle";
import Panel from "@/components/primitives/Panel";

export const metadata: Metadata = {title: "Kelly coin"};

// The Kelly coin game: the game runs in the browser from a seed, and the server replays its bets to keep
// the score. The page reads the reader's record and last games.
const KellyPage = async () => {
    const userId = await requireUserId();
    const summary = await readGameSummary(userId, 'kelly', 'kelly');

    return (
        <div className="mx-auto max-w-3xl space-y-4" data-game-page="kelly">
            <Link href="/games" className="label-type text-xs text-brand hover:underline">← {ARCHIVE_COPY.back}</Link>
            <PageTitle title={KELLY_COPY.title} subtitle={KELLY_COPY.subtitle}/>
            <Panel pad={6}>
                <KellyGame summary={summary}/>
                <WhatTheseMean id="kelly-terms" keys={['kelly-criterion']}/>
            </Panel>
        </div>
    );
};

export default KellyPage;
