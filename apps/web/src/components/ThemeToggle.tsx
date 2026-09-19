import { Check, Monitor, Moon, Sparkles, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTheme, type ThemePreference } from "@/lib/theme";

const options: { value: ThemePreference; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Claro", icon: Sun },
  { value: "dark", label: "Escuro", icon: Moon },
  { value: "system", label: "Sistema", icon: Monitor },
];

export function ThemeToggle() {
  const {
    preference,
    resolved,
    setPreference,
    glassEnabled,
    toggleGlass,
  } = useTheme();
  const ActiveIcon = resolved === "dark" ? Moon : Sun;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon" aria-label="Tema">
          <ActiveIcon className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-44">
        {options.map((o) => {
          const Icon = o.icon;
          return (
            <DropdownMenuItem
              key={o.value}
              onClick={() => setPreference(o.value)}
              className={
                preference === o.value ? "bg-primary/10 text-primary" : ""
              }
            >
              <Icon className="mr-2 h-4 w-4" />
              {o.label}
            </DropdownMenuItem>
          );
        })}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => toggleGlass()}
          className={glassEnabled ? "bg-primary/10 text-primary" : ""}
        >
          <Sparkles className="mr-2 h-4 w-4" />
          <span className="flex-1">Glassmorphism</span>
          {glassEnabled ? <Check className="h-4 w-4" /> : null}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
