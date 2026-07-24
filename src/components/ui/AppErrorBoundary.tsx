import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

type Props = { children: ReactNode };
type State = { hasError: boolean };

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };
  static getDerivedStateFromError(): State { return { hasError: true }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error("[app] render boundary recovered", { error, componentStack: info.componentStack }); }
  render() {
    if (!this.state.hasError) return this.props.children;
    return <main className="flex min-h-[70vh] items-center justify-center p-6"><section role="alert" className="w-full max-w-md rounded-2xl border border-destructive/30 bg-card/90 p-8 text-center shadow-xl"><AlertTriangle className="mx-auto h-9 w-9 text-amber-300" /><h1 className="mt-4 font-display text-xl font-bold">Workspace paused safely</h1><p className="mt-2 text-sm text-muted-foreground">This screen encountered an unexpected error. Your saved local work was not deleted.</p><Button className="mt-5 gap-2" onClick={() => window.location.reload()}><RefreshCw className="h-4 w-4" />Reload workspace</Button></section></main>;
  }
}
