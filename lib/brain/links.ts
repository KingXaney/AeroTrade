// The one address of an entity's evidence: /brain filtered to the entity, scrolled to the
// #evidence section (app/(root)/brain/page.tsx). Pure and client-safe — the graph, Active
// Theses and the narrative leaderboard all link through it, so none can drop the anchor.
export const evidenceHref = (key: string): string => `/brain?entity=${encodeURIComponent(key)}#evidence`;
