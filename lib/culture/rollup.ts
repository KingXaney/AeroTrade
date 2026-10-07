// Brands rolled up to their listed owner, for the page: what a ticker's brands weigh together
// and which of them carries a thesis. Pure. The pickers' own roll-up of attention features
// lives beside the scorer (Slice B); this one only summarises stored weights.

import {brandsByTicker, CULTURE_BRANDS} from "@/lib/culture/catalog";
import type {CultureBrand, CultureEntitySummary, Listing} from "@/lib/culture/types";

export type TickerBrandRow = {
    id: string;
    name: string;
    weightSlow: number;
    weightFast: number;
    sentimentSlow: number;
    thesis: boolean;
};

export type TickerRollup = {
    ticker: string;
    listing: Listing;
    company: string;
    brands: TickerBrandRow[];
    weightSlowSum: number;
    weightSlowMax: number;
    weightFastSum: number;
    // Weight-averaged over the owner's brands; 0 when none carries weight.
    sentimentSlow: number;
    thesisCount: number;
};

const ZERO = 1e-9;

export const rollupTickers = (
    entities: readonly CultureEntitySummary[],
    catalog: readonly CultureBrand[] = CULTURE_BRANDS,
): TickerRollup[] => {
    const byKey = new Map(entities.map((entity) => [entity.key, entity]));
    const rollups: TickerRollup[] = [];
    for (const [ticker, brands] of brandsByTicker(catalog)) {
        const rows: TickerBrandRow[] = brands.map((brand) => {
            const entity = byKey.get(brand.id);
            return {
                id: brand.id,
                name: brand.name,
                weightSlow: entity?.weightSlow ?? 0,
                weightFast: entity?.weightFast ?? 0,
                sentimentSlow: entity?.sentimentSlow ?? 0,
                thesis: entity?.thesisSince != null,
            };
        });
        const weightSlowSum = rows.reduce((sum, row) => sum + row.weightSlow, 0);
        rollups.push({
            ticker,
            listing: brands[0].owner!.listing,
            company: brands[0].owner!.company,
            brands: rows.sort((a, b) => b.weightSlow - a.weightSlow),
            weightSlowSum,
            weightSlowMax: rows.reduce((max, row) => Math.max(max, row.weightSlow), 0),
            weightFastSum: rows.reduce((sum, row) => sum + row.weightFast, 0),
            sentimentSlow: weightSlowSum < ZERO ? 0 : rows.reduce((sum, row) => sum + row.sentimentSlow * row.weightSlow, 0) / weightSlowSum,
            thesisCount: rows.filter((row) => row.thesis).length,
        });
    }
    return rollups.sort((a, b) => b.weightSlowSum - a.weightSlowSum || a.ticker.localeCompare(b.ticker));
};
