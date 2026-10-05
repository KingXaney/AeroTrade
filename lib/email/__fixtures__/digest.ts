// A realistic day for the daily brief, shared by the unit tests (lib/email/__tests__) and the
// preview script (scripts/qa/email-preview.mjs). Outlets and links are made up; the shapes are
// the real ones.

import type {DigestArticle} from '@/lib/email/digest-summary';
import type {NavigatorDigest} from '@/lib/email/digest-view';
import type {TopicDigestInput} from '@/lib/email/sections/topics';

export const FIXTURE_DAY = '2026-10-05';
export const FIXTURE_APP = 'https://app.example.com';
export const FIXTURE_SYMBOLS = ['NVDA', 'AAPL', 'XLE'];

export const FIXTURE_ARTICLES: DigestArticle[] = [
    {headline: 'Nvidia shares climb 3% as data-center orders run ahead of supply', summary: 'Nvidia rose 3.1% to $142.10 after two suppliers said orders for its data-center chips still exceed what they can ship this quarter. The company reports results on November 19.', source: 'Reuters', url: 'https://news.example.com/nvidia-orders', related: 'NVDA', sourceType: 'finance'},
    {headline: 'Chip suppliers say AI demand has not slowed', summary: 'Two Taiwanese suppliers raised their fourth-quarter shipment estimates, citing orders from US cloud companies.', source: 'Bloomberg', url: 'https://news.example.com/chip-suppliers', related: 'NVDA', sourceType: 'finance'},
    {headline: 'Fed holds rates at 4.25%–4.50% and signals patience', summary: 'The Federal Reserve left its benchmark rate unchanged for a third meeting. Officials said they want more data on inflation before moving.', source: 'CNBC', url: 'https://news.example.com/fed-holds', related: '', sourceType: 'rss'},
    {headline: 'Oil falls 2% as OPEC+ output rises for a second month', summary: 'Brent crude fell to $71.40 a barrel after the group confirmed a second monthly increase in production.', source: 'MarketWatch', url: 'https://news.example.com/oil-falls', related: 'XLE', sourceType: 'finance'},
    {headline: 'Apple files 8-K on leadership change', summary: 'Apple filed a current report with the SEC describing a change in its operations leadership.', source: 'SEC EDGAR', url: 'https://sec.example.com/aapl-8k', related: 'AAPL', sourceType: 'sec'},
    {headline: 'r/stocks debates whether chip rally has room to run', summary: 'A popular thread argues about chip valuations after this week\'s gains.', source: 'r/stocks', url: 'https://reddit.example.com/r/stocks/chips', related: '', sourceType: 'reddit'},
    {headline: 'City council approves new transit line', summary: 'The council voted 7–2 to fund the first phase of a light-rail line.', source: 'Local Times', url: 'https://local.example.com/transit', related: '', sourceType: 'web'},
];

// What a well-behaved model answers for FIXTURE_ARTICLES.
export const FIXTURE_MODEL_ANSWER = JSON.stringify({
    headline: 'Chipmakers rise on strong orders while the Fed holds rates steady',
    bullets: [
        {text: 'Nvidia rose 3.1% after suppliers said data-center chip orders still exceed what they can ship.', articles: [1, 2]},
        {text: 'The Federal Reserve kept its benchmark rate at 4.25%–4.50% for a third meeting.', articles: [3]},
        {text: 'Brent crude fell 2% to $71.40 as OPEC+ raised output again.', articles: [4]},
    ],
    stories: [
        {title: 'Nvidia climbs as chip orders outrun supply', summary: 'Nvidia rose 3.1% to $142.10 after two suppliers said orders still exceed shipments this quarter. Both raised their fourth-quarter estimates.', why: 'When orders outrun supply, the bottleneck is how fast factories can build chips, not how many buyers there are.', articles: [1, 2]},
        {title: 'Fed keeps rates unchanged for a third meeting', summary: 'The Fed held its benchmark rate at 4.25%–4.50%. Officials said they want more inflation data before moving.', why: 'The benchmark rate sets what banks pay to borrow overnight, which feeds into loan and savings rates.', articles: [3]},
        {title: 'Oil slips as OPEC+ adds supply', summary: 'Brent fell 2% to $71.40 a barrel after a second monthly output increase.', why: 'More barrels on the market with the same demand usually means a lower price per barrel.', articles: [4]},
        {title: 'Apple files a current report on leadership', summary: 'Apple filed an 8-K describing a change in its operations leadership.', why: 'An 8-K is the form a company files to report a major event between its quarterly reports.', articles: [5]},
        {title: 'Reddit posters argue over the chip rally', summary: 'Posters on r/stocks debated chip valuations after the week\'s gains.', why: 'Forum threads show what some individual investors are discussing, not verified facts.', articles: [6]},
        {title: 'City approves a new transit line', summary: 'The council voted 7–2 to fund the first phase of a light-rail line.', why: '', articles: [7]},
    ],
});

export const FIXTURE_NAVIGATOR: NavigatorDigest = {
    date: '2026-10-05',
    items: [
        {action: 'buy', symbol: 'NVDA', targetWeightPct: 12, executed: true},
        {action: 'sell', symbol: 'XLE', targetWeightPct: 0, executed: true},
        {action: 'hold', symbol: 'SPY', targetWeightPct: 40, executed: false},
    ],
    rationale: '## This week\n**Chips** led the news brain\'s themes, so the Navigator added to [NVDA](https://evil.example.com) and sold XLE.',
    activeTheses: ['AI data-center spending', 'Rate path', 'Oil supply'],
};

export const FIXTURE_TOPICS: TopicDigestInput[] = [
    {
        name: 'AI chips', slug: 'ai-chips', newCount: 4,
        brief: {summary: 'Suppliers raised shipment estimates as cloud orders kept coming.', bullets: ['Two suppliers raised Q4 estimates.', 'Cloud companies are the main buyers.']},
        articles: [
            {headline: 'Chip suppliers say AI demand has not slowed', url: 'https://news.example.com/chip-suppliers', source: 'Bloomberg'},
            {headline: 'Data-center builds hit a record', url: 'https://news.example.com/dc-record', source: 'The Wire'},
        ],
    },
    {name: 'Fed rate decisions', slug: 'fed-rate-decisions', newCount: 0, brief: null, articles: []},
];
