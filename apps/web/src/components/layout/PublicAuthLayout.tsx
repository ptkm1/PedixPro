import type { ReactNode } from "react";
import { PublicSiteHeader } from "./PublicSiteHeader";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

type Props = {
  variant: "login" | "register";
  children: ReactNode;
};

export function PublicAuthLayout({ variant, children }: Props) {
  const { glassEnabled } = useTheme();

  return (
    <div
      className={cn(
        "relative flex min-h-dvh flex-col",
        glassEnabled ? "bg-transparent" : "bg-background",
      )}
    >
      <PublicSiteHeader variant={variant} />
      {children}
    </div>
  );
}
