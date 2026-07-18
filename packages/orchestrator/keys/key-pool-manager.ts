/**
 * Phase A2 — KeyPoolManager: provider registry over A1's parsed pools.
 *
 *   const manager = KeyPoolManager.fromEnv(loadEnv());
 *   const lease = manager.pool("agnes").getNextKey();
 *
 * One KeyPool per non-empty provider bucket (canonical order: agnes, gemini,
 * hf — reordered for readability, not priority; Phase C ranks providers).
 * Unconfigured providers fail loudly and early via pool(), while hasKeys()
 * lets the routing engine (C3) skip them without try/catch.
 */
import {
  IMAGE_PROVIDER_IDS,
  type AppEnv,
  type ImageKeyPools,
  type ImageProviderId,
} from "../../shared/env/index.js";

import { ProviderNotConfiguredError } from "./errors.js";
import { KeyPool, type KeyHealth } from "./key-pool.js";

export interface KeyPoolManagerOptions {
  /** Clock injection — propagated into every pool in the registry. */
  now?: () => number;
}

export class KeyPoolManager {
  private readonly pools = new Map<ImageProviderId, KeyPool>();

  constructor(imageKeyPools: ImageKeyPools, options: KeyPoolManagerOptions = {}) {
    for (const id of IMAGE_PROVIDER_IDS) {
      const keys = imageKeyPools[id];
      if (keys.length > 0) {
        this.pools.set(id, new KeyPool(keys, { provider: id, now: options.now }));
      }
    }
  }

  /** Register pools straight from a validated A1 environment. */
  static fromEnv(
    env: Pick<AppEnv, "imageKeyPools">,
    options: KeyPoolManagerOptions = {},
  ): KeyPoolManager {
    return new KeyPoolManager(env.imageKeyPools, options);
  }

  /** True when the provider has at least one configured key. */
  hasKeys(provider: ImageProviderId): boolean {
    return this.pools.has(provider);
  }

  /** Providers with ≥1 configured key, in canonical order. */
  configuredProviders(): ImageProviderId[] {
    return IMAGE_PROVIDER_IDS.filter((id) => this.pools.has(id));
  }

  /**
   * The pool for a provider.
   * @throws {ProviderNotConfiguredError} when the provider has no keys.
   */
  pool(provider: ImageProviderId): KeyPool {
    const pool = this.pools.get(provider);
    if (!pool) throw new ProviderNotConfiguredError(provider);
    return pool;
  }

  /** New billing cycle across every provider. */
  reset(): void {
    for (const pool of this.pools.values()) pool.reset();
  }

  /** Redacted health across configured providers — safe for /metrics. */
  snapshotAll(): Partial<Record<ImageProviderId, KeyHealth[]>> {
    const out: Partial<Record<ImageProviderId, KeyHealth[]>> = {};
    for (const [id, pool] of this.pools) out[id] = pool.snapshot();
    return out;
  }
}
