'use client';

import RouteError from "@/components/system/RouteError";

const TopicError = ({error, reset}: {error: Error & {digest?: string}; reset: () => void}) => (
    <RouteError
        error={error}
        reset={reset}
        title="Topic"
        message="Couldn't load this topic. Its articles may still be on the way."
    />
);

export default TopicError;
