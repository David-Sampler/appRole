import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import { THEMES, ThemeName, ThemeColors } from '../theme/colors';

const THEME_KEY = 'role_theme';

interface ThemeState {
  themeName: ThemeName;
  colors: ThemeColors;
  loadTheme: () => Promise<void>;
  toggleTheme: () => void;
  setTheme: (name: ThemeName) => void;
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  themeName: 'purple',
  colors: THEMES.purple,

  loadTheme: async () => {
    const saved = await SecureStore.getItemAsync(THEME_KEY);
    if (saved === 'purple' || saved === 'gray') {
      set({ themeName: saved, colors: THEMES[saved] });
    }
  },

  toggleTheme: () => {
    const next: ThemeName = get().themeName === 'purple' ? 'gray' : 'purple';
    get().setTheme(next);
  },

  setTheme: (name) => {
    set({ themeName: name, colors: THEMES[name] });
    SecureStore.setItemAsync(THEME_KEY, name);
  },
}));
