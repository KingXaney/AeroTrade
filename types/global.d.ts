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
        | 'getMarketNews';

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
    };

    type FriendProfile = {
        id: string;
        name: string;
        email: string;
        portfolio: PortfolioSummary;
    };
}

export {};
