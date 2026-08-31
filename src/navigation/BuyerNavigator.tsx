import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import ExploreScreen from '../screens/ExploreScreen';
import EventDetailScreen from '../screens/EventDetailScreen';
import MyTicketsScreen from '../screens/MyTicketsScreen';
import ProfileScreen from '../screens/ProfileScreen';
import { useThemeStore } from '../store/useThemeStore';
import { BuyerStackParamList, BuyerTabParamList } from './types';

const Stack = createNativeStackNavigator<BuyerStackParamList>();
const Tab = createBottomTabNavigator<BuyerTabParamList>();

function ExploreStackScreen() {
  return (
    <Stack.Navigator>
      <Stack.Screen name="Explore" component={ExploreScreen} options={{ title: 'Explorar eventos' }} />
      <Stack.Screen
        name="EventDetail"
        component={EventDetailScreen}
        options={{ title: 'Detalhes do evento' }}
      />
    </Stack.Navigator>
  );
}

export default function BuyerNavigator() {
  const primaryColor = useThemeStore((s) => s.colors.primary);

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: primaryColor,
        tabBarInactiveTintColor: '#9CA3AF',
        tabBarIcon: ({ color, size }) => {
          const icons: Record<string, keyof typeof Ionicons.glyphMap> = {
            ExploreStack: 'search',
            MyTickets: 'ticket',
            Profile: 'person',
          };
          return <Ionicons name={icons[route.name]} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="ExploreStack" component={ExploreStackScreen} options={{ title: 'Explorar' }} />
      <Tab.Screen
        name="MyTickets"
        component={MyTicketsScreen}
        options={{ title: 'Meus Ingressos', headerShown: true }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{ title: 'Perfil', headerShown: true }}
      />
    </Tab.Navigator>
  );
}
