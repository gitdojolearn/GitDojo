import { ErrorState } from "@/components/site/page-states";

export function WorkspaceError({
  details,
  onRetry,
}: {
  details: string | null;
  onRetry: () => void;
}) {
  return (
    <ErrorState
      title="Something went wrong loading this lesson."
      description="GitDojo stores lessons in your browser's IndexedDB. Private browsing modes can block it."
      details={details}
      onRetry={onRetry}
    />
  );
}
