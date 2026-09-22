import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Bell, BookOpen, CircleHelp, LogOut, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useAuth } from "@/auth/AuthContext";
import {
    formatCnpjShort,
    useActiveEstablishment,
} from "@/auth/EstablishmentContext";
import { apiFetch } from "@/lib/api";
import { isWebAdmin, isWebManager } from "@/lib/staff";
import { ThemeToggle } from "@/components/ThemeToggle";
import { EnableWebPushButton } from "@/components/EnableWebPushButton";
import { dashboardBackTarget } from "./dashboardBackTarget";
import { DashboardSidebar } from "./DashboardSidebar";
import { QuickSearch } from "./QuickSearch";
import { AppSelect } from "@/components/ui/app-select";

export function DashboardTopBar() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [sheetOpen, setSheetOpen] = useState(false);
  const backTo = dashboardBackTarget(location.pathname);
  const showAlerts =
    isWebAdmin(user?.role) || isWebManager(user?.role);
  const {
    establishments,
    activeEstablishmentId,
    setActiveEstablishmentId,
  } = useActiveEstablishment();

  const { data: unreadPayload } = useQuery({
    queryKey: ["admin", "notifications-unread"],
    queryFn: () =>
      apiFetch<{ count: number }>("/admin/notifications/unread-count"),
    staleTime: 10_000,
    refetchInterval: 15_000,
    enabled: showAlerts,
    meta: { silentError: true },
  });
  const unreadCount = unreadPayload?.count ?? 0;

  const orgLabel = user?.organizationName?.trim() || "Empresa";

  return (
    <header className="glass-chrome sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-border bg-card px-4 md:h-16 md:px-6">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              className="lg:hidden"
              aria-label="Menu"
            >
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent
            side="left"
            className="w-64 border-sidebar-border bg-sidebar p-0"
          >
            <DashboardSidebar
              onNavigate={() => setSheetOpen(false)}
              className="w-full border-0"
            />
          </SheetContent>
        </Sheet>

        {backTo ? (
          <Button variant="ghost" size="sm" onClick={() => navigate(backTo)}>
            ← Voltar
          </Button>
        ) : null}

        <div className="hidden min-w-0 items-center gap-2 sm:flex">
          <span className="truncate text-sm font-medium text-foreground">
            {orgLabel}
          </span>
          {establishments.length > 0 ? (
            <>
              <span className="text-muted-foreground">·</span>
              {establishments.length === 1 ? (
                <span className="truncate text-sm text-muted-foreground">
                  {formatCnpjShort(establishments[0]?.cnpj)}
                </span>
              ) : (
                <AppSelect
                  value={activeEstablishmentId ?? ""}
                  onValueChange={setActiveEstablishmentId}
                  className="h-8 min-w-[11rem] max-w-[16rem]"
                  options={establishments.map((e) => ({
                    value: e.id,
                    label: `${formatCnpjShort(e.cnpj)} — ${e.tradeName || e.legalName}`,
                  }))}
                />
              )}
            </>
          ) : null}
        </div>
      </div>

      <div className="flex items-center gap-1 sm:gap-2">
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 text-muted-foreground hover:text-foreground"
          asChild
        >
          <Link to="/guia" aria-label="Guia inicial">
            <BookOpen className="size-4" />
            <span className="hidden md:inline">Guia inicial</span>
          </Link>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 text-muted-foreground hover:text-foreground"
          asChild
        >
          <Link to="/ajuda" aria-label="Ajuda">
            <CircleHelp className="size-4" />
            <span className="hidden md:inline">Ajuda</span>
          </Link>
        </Button>
        <QuickSearch />
        <ThemeToggle />
        {showAlerts ? (
          <>
            <EnableWebPushButton compact />
            <Button variant="outline" size="icon" className="relative" asChild>
              <Link to="/notificacoes" aria-label="Alertas">
                <Bell className="h-5 w-5" />
                {unreadCount > 0 ? (
                  <span className="absolute -right-1 -top-1 flex min-h-4 min-w-4 items-center justify-center rounded-full bg-warning px-1 text-[10px] font-bold text-warning-foreground">
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </span>
                ) : null}
              </Link>
            </Button>
          </>
        ) : null}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => logout()}
          aria-label="Sair"
        >
          <LogOut className="mr-2 h-4 w-4" />
          Sair
        </Button>
      </div>
    </header>
  );
}
