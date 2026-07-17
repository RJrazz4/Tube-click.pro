/**
 * Stats & Content persistence — Phase A2
 * Now Zustand-backed with persistence + migration from old localStorage keys.
 * API kept backward compatible for existing pages importing from here.
 */

import { useContentStore, type Stats, type SavedContent } from "@/stores/useContentStore";

// Re-export types for convenience
export type { Stats, SavedContent };

// Direct store access for non-react code (e.g., inside event handlers)
export const getStats = (): Stats => {
  // Zustand persist store may not be hydrated yet, fallback to default
  try {
    return useContentStore.getState().getStats();
  } catch {
    return {
      scriptsGenerated: 0,
      thumbnailsCreated: 0,
      voiceoversGenerated: 0,
      guidesCreated: 0,
      lastUpdated: new Date().toISOString(),
    };
  }
};

export const updateStats = (updates: Partial<Stats>): Stats => {
  try {
    useContentStore.getState().updateStats(updates);
    return useContentStore.getState().getStats();
  } catch {
    return getStats();
  }
};

export const incrementStat = (key: keyof Omit<Stats, 'lastUpdated'>): Stats => {
  try {
    useContentStore.getState().incrementStat(key);
    return useContentStore.getState().getStats();
  } catch {
    return getStats();
  }
};

export const getSavedContent = (): SavedContent[] => {
  try {
    return useContentStore.getState().getSavedContent();
  } catch {
    return [];
  }
};

export const saveContent = (content: Omit<SavedContent, 'id' | 'createdAt'>): SavedContent => {
  try {
    return useContentStore.getState().saveContent(content);
  } catch {
    // Fallback if store not ready
    return {
      ...content,
      id: Math.random().toString(36).substr(2, 9),
      createdAt: new Date().toISOString(),
    };
  }
};

export const deleteContent = (id: string): void => {
  try {
    useContentStore.getState().deleteContent(id);
  } catch {}
};

export const clearAllContent = (): void => {
  try {
    useContentStore.getState().clearAll();
  } catch {}
};
