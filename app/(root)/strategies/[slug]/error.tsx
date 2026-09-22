'use client';

import RouteError from "@/components/system/RouteError";

const StrategyError = ({error, reset}: {error: Error & {digest?: string}; reset: () => void}) => (
    <RouteError
        error={error}
        reset={reset}
        title="Strategy"
        message="Couldn't load this strategy. Its account and record may still be on the way."
    />
);

export default StrategyError;
