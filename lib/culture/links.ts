// The one address of a brand's evidence: /culture filtered to the brand, scrolled to the
// #evidence panel (app/(root)/culture/page.tsx). The board, the rising list, the chips and the
// dashboard widget all link through it, so none can drop the anchor. `outboundHref` is the only
// way a stored item's link becomes an anchor — http(s) only, so a stored `javascript:` link
// renders as text. Pure and client-safe. lib/brain/links.ts is the news brain's twin.

export const brandEvidenceHref = (brandId: string): string => `/culture?brand=${encodeURIComponent(brandId)}#evidence`;

export const CULTURE_PICKS_HREF = '/culture?view=picks';
export const CULTURE_SYSTEM_HREF = '/culture?view=system';

export const outboundHref = (url: string): string | null => {
    const trimmed = url.trim();
    return /^https?:\/\/\S+$/i.test(trimmed) ? trimmed : null;
};
