'use client';

import { useState, useCallback, useRef } from 'react';

interface AsyncState<T> {
  data: T | null;
  error: Error | null;
  isLoading: boolean;
  isSuccess: boolean;
  isError: boolean;
}

interface UseAsyncOptions {
  // ป้องกันการเรียกซ้ำในขณะที่กำลังทำงาน
  preventConcurrent?: boolean;
  // Debounce time (ms)
  debounceMs?: number;
  // Callback เมื่อสำเร็จ
  onSuccess?: (data: any) => void;
  // Callback เมื่อเกิดข้อผิดพลาด
  onError?: (error: Error) => void;
}

export function useAsync<T = any>(options: UseAsyncOptions = {}) {
  const {
    preventConcurrent = true,
    debounceMs = 0,
    onSuccess,
    onError,
  } = options;

  const [state, setState] = useState<AsyncState<T>>({
    data: null,
    error: null,
    isLoading: false,
    isSuccess: false,
    isError: false,
  });

  const isRunningRef = useRef(false);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  const execute = useCallback(
    async (asyncFunction: () => Promise<T>): Promise<T | null> => {
      // ป้องกันการเรียกซ้ำ
      if (preventConcurrent && isRunningRef.current) {
        console.warn('Operation already in progress');
        return null;
      }

      // Clear debounce timer
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      const runAsync = async () => {
        isRunningRef.current = true;
        setState({
          data: null,
          error: null,
          isLoading: true,
          isSuccess: false,
          isError: false,
        });

        try {
          const result = await asyncFunction();
          setState({
            data: result,
            error: null,
            isLoading: false,
            isSuccess: true,
            isError: false,
          });
          onSuccess?.(result);
          return result;
        } catch (err) {
          const error = err instanceof Error ? err : new Error(String(err));
          setState({
            data: null,
            error,
            isLoading: false,
            isSuccess: false,
            isError: true,
          });
          onError?.(error);
          return null;
        } finally {
          isRunningRef.current = false;
        }
      };

      if (debounceMs > 0) {
        return new Promise((resolve) => {
          debounceTimerRef.current = setTimeout(async () => {
            const result = await runAsync();
            resolve(result);
          }, debounceMs);
        });
      }

      return runAsync();
    },
    [preventConcurrent, debounceMs, onSuccess, onError]
  );

  const reset = useCallback(() => {
    setState({
      data: null,
      error: null,
      isLoading: false,
      isSuccess: false,
      isError: false,
    });
  }, []);

  return {
    ...state,
    execute,
    reset,
    isRunning: isRunningRef.current,
  };
}

// Hook สำหรับป้องกันการ submit form ซ้ำ
export function useFormSubmit<T = any>(
  submitFn: () => Promise<T>,
  options: UseAsyncOptions = {}
) {
  const { execute, ...state } = useAsync<T>({
    preventConcurrent: true,
    ...options,
  });

  const handleSubmit = useCallback(
    async (e?: React.FormEvent) => {
      e?.preventDefault();
      return execute(submitFn);
    },
    [execute, submitFn]
  );

  return {
    ...state,
    handleSubmit,
  };
}

// Hook สำหรับ mutation (create, update, delete)
export function useMutation<T = any, P = any>(
  mutationFn: (params: P) => Promise<T>,
  options: UseAsyncOptions = {}
) {
  const { execute, ...state } = useAsync<T>({
    preventConcurrent: true,
    ...options,
  });

  const mutate = useCallback(
    async (params: P) => {
      return execute(() => mutationFn(params));
    },
    [execute, mutationFn]
  );

  return {
    ...state,
    mutate,
  };
}

export default useAsync;
