import Badge from "@/components/primitives/Badge";
import {RATING_LABELS, type Rating} from "@/lib/agent-world/config";

// A desk rating as a data label: one neutral tone for all six, so no colour says which word is the
// stronger one, with the glossary's definition (handed down by the page) as its native tooltip.
const RatingBadge = ({rating, title}: {rating: Rating; title: string}) => (
    <Badge tone="neutral" variant="outline" title={title} data-aw-rating={rating} data-term="desk-rating">
        {RATING_LABELS[rating]}
    </Badge>
);

export default RatingBadge;
