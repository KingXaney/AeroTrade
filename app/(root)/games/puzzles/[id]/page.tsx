import type {Metadata} from "next";
import Link from "next/link";
import {notFound, redirect} from "next/navigation";
import {requireUserId} from "@/lib/auth/session";
import {getEasternDateString} from "@/lib/dates";
import {contextFor} from "@/lib/games/puzzles";
import {getArchivePuzzle} from "@/lib/games/store";
import {ARCHIVE_COPY, PUZZLE_CATEGORY_LABEL, PUZZLE_COPY, PUZZLE_DIFFICULTY_LABEL} from "@/lib/learn/copy/games";
import PuzzleSolver from "@/components/games/PuzzleSolver";
import PageTitle from "@/components/primitives/PageTitle";
import Panel from "@/components/primitives/Panel";

type Props = {params: Promise<{id: string}>};

// A puzzle not yet posted has no page, and no title in the tab either.
export const generateMetadata = async ({params}: Props): Promise<Metadata> =>
    ({title: contextFor((await params).id, getEasternDateString())?.puzzle.title ?? ARCHIVE_COPY.title});

// One archive puzzle. Today's puzzle has its own page, where a solve counts toward the streak,
// so its archive address goes there.
const ArchivePuzzlePage = async ({params}: Props) => {
    const userId = await requireUserId();
    const {id} = await params;
    if (contextFor(id, getEasternDateString())?.day) redirect('/games/puzzle');
    const view = await getArchivePuzzle(userId, id);
    if (!view) notFound();

    return (
        <div className="mx-auto max-w-3xl space-y-4" data-puzzle-page="archive">
            <Link href="/games/puzzles" className="label-type text-xs text-brand hover:underline">← {ARCHIVE_COPY.title}</Link>
            <PageTitle
                title={view.puzzle.title}
                subtitle={`${PUZZLE_COPY.number(view.puzzle.number)} · ${PUZZLE_CATEGORY_LABEL[view.puzzle.category]} · ${PUZZLE_DIFFICULTY_LABEL[view.puzzle.difficulty]}`}
            />
            <Panel pad={6}>
                <PuzzleSolver key={view.puzzle.id} puzzle={view.puzzle} daily={false} initial={view.progress}/>
            </Panel>
            <p className="text-xs leading-relaxed text-fg-muted">{PUZZLE_COPY.archiveRule}</p>
        </div>
    );
};

export default ArchivePuzzlePage;
