'use client';

import {useEffect, useLayoutEffect, useRef, useState} from "react";
import {toast} from "sonner";
import {Check, Loader2, Plus, X} from "lucide-react";
import {Command, CommandInput, CommandItem, CommandList} from "@/components/ui/command";
import {Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle} from "@/components/ui/dialog";
import ActionButton from "@/components/primitives/ActionButton";
import {iconButton} from "@/components/primitives/iconButton";
import StockHit from "@/components/stocks/StockHit";
import {useDebounce} from "@/hooks/useDebounce";
import {runWithToast} from "@/lib/action-toast";
import {searchStocks} from "@/lib/actions/stocks.actions";
import {addToWatchlist} from "@/lib/actions/watchlist.actions";
import {WATCHLIST_COPY} from "@/lib/learn/copy/watchlist";
import {addRows, popularStocks} from "@/lib/stocks/watchlist-add";
import {cn} from "@/lib/utils";
import type {StockAnswer} from '@/lib/shell/palette';
import type {Stock} from '@/lib/stocks/types';

// /watchlist's own way to add a stock: a button, and the dialog it opens — a stock search over a
// list to pick from. A pick adds the stock and closes the dialog; the reader stays on the page.
// The first-week step "Add a stock to your watchlist" lands here, and before this the page had
// only a caption pointing at the header's search.
//
// It is not a second ⌘K: components/shell/SearchCommand.tsx registers a window key listener and
// lists pages, terms and topics. This one listens to nothing outside its own dialog and lists
// stocks only, drawn with the same row (components/stocks/StockHit.tsx) by the same rule
// (lib/stocks/watchlist-add.ts): no row while the search for the text in the box is out, so
// Enter never adds an earlier query's first hit.

const POPULAR = popularStocks();

type Props = {
    // Where the button stands: the page title's actions, or the empty panel.
    place: 'title' | 'empty';
    // The symbols on the watchlist now: marked in a search's answer, left out of the suggestions.
    tracked?: readonly string[];
    // secondary beside another add button on the same page (the empty panel's).
    variant?: 'primary' | 'secondary';
};

const Picker = ({tracked, onAdded}: {tracked: readonly string[]; onAdded: () => void}) => {
    const copy = WATCHLIST_COPY.add;
    const [term, setTerm] = useState('');
    // The search's newest answer and the query it answered for (lib/shell/palette.ts).
    const [answer, setAnswer] = useState<StockAnswer<Stock> | null>(null);
    const asked = useRef(0);
    const [adding, setAdding] = useState<string | null>(null);
    const inFlight = useRef(false);

    const view = addRows({term, answer, tracked, popular: POPULAR});

    // As ⌘K asks: when the debounce fires, for the query then in the box; an answer that comes
    // back after a newer search was asked is dropped.
    const search = async () => {
        const query = view.query;
        if (!query) return;

        const request = ++asked.current;
        // null: the search did not answer (refused, failed, or the call itself was dropped).
        let stocks: Stock[] | null;
        try {
            stocks = (await searchStocks(query)) ?? null;
        } catch {
            stocks = null;
        }
        if (request === asked.current) setAnswer({query, stocks});
    };

    const debouncedSearch = useDebounce(search, 300);

    useEffect(() => {
        debouncedSearch();
    }, [term, debouncedSearch]);

    // addToWatchlist revalidates /watchlist, so its answer carries the page with the new row:
    // nothing here refreshes or navigates.
    const pick = async (stock: Stock) => {
        if (inFlight.current) return;
        inFlight.current = true;
        setAdding(stock.symbol);
        const added = await runWithToast(
            () => addToWatchlist({symbol: stock.symbol, company: stock.name}),
            toast,
            {success: copy.added(stock.symbol), error: copy.failed},
        );
        inFlight.current = false;
        if (added) onAdded();
        else setAdding(null);
    };

    const status = view.searching ? copy.searching
        : view.unavailable ? copy.unanswered
        : view.rows.length > 0 ? ''
        : view.suggested ? copy.hint : copy.none(view.query);

    return (
        // shouldFilter off: the hits come filtered from searchStocks. A held Enter repeats the
        // key, and the press that opened the dialog must not also pick its first row.
        <Command
            shouldFilter={false}
            label={copy.searchLabel}
            className="bg-transparent p-0"
            onKeyDown={(event) => { if (event.key === 'Enter' && event.repeat) event.preventDefault(); }}
        >
            <div className="search-field border-t border-line-strong/30">
                {/* text-base: a phone zooms the page on a box whose text is smaller. */}
                <CommandInput value={term} onValueChange={setTerm} placeholder={copy.placeholder} className="search-input text-base"/>
                {view.searching && <Loader2 className="search-loader" aria-hidden="true"/>}
            </div>
            {/* Always mounted, so a screen reader hears the line change. */}
            <div role="status" className={cn(status && 'search-list-indicator text-fg-muted')} data-watchlist-add-status="">{status}</div>
            {/* Short on a phone, where the keyboard takes the lower half of the screen. */}
            <CommandList label={view.suggested ? copy.popular : copy.results} className="max-h-[36dvh] sm:max-h-[min(25rem,50dvh)]">
                {view.rows.length > 0 && (
                    <>
                        <div className="search-count">{view.suggested ? copy.popular : copy.results}</div>
                        {view.rows.map(({stock, tracked: onList}) => (
                            <CommandItem
                                key={stock.symbol}
                                value={stock.symbol}
                                disabled={onList || adding !== null}
                                onSelect={() => void pick(stock)}
                                // A stock on the list is not dimmed as a row that cannot be run is: it says why.
                                className={cn('search-item-link max-lg:min-h-11', onList && 'data-[disabled=true]:opacity-100')}
                                data-watchlist-hit={stock.symbol}
                                data-tracked={onList ? '' : undefined}
                            >
                                <StockHit stock={stock}/>
                                {onList ? (
                                    <span className="flex shrink-0 items-center gap-1 text-xs text-fg-muted">
                                        <Check className="size-3.5" aria-hidden="true"/>
                                        {copy.tracked}
                                    </span>
                                ) : adding === stock.symbol ? (
                                    <span className="flex shrink-0 items-center gap-1 text-xs text-fg-muted">
                                        <Loader2 className="size-3.5 animate-spin" aria-hidden="true"/>
                                        {copy.adding}
                                    </span>
                                ) : (
                                    <Plus className="size-4 shrink-0 text-fg-muted" aria-hidden="true"/>
                                )}
                            </CommandItem>
                        ))}
                    </>
                )}
            </CommandList>
        </Command>
    );
};

const AddToWatchlist = ({place, tracked = [], variant = 'primary'}: Props) => {
    const copy = WATCHLIST_COPY.add;
    const [open, setOpen] = useState(false);
    const trigger = useRef<HTMLButtonElement>(null);

    // Back to the button that opened it. The empty panel's is gone once the first stock is on
    // the list (the page then draws the table), so the focus goes to the title's instead of
    // being dropped on the body.
    const returnFocus = (event: Event) => {
        event.preventDefault();
        (trigger.current ?? document.querySelector<HTMLElement>('[data-watchlist-add]'))?.focus();
    };

    // The dialog can close before the page has redrawn: the focus then goes back to the empty
    // panel's button, which leaves with its panel a moment later. Before it does (a layout
    // cleanup runs while the button is still in the document) the focus moves to the title's.
    useLayoutEffect(() => {
        const button = trigger.current;
        return () => {
            if (place !== 'empty' || !button || document.activeElement !== button) return;
            document.querySelector<HTMLElement>('[data-watchlist-add="title"]')?.focus();
        };
    }, [place]);

    return (
        <>
            <ActionButton
                ref={trigger}
                variant={variant}
                size={place === 'empty' ? 'md' : 'sm'}
                onClick={() => setOpen(true)}
                className="inline-flex shrink-0 items-center justify-center gap-1.5 max-lg:min-h-11"
                data-watchlist-add={place}
            >
                <Plus className="size-3.5" aria-hidden="true"/>
                {copy.button}
            </ActionButton>
            <Dialog open={open} onOpenChange={setOpen}>
                {/* Pinned by its top, so the list growing and shrinking under the box never moves the box. */}
                <DialogContent
                    showCloseButton={false}
                    className="top-4 translate-y-0 gap-0 overflow-hidden p-0 sm:top-[12vh] sm:max-w-lg"
                    onCloseAutoFocus={returnFocus}
                    data-watchlist-add-dialog=""
                >
                    <div className="space-y-1.5 py-4 pl-4 pr-14">
                        <DialogTitle className="font-heading">{copy.title}</DialogTitle>
                        <DialogDescription>{copy.lead}</DialogDescription>
                    </div>
                    {/* The search box stands before Close in the document, so it is where the focus lands. */}
                    <Picker tracked={tracked} onAdded={() => setOpen(false)}/>
                    <DialogClose className={cn(iconButton, 'absolute top-2 right-2 size-11 lg:size-8')} aria-label={copy.close}>
                        <X className="size-4" aria-hidden="true"/>
                    </DialogClose>
                </DialogContent>
            </Dialog>
        </>
    );
};

export default AddToWatchlist;
