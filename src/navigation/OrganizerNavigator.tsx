import React from 'react';
import { View, Pressable } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import MyEventsScreen from '../screens/MyEventsScreen';
import DeletedEventsScreen from '../screens/DeletedEventsScreen';
import CreateEventScreen from '../screens/CreateEventScreen';
import OrganizerEventDetailScreen from '../screens/OrganizerEventDetailScreen';
import CheckInScannerScreen from '../screens/CheckInScannerScreen';
import OrganizerGroupsScreen from '../screens/OrganizerGroupsScreen';
import CreateGroupScreen from '../screens/CreateGroupScreen';
import ProfileScreen from '../screens/ProfileScreen';
import HelpScreen from '../screens/HelpScreen';
import ThemeToggleButton from '../components/ThemeToggleButton';
import { useThemeStore } from '../store/useThemeStore';
import { OrganizerStackParamList, OrganizerTabParamList } from './types';

const Stack = createNativeStackNavigator<OrganizerStackParamList>();
const Tab = createBottomTabNavigator<OrganizerTabParamList>();

function MyEventsStackScreen() {
  const primaryColor = useThemeStore((s) => s.colors.primary);

  return (
    <Stack.Navigator>
      <Stack.Screen
        name="MyEvents"
        component={MyEventsScreen}
        options={({ navigation }) => ({
          title: 'Meus Eventos',
          headerRight: () => (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
              <ThemeToggleButton />
              <Pressable onPress={() => navigation.navigate('DeletedEvents')} hitSlop={8}>
                <Ionicons name="archive-outline" size={24} color={primaryColor} />
              </Pressable>
              <Pressable onPress={() => navigation.navigate('Help')} hitSlop={8}>
                <Ionicons name="help-circle-outline" size={24} color={primaryColor} />
              </Pressable>
            </View>
          ),
        })}
      />
      <Stack.Screen name="DeletedEvents" component={DeletedEventsScreen} options={{ title: 'Eventos removidos' }} />
      <Stack.Screen name="Help" component={HelpScreen} options={{ title: 'Como funciona' }} />
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
      <Stack.Screen name="Groups" component={OrganizerGroupsScreen} options={{ title: 'Mesas' }} />
      <Stack.Screen
        name="CreateGroup"
        component={CreateGroupScreen}
        options={({ route }) => ({ title: route.params?.group ? 'Editar mesa' : 'Criar mesa' })}
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
