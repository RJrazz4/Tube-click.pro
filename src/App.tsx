import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { MainLayout } from "@/components/layout/MainLayout";
import { createAppQueryClient } from "@/lib/cache/queryClient";
import { SoftGateProvider } from "@/contexts/SoftGateContext";
import { SoftGateRoute } from "@/components/auth/SoftGateRoute";

// Eager load the dashboard for instant first paint
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";

// Lazy load heavy tool pages to reduce initial bundle — Phase A1 Performance
const ChatAgent = lazy(() => import("./pages/ChatAgent"));
const VoiceStudio = lazy(() => import("./pages/VoiceStudio"));
const Repurposer = lazy(() => import("./pages/Repurposer"));
const Analytics = lazy(() => import("./pages/Analytics"));
const SeoOptimizer = lazy(() => import("./pages/SeoOptimizer"));
const Privacy = lazy(() => import("./pages/Privacy"));
const Terms = lazy(() => import("./pages/Terms"));
const About = lazy(() => import("./pages/About"));
const AdminPanel = lazy(() => import("./pages/AdminPanel"));
const Settings = lazy(() => import("./pages/Settings"));
const CloneCrush = lazy(() => import("./pages/CloneCrush"));
const ReferralCapture = lazy(() => import("./pages/ReferralCapture"));
const AuthCallback = lazy(() => import("./pages/AuthCallback"));
const Rewards = lazy(() => import("./pages/Rewards"));

// Tuned QueryClient for instant feel — stale 5min, gc 10min, no refetch on focus
const queryClient = createAppQueryClient();

// Loading fallback component
const PageLoader = () => (
  <div className="flex items-center justify-center min-h-[60vh]">
    <div className="flex flex-col items-center gap-4">
      <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      <p className="text-muted-foreground text-sm font-display">Loading...</p>
    </div>
  </div>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner 
        theme="dark" 
        position="bottom-right"
        toastOptions={{
          style: {
            background: "hsl(240, 10%, 8%)",
            border: "1px solid hsl(240, 10%, 18%)",
            color: "hsl(0, 0%, 95%)",
          },
        }}
      />
      <SoftGateProvider>
        <BrowserRouter>
          <MainLayout>
            <Suspense fallback={<PageLoader />}>
              <Routes>
                <Route path="/" element={<Index />} />
                <Route path="/chat-agent" element={<SoftGateRoute><ChatAgent /></SoftGateRoute>} />
                <Route path="/voice" element={<SoftGateRoute><VoiceStudio /></SoftGateRoute>} />
                <Route path="/repurposer" element={<SoftGateRoute><Repurposer /></SoftGateRoute>} />
                <Route path="/analytics" element={<SoftGateRoute><Analytics /></SoftGateRoute>} />
                <Route path="/seo" element={<SoftGateRoute><SeoOptimizer /></SoftGateRoute>} />
                <Route path="/privacy" element={<Privacy />} />
                <Route path="/terms" element={<Terms />} />
                <Route path="/about" element={<About />} />
                <Route path="/admin" element={<AdminPanel />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="/rewards" element={<Rewards />} />
                <Route path="/clone-crush" element={<SoftGateRoute><CloneCrush /></SoftGateRoute>} />
                <Route path="/ref/:code" element={<ReferralCapture />} />
                <Route path="/auth/callback" element={<AuthCallback />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </MainLayout>
        </BrowserRouter>
      </SoftGateProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
