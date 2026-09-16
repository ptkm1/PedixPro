export type AppColorScheme = "light" | "dark";

/** Preferência do utilizador; `system` segue o tema do dispositivo. */
export type ThemePreference = "system" | AppColorScheme;

export type AppColors = {
  background: string;
  surface: string;
  surfaceMuted: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  border: string;
  borderSubtle: string;
  inputBackground: string;
  inputBorder: string;
  inputText: string;
  placeholder: string;
  primary: string;
  primaryMuted: string;
  primaryForeground: string;
  danger: string;
  dangerSurface: string;
  dangerBorder: string;
  success: string;
  warning: string;
  warningSurface: string;
  tabBar: string;
  tabBarBorder: string;
  headerBackground: string;
  headerTitle: string;
  card: string;
  chip: string;
  chipActive: string;
  chipText: string;
  chipTextActive: string;
  pill: string;
  pillActive: string;
  pillText: string;
  pillTextActive: string;
  link: string;
  loginHero: string;
  loginCard: string;
  shadow: string;
  iconMuted: string;
  searchBackground: string;
  onDarkMuted: string;
  onDarkSubtle: string;
  footerBackdrop: string;
  surfaceOverlay: string;
  /** Preenchimento translúcido dos cards glass. */
  glassFill: string;
  /** Borda cyan/teal dos cards glass. */
  glassBorder: string;
  /** Brilho / glow do accent glass. */
  glassHighlight: string;
  /** Segunda cor do gradiente de fundo. */
  backgroundGradientEnd: string;
};

export type AppTheme = {
  colorScheme: AppColorScheme;
  preference: ThemePreference;
  colors: AppColors;
  isDark: boolean;
};
