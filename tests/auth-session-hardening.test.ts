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

  it("has no blanket localStorage wipe that could remove the Supabase refresh token", async () => {
    const files = await sourceFiles(join(root, "src"));
    const sources = await Promise.all(files.map((file) => readFile(file, "utf8")));

    expect(sources.some((source) => /localStorage\.clear\s*\(/.test(source))).toBe(false);
  });
});
