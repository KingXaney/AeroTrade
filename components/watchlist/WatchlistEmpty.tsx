import {Star} from "lucide-react";

const WatchlistEmpty = () => {
    return (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-gray-800 bg-gray-900/30 px-6 py-16 text-center">
            <Star className="size-10 text-yellow-500 mb-4" />
            <h2 className="text-xl font-semibold text-gray-100">Your watchlist is empty</h2>
            <p className="mt-2 text-sm text-gray-500 max-w-md">
                Use <kbd className="rounded border border-gray-700 bg-gray-800 px-1.5 py-0.5 text-xs">⌘K</kbd> or
                click <span className="text-gray-300">Search</span> in the nav to find stocks, then tap the star
                to start tracking them here.
            </p>
        </div>
    );
};

export default WatchlistEmpty;
