import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import MyEventsScreen from '../screens/MyEventsScreen';
import CreateEventScreen from '../screens/CreateEventScreen';
import OrganizerEventDetailScreen from '../screens/OrganizerEventDetailScreen';
import CheckInScannerScreen from '../screens/CheckInScannerScreen';
import ProfileScreen from '../screens/ProfileScreen';
import { useThemeStore } from '../store/useThemeStore';
import { OrganizerStackParamList, OrganizerTabParamList } from './types';

const Stack = createNativeStackNavigator<OrganizerStackParamList>();
const Tab = createBottomTabNavigator<OrganizerTabParamList>();

function MyEventsStackScreen() {
  return (
    <Stack.Navigator>
      <Stack.Screen name="MyEvents" component={MyEventsScreen} options={{ title: 'Meus Eventos' }} />
      <Stack.Screen
        name="CreateEvent"
        component={CreateEventScreen}
        options={({ route }) => ({ title: route.params?.eventId ? 'Editar Evento' : 'Criar Evento' })}
      />
      <Stack.Screen
        name="OrganizerEventDetail"
        component={OrganizerEventDetailScreen}
        options={{ title: 'Detalhes do evento' }}
      />
      <Stack.Screen
        name="CheckInScanner"
        component={CheckInScannerScreen}
        options={{ title: 'Validar ingressos', headerShown: false }}
      />
    </Stack.Navigator>
  );
}

export default function OrganizerNavigator() {
  const primaryColor = useThemeStore((s) => s.colors.primary);

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: primaryColor,
        tabBarInactiveTintColor: '#9CA3AF',
        tabBarIcon: ({ color, size }) => {
          const icons: Record<string, keyof typeof Ionicons.glyphMap> = {
            MyEventsStack: 'megaphone',
            Profile: 'person',
          };
          return <Ionicons name={icons[route.name]} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen
        name="MyEventsStack"
        component={MyEventsStackScreen}
        options={{ title: 'Meus Eventos' }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{ title: 'Perfil', headerShown: true }}
      />
    </Tab.Navigator>
  );
}
