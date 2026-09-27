// The one registry of what every number and term in the app means, in the app's own
// convention. Client-importable and import-free: the catalog reads it for column help,
// components read it for title= text and the per-panel "What these mean" disclosures,
// the chat's explain tool reads it so definitions come from tested content rather than
// the model's memory, and the dashboard's lesson widget reads the concept entries.
//
// Every sentence here is shown to readers as written. Entries describe what a figure
// measures; they never say what to do about it (lib/learn/banned.ts, enforced in the
// test). Formulas cite the function that computes the number so the prose cannot drift
// from the code.
//
// Three kinds:
//   metric  — a number the app computes (keyed by the label it appears under);
//   concept — a news term, keyed EXACTLY as lib/topics/starters.ts spells the keyword,
//             so a matched article term is a glossary key;
//   rail    — a constant the AI Navigator or the news brain trades under.

export type GlossaryKind = 'metric' | 'concept' | 'rail';

export type GlossaryEntry = {
    key: string;
    kind: GlossaryKind;
    term: string;
    aliases: readonly string[];
    // ≤ 140 characters: the native tooltip on a label.
    short: string;
    // One paragraph: the per-panel disclosure and the /learn page.
    long: string;
    formula?: string;
    computedIn?: string;
    seeAlso?: readonly string[];
};

const ENTRIES = [
    // ---- signal board columns -------------------------------------------------------
    {key: 'close', kind: 'metric', term: 'Last close', aliases: ['close', 'closing price'],
        short: 'The last completed daily closing price the rule looked at.',
        long: 'Every strategy decides on the previous session\'s close and fills in the next session, so the close is the last number it was allowed to see. Nothing is decided on an intraday price.',
        computedIn: 'lib/strategies/rules/shared.ts'},
    {key: 'since-entry', kind: 'metric', term: 'Since entry', aliases: ['since entry', 'gain since entry'],
        short: 'Price change since the strategy bought, as a share of what it paid.',
        long: 'The close divided by the average cost, minus one. It is a price change only: dividends the position received are not in this number.',
        seeAlso: ['avg-cost']},
    {key: 'weight', kind: 'metric', term: 'Current weight', aliases: ['weight', 'current weight', 'position weight'],
        short: 'The share of the account\'s value this holding makes up right now.',
        long: 'Shares × last close, divided by the account\'s total value (cash included). Weights drift as prices move even when nothing is traded, which is what a rebalance corrects.',
        seeAlso: ['target', 'drift']},
    {key: 'target', kind: 'metric', term: 'Target weight', aliases: ['target', 'target weight'],
        short: 'The share of the account the rule wants in this holding.',
        long: 'For 60/40 the targets are 59.4% and 39.6% of equity — 60% and 40% of the 99% the rule invests, because it keeps a 1% cash floor.',
        seeAlso: ['weight', 'drift']},
    {key: 'drift', kind: 'metric', term: 'Drift', aliases: ['drift'],
        short: 'Current weight minus target weight.',
        long: 'A leg is traded only when its drift exceeds the band (2% of equity). Smaller drifts are left alone so the rule does not churn on every small price move.',
        computedIn: 'lib/strategies/rules/rebalance.ts', seeAlso: ['weight', 'target']},
    {key: 'sma50', kind: 'metric', term: 'SMA50', aliases: ['sma50', '50-day average', '50-day moving average'],
        short: 'Simple moving average: the mean of the last 50 closes.',
        long: 'A smoothed price. Averaging 50 closes removes day-to-day noise, so where today\'s price sits relative to the average says whether the recent trend is up or down.',
        formula: 'mean(close[t−49 … t])', computedIn: 'lib/strategies/indicators.ts sma', seeAlso: ['sma200', 'trend-on']},
    {key: 'sma200', kind: 'metric', term: 'SMA200', aliases: ['sma200', '200-day average', '200-day moving average', '200d ma'],
        short: 'Simple moving average: the mean of the last 200 closes, about ten months.',
        long: 'The slowest average the strategies use. A close above it is the usual definition of a long-term uptrend; RSI-2 only buys dips in stocks that pass this test, and the golden cross compares the 50-day average against it.',
        formula: 'mean(close[t−199 … t])', computedIn: 'lib/strategies/indicators.ts sma', seeAlso: ['sma50', 'above-sma200']},
    {key: 'sma5', kind: 'metric', term: 'SMA5', aliases: ['sma5', '5-day average'],
        short: 'Simple moving average of the last five closes; RSI-2 sells when the close rises back above it.',
        long: 'A one-week average. After a sharp dip, the close climbing back over the five-day average is what the rule treats as the bounce it was waiting for.',
        formula: 'mean(close[t−4 … t])', computedIn: 'lib/strategies/indicators.ts sma'},
    {key: 'spread', kind: 'metric', term: 'SMA50 vs SMA200', aliases: ['spread', 'sma spread'],
        short: 'How far the 50-day average sits above or below the 200-day one, as a percentage.',
        long: 'Positive means the faster average is above the slower one (the trend is on); negative means it has crossed below. The size says how decisively.',
        formula: 'sma50 / sma200 − 1', seeAlso: ['sma50', 'sma200', 'trend-on']},
    {key: 'trend-on', kind: 'metric', term: 'Trend on', aliases: ['trend on', 'golden cross', 'death cross'],
        short: 'True when the 50-day average is above the 200-day: the rule\'s definition of an uptrend.',
        long: 'The moment the 50-day average crosses above the 200-day is the "golden cross"; crossing back below is the "death cross". Both averages lag prices, so the signal arrives late in both directions by design.',
        seeAlso: ['sma50', 'sma200']},
    {key: 'r12', kind: 'metric', term: '12-month total return', aliases: ['12m total return', 'twelve-month return', 'r12'],
        short: 'Change over the past twelve months with dividends included.',
        long: 'Dual momentum compares assets on total return, not price, because its hurdle — the T-bill — is entirely yield. A price-only comparison would understate every dividend payer.',
        computedIn: 'lib/strategies/indicators.ts trailingReturn', seeAlso: ['above-hurdle', 't-bill-rate']},
    {key: 'above-hurdle', kind: 'metric', term: 'Above the T-bill hurdle', aliases: ['above hurdle', 'clears the hurdle', 'absolute momentum'],
        short: 'True when the 12-month return is above what 13-week T-bills returned over the same year.',
        long: 'Cash sets the hurdle. When no equity index clears it, dual momentum steps into bonds instead of picking the least bad stock index — the "absolute momentum" half of the rule.',
        seeAlso: ['r12', 't-bill-rate']},
    {key: 'pick', kind: 'metric', term: 'Would be chosen', aliases: ['would be chosen', 'pick'],
        short: 'True for the asset the rule would hold today: the strongest 12-month return that clears the hurdle.',
        long: 'One asset at a time. US stocks or international stocks, whichever had the higher twelve-month return, provided it cleared the T-bill hurdle; otherwise the bond ETF.',
        seeAlso: ['r12', 'above-hurdle']},
    {key: 'momentum-12-1', kind: 'metric', term: '12-1 return', aliases: ['12-1 return', '12-1 momentum'],
        short: 'Return over the past twelve months excluding the most recent month.',
        long: 'The last month is skipped because very recent moves tend to reverse in the following weeks, while moves over the year before tend to continue. Skipping it is what separates momentum from a short-term bounce.',
        formula: 'close[t−21] / close[t−252] − 1', computedIn: 'lib/strategies/indicators.ts laggedReturn', seeAlso: ['momentum-rank']},
    {key: 'momentum-rank', kind: 'metric', term: 'Momentum rank', aliases: ['momentum rank'],
        short: 'Position among the forty large caps by 12-1 return; the top eight are held.',
        long: 'Rank 1 is the strongest twelve-month performer. A holding that falls out of the top group is sold at the next monthly reshuffle; a name that climbs in is bought.',
        computedIn: 'lib/strategies/indicators.ts rank', seeAlso: ['momentum-12-1']},
    {key: 'rsi2', kind: 'metric', term: 'RSI(2)', aliases: ['rsi(2)', 'rsi2', 'rsi', 'relative strength index'],
        short: 'A two-day relative strength index: near 0 after two down days, near 100 after two up days.',
        long: 'The RSI compares recent gains with recent losses on a 0–100 scale. Over two days it swings to extremes quickly, so a reading below the entry level marks a sharp short dip. The rule only acts on the dip when the stock is above its 200-day average.',
        formula: '100 − 100 / (1 + avg gain / avg loss), Wilder-smoothed over 2 days', computedIn: 'lib/strategies/indicators.ts wilderRsi', seeAlso: ['above-sma200', 'sma5']},
    {key: 'above-sma200', kind: 'metric', term: 'Above SMA200', aliases: ['above sma200', 'above 200-day'],
        short: 'True when the close is above the 200-day average — the filter that limits dips to stocks in an uptrend.',
        long: 'Buying every dip catches falling stocks too. Requiring the close to be above the 200-day average keeps the rule to names whose long-term direction is still up.',
        seeAlso: ['sma200', 'rsi2']},
    {key: 'high55', kind: 'metric', term: '55-day high', aliases: ['55-day high', 'donchian high', 'breakout level'],
        short: 'The highest high of the last 55 sessions; a close above it is a breakout.',
        long: 'The upper edge of a Donchian channel. A close above the highest price of the past eleven weeks means the stock is trading where it has not traded recently — the trigger the Turtle rule buys.',
        computedIn: 'lib/strategies/indicators.ts rollingHigh', seeAlso: ['low20', 'vs-high']},
    {key: 'low20', kind: 'metric', term: '20-day low', aliases: ['20-day low', 'donchian low'],
        short: 'The lowest low of the last 20 sessions; a close below it ends the position.',
        long: 'The exit edge of the channel, deliberately shorter than the entry edge so a position leaves faster than it arrived.',
        computedIn: 'lib/strategies/indicators.ts rollingLow', seeAlso: ['high55']},
    {key: 'vs-high', kind: 'metric', term: 'vs 55-day high', aliases: ['vs 55-day high', 'distance to high'],
        short: 'How far the close sits below the 55-day high, as a percentage.',
        long: 'Zero or positive means the stock is at or through its breakout level; a negative number is the distance still to go.',
        seeAlso: ['high55']},
    {key: 'vol63', kind: 'metric', term: '63-day volatility', aliases: ['63-day vol', 'vol63', 'realised volatility', 'realized volatility'],
        short: 'Annualised realised volatility: the standard deviation of the last 63 daily log returns × √252.',
        long: 'How much the price has been swinging day to day over the past quarter, scaled to a yearly figure so different stocks compare. 63 sessions is one calendar quarter.',
        formula: 'stdev(ln(close[t] / close[t−1]) over 63 days) × √252', computedIn: 'lib/strategies/indicators.ts realizedVol', seeAlso: ['volatility', 'vol-rank']},
    {key: 'vol-rank', kind: 'metric', term: 'Volatility rank', aliases: ['volatility rank', 'vol rank'],
        short: 'Position among the forty large caps from the lowest volatility up; the ten lowest are held.',
        long: 'Rank 1 is the calmest stock. The low-volatility rule holds the quiet names and reshuffles monthly as the ranking changes.',
        computedIn: 'lib/strategies/indicators.ts rank', seeAlso: ['vol63']},

    // ---- account and analytics tiles --------------------------------------------------
    {key: 'net-worth', kind: 'metric', term: 'Net worth', aliases: ['net worth', 'total value', 'account value', 'equity'],
        short: 'Cash plus the market value of every holding at the last quote.',
        long: 'The one number that says what the account is worth. A holding with no live quote is counted at what was paid for it, and the page says how many are valued that way.',
        formula: 'cash + Σ shares × last price', computedIn: 'lib/trading/account.ts computePortfolio', seeAlso: ['holdings-value', 'buying-power']},
    {key: 'holdings-value', kind: 'metric', term: 'Holdings value', aliases: ['holdings value', 'market value'],
        short: 'Shares × last price, summed over every open position.',
        long: 'Net worth minus cash. It moves with every quote; cash does not.',
        formula: 'Σ shares × last price', seeAlso: ['net-worth']},
    {key: 'buying-power', kind: 'metric', term: 'Buying power', aliases: ['buying power', 'cash'],
        short: 'Cash available for the next buy. Paper accounts have no margin, so it is simply the cash balance.',
        long: 'An order is filled only when its estimated cost fits inside this number; the ticket says so before you submit.',
        seeAlso: ['net-worth', 'market-order']},
    {key: 'total-return', kind: 'metric', term: 'Total return', aliases: ['total return', 'return', 'return since inception', 'performance'],
        short: 'Everything the account has gained or lost since it opened, as dollars and as a share of the starting balance.',
        long: 'Net worth minus the starting balance. It includes realized gains on closed positions and unrealized gains on open ones — and anything the account received without trading.',
        formula: '(net worth − starting balance) / starting balance', seeAlso: ['realized-pnl', 'unrealized-pnl', 'vs-spy']},
    {key: 'max-drawdown', kind: 'metric', term: 'Max drawdown', aliases: ['max drawdown', 'maximum drawdown', 'drawdown', 'worst drawdown'],
        short: 'The largest fall from a previous peak to a later low in the account\'s value, as a share of that peak.',
        long: 'A measure of the worst stretch, not the end result: an account can finish up for the year and still have spent weeks 15% below its high. Every daily snapshot is compared with the highest value before it.',
        formula: 'max over days of (peak so far − value) / peak so far', computedIn: 'lib/trading/analytics.ts computeMaxDrawdown', seeAlso: ['recovery', 'volatility']},
    {key: 'recovery', kind: 'metric', term: 'Recovery', aliases: ['recovery', 'gain to recover'],
        short: 'The rise needed to get back to the previous peak after a drawdown: a 20% fall needs a 25% gain.',
        long: 'Losses and gains are not symmetric. From 100 down to 80 is −20%; from 80 back to 100 is +25%. The deeper the drawdown, the larger the climb back.',
        formula: 'peak / trough − 1', seeAlso: ['max-drawdown']},
    {key: 'win-rate', kind: 'metric', term: 'Win rate', aliases: ['win rate', 'hit rate'],
        short: 'Sells that locked in a profit, as a share of all sells.',
        long: 'A sell counts as a win when its realized P&L is positive. Open positions are not counted, so an account with no sells has no win rate yet. A high win rate with small wins and large losses still loses money.',
        computedIn: 'lib/trading/analytics.ts computeWinStats', seeAlso: ['realized-pnl']},
    {key: 'realized-pnl', kind: 'metric', term: 'Realized P&L', aliases: ['realized p&l', 'realised p&l', 'realized pnl', 'realized profit', 'closed p&l'],
        short: 'Profit or loss locked in by sells: (sell price − average cost) × shares sold.',
        long: 'Only a sell realizes anything. Until then a gain is on paper and can disappear with the next quote.',
        formula: '(sell price − average cost) × shares sold', computedIn: 'lib/trading/orders.ts executeOrder', seeAlso: ['unrealized-pnl', 'avg-cost']},
    {key: 'unrealized-pnl', kind: 'metric', term: 'Unrealized P&L', aliases: ['unrealized p&l', 'unrealised p&l', 'paper gain', 'open p&l'],
        short: 'The gain or loss on open positions at the last quote: (last price − average cost) × shares held.',
        long: 'It changes with every quote and is not yours until you sell. A position with no live quote shows no unrealized P&L at all rather than a misleading zero.',
        formula: '(last price − average cost) × shares held', seeAlso: ['realized-pnl', 'avg-cost']},
    {key: 'income', kind: 'metric', term: 'Income', aliases: ['income', 'interest and dividends'],
        short: 'Cash the account received without trading: interest on idle cash and dividends on holdings.',
        long: 'A real brokerage pays interest on cash left in the account and passes on the dividends its holdings declare. Paper accounts here do the same, so idle cash is not a free lunch and a dividend payer is not penalised.',
        seeAlso: ['apy', 'ex-date', 'pay-date']},
    {key: 'trades', kind: 'metric', term: 'Trades', aliases: ['trades', 'fills', 'trade count'],
        short: 'Buys plus sells filled in this account, all time.',
        long: 'Every fill counts once. A partial sell is one trade; the strategies\' quarterly rebalance is usually two.'},
    {key: 'cagr', kind: 'metric', term: 'CAGR', aliases: ['cagr', 'compound annual growth rate', 'annualised return', 'annualized return'],
        short: 'Compound annual growth rate: the steady yearly rate that would turn the start value into the end value over the same span.',
        long: 'A three-year result of +33% is a CAGR of about 10%: three years of 10% compounded. It lets records of different lengths be compared, but it hides the path — two accounts with the same CAGR can have very different drawdowns.',
        formula: '(end / start)^(365.25 / days) − 1', computedIn: 'lib/strategies/metrics.ts cagrPct', seeAlso: ['total-return', 'volatility']},
    {key: 'volatility', kind: 'metric', term: 'Volatility', aliases: ['volatility', 'annualised volatility', 'annualized volatility', 'standard deviation'],
        short: 'The standard deviation of daily log returns × √252: how large a typical daily swing is, scaled to a year.',
        long: 'A stock with 30% annualised volatility moves about 1.9% on a typical day (30% ÷ √252). It measures the size of swings in both directions, not their direction.',
        formula: 'stdev(ln(v[t] / v[t−1])) × √252', computedIn: 'lib/strategies/metrics.ts annualizedVolPct', seeAlso: ['max-drawdown', 'vol63']},
    {key: 'vs-spy', kind: 'metric', term: 'vs SPY', aliases: ['vs spy', 'excess return', 'against the benchmark', 'versus the market'],
        short: 'The account\'s return minus SPY\'s return over exactly the same days.',
        long: 'The benchmark is measured from the account\'s own start date, so a young account and an old one are each compared with what the index did while they existed.',
        formula: 'account return − SPY return over the same window', seeAlso: ['benchmark', 'total-return']},
    {key: 'benchmark', kind: 'metric', term: 'Benchmark', aliases: ['benchmark', 'spy', 's&p 500 etf', 'the market'],
        short: 'SPY, the S&P 500 ETF, measured over the same days as the account.',
        long: 'One fund that holds the 500 largest US companies is the yardstick every account and every strategy is measured against. Owning it and doing nothing is itself one of the eight strategies.',
        seeAlso: ['vs-spy', 'simulated-record']},
    {key: 'simulated-record', kind: 'metric', term: 'Simulated record', aliases: ['simulated', 'simulated 3y', 'backtest', 'backtested'],
        short: 'The same rule run over three years of stored daily closes ending before launch — hypothetical, kept apart from the live record.',
        long: 'A backtest shows how the rule would have behaved on past data with next-day fills and no fees. It cannot know what the rule will do next, and the list of stocks it ran on was chosen recently, which flatters it.',
        seeAlso: ['benchmark', 'cagr']},
    {key: 'avg-cost', kind: 'metric', term: 'Average cost', aliases: ['avg cost', 'average cost', 'cost basis', 'average price paid'],
        short: 'The share-weighted average price paid for the shares held. Buying more moves it; selling does not.',
        long: 'Ten shares at $100 and five more at $130 give an average cost of $110. A sell realizes profit against this number, whatever each lot originally cost.',
        formula: 'Σ (shares × price paid) / Σ shares, over buys', computedIn: 'lib/trading/orders.ts executeOrder', seeAlso: ['realized-pnl', 'unrealized-pnl']},
    {key: 't-bill-rate', kind: 'metric', term: 'T-bill rate', aliases: ['t-bill rate', 't-bill', 'treasury bill', 'risk-free rate'],
        short: 'The yield on 13-week US Treasury bills — what cash earns with almost no risk.',
        long: 'The government borrows for three months at this rate. It is the floor every other investment is judged against: dual momentum uses it as the hurdle, and idle cash in a paper account earns it.',
        seeAlso: ['apy', 'above-hurdle']},
    {key: 'apy', kind: 'metric', term: 'APY', aliases: ['apy', 'annual percentage yield', 'interest rate on cash'],
        short: 'Annual percentage yield: the yearly rate on cash after daily compounding.',
        long: 'Interest is credited each day on the cash balance including earlier interest, so the yearly result is slightly more than the daily rate × 365.',
        formula: 'rate per day = (1 + APY)^(1/365) − 1', computedIn: 'lib/trading/income.ts dailyFactor', seeAlso: ['t-bill-rate', 'daily-compounding']},
    {key: 'daily-compounding', kind: 'metric', term: 'Daily compounding', aliases: ['daily compounding', 'compounding', 'compound interest'],
        short: 'Interest credited every day on a balance that already includes earlier interest.',
        long: 'Each day\'s interest is added to the balance, so the next day\'s interest is earned on a slightly larger amount. Over a year the difference from simple interest is small; over decades it is most of the result.',
        formula: 'balance × ((1 + APY)^(1/365) − 1) per day', seeAlso: ['apy', 'cagr']},
    {key: 'ex-date', kind: 'metric', term: 'Ex-dividend date', aliases: ['ex-date', 'ex-dividend date', 'ex dividend'],
        short: 'The first day a stock trades without its upcoming dividend; whoever held it at the previous close is paid.',
        long: 'A buy on the ex-date itself is one day late for that dividend; a sell on the ex-date still collects it. The share price usually opens lower by about the dividend on that day.',
        seeAlso: ['pay-date', 'dividend-yield']},
    {key: 'pay-date', kind: 'metric', term: 'Pay date', aliases: ['pay date', 'payment date', 'dividend paid'],
        short: 'The day a dividend arrives as cash — here, five days after the ex-date.',
        long: 'Between the ex-date and the pay date the dividend is owed but not yet paid. Paper accounts credit it on a fixed five-day lag, close to what real companies do.',
        computedIn: 'lib/trading/income.ts payDateFor', seeAlso: ['ex-date']},
    {key: 'market-order', kind: 'metric', term: 'Market order', aliases: ['market order', 'order type', 'fill'],
        short: 'An order to trade now at the going price. Paper fills use the last quote instantly; a real broker fills at the next available price.',
        long: 'Outside market hours a paper order still fills at the last close, whereas a real broker would queue it to the next open and the price could be different by then. There are no limit or stop orders here.',
        seeAlso: ['buying-power']},
    {key: 'effective-holdings', kind: 'metric', term: 'Effective holdings', aliases: ['effective holdings', 'effective number of holdings'],
        short: 'How many equal-sized positions the account behaves like: 1 ÷ the sum of squared weights.',
        long: 'Five holdings weighted 60/10/10/10/10 behave like about 2.4 equal ones, because the largest dominates. It is the count that matters for diversification, not the number of names.',
        formula: '1 / Σ weight²', seeAlso: ['concentration']},
    {key: 'concentration', kind: 'metric', term: 'Concentration', aliases: ['concentration', 'largest position'],
        short: 'The share of the account sitting in its largest position.',
        long: 'A measurement of how much of the account moves with one company\'s news. The AI Navigator, for comparison, caps itself at 20% per name.',
        seeAlso: ['effective-holdings']},
    {key: 'percentile', kind: 'metric', term: 'Percentile', aliases: ['percentile', 'percentile rank'],
        short: 'The share of a group that a value sits above: the 62nd percentile is above 62% of them.',
        long: 'Used to place one result inside a distribution of many — for example an account\'s return among a thousand random portfolios held over the same days.'},

    // ---- market figures --------------------------------------------------------------
    {key: 'market-cap', kind: 'metric', term: 'Market cap', aliases: ['market cap', 'market capitalization', 'market capitalisation'],
        short: 'Share price × shares outstanding: what the whole company trades for.',
        long: 'A $2 trillion market cap means buying every share at today\'s price would cost $2 trillion. It sizes companies against each other; it says nothing about whether the price is high or low relative to what the company earns.',
        formula: 'share price × shares outstanding', seeAlso: ['pe-ratio']},
    {key: 'pe-ratio', kind: 'metric', term: 'P/E ratio', aliases: ['p/e', 'pe', 'pe ratio', 'p/e ratio', 'price to earnings', 'price-to-earnings'],
        short: 'Price divided by the last twelve months of earnings per share: how many years of current profit the price represents.',
        long: 'A P/E of 30 means the market pays $30 for each $1 the company earned over the past year. Fast-growing companies tend to carry higher ratios and slow ones lower; the ratio has no meaning for a company with no profit.',
        formula: 'share price / earnings per share (trailing twelve months)', seeAlso: ['market-cap', 'dividend-yield']},
    {key: 'dividend-yield', kind: 'metric', term: 'Dividend yield', aliases: ['dividend yield', 'yield', 'dividends'],
        short: 'The last year\'s dividends per share as a percentage of the share price.',
        long: 'A 2% yield on a $100 stock means $2 of dividends per share over a year, paid in cash. Many companies pay none and keep every dollar in the business.',
        formula: 'dividends per share (last 12 months) / share price', seeAlso: ['ex-date', 'income']},
    {key: 'beta', kind: 'metric', term: 'Beta', aliases: ['beta'],
        short: 'How far the stock has moved for each 1% move in the market over past years: 1.5 means about 1.5× as far.',
        long: 'A beta above 1 means the stock has amplified market moves in both directions; below 1 means it has damped them. It is measured on the past and changes over time.',
        seeAlso: ['volatility']},
    {key: 'fifty-two-week-range', kind: 'metric', term: '52-week range', aliases: ['52-week range', '52 week high', '52 week low', 'yearly range'],
        short: 'The lowest and highest prices of the past year.',
        long: 'Where today\'s price sits inside the range says how far the stock is from its recent extremes; it does not say which way it goes next.'},

    // ---- news concepts (keys are lib/topics/starters.ts keywords) ---------------------
    {key: 'fomc', kind: 'concept', term: 'The FOMC', aliases: ['federal reserve', 'fed meeting', 'interest rate decision', 'the fed'],
        short: 'The Federal Open Market Committee: the Federal Reserve group that sets the US interest rate eight times a year.',
        long: 'Its decision moves the rate banks charge each other overnight, which feeds into mortgages, company borrowing and the return on cash. Markets react as much to the statement and the outlook as to the rate itself.',
        seeAlso: ['fed funds rate', 'rate cut', 'rate hike']},
    {key: 'fed funds rate', kind: 'concept', term: 'Fed funds rate', aliases: ['federal funds rate', 'policy rate', 'interest rates'],
        short: 'The overnight rate the Federal Reserve targets — the base every other US interest rate is built on.',
        long: 'When it rises, cash and T-bills pay more, borrowing costs more and future profits are worth less today; when it falls, the reverse. It is why a quarter-point change makes headlines.',
        seeAlso: ['fomc', 't-bill-rate']},
    {key: 'rate cut', kind: 'concept', term: 'Rate cut', aliases: ['rate cuts', 'cutting rates', 'easing'],
        short: 'The Federal Reserve lowering its target rate, usually to support a slowing economy.',
        long: 'Cheaper borrowing tends to lift stock prices and lower what cash earns. Markets often move before the cut, on the expectation, more than on the day itself.',
        seeAlso: ['fomc', 'fed funds rate']},
    {key: 'rate hike', kind: 'concept', term: 'Rate hike', aliases: ['rate hikes', 'raising rates', 'tightening'],
        short: 'The Federal Reserve raising its target rate, usually to slow inflation.',
        long: 'Higher rates make cash pay more and loans cost more; companies that depend on borrowing and stocks valued on distant profits tend to feel it most.',
        seeAlso: ['fomc', 'fed funds rate']},
    {key: 's&p 500', kind: 'concept', term: 'S&P 500', aliases: ['stock market', 'wall street', 'the index', 'sp500'],
        short: 'An index of 500 large US companies, weighted by market cap; the usual meaning of "the market".',
        long: 'A handful of the largest companies make up a large share of it, so the index can rise on a good day for a few giants. SPY is the fund that tracks it and the benchmark for every account here.',
        seeAlso: ['benchmark', 'market-cap']},
    {key: 'nasdaq', kind: 'concept', term: 'Nasdaq', aliases: ['nasdaq composite', 'nasdaq 100'],
        short: 'A US stock exchange and the index of the companies listed on it, heavy in technology.',
        long: 'Because so many technology companies list there, the Nasdaq index moves more than the S&P 500 when tech moves, in both directions.',
        seeAlso: ['s&p 500']},
    {key: 'dow jones', kind: 'concept', term: 'Dow Jones', aliases: ['the dow', 'dow jones industrial average', 'dow'],
        short: 'An index of 30 large US companies, weighted by share price rather than size.',
        long: 'The oldest US index and the one quoted in points on the evening news. Its price weighting means a high-priced stock moves it more than a larger company with a lower share price.',
        seeAlso: ['s&p 500']},
    {key: 'stock futures', kind: 'concept', term: 'Stock futures', aliases: ['futures', 'index futures', 'pre-market'],
        short: 'Contracts that trade overnight on where an index will be, read as a preview of the open.',
        long: 'Futures trade almost around the clock, so "futures are down" before the open is the market\'s reaction to overnight news. They often, but not always, predict the first minutes of trading.',
        seeAlso: ['s&p 500']},
    {key: 'earnings season', kind: 'concept', term: 'Earnings season', aliases: ['earnings', 'quarterly results', 'big tech earnings', 'earnings report'],
        short: 'The weeks after each quarter when listed companies report their results.',
        long: 'A company reports revenue, profit and often guidance for the next quarter. The stock reacts to the gap between the report and what analysts expected, not to the numbers alone — a profit can still send a stock down.',
        seeAlso: ['pe-ratio', 'magnificent seven']},
    {key: 'market rally', kind: 'concept', term: 'Market rally', aliases: ['rally', 'sell-off', 'selloff', 'correction'],
        short: 'A sustained rise across most of the market; a sell-off or correction is the opposite.',
        long: 'A correction is usually defined as a 10% fall from a high and a bear market as 20%. Rallies and sell-offs describe direction over days or weeks, not what happens next.',
        seeAlso: ['max-drawdown']},
    {key: 'crude oil', kind: 'concept', term: 'Crude oil', aliases: ['oil prices', 'oil production', 'wti', 'oil'],
        short: 'Unrefined petroleum, priced per barrel; WTI is the US benchmark grade, Brent the international one.',
        long: 'Oil feeds into fuel, transport and plastics, so its price moves inflation and the profits of energy companies. Supply decisions by producers and demand from the world economy set it.',
        seeAlso: ['opec', 'brent crude']},
    {key: 'opec', kind: 'concept', term: 'OPEC', aliases: ['opec+', 'oil cartel'],
        short: 'The group of oil-producing countries that coordinates how much oil its members pump.',
        long: 'By cutting or raising production quotas OPEC moves the price of oil, which is why its meetings are headlines for energy stocks and for inflation.',
        seeAlso: ['crude oil', 'brent crude']},
    {key: 'brent crude', kind: 'concept', term: 'Brent crude', aliases: ['brent'],
        short: 'The international benchmark grade of oil, priced in the North Sea.',
        long: 'Most of the world\'s oil is priced off Brent; the US grade, WTI, usually trades a few dollars below it.',
        seeAlso: ['crude oil', 'opec']},
    {key: 'natural gas', kind: 'concept', term: 'Natural gas', aliases: ['lng', 'gas prices'],
        short: 'The fuel behind much of the world\'s electricity and heating; LNG is the liquefied form that ships by sea.',
        long: 'Gas prices differ by region because pipelines and LNG terminals limit how much can move. Cold winters, storage levels and export capacity drive them.',
        seeAlso: ['crude oil']},
    {key: 'sanctions', kind: 'concept', term: 'Sanctions', aliases: ['economic sanctions', 'export controls'],
        short: 'Government restrictions on trade or finance with a country, company or person.',
        long: 'Sanctions can cut a company off from customers, suppliers or banking. Markets read them for who loses access to what — chips, oil, payments — and who might supply it instead.',
        seeAlso: ['tariffs', 'supply chain']},
    {key: 'tariffs', kind: 'concept', term: 'Tariffs', aliases: ['trade war', 'tariff', 'import duties', 'trade dispute'],
        short: 'Taxes on imported goods, paid by the importer and usually passed on in prices.',
        long: 'A tariff raises the cost of imported parts and finished goods, which reaches company margins and consumer prices. Companies that import a lot, or export to a country that retaliates, are the ones the market re-prices.',
        seeAlso: ['supply chain', 'sanctions']},
    {key: 'supply chain', kind: 'concept', term: 'Supply chain', aliases: ['supply chains', 'shortages', 'logistics'],
        short: 'The chain of suppliers, factories and shipping that turns raw materials into a product on a shelf.',
        long: 'A disruption anywhere along it — a port, a chip factory, a shipping lane — shows up as delays, shortages and higher prices weeks later, which is why the term appears in earnings reports.',
        seeAlso: ['tariffs']},
    {key: 'european central bank', kind: 'concept', term: 'European Central Bank', aliases: ['ecb'],
        short: 'The central bank for the countries that use the euro; it sets their interest rate as the Federal Reserve does for the US.',
        long: 'Its decisions move the euro against the dollar and the borrowing costs of European companies and governments.',
        seeAlso: ['fomc', 'bank of japan']},
    {key: 'bank of japan', kind: 'concept', term: 'Bank of Japan', aliases: ['boj'],
        short: 'Japan\'s central bank, known for holding interest rates near zero for decades.',
        long: 'Its rate moves the yen, and because so much money is borrowed cheaply in yen and invested elsewhere, a change there can ripple through markets far from Japan.',
        seeAlso: ['fomc', 'european central bank']},
    {key: 'imf', kind: 'concept', term: 'The IMF', aliases: ['international monetary fund', 'world bank'],
        short: 'The International Monetary Fund: lends to countries in financial trouble and publishes forecasts for the world economy.',
        long: 'Its growth forecasts and warnings are read as a temperature check on the global economy; the World Bank, its sister institution, funds development projects.',
        seeAlso: ['global economy']},
    {key: 'global economy', kind: 'concept', term: 'Global economy', aliases: ['world economy', 'gdp', 'recession', 'economic growth'],
        short: 'The combined output of every country, measured as GDP; a recession is a sustained fall in it.',
        long: 'Company profits track the economy they sell into. Growth forecasts, jobs numbers and inflation readings move markets because they change what profits are expected to be.',
        seeAlso: ['imf', 'fed funds rate']},
    {key: 'magnificent seven', kind: 'concept', term: 'Magnificent Seven', aliases: ['mag 7', 'mag seven', 'megacap tech'],
        short: 'The seven largest US technology companies, whose size means they drive much of the S&P 500\'s move.',
        long: 'Apple, Microsoft, Alphabet, Amazon, Nvidia, Meta and Tesla. Together they are a large share of the index by market cap, so their earnings weeks move the whole market.',
        seeAlso: ['s&p 500', 'earnings season', 'market-cap']},
    {key: 'ev tax credit', kind: 'concept', term: 'EV tax credit', aliases: ['ev subsidy', 'electric vehicle credit'],
        short: 'A government tax break for buying an electric vehicle; its rules change which cars qualify.',
        long: 'A credit lowers the effective price of qualifying cars, so a change in the rules moves demand for specific manufacturers and the battery supply chain behind them.',
        seeAlso: ['supply chain']},
    {key: 'bitcoin etf', kind: 'concept', term: 'Bitcoin ETF', aliases: ['spot bitcoin etf', 'crypto etf'],
        short: 'A fund listed on a stock exchange that holds bitcoin, so it can be bought like a share.',
        long: 'It lets ordinary brokerage accounts hold bitcoin without a crypto wallet. Flows into and out of these funds are watched as a measure of demand from traditional investors.',
        seeAlso: ['stablecoin bill']},
    {key: 'stablecoin bill', kind: 'concept', term: 'Stablecoin bill', aliases: ['stablecoin', 'digital asset', 'crypto regulation', 'crypto legislation'],
        short: 'Proposed law setting rules for stablecoins — digital tokens designed to hold a fixed value, usually one dollar.',
        long: 'Stablecoins are the cash of the crypto markets. Rules on what backs them and who may issue them decide which companies can run that business.',
        seeAlso: ['bitcoin etf']},
    {key: 'mortgage rates', kind: 'concept', term: 'Mortgage rates', aliases: ['mortgage rate', 'home loan rates'],
        short: 'The interest rate on home loans, which follows long-term government bond yields more than the Fed\'s overnight rate.',
        long: 'A higher rate raises the monthly payment on the same house, which cools demand, sales and eventually prices. Homebuilders and banks are the stocks that react first.',
        seeAlso: ['fed funds rate', 'home prices']},
    {key: 'home prices', kind: 'concept', term: 'Home prices', aliases: ['home sales', 'house prices', 'housing market'],
        short: 'What houses sell for, tracked monthly by indexes such as Case-Shiller.',
        long: 'Housing is most households\' largest asset, so its price affects how wealthy people feel and how much they spend — and it lags mortgage rates by months.',
        seeAlso: ['mortgage rates', 'case-shiller', 'housing starts']},
    {key: 'housing starts', kind: 'concept', term: 'Housing starts', aliases: ['homebuilders', 'construction starts'],
        short: 'The number of new homes on which construction began in a month.',
        long: 'A forward-looking measure: builders start homes when they expect to sell them. Rising starts point to confidence and to demand for lumber, appliances and labour.',
        seeAlso: ['home prices']},
    {key: 'case-shiller', kind: 'concept', term: 'Case-Shiller index', aliases: ['case shiller', 'home price index'],
        short: 'A monthly index of US home prices built from repeat sales of the same houses.',
        long: 'Comparing each house with its own earlier sale removes the effect of which houses happened to sell that month. It is published with a two-month delay.',
        seeAlso: ['home prices']},
    {key: 'rent prices', kind: 'concept', term: 'Rent prices', aliases: ['rents', 'rental market'],
        short: 'What tenants pay, a large part of the inflation measures the Federal Reserve watches.',
        long: 'Rent is about a third of the consumer price index, and it moves slowly because leases reset once a year — so rent trends shape inflation readings for months.',
        seeAlso: ['global economy', 'fed funds rate']},

    // ---- rails --------------------------------------------------------------------------
    {key: 'position-cap', kind: 'rail', term: 'Position cap', aliases: ['position cap', 'max position weight'],
        short: 'The largest share of the account the AI Navigator allows in one name: 20%.',
        long: 'A rail, not a forecast. Whatever the news says about a company, the Navigator\'s allocator will not put more than a fifth of the account in it.',
        computedIn: 'lib/navigator/config.ts MAX_POSITION_WEIGHT', seeAlso: ['concentration', 'cash-floor']},
    {key: 'cash-floor', kind: 'rail', term: 'Cash floor', aliases: ['cash floor', 'minimum cash'],
        short: 'The share of the account the AI Navigator always keeps in cash: 10%.',
        long: 'The floor is kept even when every candidate scores well, so the account is never fully invested.',
        computedIn: 'lib/navigator/config.ts MIN_CASH_WEIGHT', seeAlso: ['position-cap']},
] as const satisfies readonly GlossaryEntry[];

export type GlossaryKey = (typeof ENTRIES)[number]['key'];

export const GLOSSARY = Object.fromEntries(
    ENTRIES.map((entry) => [entry.key, entry]),
) as unknown as Readonly<Record<GlossaryKey, GlossaryEntry>>;

export const GLOSSARY_KEYS: readonly GlossaryKey[] = ENTRIES.map((entry) => entry.key);

export const isGlossaryKey = (value: string): value is GlossaryKey => value in GLOSSARY;

export const lookupTerm = (key: string): GlossaryEntry | null => (isGlossaryKey(key) ? GLOSSARY[key] : null);

export const shortHelp = (key: GlossaryKey): string => GLOSSARY[key].short;

export const entriesOfKind = (kind: GlossaryKind): GlossaryEntry[] => ENTRIES.filter((entry) => entry.kind === kind);

const ALIAS_INDEX: ReadonlyMap<string, GlossaryEntry> = new Map(
    ENTRIES.flatMap((entry) => [
        [entry.key, entry] as const,
        [entry.term.toLowerCase(), entry] as const,
        ...entry.aliases.map((alias) => [alias.toLowerCase(), entry] as const),
    ]),
);

const FILLER = new Set(['what', 'whats', 'is', 'are', 'does', 'do', 'mean', 'means', 'my', 'the', 'a', 'an', 'of', 'this', 'that', 'explain', 'define', 'here', 'in', 'on', 'app', 'aerotrade', 'please']);

// "What does my max drawdown mean?" → the max-drawdown entry. Exact key, term or alias
// first, then the longest run of words that is one, then any single word. Plain string
// comparison throughout: a query never becomes a RegExp.
export const resolveTerm = (query: string): GlossaryEntry | null => {
    const cleaned = query.toLowerCase().replace(/[?!.,;:"()]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!cleaned) return null;
    const direct = ALIAS_INDEX.get(cleaned);
    if (direct) return direct;
    const words = cleaned.split(' ').filter((word) => !FILLER.has(word));
    for (let size = Math.min(4, words.length); size >= 1; size -= 1) {
        for (let start = 0; start + size <= words.length; start += 1) {
            const hit = ALIAS_INDEX.get(words.slice(start, start + size).join(' '));
            if (hit) return hit;
        }
    }
    return null;
};

// Palette rows: entries whose term, key or alias starts with (then contains) the query,
// best matches first. Plain string comparison; never a RegExp from the query.
export const searchGlossary = (query: string, limit = 5): GlossaryEntry[] => {
    const q = query.toLowerCase().trim();
    if (q.length < 2) return [];
    const rank = (entry: GlossaryEntry): number => {
        const names = [entry.key, entry.term.toLowerCase(), ...entry.aliases.map((alias) => alias.toLowerCase())];
        if (names.some((name) => name.startsWith(q))) return 0;
        if (names.some((name) => name.includes(q))) return 1;
        return 2;
    };
    return ENTRIES
        .map((entry) => [rank(entry), entry] as const)
        .filter(([score]) => score < 2)
        .sort((a, b) => a[0] - b[0])
        .slice(0, limit)
        .map(([, entry]) => entry);
};

// A matched article term (a starter keyword, lowercase) → the concept that teaches it,
// or null when the term is a name rather than a concept.
export const conceptForTerm = (term: string): GlossaryEntry | null => {
    const hit = ALIAS_INDEX.get(term.toLowerCase().trim());
    return hit && hit.kind === 'concept' ? hit : null;
};
