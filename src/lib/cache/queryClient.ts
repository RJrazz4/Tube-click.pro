import { QueryClient } from "@tanstack/react-query";

export const createAppQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 1000 * 60 * 5, // 5 min — instant UI feels smooth
        gcTime: 1000 * 60 * 10, // 10 min cache retention
        retry: 1,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
      },
      mutations: {
        retry: 1,
      },
    },
  });
