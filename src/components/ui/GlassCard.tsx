 import * as React from "react";
 import { X } from "lucide-react";
 import { cn } from "@/lib/utils";
 
 interface GlassCardProps extends React.HTMLAttributes<HTMLDivElement> {
   onClose?: () => void;
   showClose?: boolean;
   children: React.ReactNode;
   variant?: "default" | "success" | "error" | "pending";
 }
 
 const GlassCard = React.forwardRef<HTMLDivElement, GlassCardProps>(
   ({ className, onClose, showClose = false, children, variant = "default", ...props }, ref) => {
     const variantStyles = {
       default: "border-border/50",
       success: "border-green-500/30",
       error: "border-destructive/30",
       pending: "border-primary/30",
     };
 
     return (
       <div
         ref={ref}
         className={cn(
           // Glassmorphism effect
           "relative rounded-2xl border backdrop-blur-md",
           "bg-card/80 shadow-lg",
           // Subtle glow
           "before:absolute before:inset-0 before:rounded-2xl before:bg-gradient-to-br before:from-primary/5 before:to-accent/5 before:pointer-events-none",
           // Transition
           "transition-all duration-300 hover:shadow-xl hover:border-primary/40",
           variantStyles[variant],
           className
         )}
         {...props}
       >
         {/* Close button - large touch target for mobile */}
         {showClose && onClose && (
           <button
             onClick={onClose}
             className={cn(
               "absolute -top-2 -right-2 z-20",
               "w-8 h-8 md:w-7 md:h-7 rounded-full",
               "bg-secondary/90 backdrop-blur-sm border border-border",
               "flex items-center justify-center",
               "text-muted-foreground hover:text-foreground hover:bg-destructive/20 hover:border-destructive/50",
               "transition-all duration-200",
               "active:scale-90",
               // Larger touch area for mobile
               "touch-manipulation"
             )}
             aria-label="Remove item"
           >
             <X className="w-4 h-4" />
           </button>
         )}
         <div className="relative z-10">{children}</div>
       </div>
     );
   }
 );
 
 GlassCard.displayName = "GlassCard";
 
 export { GlassCard };