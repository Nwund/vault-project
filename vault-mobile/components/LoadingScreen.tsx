// File: vault-mobile/components/LoadingScreen.tsx
// Full-screen loading indicator

import { useEffect, useRef } from 'react'
import { View, Text, StyleSheet, Animated, Easing } from 'react-native'
import { Ionicons } from '@expo/vector-icons'

interface LoadingScreenProps {
  message?: string
  showSpinner?: boolean
}

export function LoadingScreen({
  message = 'Loading...',
  showSpinner = true,
}: LoadingScreenProps) {
  const spinAnim = useRef(new Animated.Value(0)).current
  const pulseAnim = useRef(new Animated.Value(1)).current
  const fadeAnim = useRef(new Animated.Value(0)).current

  useEffect(() => {
    // Fade in
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
    }).start()

    // Spin animation
    if (showSpinner) {
      Animated.loop(
        Animated.timing(spinAnim, {
          toValue: 1,
          duration: 1000,
          easing: Easing.linear,
          useNativeDriver: true,
        })
      ).start()
    }

    // Pulse animation
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 0.8,
          duration: 600,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 600,
          useNativeDriver: true,
        }),
      ])
    ).start()
  }, [])

  const spinInterpolate = spinAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  })

  return (
    <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
      <View style={styles.content}>
        {showSpinner && (
          <Animated.View
            style={[
              styles.spinnerContainer,
              {
                transform: [
                  { rotate: spinInterpolate },
                  { scale: pulseAnim },
                ],
              },
            ]}
          >
            <Ionicons name="sync" size={40} color="#3b82f6" />
          </Animated.View>
        )}
        <Animated.Text style={[styles.message, { opacity: pulseAnim }]}>
          {message}
        </Animated.Text>
      </View>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#09090b',
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    alignItems: 'center',
    gap: 24,
  },
  spinnerContainer: {
    width: 80,
    height: 80,
    borderRadius: 20,
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  message: {
    color: '#a1a1aa',
    fontSize: 16,
    fontWeight: '500',
  },
})
