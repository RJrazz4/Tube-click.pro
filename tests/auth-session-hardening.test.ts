import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = new URL("..", import.meta.url).pathname;

async function sourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(entry.name) ? [path] : [];
  }));
  return files.flat();
}

describe("Supabase session persistence hardening", () => {
  it("uses localStorage and enables all persistent-session options", async () => {
    const clientSource = await readFile(join(root, "src/integrations/supabase/client.ts"), "utf8");

    expect(clientSource).toMatch(/storage:\s*localStorage/);
    expect(clientSource).toMatch(/persistSession:\s*true/);
    expect(clientSource).toMatch(/autoRefreshToken:\s*true/);
    expect(clientSource).toMatch(/detectSessionInUrl:\s*true/);
  });

  it("serves BrowserRouter deep links so the registered production callback can mount", async () => {
    const deployment = JSON.parse(await readFile(join(root, "vercel.json"), "utf8"));
    const appSource = await readFile(join(root, "src/App.tsx"), "utf8");

    expect(deployment.rewrites).toContainEqual({
      source: "/(.*)",
      destination: "/index.html",
    });
    expect(appSource).toMatch(/<Route path="\/auth\/callback" element={<AuthCallback \/>} \/>/);
  });

  it("uses the canonical callback and validates both popup origin and source", async () => {
    const contextSource = await readFile(join(root, "src/contexts/SoftGateContext.tsx"), "utf8");

    expect(contextSource).toMatch(/redirectTo:\s*`\$\{getCanonicalRoot\(\)\}\/auth\/callback`/);
    expect(contextSource).toMatch(/event\.origin !== callbackOrigin/);
    expect(contextSource).toMatch(/event\.source !== authPopupRef\.current/);
    expect(contextSource).toMatch(/supabase\.auth\.getSession\(\)/);
  });

  it("lets Supabase consume callback credentials exactly once", async () => {
    const callbackSource = await readFile(join(root, "src/pages/AuthCallback.tsx"), "utf8");

    expect(callbackSource).toMatch(/supabase\.auth\.initialize\(\)/);
    expect(callbackSource).toMatch(/supabase\.auth\.getSession\(\)/);
    expect(callbackSource).not.toMatch(/exchangeCodeForSession\s*\(/);
    expect(callbackSource).not.toMatch(/\.setSession\s*\(/);
    expect(callbackSource).not.toMatch(/document\.referrer/);
  });

  it("has no blanket localStorage wipe that could remove the Supabase refresh token", async () => {
    const files = await sourceFiles(join(root, "src"));
    const sources = await Promise.all(files.map((file) => readFile(file, "utf8")));

    expect(sources.some((source) => /localStorage\.clear\s*\(/.test(source))).toBe(false);
  });
});
