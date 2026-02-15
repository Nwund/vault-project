// File: vault-mobile/app/(tabs)/_layout.tsx
// Enhanced tab navigation layout with better styling

import { Tabs, router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { View, StyleSheet, Platform, TouchableOpacity } from 'react-native'
import { BlurView } from 'expo-blur'
import * as Haptics from 'expo-haptics'

// Header button component
function HeaderButton({
  icon,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap
  onPress: () => void
}) {
  return (
    <TouchableOpacity
      style={styles.headerButton}
      onPress={() => {
        if (Platform.OS === 'ios') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
        onPress()
      }}
    >
      <Ionicons name={icon} size={22} color="#fff" />
    </TouchableOpacity>
  )
}

export default function TabLayout() {
  const handleTabPress = () => {
    if (Platform.OS === 'ios') {
      Haptics.selectionAsync()
    }
  }

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#3b82f6',
        tabBarInactiveTintColor: '#52525b',
        tabBarStyle: {
          backgroundColor: Platform.OS === 'ios' ? 'transparent' : '#0a0a0b',
          borderTopColor: '#1f1f23',
          borderTopWidth: 0.5,
          height: Platform.OS === 'ios' ? 88 : 64,
          paddingBottom: Platform.OS === 'ios' ? 28 : 8,
          paddingTop: 8,
          position: 'absolute',
        },
        tabBarBackground: () =>
          Platform.OS === 'ios' ? (
            <BlurView
              intensity={80}
              tint="dark"
              style={StyleSheet.absoluteFill}
            />
          ) : null,
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
        },
        headerStyle: {
          backgroundColor: '#0a0a0b',
          borderBottomWidth: 0,
          shadowOpacity: 0,
          elevation: 0,
        },
        headerTitleStyle: {
          color: '#fff',
          fontSize: 18,
          fontWeight: '700',
        },
        headerTintColor: '#fff',
      }}
      screenListeners={{
        tabPress: handleTabPress,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Library',
          tabBarIcon: ({ color, focused }) => (
            <View style={focused && styles.activeIconContainer}>
              <Ionicons
                name={focused ? 'library' : 'library-outline'}
                size={24}
                color={color}
              />
            </View>
          ),
          headerRight: () => (
            <View style={styles.headerRight}>
              <HeaderButton
                icon="pricetags-outline"
                onPress={() => router.push('/tags')}
              />
              <HeaderButton
                icon="search"
                onPress={() => router.push('/search')}
              />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="wall"
        options={{
          title: 'Wall',
          headerShown: false,
          tabBarIcon: ({ color, focused }) => (
            <View style={focused && styles.activeIconContainer}>
              <Ionicons
                name={focused ? 'grid' : 'grid-outline'}
                size={24}
                color={color}
              />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="playlists"
        options={{
          title: 'Sessions',
          tabBarIcon: ({ color, focused }) => (
            <View style={focused && styles.activeIconContainer}>
              <Ionicons
                name={focused ? 'musical-notes' : 'musical-notes-outline'}
                size={24}
                color={color}
              />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="downloads"
        options={{
          title: 'Offline',
          tabBarIcon: ({ color, focused }) => (
            <View style={focused && styles.activeIconContainer}>
              <Ionicons
                name={focused ? 'cloud-download' : 'cloud-download-outline'}
                size={24}
                color={color}
              />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color, focused }) => (
            <View style={focused && styles.activeIconContainer}>
              <Ionicons
                name={focused ? 'settings' : 'settings-outline'}
                size={24}
                color={color}
              />
            </View>
          ),
        }}
      />
    </Tabs>
  )
}

const styles = StyleSheet.create({
  activeIconContainer: {
    transform: [{ scale: 1.1 }],
  },
  headerRight: {
    flexDirection: 'row',
    gap: 8,
    marginRight: 16,
  },
  headerButton: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#27272a',
    justifyContent: 'center',
    alignItems: 'center',
  },
})
