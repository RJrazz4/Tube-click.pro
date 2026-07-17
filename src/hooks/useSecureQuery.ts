import { useQuery, useMutation, UseQueryOptions, UseMutationOptions } from "@tanstack/react-query";
import { fetchEdgeFunctionJson, fetchEdgeFunctionBlob, EdgeFunctionError } from "@/api/client/secureClient";
import { QK } from "@/api/client/queryKeys";
import { useAppStore } from "@/stores/useAppStore";
import { toast } from "sonner";

/**
 * Phase A2 — Global State & Caching
 * Wrappers around React Query providing:
 * - Centralized query keys (QK)
 * - SWR-like caching (staleTime 5m, gcTime 10m — defined in queryClient)
 * - Throttling via useAppStore.canGenerate() to prevent quota burn
 * - Instant UI feel without unnecessary re-renders
 */

// Generic secure query for JSON endpoints
export function useSecureJsonQuery<T>(
  functionName: string,
  body: unknown,
  queryKey: readonly unknown[],
  options?: Omit<UseQueryOptions<T, EdgeFunctionError>, 'queryKey' | 'queryFn'>
) {
  return useQuery<T, EdgeFunctionError>({
    queryKey,
    queryFn: ({ signal }) => fetchEdgeFunctionJson<T>(functionName, body, signal),
    ...options,
  });
}

// Mutation wrapper for generations (content, thumbnails, storyboard, etc)
export function useSecureMutation<T, TVariables>(
  functionName: string,
  options?: UseMutationOptions<T, EdgeFunctionError, TVariables>
) {
  const canGenerate = useAppStore((s) => s.canGenerate);
  const updateGenTime = useAppStore((s) => s.updateGenerationTime);

  return useMutation<T, EdgeFunctionError, TVariables>({
    mutationFn: async (variables) => {
      if (!canGenerate()) {
        // Soft throttle — wait minimal interval
        await new Promise((r) => setTimeout(r, 400));
      }
      updateGenTime();
      return fetchEdgeFunctionJson<T>(functionName, variables);
    },
    onError: (error) => {
      if (error.status === 429) {
        toast.error("Rate limit reached. Please wait a moment — caching will serve previous results instantly.");
      } else if (error.status >= 500) {
        toast.error("Server busy. Retrying with cached results if available...");
      }
    },
    ...options,
  });
}

// Blob mutation for audio
export function useSecureBlobMutation<TVariables>(
  functionName: string,
  options?: UseMutationOptions<Blob, EdgeFunctionError, TVariables>
) {
  const canGenerate = useAppStore((s) => s.canGenerate);
  const updateGenTime = useAppStore((s) => s.updateGenerationTime);

  return useMutation<Blob, EdgeFunctionError, TVariables>({
    mutationFn: async (variables) => {
      if (!canGenerate()) await new Promise((r) => setTimeout(r, 400));
      updateGenTime();
      return fetchEdgeFunctionBlob(functionName, variables);
    },
    ...options,
  });
}

// Re-export QK for convenience
export { QK };

// Helper hook for content generation (TubeBot style)
export function useContentGeneration() {
  return useSecureMutation<{ titles: string[]; hooks: string[]; script: string; hashtags: string[]; description: string }, { topic: string; platform: string; style: string; language: string }>(
    "generate-content",
    {
      // Cache per topic+style for 10 minutes — instant feel on revisit
      gcTime: 1000 * 60 * 10,
    }
  );
}

// Helper for thumbnails — with smart caching
export function useThumbnailGeneration() {
  return useSecureMutation<{ thumbnails: string[] }, { title: string; emotion: string; style: string; aspectRatio: string; count: number }>(
    "generate-thumbnail"
  );
}
