// File: vault-mobile/components/NetworkIndicator.tsx
// Connection status and network quality indicator

import { useState, useEffect, useRef } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Platform,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import * as Network from 'expo-network'
import { useConnectionStore } from '@/stores/connection'

type NetworkQuality = 'excellent' | 'good' | 'poor' | 'offline'

export function NetworkIndicator() {
  const { isConnected, serverUrl } = useConnectionStore()
  const [networkQuality, setNetworkQuality] = useState<NetworkQuality>('good')
  const [latency, setLatency] = useState<number | null>(null)
  const [expanded, setExpanded] = useState(false)

  const pulseAnim = useRef(new Animated.Value(1)).current

  // Start pulse animation for poor connection
  useEffect(() => {
    if (networkQuality === 'poor' || networkQuality === 'offline') {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 0.6,
            duration: 800,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 800,
            useNativeDriver: true,
          }),
        ])
      )
      pulse.start()
      return () => pulse.stop()
    } else {
      pulseAnim.setValue(1)
    }
  }, [networkQuality])

  // Check network quality periodically
  useEffect(() => {
    const checkNetwork = async () => {
      try {
        const networkState = await Network.getNetworkStateAsync()

        if (!networkState.isConnected) {
          setNetworkQuality('offline')
          setLatency(null)
          return
        }

        // Ping server to measure latency
        if (serverUrl && isConnected) {
          const startTime = Date.now()
          try {
            const response = await fetch(`${serverUrl}/api/ping`, {
              method: 'GET',
              signal: AbortSignal.timeout(5000),
            })

            if (response.ok) {
              const responseLatency = Date.now() - startTime
              setLatency(responseLatency)

              if (responseLatency < 100) {
                setNetworkQuality('excellent')
              } else if (responseLatency < 300) {
                setNetworkQuality('good')
              } else {
                setNetworkQuality('poor')
              }
            } else {
              setNetworkQuality('poor')
            }
          } catch {
            setNetworkQuality('poor')
            setLatency(null)
          }
        } else {
          setNetworkQuality('good')
        }
      } catch {
        setNetworkQuality('offline')
      }
    }

    checkNetwork()
    const interval = setInterval(checkNetwork, 30000)
    return () => clearInterval(interval)
  }, [serverUrl, isConnected])

  const getStatusColor = () => {
    switch (networkQuality) {
      case 'excellent':
        return '#22c55e'
      case 'good':
        return '#3b82f6'
      case 'poor':
        return '#f59e0b'
      case 'offline':
        return '#ef4444'
    }
  }

  const getStatusIcon = (): keyof typeof Ionicons.glyphMap => {
    switch (networkQuality) {
      case 'excellent':
        return 'wifi'
      case 'good':
        return 'wifi'
      case 'poor':
        return 'cellular'
      case 'offline':
        return 'cloud-offline'
    }
  }

  const getStatusText = () => {
    switch (networkQuality) {
      case 'excellent':
        return 'Excellent'
      case 'good':
        return 'Good'
      case 'poor':
        return 'Slow'
      case 'offline':
        return 'Offline'
    }
  }

  const color = getStatusColor()

  return (
    <TouchableOpacity
      style={styles.container}
      onPress={() => setExpanded(!expanded)}
      activeOpacity={0.8}
    >
      <Animated.View
        style={[
          styles.indicator,
          { backgroundColor: `${color}20`, opacity: pulseAnim },
        ]}
      >
        <Ionicons name={getStatusIcon()} size={14} color={color} />
      </Animated.View>

      {expanded && (
        <View style={styles.expandedInfo}>
          <Text style={[styles.statusText, { color }]}>{getStatusText()}</Text>
          {latency !== null && (
            <Text style={styles.latencyText}>{latency}ms</Text>
          )}
        </View>
      )}
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  indicator: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  expandedInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  latencyText: {
    color: '#52525b',
    fontSize: 11,
  },
})
