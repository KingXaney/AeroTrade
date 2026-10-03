import type {Metadata} from "next";
import Link from "next/link";
import {requireUserId} from "@/lib/auth/session";
import {readGameSummary} from "@/lib/games/store";
import {ARCHIVE_COPY, CORRELATION_COPY} from "@/lib/learn/copy/games";
import CorrelationGame from "@/components/games/CorrelationGame";
import WhatTheseMean from "@/components/learn/WhatTheseMean";
import PageTitle from "@/components/primitives/PageTitle";
import Panel from "@/components/primitives/Panel";

export const metadata: Metadata = {title: "Guess the correlation"};

// Guess the correlation: the plots come from a seed, and the server replays the guesses to keep the score
// (the average miss, lower being the record). The page reads the reader's record and last games.
const CorrelationPage = async () => {
    const userId = await requireUserId();
    const summary = await readGameSummary(userId, 'correlation', 'correlation');

    return (
        <div className="mx-auto max-w-3xl space-y-4" data-game-page="correlation">
            <Link href="/games" className="label-type text-xs text-brand hover:underline">← {ARCHIVE_COPY.back}</Link>
            <PageTitle title={CORRELATION_COPY.title} subtitle={CORRELATION_COPY.subtitle}/>
            <Panel pad={6}>
                <CorrelationGame summary={summary}/>
                <WhatTheseMean id="correlation-terms" keys={['correlation']}/>
            </Panel>
        </div>
    );
};

export default CorrelationPage;
