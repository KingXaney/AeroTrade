"use client"

import {useEffect, useRef, useState, useTransition} from "react";
import {useRouter} from "next/navigation";
import {toast} from "sonner";
import {CommandDialog, CommandInput, CommandItem, CommandList} from "@/components/ui/command";
import {Button} from "@/components/ui/button";
import {BookOpen, Loader2, Search, Sparkles, TrendingUp} from "lucide-react";
import {searchStocks} from "@/lib/actions/stocks.actions";
import {createTopic} from "@/lib/actions/topics.actions";
import {NAME_MAX} from "@/lib/topics/config";
import {useDebounce} from "@/hooks/useDebounce";
import {searchGlossaryFor} from "@/lib/learn/where";
import {NAV_PAGES, searchPages, type NavDestination} from "@/lib/shell/navigation";
import {paletteRows, type StockAnswer} from "@/lib/shell/palette";
import type {Stock} from '@/lib/stocks/types';
import type {TopicLink} from '@/lib/topics/types';

type SearchCommandProps = {
    renderAs?: 'button' | 'text';
    label?: string;
    initialStocks: Stock[];
    initialTopics?: TopicLink[];   // followed topics, so ⌘K opens instead of duplicating
    pages?: readonly NavDestination[];   // the audience's pages (navPagesFor); the full registry by default
    owner?: boolean;   // the owner (lib/lab/owner.ts): the Learn rows then reach the terms homed on the owner's pages too
};

export default function SearchCommand({
    renderAs = 'button',
    label = 'Add stock',
    initialStocks,
    initialTopics = [],
    pages = NAV_PAGES,
    owner = false,
}: SearchCommandProps) {
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");
    // The stock search's newest answer and the query it answered for. Rows are drawn from it only
    // while that is the query in the box: Enter runs the selected row, so an earlier query's
    // stocks must never stand in for this one's (lib/shell/palette.ts).
    const [answer, setAnswer] = useState<StockAnswer<Stock> | null>(null);
    const asked = useRef(0);
    const [following, startFollow] = useTransition();

    const rows = paletteRows({term: searchTerm, answer, popular: initialStocks, topicMax: NAME_MAX});
    const isSearchMode = !!rows.query;

    // "Follow topic" row: any query long enough to be a subject. If it names a
    // topic the user already follows, open that instead of creating a duplicate.
    const topicQuery = rows.query;
    const existingTopic = rows.topic !== 'none' ? initialTopics.find((t) => t.name.toLowerCase() === topicQuery.toLowerCase()) : undefined;
    // Glossary rows are matched client-side against a pure registry: no request, no key. Only the
    // entries the reader's /glossary renders (glossaryGroupsFor), so no row opens a missing anchor.
    const learnHits = searchGlossaryFor(topicQuery, 4, {owner});
    // Pages are matched the same way, against the navigation registry: with the rail showing
    // icons only, the palette is also how a page is reached by name.
    const pageHits = searchPages(topicQuery, 4, pages);

    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
                e.preventDefault();
                setOpen((v) => !v);
            }
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, []);

    // Asks for the query in the box when the debounce fires. An answer that comes back after a
    // newer search was asked is dropped, so a slow reply never takes the newer one's place.
    const handleSearch = async () => {
        const query = rows.query;
        if (!query) return;

        const request = ++asked.current;
        let stocks: Stock[];
        try {
            stocks = (await searchStocks(query)) ?? [];
        } catch {
            stocks = [];
        }
        if (request === asked.current) setAnswer({query, stocks});
    };

    const debouncedSearch = useDebounce(handleSearch, 300);

    useEffect(() => {
        debouncedSearch();
    }, [searchTerm, debouncedSearch]);

    const closePalette = () => {
        setOpen(false);
        setSearchTerm("");
        setAnswer(null);
    };

    const goTo = (href: string) => {
        closePalette();
        router.push(href);
    };

    const handleFollowTopic = () => {
        const name = topicQuery;
        startFollow(async () => {
            const result = await createTopic({name});
            if (!result.success || !result.topic) {
                toast.error(result.message ?? 'Could not follow this topic');
                return;
            }
            toast.success(`Following "${result.topic.name}"`);
            closePalette();
            router.push(`/topics/${result.topic.slug}`);
        });
    };

    return (
        <>
            {renderAs === 'text' ? (
                // Was a bare <span onClick> — Tab skipped it and screen readers announced
                // it as inert text. The ⌘K hint is the only place the shortcut is advertised.
                <button type="button" onClick={() => setOpen(true)} aria-label={label}
                        className="search-text inline-flex h-9 w-9 shrink-0 items-center justify-center gap-2 rounded-lg border border-line-strong/30 bg-surface-0/60 text-sm transition-colors md:w-full md:max-w-md md:shrink md:justify-start md:px-3">
                    <Search className="size-4 opacity-70 shrink-0" aria-hidden="true"/>
                    <span className="hidden md:inline flex-1 truncate text-left text-fg-muted">{label}</span>
                    <kbd className="hidden md:inline text-[10px] px-1.5 py-0.5 rounded border border-line-strong/40 text-fg-muted font-mono">⌘K</kbd>
                </button>
            ) : (
                <Button onClick={() => setOpen(true)} className="search-btn">
                    {label}
                </Button>
            )}
            {/* Hits come pre-filtered from searchStocks, so cmdk's own substring filter
                must be off — otherwise a typed query is filtered twice and valid results
                silently disappear. */}
            <CommandDialog open={open} onOpenChange={setOpen} className="search-dialog" shouldFilter={false}>
                <div className="search-field">
                    <CommandInput
                        value={searchTerm}
                        onValueChange={setSearchTerm}
                        placeholder="Search stocks, a page, a term to learn, or a topic to follow..."
                        className="search-input"
                    />
                    {rows.searching && <Loader2 className="search-loader" />}
                </div>
                <CommandList className="search-list">
                    {pageHits.length > 0 && (
                        <>
                            <div className="search-count">Pages</div>
                            {pageHits.map((page) => (
                                <CommandItem
                                    key={page.href}
                                    value={`page-${page.href}`}
                                    onSelect={() => goTo(page.href)}
                                    className="search-item-link"
                                    data-page-hit={page.href}
                                >
                                    <span className="material-symbols-outlined text-base text-brand" aria-hidden="true">{page.icon}</span>
                                    <div className="flex-1">
                                        <div className="search-item-name">{page.label}</div>
                                        {/* The section under a tab's name; under a section's own name, the tab it opens on ("Markets" / "Trade"). */}
                                        {(page.section !== page.label || page.tab !== page.label) && (
                                            <div className="text-sm text-fg-muted font-mono" style={{fontSize: '11px', letterSpacing: '0.02em'}}>
                                                {page.section !== page.label ? page.section : page.tab}
                                            </div>
                                        )}
                                    </div>
                                </CommandItem>
                            ))}
                        </>
                    )}
                    {learnHits.length > 0 && (
                        <>
                            <div className="search-count">Learn</div>
                            {learnHits.map((entry) => (
                                <CommandItem
                                    key={entry.key}
                                    value={`learn-${entry.key}`}
                                    onSelect={() => goTo(`/glossary#${entry.key}`)}
                                    className="search-item-link"
                                    data-learn-hit={entry.key}
                                >
                                    <BookOpen className="h-4 w-4 text-brand" />
                                    <div className="flex-1">
                                        <div className="search-item-name">{entry.term}</div>
                                        <div className="text-sm text-fg-muted font-mono" style={{fontSize: '11px', letterSpacing: '0.02em'}}>
                                            {entry.short}
                                        </div>
                                    </div>
                                </CommandItem>
                            ))}
                        </>
                    )}
                    {/* Stocks before the topic row: cmdk selects the first row that can be run, and
                        Enter runs it. While the search for this query is out there is no stock row
                        at all — a plain line where "No stocks found" would stand, since cmdk's Empty
                        shows only when no row is mounted and the waiting topic row is one. */}
                    {rows.searching ? (
                        <div className="search-list-indicator">Loading stocks...</div>
                    ) : rows.stocks.length === 0 ? (
                        <div className="search-list-indicator">
                            {isSearchMode ? 'No stocks found' : 'No stocks available'}
                        </div>
                    ) : (
                        <>
                            <div className="search-count">
                                {isSearchMode ? 'Stocks' : 'Popular stocks'}
                                {` `}({rows.stocks.length})
                            </div>
                            {rows.stocks.map((stock) => (
                                <CommandItem
                                    key={stock.symbol}
                                    value={stock.symbol}
                                    onSelect={() => goTo(`/stocks/${stock.symbol}`)}
                                    className="search-item-link"
                                    data-stock-hit={stock.symbol}
                                >
                                    <TrendingUp className="h-4 w-4 text-brand-dim" />
                                    <div className="flex-1">
                                        <div className="search-item-name">
                                            {stock.name}
                                        </div>
                                        <div className="text-sm text-fg-muted font-mono"
                                             style={{ fontSize: '11px', letterSpacing: '0.02em' }}>
                                            {stock.symbol} | {stock.exchange} | {stock.type}
                                        </div>
                                    </div>
                                </CommandItem>
                            ))}
                        </>
                    )}
                    {/* The topic row is last, and waits (disabled) until the stock search has answered:
                        following is a write, so it is Enter's row only when nothing else was found. */}
                    {rows.topic !== 'none' && (
                        <>
                            <div className="search-count">Topics</div>
                            {/* Keyed on waiting/ready. cmdk selects a row after a keystroke, or when one
                                mounts with nothing selected — never when a row stops being disabled.
                                The remount is what makes this row Enter's when the search found nothing. */}
                            <CommandItem
                                key={rows.topic}
                                value={`topic-${topicQuery}`}
                                disabled={following || rows.topic === 'waiting'}
                                onSelect={existingTopic
                                    ? () => goTo(`/topics/${existingTopic.slug}`)
                                    : handleFollowTopic}
                                className="search-item-link"
                                data-topic-row={rows.topic}
                            >
                                {following
                                    ? <Loader2 className="h-4 w-4 animate-spin text-brand"/>
                                    : <Sparkles className="h-4 w-4 text-brand"/>}
                                <div className="flex-1">
                                    <div className="search-item-name">
                                        {existingTopic ? `Open topic: ${existingTopic.name}` : `Follow topic: “${topicQuery}”`}
                                    </div>
                                    <div className="text-sm text-fg-muted font-mono" style={{fontSize: '11px', letterSpacing: '0.02em'}}>
                                        {existingTopic ? 'You already follow this' : 'News about anything — markets, tech, politics, sport'}
                                    </div>
                                </div>
                            </CommandItem>
                        </>
                    )}
                </CommandList>
            </CommandDialog>
        </>
    );
}
