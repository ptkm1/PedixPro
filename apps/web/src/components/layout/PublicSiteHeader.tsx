import { Link } from "react-router-dom";
import { ThemeToggle } from "@/components/ThemeToggle";
import { AppLogo } from "./AppLogo";

type Props = {
  variant: "login" | "register";
};

export function PublicSiteHeader({ variant }: Props) {
  const secondary =
    variant === "login" ? (
      <Link
        to="/cadastro"
        className="rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:text-primary hover:underline"
      >
        Criar conta
      </Link>
    ) : (
      <Link
        to="/login"
        className="rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:text-primary hover:underline"
      >
        Já tenho conta
      </Link>
    );

  return (
    <header className="glass-chrome relative z-10 border-b border-border bg-card">
      <div className="mx-auto flex h-14 max-w-lg items-center justify-between px-4 sm:max-w-none sm:px-6">
        <AppLogo to="/login" inverted />
        <div className="flex items-center gap-2">
          <Link
            to="/legal/termos"
            className="hidden rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:text-primary hover:underline sm:inline-flex"
          >
            Termos
          </Link>
          <Link
            to="/legal/privacidade"
            className="hidden rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:text-primary hover:underline sm:inline-flex"
          >
            Privacidade
          </Link>
          <ThemeToggle />
          {secondary}
        </div>
      </div>
    </header>
  );
}
