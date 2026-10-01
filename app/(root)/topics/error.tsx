'use client';

import RouteError from "@/components/shell/RouteError";

// Route-level boundary: a failed topics read never blanks the shell.
const TopicsError = ({error, reset}: {error: Error & {digest?: string}; reset: () => void}) => (
    <RouteError error={error} reset={reset} title="Topics" message="Couldn't load your topics." />
);

export default TopicsError;
