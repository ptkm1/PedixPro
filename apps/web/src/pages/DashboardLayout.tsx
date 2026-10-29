import { Outlet } from "react-router-dom";
import { DashboardSidebar } from "@/components/layout/DashboardSidebar";
import { DashboardTopBar } from "@/components/layout/DashboardTopBar";
import { EstablishmentProvider } from "@/auth/EstablishmentContext";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

export function DashboardLayout() {
  const { glassEnabled } = useTheme();

  return (
    <EstablishmentProvider>
      <div
        className={cn(
          "relative flex h-dvh flex-col overflow-hidden",
          glassEnabled ? "bg-transparent" : "bg-background",
        )}
      >
        {/* Desktop: sidebar fixa; em telas pequenas usa o Sheet no top bar */}
        <div className="fixed inset-y-0 left-0 z-40 w-64 max-lg:hidden">
          <DashboardSidebar className="h-dvh" />
        </div>
        <div className="flex min-h-0 min-w-0 flex-1 flex-col lg:pl-64">
          <div className="shrink-0">
            <DashboardTopBar />
          </div>
          <main className="flex min-h-0 flex-1 flex-col overflow-auto p-4 md:p-6 lg:p-8">
            <Outlet />
          </main>
        </div>
      </div>
    </EstablishmentProvider>
  );
}
