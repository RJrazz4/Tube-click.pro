import { Link } from "react-router-dom";
import { ChevronDown, CreditCard, LogOut, Settings, UserRound } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuthStore } from "@/stores/useAuthStore";
import { purgeAllUserStores, pinUserId } from "@/lib/storage/perUserStorage";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { getCanonicalRoot } from "@/lib/domain/canonical";

function getCurrentRoot() {
  try {
    return window.location.origin;
  } catch {
    return getCanonicalRoot();
  }
}

/** Derive up to two initials for the avatar fallback. */
function getInitials(name?: string, email?: string): string {
  const source = name || email || "";
  const parts = source.split(/[\s@._-]+/).filter(Boolean);
  const initials = parts.slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("");
  return initials || "U";
}

/**
 * Industry-standard user menu for the top navigation bar.
 * Shows the user's avatar + email, then Profile / Subscription / Settings / Logout.
 */
export function UserMenu() {
  const user = useAuthStore((s) => s.user);
  const displayName = user?.name || user?.email || "User";
  const email = user?.email || "";
  const initials = getInitials(user?.name, user?.email);

  const signOut = async () => {
    const userId = user?.id ?? null;
    // Wipe user-scoped client storage BEFORE signOut so the Supabase client
    // cannot revive another account's tokens on re-render.
    purgeAllUserStores(userId);
    purgeAllUserStores(null);
    pinUserId(null);
    const { error } = await supabase.auth.signOut({ scope: "local" });
    if (error) {
      toast.error("Sign out failed — please try again");
      return;
    }
    toast.success("Signed out");
    window.setTimeout(() => window.location.replace(getCurrentRoot()), 150);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="flex items-center gap-2 rounded-full border border-border/60 bg-secondary/40 py-1.5 pl-1.5 pr-3 text-sm text-foreground transition-colors hover:bg-secondary/70 hover:border-primary/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Account menu"
        >
          <Avatar className="h-7 w-7 border border-primary/20">
            {user?.avatar ? (
              <AvatarImage src={user.avatar} alt={displayName} />
            ) : null}
            <AvatarFallback className="bg-gradient-to-br from-neon-purple to-neon-cyan text-[11px] font-semibold text-white">
              {initials}
            </AvatarFallback>
          </Avatar>
          <span className="hidden max-w-32 truncate sm:inline">{displayName}</span>
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-64 border-primary/15 glass-strong">
        <DropdownMenuLabel className="flex items-center gap-3 py-3">
          <Avatar className="h-10 w-10 border border-primary/20">
            {user?.avatar ? (
              <AvatarImage src={user.avatar} alt={displayName} />
            ) : null}
            <AvatarFallback className="bg-gradient-to-br from-neon-purple to-neon-cyan text-sm font-semibold text-white">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">{displayName}</p>
            {email && (
              <p className="truncate text-xs text-muted-foreground">{email}</p>
            )}
          </div>
        </DropdownMenuLabel>

        <DropdownMenuSeparator />

        <DropdownMenuGroup>
          <DropdownMenuItem asChild>
            <Link to="/settings?tab=general" className="cursor-pointer">
              <UserRound className="mr-2 h-4 w-4" />
              Profile
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link to="/settings?tab=subscription" className="cursor-pointer">
              <CreditCard className="mr-2 h-4 w-4" />
              Subscription
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link to="/settings" className="cursor-pointer">
              <Settings className="mr-2 h-4 w-4" />
              Settings
            </Link>
          </DropdownMenuItem>
        </DropdownMenuGroup>

        <DropdownMenuSeparator />

        <DropdownMenuItem
          onSelect={() => void signOut()}
          className="cursor-pointer text-destructive focus:text-destructive"
        >
          <LogOut className="mr-2 h-4 w-4" />
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
