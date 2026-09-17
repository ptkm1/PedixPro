import { useAuth } from "@/auth/AuthContext";
import { CommerceProWordmark } from "@/components/brand/CommerceProBrand";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
    applyNavOrder,
    clearNavOrder,
    loadNavOrder,
    navOrderStorageKey,
    saveNavOrder,
} from "@/lib/nav-order";
import { staffRoleLabel, userInitials } from "@/lib/staff";
import { cn } from "@/lib/utils";
import { LogOut, RotateCcw } from "lucide-react";
import {
    useCallback,
    useEffect,
    useMemo,
    useState,
    type DragEvent,
} from "react";
import { NavLink } from "react-router-dom";
import {
    navForRole,
    splitMainAndSettingsNav,
    type NavItem,
} from "./navConfig";

type Props = {
  onNavigate?: () => void;
  className?: string;
};

function reorderByIndex<T>(list: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) {
    return list;
  }
  const next = [...list];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

export function DashboardSidebar({ onNavigate, className }: Props) {
  const { user, logout } = useAuth();
  const { main: defaultMain, settings } = useMemo(
    () => splitMainAndSettingsNav(navForRole(user)),
    [user],
  );

  const storageKey = useMemo(() => {
    if (!user?.organizationId || !user?.id) return null;
    return navOrderStorageKey(user.organizationId, user.id);
  }, [user?.id, user?.organizationId]);

  const [orderedMain, setOrderedMain] = useState<NavItem[]>(defaultMain);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);
  const [hasCustomOrder, setHasCustomOrder] = useState(false);

  useEffect(() => {
    if (!storageKey) {
      setOrderedMain(defaultMain);
      setHasCustomOrder(false);
      return;
    }
    const saved = loadNavOrder(storageKey);
    setOrderedMain(applyNavOrder(defaultMain, saved));
    setHasCustomOrder(Boolean(saved?.length));
  }, [defaultMain, storageKey]);

  const persistOrder = useCallback(
    (items: NavItem[]) => {
      if (!storageKey) return;
      const keys = items.map((item) => item.to);
      saveNavOrder(storageKey, keys);
      setHasCustomOrder(true);
    },
    [storageKey],
  );

  const resetOrder = useCallback(() => {
    if (storageKey) clearNavOrder(storageKey);
    setOrderedMain(defaultMain);
    setHasCustomOrder(false);
    setDragFrom(null);
    setDragOver(null);
  }, [defaultMain, storageKey]);

  const onDragStart = (index: number) => (e: DragEvent) => {
    setDragFrom(index);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(index));
  };

  const onDragOver = (index: number) => (e: DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragOver !== index) setDragOver(index);
  };

  const onDrop = (index: number) => (e: DragEvent) => {
    e.preventDefault();
    const from =
      dragFrom ?? Number.parseInt(e.dataTransfer.getData("text/plain"), 10);
    if (Number.isNaN(from)) {
      setDragFrom(null);
      setDragOver(null);
      return;
    }
    const next = reorderByIndex(orderedMain, from, index);
    setOrderedMain(next);
    persistOrder(next);
    setDragFrom(null);
    setDragOver(null);
  };

  const onDragEnd = () => {
    setDragFrom(null);
    setDragOver(null);
  };

  const SettingsIcon = settings?.icon;

  return (
    <aside
      className={cn(
        "glass-chrome flex h-full w-full flex-col border-r border-sidebar-border bg-sidebar",
        className,
      )}
    >
      <div className="flex h-16 items-center border-b border-sidebar-border px-4">
        <CommerceProWordmark iconSize={32} />
      </div>

      <nav
        className="flex-1 space-y-1 overflow-y-auto px-3 py-4"
        aria-label="Principal"
      >
        {orderedMain.map((item, index) => {
          const Icon = item.icon;
          const isDragging = dragFrom === index;
          const isDropTarget = dragOver === index && dragFrom !== index;
          return (
            <div
              key={item.to}
              draggable
              onDragStart={onDragStart(index)}
              onDragOver={onDragOver(index)}
              onDrop={onDrop(index)}
              onDragEnd={onDragEnd}
              onDragLeave={() => {
                if (dragOver === index) setDragOver(null);
              }}
              className={cn(
                "group flex items-stretch rounded-lg transition-[opacity,box-shadow]",
                isDragging && "opacity-40",
                isDropTarget &&
                  "ring-1 ring-sidebar-primary/50 ring-offset-1 ring-offset-sidebar",
              )}
            >
              <NavLink
                to={item.to}
                end={item.end}
                onClick={onNavigate}
                draggable={false}
                className={({ isActive }) =>
                  cn(
                    "flex min-w-0 flex-1 items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-sidebar-primary text-sidebar-primary-foreground"
                      : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground",
                  )
                }
              >
                <Icon className="h-5 w-5 shrink-0" />
                <span className="truncate">{item.label}</span>
              </NavLink>
            </div>
          );
        })}
      </nav>

      <div className="border-t border-sidebar-border p-4">
        {settings && SettingsIcon ? (
          <NavLink
            to={settings.to}
            end={settings.end}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                "mb-3 flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                isActive
                  ? "bg-sidebar-primary text-sidebar-primary-foreground"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground",
              )
            }
          >
            <SettingsIcon className="h-5 w-5 shrink-0" />
            {settings.label}
          </NavLink>
        ) : null}

        {hasCustomOrder ? (
          <button
            type="button"
            onClick={resetOrder}
            className="mb-3 flex w-full items-center gap-1.5 px-1 text-left text-[11px] text-sidebar-foreground/45 transition-colors hover:text-sidebar-foreground/70"
          >
            <RotateCcw className="h-3 w-3 shrink-0" aria-hidden />
            Restaurar ordem padrão
          </button>
        ) : null}

        <NavLink
          to="/perfil"
          onClick={onNavigate}
          className={({ isActive }) =>
            cn(
              "flex items-center gap-3 rounded-lg px-2 py-2 transition-colors",
              isActive
                ? "bg-sidebar-primary text-sidebar-primary-foreground"
                : "text-sidebar-foreground hover:bg-sidebar-accent",
            )
          }
          aria-label="Abrir perfil"
        >
          <Avatar className="size-9 shrink-0">
            <AvatarFallback className="bg-sidebar-foreground/15 text-xs font-semibold text-current">
              {userInitials(user?.name)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">
              {user?.name || "Perfil"}
            </p>
            <p className="truncate text-xs opacity-70">{user?.email}</p>
            <p className="truncate text-xs opacity-60">
              {staffRoleLabel(user)}
            </p>
          </div>
        </NavLink>
        <Button
          variant="ghost"
          size="sm"
          className="mt-2 w-full justify-start text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground"
          onClick={() => {
            onNavigate?.();
            logout();
          }}
        >
          <LogOut className="mr-2 h-4 w-4" />
          Sair
        </Button>
      </div>
    </aside>
  );
}
