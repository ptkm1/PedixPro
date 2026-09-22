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
          "relative min-h-dvh",
          glassEnabled ? "bg-transparent" : "bg-background",
        )}
      >
        {/* Desktop: sidebar fixa; em telas pequenas usa o Sheet no top bar */}
        <div className="fixed inset-y-0 left-0 z-40 w-64 max-lg:hidden">
          <DashboardSidebar className="h-dvh" />
        </div>
        <div className="min-w-0 lg:pl-64">
          <DashboardTopBar />
          <main className="p-4 md:p-6 lg:p-8">
            <Outlet />
          </main>
        </div>
      </div>
    </EstablishmentProvider>
  );
}
