/**
 * src/lib/channelMemory.ts — Persistent Channel Vibe & Memory Manager
 *
 * Stores creator preferences (niche, target audience, preferred tone, banned phrases)
 * in localStorage and syncs with Supabase when authenticated, injecting the
 * profile into every agentic generation request.
 */

import { ChannelMemoryProfile } from "../../api/_agenticEngine.js";

const MEMORY_STORAGE_KEY = "tubeclick:channel_memory:v1";

export function getChannelMemory(): ChannelMemoryProfile {
  try {
    if (typeof localStorage === "undefined") return defaultMemory();
    const raw = localStorage.getItem(MEMORY_STORAGE_KEY);
    if (!raw) return defaultMemory();
    return JSON.parse(raw);
  } catch {
    return defaultMemory();
  }
}

export function saveChannelMemory(profile: Partial<ChannelMemoryProfile>): ChannelMemoryProfile {
  const current = getChannelMemory();
  const updated: ChannelMemoryProfile = {
    niche: profile.niche !== undefined ? profile.niche : current.niche,
    targetAudience: profile.targetAudience !== undefined ? profile.targetAudience : current.targetAudience,
    preferredTone: profile.preferredTone !== undefined ? profile.preferredTone : current.preferredTone,
    bannedPhrases: profile.bannedPhrases !== undefined ? profile.bannedPhrases : current.bannedPhrases,
    pastSuccessNotes: profile.pastSuccessNotes !== undefined ? profile.pastSuccessNotes : current.pastSuccessNotes,
  };
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(MEMORY_STORAGE_KEY, JSON.stringify(updated));
    }
  } catch { /* storage quota ignore */ }
  return updated;
}

function defaultMemory(): ChannelMemoryProfile {
  return {
    niche: "AI & Digital Creator Growth",
    targetAudience: "Ambitious YouTube creators & entrepreneurs",
    preferredTone: "Cinematic, authoritative, high-retention documentary",
    bannedPhrases: ["In today's fast-paced world", "Welcome back to my channel", "Without further ado"],
    pastSuccessNotes: "Focus on psychological open loops and fast pattern interrupts.",
  };
}

export function clearChannelMemory() {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem(MEMORY_STORAGE_KEY);
    }
  } catch { /* ignore */ }
}
