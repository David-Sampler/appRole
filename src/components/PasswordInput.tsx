import React, { useState } from 'react';
import { View, TextInput, Pressable, StyleSheet, TextInputProps } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export default function PasswordInput(props: TextInputProps) {
  const [visible, setVisible] = useState(false);

  return (
    <View style={styles.wrapper}>
      <TextInput
        {...props}
        style={[styles.input, props.style]}
        secureTextEntry={!visible}
        placeholderTextColor="#9CA3AF"
      />
      <Pressable style={styles.toggle} onPress={() => setVisible((v) => !v)} hitSlop={8}>
        <Ionicons name={visible ? 'eye-off-outline' : 'eye-outline'} size={20} color="#9CA3AF" />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { position: 'relative', justifyContent: 'center' },
  input: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingRight: 44,
    fontSize: 16,
    color: '#111827',
  },
  toggle: {
    position: 'absolute',
    right: 14,
  },
});
