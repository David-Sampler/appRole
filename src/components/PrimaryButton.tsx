import React from 'react';
import { Pressable, Text, StyleSheet, ActivityIndicator, StyleProp, ViewStyle, PressableProps } from 'react-native';
import { useThemeStore } from '../store/useThemeStore';

interface Props extends Omit<PressableProps, 'style'> {
  title: string;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

export default function PrimaryButton({ title, loading, disabled, style, ...pressableProps }: Props) {
  const primaryColor = useThemeStore((s) => s.colors.primary);

  return (
    <Pressable
      disabled={disabled || loading}
      style={[styles.button, { backgroundColor: primaryColor }, (disabled || loading) && styles.disabled, style]}
      {...pressableProps}
    >
      {loading ? (
        <ActivityIndicator color="#fff" />
      ) : (
        <Text style={styles.text}>{title}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: { opacity: 0.6 },
  text: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
