/**
 * packages/orchestrator/embeddings.ts — Embedding provider.
 *
 * Produces 1536-dimensional unit-normalized embeddings using OpenAI's
 * text-embedding-3-small (cost $0.02/1M tokens — cheapest good-quality
 * embedding; dimension matches ghost_memory_chunks.embedding).
 *
 * The provider is abstracted so we can swap to Cohere embed-english-v3.0
 * or Gemini embedding-001 later without touching callers. A key-pool
 * pattern matches openRouterKeys() — accept OPENAI_API_KEYS as a CSV
 * with round-robin rotation + fatal-on-missing (fatal at import-time
 * lazily).
 *
 * Running in Edge runtime: uses global `fetch`, no Node deps.
 */

const DIMENSIONS = 1536;
const MODEL = "text-embedding-3-small";

let _keyIdx = 0;

function openAiKeys(): string[] {
  const env = process.env;
  const plural = (env.OPENAI_API_KEYS || "").trim();
  let keys: string[] = [];
  if (plural) {
    keys = plural.split(",").map((k) => k.trim()).filter(Boolean);
  } else {
    const single = (env.OPENAI_API_KEY || "").trim();
    if (single) keys.push(single);
  }
  return [...new Set(keys)];
}

function nextKey(): string {
  const keys = openAiKeys();
  if (keys.length === 0) {
    throw new Error(
      "OPENAI_API_KEYS (or OPENAI_API_KEY) not configured — embeddings unavailable. " +
        "Set a comma-separated list in the Vercel / Supabase environment.",
    );
  }
  const k = keys[_keyIdx % keys.length];
  _keyIdx = (_keyIdx + 1) % keys.length;
  return k;
}

/**
 * Embed one or more text inputs. Returns an array of length inputs.length,
 * each a Float64Array(DIMENSIONS). The function performs best-effort
 * dimension validation (throws if the provider returns a weird shape).
 */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const key = nextKey();
  const url = "https://api.openai.com/v1/embeddings";

  // OpenAI caps batch size at 2048 inputs; we stay well under.
  const BATCH = 512;
  const out: number[][] = [];

  for (let i = 0; i < texts.length; i += BATCH) {
    const batch = texts.slice(i, i + BATCH);
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: MODEL,
        input: batch,
        dimensions: DIMENSIONS,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Embedding API HTTP ${res.status}: ${body.slice(0, 200)}`);
    }
    const json = (await res.json()) as {
      data: Array<{ embedding: number[]; index: number }>;
      model: string;
    };
    if (!Array.isArray(json.data)) throw new Error("Embedding API returned no data");
    // The API returns entries in input order; sort defensively.
    const sorted = [...json.data].sort((a, b) => a.index - b.index);
    for (const entry of sorted) {
      if (!Array.isArray(entry.embedding) || entry.embedding.length !== DIMENSIONS) {
        throw new Error(
          `Embedding dimension mismatch: expected ${DIMENSIONS} got ${entry.embedding?.length}`,
        );
      }
      out.push(entry.embedding);
    }
  }

  return out;
}

export async function embedText(text: string): Promise<number[]> {
  const [v] = await embedTexts([text]);
  return v;
}

export const EMBEDDING_DIMENSIONS = DIMENSIONS;
export const EMBEDDING_MODEL = MODEL;
