// Shaping a raw news item (Finnhub, RSS, Reddit, SEC, Google News search) into the article the
// digest, the feed and the news brain read: which raw items qualify, and the one formatted shape.
// Pure — it imports nothing.

// Check for required article fields
export const validateArticle = (article: RawNewsArticle) =>
    article.headline && article.summary && article.url && article.datetime;

// The news brain persists articles and wants more context than the email needs.
export const FULL_SUMMARY_MAX_CHARS = 1500;

export const formatArticle = (
    article: RawNewsArticle,
    isCompanyNews: boolean,
    symbol?: string,
    index: number = 0
) => ({
  // Stable id — deterministic so Inngest step replays produce identical output.
  // Dedup at the call site keeps article.id values distinct within a result set.
  id: article.id + index,
  headline: article.headline!.trim(),
  summary:
      article.summary!.trim().substring(0, isCompanyNews ? 200 : 150) + '...',
  // Untruncated text for the news brain; the email path strips this before prompting.
  fullSummary: article.summary!.trim().substring(0, FULL_SUMMARY_MAX_CHARS),
  source: article.source || (isCompanyNews ? 'Company News' : 'Market News'),
  url: article.url!,
  datetime: article.datetime!,
  image: article.image || '',
  category: isCompanyNews ? 'company' : article.category || 'general',
  related: isCompanyNews ? symbol! : article.related || '',
});
