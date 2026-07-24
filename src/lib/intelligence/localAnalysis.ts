export type SignalKey = "clarity" | "specificity" | "audienceFit" | "tension" | "readability";

export interface InsightSignal {
  key: SignalKey;
  label: string;
  score: number;
  reason: string;
}

export interface LocalInsight {
  input: string;
  signals: InsightSignal[];
  summary: string;
  nextMove: string;
  analyzedAt: string;
  method: "local-rules";
}

const WORDS = /[A-Za-z0-9']+/g;
const cacheKey = (input: string) => `tc-cache:title-insight:${input.trim().toLowerCase()}`;

export function analyzeTitleLocally(input: string): LocalInsight {
  const text = input.trim().replace(/\s+/g, " ");
  const words = text.match(WORDS) ?? [];
  const wordCount = words.length;
  const hasNumber = /\d/.test(text);
  const hasSpecificPromise = /(how|why|guide|ways|steps|before|after|mistakes|best|learn|make)/i.test(text);
  const hasTension = /[?!]|without|secret|mistake|truth|vs\.?|challenge|actually/i.test(text);
  const clarity = Math.max(20, Math.min(98, 100 - Math.max(0, wordCount - 12) * 5 - (wordCount < 3 ? 25 : 0)));
  const specificity = Math.min(98, 38 + (hasNumber ? 22 : 0) + (hasSpecificPromise ? 25 : 0) + (wordCount > 5 ? 10 : 0));
  const audienceFit = Math.min(96, 48 + (hasSpecificPromise ? 24 : 0) + (hasNumber ? 12 : 0) + (text.includes("you") ? 10 : 0));
  const tension = Math.min(96, 34 + (hasTension ? 34 : 0) + (wordCount > 5 ? 12 : 0));
  const readability = Math.max(25, Math.min(98, 98 - Math.max(0, wordCount - 10) * 4 - (text.includes(":") ? 5 : 0)));

  const signals: InsightSignal[] = [
    { key: "clarity", label: "Clarity", score: clarity, reason: clarity >= 75 ? "The promise is easy to scan." : "Shorten the wording and surface the main promise earlier." },
    { key: "specificity", label: "Specificity", score: specificity, reason: specificity >= 70 ? "A concrete outcome or framing is present." : "Add an outcome, audience, number, or defined situation." },
    { key: "audienceFit", label: "Audience fit", score: audienceFit, reason: audienceFit >= 70 ? "The framing suggests a useful viewer intent." : "Name the viewer problem or desired result more directly." },
    { key: "tension", label: "Curiosity", score: tension, reason: tension >= 70 ? "There is a reason to continue reading." : "Introduce a meaningful contrast, question, or unresolved outcome." },
    { key: "readability", label: "Readability", score: readability, reason: readability >= 75 ? "The length is comfortable for a quick scan." : "Reduce clauses and remove filler words." },
  ];
  const weakest = [...signals].sort((a, b) => a.score - b.score)[0];
  return {
    input: text,
    signals,
    summary: `Strongest opportunity: improve ${weakest.label.toLowerCase()} without changing the core idea.`,
    nextMove: `Rewrite once with a clearer ${weakest.label.toLowerCase()} signal, then compare both versions.`,
    analyzedAt: new Date().toISOString(),
    method: "local-rules",
  };
}

export function loadCachedInsight(input: string): LocalInsight | null {
  try {
    const raw = localStorage.getItem(cacheKey(input));
    return raw ? JSON.parse(raw) as LocalInsight : null;
  } catch { return null; }
}

export function saveCachedInsight(insight: LocalInsight): void {
  try { localStorage.setItem(cacheKey(insight.input), JSON.stringify(insight)); } catch { /* storage is optional */ }
}
