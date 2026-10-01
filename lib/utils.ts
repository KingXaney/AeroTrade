import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const getDateRange = (days: number) => {
  const toDate = new Date();
  const fromDate = new Date();
  fromDate.setDate(toDate.getDate() - days);
  return {
    to: toDate.toISOString().split('T')[0],
    from: fromDate.toISOString().split('T')[0],
  };
};

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

export const getFormattedTodayDate = () => new Date().toLocaleDateString('en-US', {
  weekday: 'long',
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  timeZone: 'UTC',
});
