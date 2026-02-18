// File: vault-mobile/app/_layout.tsx
// Root layout with navigation and providers

import { useEffect, useState } from 'react'
import { View, Text, StyleSheet, Platform } from 'react-native'
import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import * as SplashScreen from 'expo-splash-screen'
import * as Network from 'expo-network'
import { Ionicons } from '@expo/vector-icons'
import { useConnectionStore } from '@/stores/connection'
import { startAutoSync, stopAutoSync } from '@/stores/sync'
import { ToastProvider } from '@/contexts/toast'
import { ErrorBoundary } from '@/components/ErrorBoundary'

// Prevent splash screen from auto-hiding
SplashScreen.preventAutoHideAsync()

export default function RootLayout() {
  const { initialize, isConnected } = useConnectionStore()
  const [isOffline, setIsOffline] = useState(false)

  useEffect(() => {
    // Initialize connection on app start
    initialize().finally(() => {
      SplashScreen.hideAsync()
    })

    // Start auto-sync service
    startAutoSync()

    // Check network status
    const checkNetwork = async () => {
      try {
        const networkState = await Network.getNetworkStateAsync()
        setIsOffline(!networkState.isConnected)
      } catch {
        // Ignore network check errors
      }
    }

    checkNetwork()
    const interval = setInterval(checkNetwork, 10000)
    return () => {
      clearInterval(interval)
      stopAutoSync()
    }
  }, [])

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ErrorBoundary>
      <ToastProvider>
        <StatusBar style="light" />

        {/* Offline Banner */}
        {isOffline && (
          <View style={styles.offlineBanner}>
            <Ionicons name="cloud-offline" size={16} color="#fff" />
            <Text style={styles.offlineText}>No Internet Connection</Text>
          </View>
        )}

        <Stack
        screenOptions={{
          headerStyle: {
            backgroundColor: '#18181b',
          },
          headerTintColor: '#fff',
          headerTitleStyle: {
            fontWeight: '600',
          },
          contentStyle: {
            backgroundColor: '#09090b',
          },
        }}
      >
        <Stack.Screen
          name="(tabs)"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="player/[id]"
          options={{
            headerShown: false,
            presentation: 'fullScreenModal',
            animation: 'fade',
          }}
        />
        <Stack.Screen
          name="viewer/[id]"
          options={{
            headerShown: false,
            presentation: 'fullScreenModal',
            animation: 'fade',
          }}
        />
        <Stack.Screen
          name="connect"
          options={{
            title: 'Connect to Vault',
            presentation: 'modal',
          }}
        />
        <Stack.Screen
          name="favorites"
          options={{
            title: 'Favorites',
            presentation: 'modal',
          }}
        />
        <Stack.Screen
          name="history"
          options={{
            title: 'Watch History',
            presentation: 'modal',
          }}
        />
        <Stack.Screen
          name="details/[id]"
          options={{
            title: 'Details',
            presentation: 'card',
            headerShown: true,
            headerBackTitle: 'Back',
          }}
        />
        <Stack.Screen
          name="tags"
          options={{
            title: 'Browse Tags',
            presentation: 'modal',
          }}
        />
        <Stack.Screen
          name="search"
          options={{
            title: 'Search',
            presentation: 'modal',
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="url-download"
          options={{
            title: 'Download from URL',
            presentation: 'modal',
            headerShown: false,
          }}
        />
      </Stack>
      </ToastProvider>
      </ErrorBoundary>
    </GestureHandlerRootView>
  )
}

const styles = StyleSheet.create({
  offlineBanner: {
    backgroundColor: '#ef4444',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingTop: Platform.OS === 'ios' ? 50 : 8,
    gap: 8,
  },
  offlineText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
})
