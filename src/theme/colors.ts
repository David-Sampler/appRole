export type ThemeName = 'purple' | 'gray';

export interface ThemeColors {
  primary: string;
  primaryLight: string;
}

export const THEMES: Record<ThemeName, ThemeColors> = {
  purple: { primary: '#7C3AED', primaryLight: '#F5F3FF' },
  gray: { primary: '#282B30', primaryLight: '#F3F4F6' },
};
