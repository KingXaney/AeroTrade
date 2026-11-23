"use client"

import {useEffect, useRef, useState, useTransition} from "react";
import {useRouter} from "next/navigation";
import {toast} from "sonner";
import {CommandDialog, CommandInput, CommandItem, CommandList} from "@/components/ui/command";
import {Button} from "@/components/ui/button";
import {BookOpen, Loader2, Search, Sparkles} from "lucide-react";
import StockHit from "@/components/stocks/StockHit";
import {searchStocks} from "@/lib/actions/stocks.actions";
import {createTopic} from "@/lib/actions/topics.actions";
import {NAME_MAX} from "@/lib/topics/config";
import {useDebounce} from "@/hooks/useDebounce";
import {SHELL_COPY} from "@/lib/learn/copy/shell";
import type {searchGlossaryFor} from "@/lib/learn/where";
import {NAV_PAGES, searchPages, type NavDestination} from "@/lib/shell/navigation";
import {paletteRows, type StockAnswer} from "@/lib/shell/palette";
import type {Stock} from '@/lib/stocks/types';
import type {TopicLink} from '@/lib/topics/types';

// ⌘K's Learn rows are matched against the glossary: 120 KB of definitions that no page needs
// until the palette is open (lib/shell/__tests__/first-load.test.ts keeps it out of the shell's
// own bundle). So it is fetched then — at the trigger's first hover, focus or touch, and when
// the palette opens — once for the page's life. Until it lands the palette draws its other rows
// and the topic row waits (lib/shell/palette.ts); if it cannot be fetched, the palette goes on
// without Learn rows.
type GlossarySearch = typeof searchGlossaryFor;
let glossarySearch: Promise<GlossarySearch> | null = null;
const loadGlossarySearch = (): Promise<GlossarySearch> =>
    (glossarySearch ??= import("@/lib/learn/where").then((mod) => mod.searchGlossaryFor, (error: unknown) => {
        glossarySearch = null;   // a dropped connection: the next open asks again
        throw error;
    }));
const preloadGlossary = () => { void loadGlossarySearch().catch(() => undefined); };

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
    // The text an Enter was pressed on while its stock search was out. A ticker typed and entered
    // in one go would otherwise run nothing: no row can be run until the search answers. The
    // answer then opens the first stock it found — a stock only, never the topic row, which is a
    // write and is not run by a key pressed before it could be read.
    const enterKept = useRef<string | null>(null);
    const [following, startFollow] = useTransition();

    // Glossary rows are matched client-side against a pure registry: no request, no key. Only the
    // entries the reader's /glossary renders (glossaryGroupsFor), so no row opens a missing anchor.
    const [glossary, setGlossary] = useState<GlossarySearch | 'unavailable' | null>(null);
    useEffect(() => {
        if (!open || glossary) return;
        let current = true;
        loadGlossarySearch().then(
            (search) => { if (current) setGlossary(() => search); },
            () => { if (current) setGlossary('unavailable'); },
        );
        return () => { current = false; };
    }, [open, glossary]);

    const rows = paletteRows({term: searchTerm, answer, popular: initialStocks, topicMax: NAME_MAX, glossaryReady: glossary !== null});
    const isSearchMode = !!rows.query;

    // "Follow topic" row: any query long enough to be a subject. If it names a
    // topic the user already follows, open that instead of creating a duplicate.
    const topicQuery = rows.query;
    const existingTopic = rows.topic !== 'none' ? initialTopics.find((t) => t.name.toLowerCase() === topicQuery.toLowerCase()) : undefined;
    const learnHits = typeof glossary === 'function' ? glossary(topicQuery, 4, {owner}) : [];
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

    const closePalette = () => {
        setOpen(false);
        setSearchTerm("");
        setAnswer(null);
    };

    const goTo = (href: string) => {
        closePalette();
        router.push(href);
    };

    // Asks for the query in the box when the debounce fires. An answer that comes back after a
    // newer search was asked is dropped, so a slow reply never takes the newer one's place.
    const handleSearch = async () => {
        const query = rows.query;
        if (!query) return;

        const request = ++asked.current;
        // null: the search did not answer (refused, failed, or the call itself was dropped).
        let stocks: Stock[] | null;
        try {
            stocks = (await searchStocks(query)) ?? null;
        } catch {
            stocks = null;
        }
        if (request !== asked.current) return;
        setAnswer({query, stocks});
        // An Enter pressed while this search was out was kept for it (the input's onKeyDown).
        if (enterKept.current === query) {
            enterKept.current = null;
            const first = stocks?.[0];
            if (first) goTo(`/stocks/${first.symbol}`);
        }
    };

    const debouncedSearch = useDebounce(handleSearch, 300);

    useEffect(() => {
        debouncedSearch();
    }, [searchTerm, debouncedSearch]);

    // A kept Enter is for the text it was pressed on, in the palette it was pressed in.
    useEffect(() => {
        enterKept.current = null;
    }, [open, searchTerm]);

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
                // A pill --search-h tall from md, and a circle of that size below it. The border
                // is transparent, kept for forced-colours mode, which draws it. Under a coarse
                // pointer a transparent circle 44px across (::before, size-11, centred on the
                // button) answers a thumb, the circle drawn as it is.
                <button type="button" onClick={() => setOpen(true)} aria-label={label}
                        onPointerEnter={preloadGlossary} onFocus={preloadGlossary} onTouchStart={preloadGlossary}
                        className="search-text relative inline-flex size-(--search-h) shrink-0 items-center justify-center gap-2 rounded-full border border-transparent bg-fg/6 text-sm transition-colors pointer-coarse:before:absolute pointer-coarse:before:left-1/2 pointer-coarse:before:top-1/2 pointer-coarse:before:size-11 pointer-coarse:before:-translate-1/2 pointer-coarse:before:rounded-full md:w-full md:max-w-md md:shrink md:justify-start md:px-3">
                    <Search className="size-4 opacity-70 shrink-0" aria-hidden="true"/>
                    <span className="hidden md:inline flex-1 truncate text-left text-fg-muted">{label}</span>
                    <kbd className="hidden md:inline text-[10px] px-1.5 py-0.5 rounded border border-line-strong/40 text-fg-muted font-mono">⌘K</kbd>
                </button>
            ) : (
                <Button onClick={() => setOpen(true)} className="search-btn"
                        onPointerEnter={preloadGlossary} onFocus={preloadGlossary} onTouchStart={preloadGlossary}>
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
                        onKeyDown={(event) => {
                            // With a page or a glossary row drawn, Enter is that row's, as ever. An
                            // Enter that settles an input method's composition is not a press of the key.
                            if (event.key === 'Enter' && !event.repeat && !event.nativeEvent.isComposing
                                && rows.searching && pageHits.length === 0 && learnHits.length === 0) {
                                enterKept.current = rows.query;
                            }
                        }}
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
                    ) : rows.unavailable ? (
                        <div className="search-list-indicator" role="status" data-search-unanswered="">{SHELL_COPY.searchUnanswered}</div>
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
                                    <StockHit stock={stock}/>
                                </CommandItem>
                            ))}
                        </>
                    )}
                    {/* The topic row is last, and waits (disabled) until the stock search has answered:
                        following is a write, so it is Enter's row only when nothing else was found. */}
                    {/* Pinned to the list's foot (.search-topic): as many as 25 stocks stand before it
                        in a list 400 px tall with no scrollbar, and a row out of sight is not offered. */}
                    {rows.topic !== 'none' && (
                        <div className="search-topic">
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
                        </div>
                    )}
                </CommandList>
            </CommandDialog>
        </>
    );
}
