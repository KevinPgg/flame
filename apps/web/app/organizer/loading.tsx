import LoadingSpinner from "../components/LoadingSpinner";

export default function OrganizerLoading() {
  return (
    <LoadingSpinner
      title="Loading Organizer Dashboard"
      subtitle="Preparing your events and data..."
      fullHeight={true}
    />
  );
}
