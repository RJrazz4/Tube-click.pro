## Summary of Changes

1. **Promptsmith LLM Middleman (`packages/orchestrator/promptsmith`)**:
   - Ingests raw user input (Hinglish, shorthand notes, conversational notes) and translates them into a strict, optimized English prompt specification (`OptimizedPromptSpec`: subject, style, camera, negativePrompts, rawPrompt).
   - Designed for $0 cost architecture utilizing free-tier JSON-mode completion clients (OpenRouter / Gemini Flash / Llama-3).
   - Includes robust rule-based deterministic fallback sanitizer to guarantee 100% pipeline reliability even under upstream LLM hiccups.

2. **Router Resilience & Pre-Fallback Retry Logic (`packages/orchestrator/resilience/fallback-executor.ts`)**:
   - Added configurable `maxPrimaryRetries` and Promptsmith integration.
   - Prevents premature cascading to backup/fallback engines by retrying primary providers with Promptsmith-optimized prompts on transient failures before giving up or falling back.

3. **Testing**:
   - Comprehensive unit tests added and passing for Promptsmith and primary retry resilience.
   - All 469 orchestrator and integration tests passing successfully.
