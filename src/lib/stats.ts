// Stats tracking for TubeGenius Pro
export interface Stats {
  scriptsGenerated: number;
  thumbnailsCreated: number;
  voiceoversGenerated: number;
  guidesCreated: number;
  lastUpdated: string;
}

export interface SavedContent {
  id: string;
  type: 'script' | 'thumbnail' | 'voiceover' | 'guide';
  title: string;
  content: string; // For scripts/guides it's text, for thumbnails it's base64 or URL
  createdAt: string;
}

const STATS_KEY = 'tubegenius-stats';
const CONTENT_KEY = 'tubegenius-content';

export const getStats = (): Stats => {
  const stored = localStorage.getItem(STATS_KEY);
  if (stored) {
    return JSON.parse(stored);
  }
  return {
    scriptsGenerated: 0,
    thumbnailsCreated: 0,
    voiceoversGenerated: 0,
    guidesCreated: 0,
    lastUpdated: new Date().toISOString(),
  };
};

export const updateStats = (updates: Partial<Stats>): Stats => {
  const current = getStats();
  const newStats = {
    ...current,
    ...updates,
    lastUpdated: new Date().toISOString(),
  };
  localStorage.setItem(STATS_KEY, JSON.stringify(newStats));
  return newStats;
};

export const incrementStat = (key: keyof Omit<Stats, 'lastUpdated'>): Stats => {
  const current = getStats();
  return updateStats({
    [key]: current[key] + 1,
  });
};

export const getSavedContent = (): SavedContent[] => {
  const stored = localStorage.getItem(CONTENT_KEY);
  if (stored) {
    return JSON.parse(stored);
  }
  return [];
};

export const saveContent = (content: Omit<SavedContent, 'id' | 'createdAt'>): SavedContent => {
  const saved = getSavedContent();
  const newContent: SavedContent = {
    ...content,
    id: Math.random().toString(36).substr(2, 9),
    createdAt: new Date().toISOString(),
  };
  saved.unshift(newContent);
  // Keep only last 50 items
  const trimmed = saved.slice(0, 50);
  localStorage.setItem(CONTENT_KEY, JSON.stringify(trimmed));
  return newContent;
};

export const deleteContent = (id: string): void => {
  const saved = getSavedContent();
  const filtered = saved.filter((c) => c.id !== id);
  localStorage.setItem(CONTENT_KEY, JSON.stringify(filtered));
};

export const clearAllContent = (): void => {
  localStorage.removeItem(CONTENT_KEY);
  localStorage.removeItem(STATS_KEY);
};
