import { ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { Footer } from "./Footer";
import { SmartGeoPaymentModal } from "@/components/SmartGeoPaymentModal";

interface MainLayoutProps {
  children: ReactNode;
}

export function MainLayout({ children }: MainLayoutProps) {
  return (
    <div className="min-h-screen bg-background cyber-grid flex flex-col">
      <Sidebar />
      <TopBar />
      <main className="ml-20 pt-16 flex-1">
        <div className="p-6 lg:p-8">
          {children}
        </div>
      </main>
      <div className="ml-20">
        <Footer />
      </div>
      <SmartGeoPaymentModal />
    </div>
  );
}
