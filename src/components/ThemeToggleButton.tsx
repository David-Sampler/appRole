import React from 'react';
import { Pressable, View, StyleSheet } from 'react-native';
import { useThemeStore } from '../store/useThemeStore';

export default function ThemeToggleButton() {
  const toggleTheme = useThemeStore((s) => s.toggleTheme);

  return (
    <Pressable onPress={toggleTheme} hitSlop={8} style={styles.toggle}>
      <View style={[styles.half, { backgroundColor: '#7C3AED' }]} />
      <View style={[styles.half, { backgroundColor: '#282B30' }]} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  toggle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    overflow: 'hidden',
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  half: { flex: 1, height: '100%' },
});
