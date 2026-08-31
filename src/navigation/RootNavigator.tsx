import React, { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useAuthStore } from '../store/useAuthStore';
import { useThemeStore } from '../store/useThemeStore';
import AuthNavigator from './AuthNavigator';
import BuyerNavigator from './BuyerNavigator';
import OrganizerNavigator from './OrganizerNavigator';

export default function RootNavigator() {
  const user = useAuthStore((s) => s.user);
  const isRestoring = useAuthStore((s) => s.isRestoring);
  const restoreSession = useAuthStore((s) => s.restoreSession);
  const loadTheme = useThemeStore((s) => s.loadTheme);
  const primaryColor = useThemeStore((s) => s.colors.primary);

  useEffect(() => {
    restoreSession();
    loadTheme();
  }, []);

  if (isRestoring) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={primaryColor} />
      </View>
    );
  }

  return (
    <NavigationContainer>
      {!user ? (
        <AuthNavigator />
      ) : user.role === 'organizer' ? (
        <OrganizerNavigator />
      ) : (
        <BuyerNavigator />
      )}
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
});
