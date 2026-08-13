import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

/**
 * Vite configuration for TubeClick Pro.
 *
 * - React SWC plugin for fast HMR and production builds.
 * - `@/*` path alias resolves to `./src` (mirrors tsconfig paths).
 * - Production chunking isolates large third-party vendors so they
 *   cache independently and the initial bundle stays under budget.
 */
export default defineConfig(({ mode }) => ({
  server: {
    // Bind to IPv6 + IPv4 so the dev server is reachable from containers
    // and on the local network on all host OSes.
    host: "::",
    port: 8080,
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    target: "esnext",
    sourcemap: mode === "development",
    rollupOptions: {
      output: {
        // Vendor chunks keep cache keys stable across app-code-only pushes
        // and prevent re-download of large libraries on every deploy.
        manualChunks: {
          "react-vendor": ["react", "react-dom", "react-router-dom"],
          "supabase": ["@supabase/supabase-js"],
          "query": ["@tanstack/react-query"],
          "ui-core": [
            "@radix-ui/react-dialog",
            "@radix-ui/react-tabs",
            "@radix-ui/react-select",
            "@radix-ui/react-toast",
            "@radix-ui/react-tooltip",
          ],
          "icons": ["lucide-react"],
          // MP7 bundle audit. Recharts (~290kB raw) was being inlined into
          // the CompetitorShowdown route chunk, which made that single
          // lazy chunk 424kB and — worse — invalidated the whole thing on
          // every app-code deploy, forcing repeat downloads of an
          // unchanged charting library. Hoisting it into its own vendor
          // chunk restores a stable cache key and lets the route chunk
          // shrink to just its own component code.
          "charts": ["recharts"],
        },
      },
    },
    // Hint threshold; tuned to silence warnings for the heaviest vendor chunk.
    chunkSizeWarningLimit: 500,
  },
  optimizeDeps: {
    // Pre-bundle frequently-imported deps to smooth dev-server start-up.
    include: ["react", "react-dom", "react-router-dom", "@tanstack/react-query"],
  },
}));
