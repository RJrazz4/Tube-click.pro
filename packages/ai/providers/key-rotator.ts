/**
 * Phase 3 — KeyRotator: Round-robin API-key rotation for a single provider.
 *
 * Each provider adapter that requires authentication holds one KeyRotator
 * instance.  When the adapter receives a 429 / 402 / 401 it calls `rotate()`
 * to advance to the next key.  The Generator Orchestrator catches
 * `AllKeysExhaustedError` and fails over to the next provider in the chain.
 */

import { AllKeysExhaustedError } from "./types.js";

export class KeyRotator {
  /** Human-readable label for diagnostics (e.g. "agnes-flash"). */
  public readonly label: string;

  private readonly keys: string[];
  private index = 0;
  /** Tracks which keys have been marked exhausted this cycle. */
  private exhausted = new Set<number>();

  /**
   * @param label  Provider name used in error messages.
   * @param keys   Non-empty array of API keys.  A single key is fine;
   *               rotation is a no-op until `exhaust()` is called.
   */
  constructor(label: string, keys: string[]) {
    if (!keys.length) {
      throw new Error(`KeyRotator("${label}"): at least one key is required`);
    }
    this.label = label;
    this.keys = [...new Set(keys.filter(Boolean))];
  }

  /** Return the currently-active key. */
  get current(): string {
    return this.keys[this.index % this.keys.length];
  }

  /** Number of keys currently available (not exhausted). */
  get available(): number {
    return this.keys.length - this.exhausted.size;
  }

  /** Total number of keys managed. */
  get total(): number {
    return this.keys.length;
  }

  /**
   * Mark the current key exhausted and rotate to the next non-exhausted key.
   *
   * @throws {AllKeysExhaustedError} when every key has been exhausted.
   */
  rotate(): void {
    this.exhausted.add(this.index);

    // Try to find a non-exhausted key
    for (let i = 1; i <= this.keys.length; i++) {
      const next = (this.index + i) % this.keys.length;
      if (!this.exhausted.has(next)) {
        this.index = next;
        return;
      }
    }

    // Every key is exhausted
    throw new AllKeysExhaustedError(this.label);
  }

  /** Reset all keys as available (e.g. after a successful generation). */
  reset(): void {
    this.exhausted.clear();
  }

  /** Convenience: call `rotate()` but return `true`/`false` instead of throwing. */
  tryRotate(): boolean {
    try {
      this.rotate();
      return true;
    } catch {
      return false;
    }
  }
}
