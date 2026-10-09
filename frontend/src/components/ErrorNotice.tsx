import type { ApiError } from "../api";

export function ErrorNotice({ error, onRetry }: { error: ApiError; onRetry?: () => void }) {
  return (
    <div className="notice notice-error" role="alert">
      <span>{error.message}</span>
      {onRetry ? (
        <button type="button" className="btn btn-quiet" onClick={onRetry}>
          Try again
        </button>
      ) : null}
    </div>
  );
}

export function fieldErrors(error: ApiError | null): Record<string, string> {
  const result: Record<string, string> = {};
  for (const item of error?.details ?? []) {
    result[item.field] = item.message;
  }
  return result;
}
