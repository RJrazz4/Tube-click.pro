import { ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { Footer } from "./Footer";
import { GhostRedirectOverlay } from "@/components/ui/GhostRedirectOverlay";
import { CommandPaletteGhost } from "@/components/ui/CommandPaletteGhost";
import { GlobalMatrixLayer } from "@/components/ui/GlobalMatrixLayer";
import { VideoWallBackground } from "@/components/ui/VideoWallBackground";

interface MainLayoutProps {
  children: ReactNode;
}

export function MainLayout({ children }: MainLayoutProps) {
  return (
    <div className="app-shell min-h-[100dvh] bg-background flex flex-col relative">
      <GlobalMatrixLayer />
      <div className="fixed inset-0 -z-40 opacity-[0.35] pointer-events-none">
        <VideoWallBackground intensity="low" />
      </div>
      <a href="#main-content" className="skip-to-content">Skip to main content</a>
      <GhostRedirectOverlay />
      <CommandPaletteGhost />
      <Sidebar />
      <TopBar />
      <main id="main-content" tabIndex={-1} className="ml-20 pt-16 flex-1 max-md:ml-0 max-md:pb-[calc(4.5rem+env(safe-area-inset-bottom))] relative z-10">
        <div className="p-4 sm:p-6 lg:p-8">
          {children}
        </div>
      </main>
      <div className="ml-20 max-md:ml-0 max-md:mb-[calc(4.5rem+env(safe-area-inset-bottom))] relative z-10">
        <Footer />
      </div>
      {/* Ghost hint for command palette - desktop only, lightweight */}
      <div className="fixed bottom-3 right-3 hidden md:flex items-center gap-1.5 rounded-full glass-strong border-border/40 px-2.5 py-1 text-[10px] font-mono text-muted-foreground z-40">
        <span className="w-1 h-1 rounded-full bg-green-400 animate-pulse" />
        <span>Press</span>
        <kbd className="px-1 py-0.5 rounded bg-secondary border border-border text-[9px]">⌘K</kbd>
        <span>for Ghost Commands • MUM-01 • tubeclickpro.in</span>
      </div>
    </div>
  );
}
