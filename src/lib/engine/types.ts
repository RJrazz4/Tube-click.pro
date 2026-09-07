/**
 * Engine contracts (mirror of tubeclickpro-backend-engine response shapes).
 * Keep in sync with the engine's src/audience/tier.ts, script contracts, and
 * challenge-core — these types are the frontend's single source of truth.
 */

export interface AudienceHunger {
  topic: string;
  rank: number;
  score: number;
  evidence: {
    watch_share_pct?: number;
    engagement_rate?: number;
    hook_retention?: number;
    demand_videos_28d?: number;
    supply_videos_90d?: number;
    sample_video_ids?: Array<{ video_id: string }>;
    [k: string]: unknown;
  };
  geo?: Record<string, unknown>;
}

export interface AudienceProfile {
  freshness: "fresh" | "stale" | "cold" | "empty";
  computedAt: string;
  tier: "free" | "premium";
  hungers: AudienceHunger[];
  lockedHungerCount: number;
  rollups: Record<string, unknown>;
  narrative?: { brief?: AudienceBrief } | null;
  upsell?: { message: string };
}

export interface AudienceBrief {
  headline: string;
  who: string;
  where_when: string;
  what_they_want: string[];
  retention_truth: string;
  next_3_videos: Array<{ title_idea: string; why: string; hunger_topic: string }>;
}

export type DayCell =
  | { kind: "done"; date: string; star: boolean }
  | { kind: "freeze"; date: string }
  | { kind: "missed"; date: string }
  | { kind: "today"; date: string; done: boolean; star: boolean }
  | { kind: "locked"; date: null; dayNumber: number };

export interface ChallengeMilestone {
  day: number;
  id: "rising" | "momentum" | "algorithm" | "champion";
  label: string;
  achieved: boolean;
}

export interface ChallengeState {
  status: "active" | "completed" | "abandoned" | "not_enrolled";
  timezone?: string;
  start_date?: string;
  elapsed_days?: number;
  streak?: number;
  best_streak?: number;
  freezes_used?: number;
  freezes_earned?: number;
  total_script_days?: number;
  total_publish_days?: number;
  challenge_length_days?: number;
  today?: {
    local_date: string;
    done: boolean;
    drop_available_at: string;
    drop_topic: string | null;
  };
  milestones?: ChallengeMilestone[];
  cells?: DayCell[];
}

export interface EngineScriptListItem {
  id: string;
  kind: "outline" | "package";
  status: string;
  hunger_topic: string | null;
  tier: "free" | "premium";
  critic: { weighted_total?: number; verdict?: string; error?: string } | null;
  cost_usd: number;
  created_at: string;
}

export interface EngineScriptDetail extends EngineScriptListItem {
  package: {
    hook?: { text: string; seconds: number; variants: string[] };
    beats?: Array<{ title: string; purpose: string; seconds: number }>;
    sections?: Array<{ heading: string; voiceover: string; b_roll_cues?: string[] }>;
    title_variants?: string[];
    thumbnail_texts?: string[];
    description?: string;
    tags?: string[];
    chapters?: Array<{ label: string; at_second: number }>;
    posting_window?: { note: string };
    audience_evidence?: { grounding_references: string[]; evidence_numbers: string[] };
    why_it_works?: string[];
    hook_angle?: string;
    [k: string]: unknown;
  } | null;
  grounding_hash?: string;
  prompt_version?: string;
}

// ── Dual-LLM Daily Content Engine (backend /api/content/daily) ──────────
export interface DailyVisualBeat {
  at: string; // "00:00-00:05"
  shot: string;
  broll: string;
}

export interface DailyPackage {
  format: 'short' | 'long';
  hunger_topic: string;
  title: string;
  script: string;
  hook: { text: string; seconds: number; variants: string[] };
  voiceover_prompt: string;
  tags: string[];
  description: string;
  visual_timeline: DailyVisualBeat[];
  thumbnail_text?: string;
  posting_window: { note: string };
  audience_evidence: { grounding_references: string[]; evidence_numbers: string[] };
}

export interface DailyEditorReport {
  approved: boolean;
  opening_rewritten: boolean;
  generic_intros_removed: string[];
  hook_reason: string;
  format_issues: string[];
  model?: string;
}

export interface DailyContentRecord {
  date: string;
  userId: string;
  tier: 'free' | 'premium';
  groundingHash: string;
  generationModel: string;
  editorModel: string;
  result: { short: DailyPackage; long?: DailyPackage };
  reports: { short: DailyEditorReport; long?: DailyEditorReport };
  costUsd: number;
  createdAt: string;
}

export interface CompetitorGap {
  niche?: string;
  avgVelocity?: number;
  monthlyRevenue?: number;
  topVideoTitle?: string;
  topVideoChannel?: string;
  topVideoVelocity?: number;
  topVideoViews?: number;
}

export interface ConnectionStatus {
  connected: boolean;
  status?: "active" | "expired" | "revoked" | "error";
  channelTitle?: string;
  channelHandle?: string;
  lastSyncAt?: string | null;
  syncError?: string | null;
}
