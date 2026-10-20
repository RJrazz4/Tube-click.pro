/**
 * Professional-details lead capture (Round 4, 2026-10-20 — owner pivot).
 *
 * In FREE_PRO_MODE, Pro activates only after the user submits this form.
 * Record shape (owner's exact field list):
 *   user_id, phone, email, location,
 *   online_income (range) + online_income_exact (optional),
 *   physical_income (range) + physical_income_exact (optional),
 *   referrer_code (signup attribution, if present),
 *   created_at / updated_at (server-side on the table).
 *
 * Storage: upsert into public.lead_profiles (migration
 * 202610200001_lead_profiles.sql — NOT yet applied server-side; the write
 * fails gracefully until it is, see saveLeadDetails). On submit the record
 * is ALSO:
 *   • cached in the browser (localStorage backup key) so nothing is lost
 *     before the schema/webhook exist, and
 *   • POSTed fire-and-forget to VITE_LEAD_SHEET_WEBHOOK_URL when configured
 *     (the Zapier → Google Sheets zap attaches there later).
 */
import { supabase } from "@/integrations/supabase/client";
import { getCurrentUserId } from "@/lib/auth/accessToken";

export const LEAD_RECORD_BACKUP_KEY = "tcp:lead-record";

export const INCOME_RANGES = [
  "Not earning yet",
  "Under ₹10k /month",
  "₹10k – ₹50k /month",
  "₹50k – ₹1L /month",
  "₹1L+ /month",
] as const;

export interface LeadDetailsRecord {
  user_id: string;
  phone: string;
  email: string;
  location: string;
  online_income: string;
  online_income_exact?: string | null;
  physical_income: string;
  physical_income_exact?: string | null;
  referrer_code?: string | null;
}

export interface LeadDetailsFormInput {
  phone: string;
  email: string;
  location: string;
  onlineIncome: string;
  onlineIncomeExact?: string;
  physicalIncome: string;
  physicalIncomeExact?: string;
}

export function validateLeadForm(input: LeadDetailsFormInput): string[] {
  const errors: string[] = [];
  const digits = input.phone.replace(/\D/g, "");
  if (digits.length < 10) errors.push("Enter a valid phone number (at least 10 digits).");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email.trim())) errors.push("Enter a valid email address.");
  if (!input.location.trim()) errors.push("Enter your location / address.");
  if (!INCOME_RANGES.includes(input.onlineIncome as (typeof INCOME_RANGES)[number]))
    errors.push("Choose your online earning range.");
  if (!INCOME_RANGES.includes(input.physicalIncome as (typeof INCOME_RANGES)[number]))
    errors.push("Choose your physical earning range.");
  return errors;
}

/** Best-effort: who referred this user at signup (referral_events.ref_code). */
export async function loadReferrerCode(): Promise<string | null> {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return null;
    const { data } = await (supabase as any)
      .from("referral_events")
      .select("ref_code")
      .eq("referred_user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const code = (data as { ref_code?: unknown } | null)?.ref_code;
    return typeof code === "string" && code ? code : null;
  } catch {
    return null;
  }
}

/**
 * Has this user already submitted the lead form?
 * Returns true (row exists), false (no row), or null (unknown — e.g. the
 * lead_profiles table doesn't exist yet, or offline). Callers should treat
 * null as "keep the current local flag".
 */
export async function loadLeadSubmitted(userId: string): Promise<boolean | null> {
  try {
    const { data, error } = await (supabase as any)
      .from("lead_profiles")
      .select("id")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle();
    if (error) return null;
    return Boolean(data);
  } catch {
    return null;
  }
}

function fireLeadWebhook(record: LeadDetailsRecord): void {
  try {
    const url = (import.meta as { env?: Record<string, string | undefined> }).env
      ?.VITE_LEAD_SHEET_WEBHOOK_URL;
    if (!url) return; // no-op until the Zapier→Sheets zap is attached
    void fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...record, source: "tubeclickpro-pro-activation" }),
      signal: AbortSignal.timeout(8_000),
    }).catch(() => {
      /* fire-and-forget: lead capture must never block or throw */
    });
  } catch {
    /* no-op */
  }
}

export interface LeadSaveResult {
  ok: boolean;
  /** True when the row landed in Supabase (false until the migration is applied). */
  dbSaved: boolean;
  record: LeadDetailsRecord;
}

/**
 * Persists the lead record and flips the local activation state.
 * The Pro unlock itself is driven by useAuthStore.setLeadSubmitted(true) —
 * callers set it on ok===true. DB/webhook are best-effort and never block
 * the unlock (the schema may not be applied yet — see module docstring).
 */
export async function saveLeadDetails(input: LeadDetailsFormInput): Promise<LeadSaveResult> {
  const errors = validateLeadForm(input);
  if (errors.length > 0) return { ok: false, dbSaved: false, record: null as never };

  const userId = await getCurrentUserId();
  if (!userId) return { ok: false, dbSaved: false, record: null as never };

  const referrer_code = await loadReferrerCode();
  const record: LeadDetailsRecord = {
    user_id: userId,
    phone: input.phone.replace(/[^\d+]/g, ""),
    email: input.email.trim(),
    location: input.location.trim(),
    online_income: input.onlineIncome,
    online_income_exact: input.onlineIncomeExact?.trim() || null,
    physical_income: input.physicalIncome,
    physical_income_exact: input.physicalIncomeExact?.trim() || null,
    referrer_code,
  };

  // Browser backup so the lead is never lost before schema/webhook exist.
  try {
    localStorage.setItem(LEAD_RECORD_BACKUP_KEY, JSON.stringify(record));
  } catch {
    /* storage may be unavailable — non-fatal */
  }

  let dbSaved = false;
  try {
    const { error } = await (supabase as any)
      .from("lead_profiles")
      .upsert(record as never, { onConflict: "user_id" });
    dbSaved = !error;
    if (error) console.warn("[leads] lead_profiles upsert failed (schema may not be applied yet)", error.message);
  } catch (e) {
    console.warn("[leads] lead_profiles upsert threw", e);
  }

  fireLeadWebhook(record);
  return { ok: true, dbSaved, record };
}
