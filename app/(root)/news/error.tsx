'use client';

import RouteError from "@/components/shell/RouteError";

// Route-level boundary: a failed feed never blanks the shell.
const NewsError = ({error, reset}: {error: Error & {digest?: string}; reset: () => void}) => (
    <RouteError error={error} reset={reset} title="News" message="Couldn't load your feed." />
);

export default NewsError;
