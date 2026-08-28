import type { ReactNode } from "react";
import { TopBar } from "./TopBar";

interface AppShellProps { children: ReactNode; }

export function AppShell({ children }: AppShellProps) {
  return (
    <div className="site-shell">
      <TopBar activeSection="home" />
      <main>{children}</main>
    </div>
  );
}
