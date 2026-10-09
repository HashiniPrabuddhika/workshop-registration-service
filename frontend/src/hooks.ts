import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "./api";

export function useFetch<T>(load: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(true);
  const ticket = useRef(0);
  const loader = useRef(load);
  loader.current = load;

  const reload = useCallback(() => {
    const current = ++ticket.current;
    setLoading(true);
    loader
      .current()
      .then((result) => {
        if (current === ticket.current) {
          setData(result);
          setError(null);
        }
      })
      .catch((reason: unknown) => {
        if (current === ticket.current) {
          setError(reason instanceof ApiError ? reason : new ApiError(0, "UNKNOWN", "Something went wrong"));
        }
      })
      .finally(() => {
        if (current === ticket.current) {
          setLoading(false);
        }
      });
  }, []);

  useEffect(() => {
    reload();
    return () => {
      ticket.current += 1;
    };
  }, deps);

  return { data, error, loading, reload };
}

export function useDebounced<T>(value: T, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}
