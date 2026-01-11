import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { MainLayout } from "@/components/layout/MainLayout";
import Index from "./pages/Index";
import ChatAgent from "./pages/ChatAgent";
import Storyboard from "./pages/Storyboard";
import Thumbnails from "./pages/Thumbnails";
import VisionGuide from "./pages/VisionGuide";
import VoiceStudio from "./pages/VoiceStudio";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

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
      <BrowserRouter>
        <MainLayout>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/chat-agent" element={<ChatAgent />} />
            <Route path="/storyboard" element={<Storyboard />} />
            <Route path="/thumbnails" element={<Thumbnails />} />
            <Route path="/vision-guide" element={<VisionGuide />} />
            <Route path="/voice" element={<VoiceStudio />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </MainLayout>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
