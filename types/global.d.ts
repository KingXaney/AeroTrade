declare global {
    type SignInFormData = {
        email: string;
        password: string;
    };

    type SignUpFormData = {
        fullName: string;
        email: string;
        password: string;
        country: string;
        investmentGoals: string;
        riskTolerance: string;
        preferredIndustry: string;
    };

    type CountrySelectProps = {
        name: string;
        label: string;
        control: Control;
        error?: FieldError;
        required?: boolean;
    };

    type FormInputProps = {
        name: string;
        label: string;
        placeholder: string;
        type?: string;
        register: UseFormRegister;
        error?: FieldError;
        validation?: RegisterOptions;
        disabled?: boolean;
        value?: string;
    };

    type Option = {
        value: string;
        label: string;
    };

    type SelectFieldProps = {
        name: string;
        label: string;
        placeholder: string;
        options: readonly Option[];
        control: Control;
        error?: FieldError;
        required?: boolean;
    };

    type FooterLinkProps = {
        text: string;
        linkText: string;
        href: string;
    };

    type WelcomeEmailData = {
        email: string;
        name: string;
        intro: string;
    };

    type User = {
        id: string;
        name: string;
        email: string;
    };

    type Stock = {
        symbol: string;
        name: string;
        exchange: string;
        type: string;
    };

    type StockWithWatchlistStatus = Stock & {
        isInWatchlist: boolean;
    };

    type FinnhubSearchResult = {
        symbol: string;
        description: string;
        displaySymbol?: string;
        type: string;
    };

    type FinnhubSearchResponse = {
        count: number;
        result: FinnhubSearchResult[];
    };

    type StockDetailsPageProps = {
        params: Promise<{
            symbol: string;
        }>;
    };

    type WatchlistButtonProps = {
        symbol: string;
        company: string;
        isInWatchlist: boolean;
        showTrashIcon?: boolean;
        type?: 'button' | 'icon';
        onWatchlistChange?: (symbol: string, isAdded: boolean) => void;
    };

    type QuoteData = {
        c?: number;
        dp?: number;
    };

    type ProfileData = {
        name?: string;
        marketCapitalization?: number;
    };

    type FinancialsData = {
        metric?: { [key: string]: number };
    };

    type SelectedStock = {
        symbol: string;
        company: string;
        currentPrice?: number;
    };

    type WatchlistTableProps = {
        watchlist: StockWithData[];
    };

    type StockWithData = {
        userId: string;
        symbol: string;
        company: string;
        addedAt: Date;
        currentPrice?: number;
        changePercent?: number;
        priceFormatted?: string;
        changeFormatted?: string;
        marketCap?: string;
        peRatio?: string;
    };

    type AlertsListProps = {
        alertData: Alert[] | undefined;
    };

    type NewsSourceType = 'finance' | 'rss' | 'reddit' | 'sec';

    type MarketNewsArticle = {
        id: number;
        headline: string;
        summary: string;
        source: string;
        url: string;
        datetime: number;
        category: string;
        related: string;
        image?: string;
        sourceType?: NewsSourceType;
        fullSummary?: string;     // untruncated text for the news brain
    };

    type WatchlistNewsProps = {
        news?: MarketNewsArticle[];
    };

    // --- Search & Watchlist ---
    type SearchCommandProps = {
        renderAs?: 'button' | 'text';
        label?: string;
        initialStocks: StockWithWatchlistStatus[];
    };

    type WatchlistEntry = {
        symbol: string;
        company: string;
        addedAt: Date;
    };

    // --- Chat ---
    type ChatToolName =
        | 'searchStock'
        | 'getStockQuote'
        | 'getStockProfile'
        | 'getStockFinancials'
        | 'getWatchlist'
        | 'addStockToWatchlist'
        | 'removeStockFromWatchlist'
        | 'getMarketNews'
        | 'getBrainDigest'
        | 'getAiSuggestions';

    type AlertData = {
        symbol: string;
        company: string;
        alertName: string;
        alertType: 'upper' | 'lower';
        threshold: string;
    };

    type AlertModalProps = {
        alertId?: string;
        alertData?: AlertData;
        action?: string;
        open: boolean;
        setOpen: (open: boolean) => void;
    };

    type RawNewsArticle = {
        id: number;
        headline?: string;
        summary?: string;
        source?: string;
        url?: string;
        datetime?: number;
        image?: string;
        category?: string;
        related?: string;
    };

    type Alert = {
        id: string;
        symbol: string;
        company: string;
        alertName: string;
        currentPrice: number;
        alertType: 'upper' | 'lower';
        threshold: number;
        changePercent?: number;
    };

    // --- Paper trading ---
    type PaperPosition = {
        symbol: string;
        company: string;
        quantity: number;
        avgCost: number;
    };

    type EnrichedPosition = PaperPosition & {
        currentPrice?: number;
        changePercent?: number;
        costBasis: number;        // avgCost * quantity
        marketValue: number;      // currentPrice * quantity (0 if price unknown)
        unrealizedPnl: number;    // marketValue - costBasis
        unrealizedPnlPct: number; // unrealizedPnl / costBasis * 100
    };

    type PortfolioSummary = {
        startingBalance: number;
        cash: number;
        positions: EnrichedPosition[];
        holdingsValue: number;
        totalValue: number;       // cash + holdingsValue
        totalReturnAbs: number;   // totalValue - startingBalance
        totalReturnPct: number;   // totalReturnAbs / startingBalance * 100
    };

    type PaperTradeRecord = {
        id: string;
        symbol: string;
        company: string;
        side: 'buy' | 'sell';
        quantity: number;
        price: number;
        total: number;
        realizedPnl?: number;
        createdAt: number;        // epoch milliseconds
    };

    type OrderResult = {
        success: boolean;
        message?: string;
    };

    // --- Friends / competition ---
    type FriendSummary = {
        friendshipId: string;
        id: string;
        name: string;
        email: string;
    };

    type FriendRequest = {
        friendshipId: string;
        requesterId: string;
        name: string;
        email: string;
        createdAt: number;
    };

    type LeaderboardEntry = {
        id: string;
        name: string;
        isYou: boolean;
        totalValue: number;
        totalReturnPct: number;
        accountName: string;      // name of the user's best strategy account
    };

    type FriendProfile = {
        id: string;
        name: string;
        email: string;
        portfolio: PortfolioSummary;  // the friend's best strategy account
        accountName: string;
        accounts: {name: string; totalValue: number; totalReturnPct: number}[];
    };

    // --- Multi-account strategies & analytics ---
    type PaperAccountSummary = {
        id: string;
        name: string;
        inceptionAt: number;      // epoch ms; anchors the performance chart
        createdAt: number;        // epoch ms
    };

    type AccountWithPortfolio = {
        account: PaperAccountSummary;
        summary: PortfolioSummary;
    };

    type SnapshotPoint = {
        date: string;             // 'YYYY-MM-DD' in America/New_York
        value: number;
    };

    type PerfPoint = {
        date: string;
        accountPct: number;           // % return since account inception
        benchmarkPct: number | null;  // % return of SPY over the same window (null before first benchmark point)
    };

    type AccountAnalytics = {
        account: PaperAccountSummary;
        summary: PortfolioSummary;
        series: PerfPoint[];
        maxDrawdownPct: number | null;  // null until enough snapshots exist
        winRatePct: number | null;      // null until a closed (sell) trade exists
        wins: number;
        losses: number;
        realizedPnl: number;
        tradeCount: number;
    };

    // --- News brain & AI navigator ---
    type BrainEntityType = 'ticker' | 'sector' | 'theme';

    type BrainEntitySummary = {
        key: string;
        type: BrainEntityType;
        displayName: string;
        weightFast: number;
        weightSlow: number;
        sentimentFast: number;        // derived avg, −1..1
        sentimentSlow: number;
        thesisSince: number | null;   // epoch ms when the slow weight sustained above threshold
        lastSeenAt: number;           // epoch ms
    };

    type SuggestionAction = 'buy' | 'sell' | 'hold';

    type SuggestionItem = {
        symbol: string;
        action: SuggestionAction;
        quantity?: number;            // planned whole shares (absent on global/hold items)
        targetWeight: number;
        currentWeight: number;
        score: number;
        reasons: string[];            // deterministic strings from scoring — never LLM output
        executed: boolean;
        executionPrice?: number;
        error?: string;
    };

    type NavigatorStatus = {
        enrolled: boolean;
        status?: 'active' | 'paused';
        accountId?: string;
        enrolledAt?: number;          // epoch ms
        lastRunDate?: string;         // 'YYYY-MM-DD' ET
        lastError?: string;
    };
}

export {};
