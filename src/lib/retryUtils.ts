/**
 * Retry Utility with Exponential Backoff and Fallback Strategies
 * Production-grade retry logic for API calls
 */

export interface RetryOptions {
  maxAttempts: number;
  baseDelay: number;
  maxDelay: number;
  onRetry?: (attempt: number, error: Error) => void;
}

const DEFAULT_OPTIONS: RetryOptions = {
  maxAttempts: 3,
  baseDelay: 1000,
  maxDelay: 10000,
};

/**
 * Execute a function with automatic retry and exponential backoff
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: Partial<RetryOptions> = {}
): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let lastError: Error = new Error('Unknown error');

  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      // Don't retry on certain errors
      const errorMessage = lastError.message.toLowerCase();
      if (
        errorMessage.includes('invalid api key') ||
        errorMessage.includes('authentication') ||
        errorMessage.includes('not configured') ||
        errorMessage.includes('credits required') ||
        errorMessage.includes('payment required')
      ) {
        throw lastError;
      }

      if (attempt < opts.maxAttempts) {
        // Calculate delay with exponential backoff
        const delay = Math.min(
          opts.baseDelay * Math.pow(2, attempt - 1),
          opts.maxDelay
        );
        
        // Add jitter (±20%)
        const jitter = delay * 0.2 * (Math.random() * 2 - 1);
        const finalDelay = Math.round(delay + jitter);

        opts.onRetry?.(attempt, lastError);
        
        await new Promise(resolve => setTimeout(resolve, finalDelay));
      }
    }
  }

  throw lastError;
}

/**
 * Execute with fallback - try primary function, fall back to secondary on failure
 */
export async function withFallback<T>(
  primary: () => Promise<T>,
  fallback: () => Promise<T>,
  options: Partial<RetryOptions> = {}
): Promise<T> {
  try {
    return await withRetry(primary, options);
  } catch (primaryError) {
    console.warn('Primary failed, trying fallback:', primaryError);
    try {
      return await withRetry(fallback, { ...options, maxAttempts: 2 });
    } catch (fallbackError) {
      // If both fail, throw the primary error as it's more informative
      throw primaryError;
    }
  }
}

/**
 * Create a simplified prompt as fallback for complex prompts
 */
export function createSimplifiedPrompt(originalPrompt: string): string {
  // Reduce complexity by keeping core elements
  const simplified = originalPrompt
    // Remove excessive detail
    .replace(/Ultra realistic|8K|professional DSLR|cinematic lighting/gi, 'realistic')
    .replace(/shallow depth of field|photorealistic|dramatic atmosphere/gi, '')
    // Simplify to essentials
    .replace(/,\s*,/g, ',')
    .replace(/\s+/g, ' ')
    .trim();
  
  // Ensure it's not too short
  if (simplified.length < 20) {
    return `High quality image: ${simplified}`;
  }
  
  return simplified;
}

/**
 * Rate limit helper - ensures minimum time between calls
 */
export class RateLimiter {
  private lastCall: number = 0;
  private readonly minInterval: number;

  constructor(minIntervalMs: number = 1000) {
    this.minInterval = minIntervalMs;
  }

  async throttle(): Promise<void> {
    const now = Date.now();
    const elapsed = now - this.lastCall;
    
    if (elapsed < this.minInterval) {
      await new Promise(resolve => setTimeout(resolve, this.minInterval - elapsed));
    }
    
    this.lastCall = Date.now();
  }
}
