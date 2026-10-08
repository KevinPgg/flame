import { EventsScreenStatus } from "../events/EventsScreenStatus";

interface EventsStatusContainerProps {
  isLoading: boolean;
  isError: boolean;
  hasData: boolean;
  error: Error | null;
  onRetry: () => void;
}

/**
 * Orchestrates loading and error states for the events feed.
 * When there's no data and we're loading or errored, shows EventsScreenStatus.
 * Otherwise renders children.
 */
export function EventsStatusContainer({
  isLoading,
  isError,
  hasData,
  error,
  onRetry,
  children,
}: EventsStatusContainerProps & { children: React.ReactNode }) {
  const shouldShowStatus = !hasData && (isLoading || isError);

  if (shouldShowStatus) {
    return (
      <EventsScreenStatus
        isError={isError}
        error={error}
        isLoading={isLoading}
        hasData={hasData}
        onRetry={onRetry}
      />
    );
  }

  return <>{children}</>;
}
