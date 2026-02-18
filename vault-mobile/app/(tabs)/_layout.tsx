// File: vault-mobile/app/(tabs)/_layout.tsx
// Enhanced tab navigation layout with sleek styling and animations

import { Tabs, router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { View, StyleSheet, Platform, TouchableOpacity, Animated } from 'react-native'
import { BlurView } from 'expo-blur'
import { LinearGradient } from 'expo-linear-gradient'
import * as Haptics from 'expo-haptics'
import { useRef, useEffect } from 'react'

// Animated header button with scale effect
function HeaderButton({
  icon,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap
  onPress: () => void
}) {
  const scale = useRef(new Animated.Value(1)).current

  const handlePressIn = () => {
    Animated.spring(scale, {
      toValue: 0.9,
      useNativeDriver: true,
    }).start()
  }

  const handlePressOut = () => {
    Animated.spring(scale, {
      toValue: 1,
      friction: 3,
      useNativeDriver: true,
    }).start()
  }

  return (
    <TouchableOpacity
      onPress={() => {
        if (Platform.OS === 'ios') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
        onPress()
      }}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      activeOpacity={1}
    >
      <Animated.View style={[styles.headerButton, { transform: [{ scale }] }]}>
        <Ionicons name={icon} size={20} color="#fff" />
      </Animated.View>
    </TouchableOpacity>
  )
}

// Tab icon with glow effect when active
function TabIcon({
  name,
  nameOutline,
  color,
  focused,
}: {
  name: keyof typeof Ionicons.glyphMap
  nameOutline: keyof typeof Ionicons.glyphMap
  color: string
  focused: boolean
}) {
  const scale = useRef(new Animated.Value(focused ? 1.1 : 1)).current
  const glowOpacity = useRef(new Animated.Value(focused ? 1 : 0)).current

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scale, {
        toValue: focused ? 1.15 : 1,
        friction: 5,
        useNativeDriver: true,
      }),
      Animated.timing(glowOpacity, {
        toValue: focused ? 1 : 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start()
  }, [focused])

  return (
    <View style={styles.tabIconContainer}>
      {/* Glow effect */}
      <Animated.View
        style={[
          styles.tabGlow,
          {
            opacity: glowOpacity,
            backgroundColor: color,
          },
        ]}
      />
      <Animated.View style={{ transform: [{ scale }] }}>
        <Ionicons
          name={focused ? name : nameOutline}
          size={24}
          color={color}
        />
      </Animated.View>
    </View>
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
            <TabIcon name="library" nameOutline="library-outline" color={color} focused={focused} />
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
        name="feed"
        options={{
          title: 'Feed',
          headerShown: false,
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name="play-circle" nameOutline="play-circle-outline" color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="liked"
        options={{
          title: 'Liked',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name="heart" nameOutline="heart-outline" color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="wall"
        options={{
          title: 'Wall',
          headerShown: false,
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name="grid" nameOutline="grid-outline" color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="playlists"
        options={{
          title: 'Sessions',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name="albums" nameOutline="albums-outline" color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="downloads"
        options={{
          title: 'Offline',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name="cloud-download" nameOutline="cloud-download-outline" color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'More',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name="ellipsis-horizontal-circle" nameOutline="ellipsis-horizontal-circle-outline" color={color} focused={focused} />
          ),
        }}
      />
    </Tabs>
  )
}

const styles = StyleSheet.create({
  tabIconContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 50,
    height: 30,
  },
  tabGlow: {
    position: 'absolute',
    width: 40,
    height: 40,
    borderRadius: 20,
    opacity: 0.3,
    transform: [{ scale: 1.5 }],
  },
  headerRight: {
    flexDirection: 'row',
    gap: 10,
    marginRight: 16,
  },
  headerButton: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
})
