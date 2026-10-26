"use client";

import React, { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

interface QueryProviderProps {
  children: React.ReactNode;
}

export function QueryProvider({ children }: QueryProviderProps) {
  // Stable QueryClient instance per browser session (React 19 & Next.js App Router compliant)
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 2 * 60 * 1000, // 2 minutes: reuse valid cached data without re-fetching
            gcTime: 30 * 60 * 1000, // 30 minutes: keep inactive cache in memory for smooth navigation
            refetchOnWindowFocus: false, // Prevents aggressive background network spikes
            refetchOnReconnect: true, // Re-sync seamlessly when device regains connectivity
            retry: (failureCount, error: any) => {
              // Never retry permanent client/auth errors (401, 403, 404)
              const status = error?.status || error?.statusCode;
              if (status === 401 || status === 403 || status === 404) return false;
              return failureCount < 2;
            },
          },
          mutations: {
            retry: 1,
          },
        },
      })
  );

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
