import { appColorsDark, appColorsLight } from "@pedidos/design-tokens";
import type { AppColorScheme, AppColors } from "./types";

/** Dark glassmorphism — navy profundo + cyan elétrico (mock Pedix Pro). */
const darkGlass: AppColors = {
  ...appColorsDark,
  background: "#071828",
  surface: "#0f2a42",
  surfaceMuted: "#143352",
  text: "#f4fbff",
  textSecondary: "#9eb6c9",
  textMuted: "#8aa3b8",
  border: "rgba(125, 211, 252, 0.22)",
  borderSubtle: "rgba(125, 211, 252, 0.12)",
  inputBackground: "#0f2a42",
  inputBorder: "rgba(125, 211, 252, 0.28)",
  inputText: "#f4fbff",
  placeholder: "#8aa3b8",
  primary: "#33DAFF",
  primaryMuted: "rgba(51, 218, 255, 0.16)",
  primaryForeground: "#041018",
  tabBar: "#0a2034",
  tabBarBorder: "rgba(125, 211, 252, 0.28)",
  headerBackground: "transparent",
  headerTitle: "#f4fbff",
  card: "#123048",
  chip: "#143352",
  chipActive: "rgba(51, 218, 255, 0.22)",
  chipText: "#cfe7f5",
  chipTextActive: "#33DAFF",
  pill: "#143352",
  pillActive: "rgba(51, 218, 255, 0.22)",
  pillText: "#cfe7f5",
  pillTextActive: "#33DAFF",
  link: "#33DAFF",
  loginHero: "#041018",
  loginCard: "#123048",
  iconMuted: "#8aa3b8",
  searchBackground: "#0f2a42",
  onDarkMuted: "#8aa3b8",
  onDarkSubtle: "#6b8499",
  footerBackdrop: "rgba(7, 24, 40, 0.96)",
  surfaceOverlay: "rgba(14, 40, 66, 0.94)",
  glassFill: "#123048",
  glassBorder: "rgba(125, 211, 252, 0.35)",
  glassHighlight: "rgba(51, 218, 255, 0.55)",
  backgroundGradientEnd: "#050f18",
};

const lightGlass: AppColors = {
  ...appColorsLight,
  glassFill: "rgba(255, 255, 255, 0.72)",
  glassBorder: "rgba(2, 68, 92, 0.14)",
  glassHighlight: "rgba(2, 68, 92, 0.35)",
  backgroundGradientEnd: "#E8F1F5",
};

export const themeColors: Record<AppColorScheme, AppColors> = {
  light: lightGlass,
  dark: darkGlass,
};

/** @deprecated use themeColors */
export const palette = {} as const;
