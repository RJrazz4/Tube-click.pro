import { ReactNode } from "react";
interface MainLayoutProps {
  children: ReactNode;
}

export function MainLayout({ children }: MainLayoutProps) {
  return (
    <div className="min-h-screen bg-[#0a0f0f] text-white">
      {children}
    </div>
  );
}
