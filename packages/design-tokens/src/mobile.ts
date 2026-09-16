import type { SemanticColors } from "./colors.js";
import { darkColorsHex, lightColorsHex } from "./colors.js";

/** Mapa PedixPro → AppColors do mobile. */
export function semanticToAppColors(c: SemanticColors) {
  return {
    background: c.background,
    surface: c.card,
    surfaceMuted: c.muted,
    text: c.foreground,
    textSecondary: c.mutedForeground,
    textMuted: c.mutedForeground,
    border: c.border,
    borderSubtle: c.border,
    inputBackground: c.input,
    inputBorder: c.border,
    inputText: c.foreground,
    placeholder: c.mutedForeground,
    primary: c.primary,
    primaryMuted: c.secondary,
    primaryForeground: c.primaryForeground,
    danger: c.destructive,
    dangerSurface: c.destructive === "#dc2626" ? "#fef2f2" : "#2d1f1f",
    dangerBorder: c.destructive === "#dc2626" ? "#fecaca" : "#5c3030",
    success: c.success,
    warning: c.warning,
    warningSurface: c.warning === "#d97706" ? "#fffbeb" : "#2d2818",
    tabBar: c.card,
    tabBarBorder: c.border,
    headerBackground: c.card,
    headerTitle: c.foreground,
    card: c.card,
    chip: c.muted,
    chipActive: c.primary,
    chipText: c.foreground,
    chipTextActive: c.primaryForeground,
    pill: c.muted,
    pillActive: c.primary,
    pillText: c.foreground,
    pillTextActive: c.primaryForeground,
    link: c.primary,
    loginHero: c.sidebar,
    loginCard: c.card,
    shadow: "#000000",
    iconMuted: c.mutedForeground,
    searchBackground: c.input,
    onDarkMuted: c.mutedForeground,
    onDarkSubtle: c.mutedForeground,
    footerBackdrop: c.background + "f2",
    surfaceOverlay: c.card + "e8",
    glassFill: c.card,
    glassBorder: c.border,
    glassHighlight: c.primary,
    backgroundGradientEnd: c.background,
  };
}

export const appColorsLight = semanticToAppColors(lightColorsHex);
export const appColorsDark = semanticToAppColors(darkColorsHex);
