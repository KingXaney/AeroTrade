import Link from "next/link";
import {cn, getChangeColorClass} from "@/lib/utils";
import FollowTopicButton from "@/components/topics/FollowTopicButton";

// Lower-cased topic name -> the user's topic; only the /brain page passes it.
export type FollowedByName = Record<string, {id: string; slug: string}>;

// A ticker's symbol is a useful match term; a theme's internal key is not.
const topicKeywords = (e: BrainEntitySummary): string[] => (e.type === 'ticker' ? [e.displayName, e.key] : [e.displayName]);

const TypeColumn = ({title, entities, followedByName}: {title: string; entities: BrainEntitySummary[]; followedByName?: FollowedByName}) => (
    <div>
        <h3 className="text-[10px] uppercase tracking-[0.14em] text-fg-muted mb-2" style={{fontFamily: 'var(--type-mono)'}}>
            {title}
        </h3>
        {entities.length === 0 ? (
            <p className="text-xs text-fg-muted">Nothing yet</p>
        ) : (
            <div className="space-y-1">
                {entities.map((e) => (
                    // The row used to be one <Link> with the follow <button> nested inside it —
                    // invalid markup, and the two fought over the click. Now the name is the
                    // link and the button is its sibling.
                    <div key={e.key}
                         className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg border bg-surface-2/40 border-line-strong/20 hover:border-brand/30 transition-colors">
                        <Link href={`/brain?entity=${encodeURIComponent(e.key)}#evidence`}
                              className="text-xs font-semibold text-fg hover:text-brand truncate max-w-[55%]" style={{fontFamily: 'var(--type-mono)'}}>
                            {e.displayName}
                            {e.thesisSince !== null && <span className="ml-1 text-brand">●</span>}
                        </Link>
                        <span className="flex items-center gap-1 text-[11px]" style={{fontFamily: 'var(--type-mono)'}}>
                            <span className="text-fg-soft">{e.weightSlow.toFixed(1)}</span>{' '}
                            <span className={cn(getChangeColorClass(e.sentimentSlow || undefined))}>
                                {e.sentimentSlow >= 0 ? '+' : ''}{e.sentimentSlow.toFixed(2)}
                            </span>
                            {followedByName && (
                                <FollowTopicButton name={e.displayName} keywords={topicKeywords(e)}
                                                   followed={followedByName[e.displayName.toLowerCase()] ?? null} className="size-6" />
                            )}
                        </span>
                    </div>
                ))}
            </div>
        )}
    </div>
);

// Slow-layer leaderboard per entity type. The cyan dot marks an active thesis.
const NarrativeLeaderboard = ({entities, followedByName}: {entities: Record<BrainEntityType, BrainEntitySummary[]>; followedByName?: FollowedByName}) => (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <TypeColumn title="Themes" entities={entities.theme} followedByName={followedByName} />
        <TypeColumn title="Sectors" entities={entities.sector} followedByName={followedByName} />
        <TypeColumn title="Tickers" entities={entities.ticker} followedByName={followedByName} />
    </div>
);

export default NarrativeLeaderboard;
