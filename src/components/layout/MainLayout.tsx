import { ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { Footer } from "./Footer";

interface MainLayoutProps {
  children: ReactNode;
}

export function MainLayout({ children }: MainLayoutProps) {
  return (
    <div className="app-shell min-h-[100dvh] bg-background cyber-grid flex flex-col">
      <a href="#main-content" className="skip-to-content">Skip to main content</a>
      <Sidebar />
      <TopBar />
      <main id="main-content" tabIndex={-1} className="ml-20 pt-16 flex-1 max-md:ml-0 max-md:pb-[calc(4.5rem+env(safe-area-inset-bottom))]">
        <div className="p-4 sm:p-6 lg:p-8">
          {children}
        </div>
      </main>
      <div className="ml-20 max-md:ml-0 max-md:mb-[calc(4.5rem+env(safe-area-inset-bottom))]">
        <Footer />
      </div>
    </div>
  );
}
