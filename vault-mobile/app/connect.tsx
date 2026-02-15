// File: vault-mobile/app/connect.tsx
// Connection screen - Enhanced with animations and better UX

import { useState, useEffect, useRef } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  StyleSheet,
  ActivityIndicator,
  Platform,
  Animated,
  Easing,
  Keyboard,
} from 'react-native'
import { router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { getErrorMessage } from '@/utils'
import * as Haptics from 'expo-haptics'
import { useConnectionStore } from '@/stores/connection'
import { api } from '@/services/api'

export default function ConnectScreen() {
  const { connect, isConnecting, connectionError, serverUrl: lastServerUrl } = useConnectionStore()

  const [mode, setMode] = useState<'auto' | 'manual'>('auto')
  const [serverAddress, setServerAddress] = useState('')
  const [pairingCode, setPairingCode] = useState('')
  const [deviceName, setDeviceName] = useState('My Phone')
  const [discoveredServers, setDiscoveredServers] = useState<string[]>([])
  const [isScanning, setIsScanning] = useState(false)

  // Animation refs
  const scanRotation = useRef(new Animated.Value(0)).current
  const pulseAnim = useRef(new Animated.Value(1)).current
  const slideAnim = useRef(new Animated.Value(0)).current
  const codeInputRefs = useRef<(TextInput | null)[]>([])
  const [codeDigits, setCodeDigits] = useState(['', '', '', '', '', ''])

  // Spin animation for scanning
  useEffect(() => {
    if (isScanning) {
      Animated.loop(
        Animated.timing(scanRotation, {
          toValue: 1,
          duration: 2000,
          easing: Easing.linear,
          useNativeDriver: true,
        })
      ).start()

      // Pulse animation
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.1,
            duration: 800,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 800,
            useNativeDriver: true,
          }),
        ])
      ).start()
    } else {
      scanRotation.setValue(0)
      pulseAnim.setValue(1)
    }
  }, [isScanning])

  // Slide animation when mode changes
  useEffect(() => {
    Animated.spring(slideAnim, {
      toValue: mode === 'auto' ? 0 : 1,
      useNativeDriver: true,
    }).start()
  }, [mode])

  // State for scan progress
  const [scanProgress, setScanProgress] = useState({ current: 0, total: 0 })
  const scanAbortRef = useRef<AbortController | null>(null)

  // Auto-discover servers
  useEffect(() => {
    if (mode === 'auto') {
      scanForServers()
    }
    return () => {
      // Cleanup: abort scan when mode changes or component unmounts
      scanAbortRef.current?.abort()
    }
  }, [mode])

  // Test a single address with quick timeout
  const testServer = async (addr: string, signal: AbortSignal): Promise<string | null> => {
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 1500) // 1.5s per server

      const response = await fetch(`${addr}/api/ping`, {
        signal: signal.aborted ? signal : controller.signal,
      })
      clearTimeout(timeoutId)

      if (response.ok) {
        const data = await response.json()
        if (data.status === 'ok') {
          return addr
        }
      }
    } catch {
      // Server not found or timeout
    }
    return null
  }

  const scanForServers = async () => {
    // Abort any existing scan
    scanAbortRef.current?.abort()
    scanAbortRef.current = new AbortController()
    const signal = scanAbortRef.current.signal

    setIsScanning(true)
    setDiscoveredServers([])
    setScanProgress({ current: 0, total: 0 })
    if (Platform.OS === 'ios') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)

    const found: string[] = []

    // Priority 0: Try last known server first (instant reconnect if server is same)
    if (lastServerUrl) {
      setScanProgress({ current: 0, total: 1 })
      const lastServerResult = await testServer(lastServerUrl, signal)
      if (lastServerResult) {
        found.push(lastServerResult)
        setDiscoveredServers([lastServerResult])
        setServerAddress(lastServerResult) // Auto-select it
        if (Platform.OS === 'ios') {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
        }
        setIsScanning(false)
        setScanProgress({ current: 0, total: 0 })
        return
      }
    }

    // Priority 1: Common home network subnets with likely IPs first (1-50)
    // Most home networks use low IP numbers
    const prioritySubnets = ['192.168.1', '192.168.0', '192.168.2', '10.0.0', '10.0.1']
    const priorityIPs: string[] = []

    // First pass: scan .1 to .50 on all subnets (most likely to have computers)
    for (const subnet of prioritySubnets) {
      for (let i = 1; i <= 50; i++) {
        priorityIPs.push(`http://${subnet}.${i}:8765`)
      }
    }

    // Second pass: scan .51 to .150 (less common but possible)
    const secondaryIPs: string[] = []
    for (const subnet of prioritySubnets) {
      for (let i = 51; i <= 150; i++) {
        secondaryIPs.push(`http://${subnet}.${i}:8765`)
      }
    }

    // Remove last server URL from scan list (already tried)
    const allAddresses = [...priorityIPs, ...secondaryIPs].filter(addr => addr !== lastServerUrl)
    setScanProgress({ current: 0, total: allAddresses.length })

    // Scan in parallel batches
    const batchSize = 30 // More parallel requests but with per-request timeouts
    let scannedCount = 0

    for (let i = 0; i < allAddresses.length && found.length === 0; i += batchSize) {
      if (signal.aborted) break

      const batch = allAddresses.slice(i, i + batchSize)
      const results = await Promise.all(
        batch.map(addr => testServer(addr, signal))
      )

      for (const result of results) {
        if (result) {
          found.push(result)
          setDiscoveredServers(prev => [...prev, result])
          if (Platform.OS === 'ios') {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
          }
        }
      }

      scannedCount += batch.length
      setScanProgress({ current: scannedCount, total: allAddresses.length })

      // Stop scanning once we find a server
      if (found.length > 0) break
    }

    setDiscoveredServers(found)
    setIsScanning(false)
    setScanProgress({ current: 0, total: 0 })
  }

  const handleCodeDigitChange = (index: number, value: string) => {
    const digit = value.replace(/\D/g, '').slice(-1)
    const newDigits = [...codeDigits]
    newDigits[index] = digit
    setCodeDigits(newDigits)
    setPairingCode(newDigits.join(''))

    // Auto-focus next input
    if (digit && index < 5) {
      codeInputRefs.current[index + 1]?.focus()
    }

    if (Platform.OS === 'ios' && digit) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    }
  }

  const handleCodeKeyPress = (index: number, key: string) => {
    if (key === 'Backspace' && !codeDigits[index] && index > 0) {
      codeInputRefs.current[index - 1]?.focus()
    }
  }

  const handleConnect = async () => {
    Keyboard.dismiss()

    if (!serverAddress && discoveredServers.length === 0) {
      if (Platform.OS === 'ios') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
      Alert.alert('Error', 'Please enter a server address or select a discovered server')
      return
    }

    const code = codeDigits.join('')
    if (code.length !== 6) {
      if (Platform.OS === 'ios') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
      Alert.alert('Error', 'Please enter the 6-digit pairing code from your desktop')
      return
    }

    const address = serverAddress || discoveredServers[0]

    try {
      if (Platform.OS === 'ios') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
      await connect(address, code, deviceName)
      if (Platform.OS === 'ios') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      router.back()
    } catch (err) {
      if (Platform.OS === 'ios') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
      Alert.alert('Connection Failed', getErrorMessage(err))
    }
  }

  const handleSelectServer = (address: string) => {
    if (Platform.OS === 'ios') Haptics.selectionAsync()
    setServerAddress(address)
  }

  const handleModeChange = (newMode: 'auto' | 'manual') => {
    if (Platform.OS === 'ios') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    setMode(newMode)
  }

  const spinInterpolate = scanRotation.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  })

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerIconContainer}>
          <Ionicons name="phone-portrait" size={32} color="#3b82f6" />
          <View style={styles.headerIconBadge}>
            <Ionicons name="link" size={14} color="#fff" />
          </View>
        </View>
        <Text style={styles.headerTitle}>Connect to Vault</Text>
        <Text style={styles.headerSubtitle}>
          Pair your phone with your desktop Vault to access your library
        </Text>
      </View>

      {/* Mode Toggle */}
      <View style={styles.modeToggle}>
        <TouchableOpacity
          style={[styles.modeButton, mode === 'auto' && styles.modeButtonActive]}
          onPress={() => handleModeChange('auto')}
        >
          <Ionicons
            name="wifi"
            size={18}
            color={mode === 'auto' ? '#fff' : '#71717a'}
          />
          <Text style={[styles.modeText, mode === 'auto' && styles.modeTextActive]}>
            Auto Discover
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.modeButton, mode === 'manual' && styles.modeButtonActive]}
          onPress={() => handleModeChange('manual')}
        >
          <Ionicons
            name="create"
            size={18}
            color={mode === 'manual' ? '#fff' : '#71717a'}
          />
          <Text style={[styles.modeText, mode === 'manual' && styles.modeTextActive]}>
            Manual
          </Text>
        </TouchableOpacity>
      </View>

      {/* Instructions */}
      <View style={styles.instructions}>
        <View style={styles.instructionStep}>
          <View style={styles.stepNumber}>
            <Text style={styles.stepNumberText}>1</Text>
          </View>
          <Text style={styles.instructionText}>
            Open Vault on your desktop
          </Text>
        </View>
        <View style={styles.instructionStep}>
          <View style={styles.stepNumber}>
            <Text style={styles.stepNumberText}>2</Text>
          </View>
          <Text style={styles.instructionText}>
            Go to Settings → Mobile Sync
          </Text>
        </View>
        <View style={styles.instructionStep}>
          <View style={styles.stepNumber}>
            <Text style={styles.stepNumberText}>3</Text>
          </View>
          <Text style={styles.instructionText}>
            Click "Generate Pairing Code"
          </Text>
        </View>
      </View>

      {/* Auto Discovery */}
      {mode === 'auto' && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Discovered Servers</Text>
            <TouchableOpacity
              style={styles.refreshButton}
              onPress={scanForServers}
              disabled={isScanning}
            >
              <Animated.View style={{ transform: [{ rotate: spinInterpolate }] }}>
                <Ionicons name="refresh" size={20} color="#3b82f6" />
              </Animated.View>
            </TouchableOpacity>
          </View>

          {isScanning ? (
            <Animated.View style={[styles.scanningContainer, { transform: [{ scale: pulseAnim }] }]}>
              <View style={styles.scanningIcon}>
                <Ionicons name="radio" size={32} color="#3b82f6" />
              </View>
              <Text style={styles.scanningText}>Scanning network...</Text>
              {scanProgress.total > 0 && (
                <Text style={styles.scanningProgress}>
                  {Math.round((scanProgress.current / scanProgress.total) * 100)}% ({scanProgress.current}/{scanProgress.total})
                </Text>
              )}
              <Text style={styles.scanningHint}>Make sure Vault is running on your desktop</Text>
            </Animated.View>
          ) : discoveredServers.length > 0 ? (
            <View style={styles.serverList}>
              {discoveredServers.map((server, index) => (
                <TouchableOpacity
                  key={server}
                  style={[
                    styles.serverItem,
                    serverAddress === server && styles.serverItemSelected,
                  ]}
                  onPress={() => handleSelectServer(server)}
                >
                  <View style={[
                    styles.serverIcon,
                    serverAddress === server && styles.serverIconSelected,
                  ]}>
                    <Ionicons
                      name="desktop"
                      size={22}
                      color={serverAddress === server ? '#3b82f6' : '#71717a'}
                    />
                  </View>
                  <View style={styles.serverInfo}>
                    <Text style={styles.serverName}>Vault Desktop</Text>
                    <Text style={styles.serverAddress}>{server}</Text>
                  </View>
                  {serverAddress === server && (
                    <View style={styles.checkmark}>
                      <Ionicons name="checkmark" size={18} color="#fff" />
                    </View>
                  )}
                </TouchableOpacity>
              ))}
            </View>
          ) : (
            <View style={styles.noServers}>
              <View style={styles.noServersIcon}>
                <Ionicons name="cloud-offline" size={36} color="#52525b" />
              </View>
              <Text style={styles.noServersText}>No servers found</Text>
              <Text style={styles.noServersHint}>
                Make sure your desktop Vault is running and on the same network
              </Text>
              <TouchableOpacity style={styles.retryButton} onPress={scanForServers}>
                <Ionicons name="refresh" size={16} color="#3b82f6" />
                <Text style={styles.retryButtonText}>Scan Again</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}

      {/* Manual Entry */}
      {mode === 'manual' && (
        <View style={styles.section}>
          <Text style={styles.label}>Server Address</Text>
          <View style={styles.inputContainer}>
            <Ionicons name="globe" size={20} color="#52525b" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="http://192.168.1.100:8765"
              placeholderTextColor="#52525b"
              value={serverAddress}
              onChangeText={setServerAddress}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
            />
          </View>
        </View>
      )}

      {/* Device Name */}
      <View style={styles.section}>
        <Text style={styles.label}>Device Name</Text>
        <View style={styles.inputContainer}>
          <Ionicons name="phone-portrait" size={20} color="#52525b" style={styles.inputIcon} />
          <TextInput
            style={styles.input}
            placeholder="My Phone"
            placeholderTextColor="#52525b"
            value={deviceName}
            onChangeText={setDeviceName}
          />
        </View>
      </View>

      {/* Pairing Code - Split Inputs */}
      <View style={styles.section}>
        <Text style={styles.label}>Pairing Code</Text>
        <View style={styles.codeInputContainer}>
          {[0, 1, 2, 3, 4, 5].map((index) => (
            <View key={index} style={styles.codeDigitWrapper}>
              <TextInput
                ref={(ref) => (codeInputRefs.current[index] = ref)}
                style={[
                  styles.codeDigit,
                  codeDigits[index] && styles.codeDigitFilled,
                ]}
                value={codeDigits[index]}
                onChangeText={(text) => handleCodeDigitChange(index, text)}
                onKeyPress={(e) => handleCodeKeyPress(index, e.nativeEvent.key)}
                keyboardType="number-pad"
                maxLength={1}
                selectTextOnFocus
              />
              {index === 2 && <View style={styles.codeDash} />}
            </View>
          ))}
        </View>
      </View>

      {/* Error Message */}
      {connectionError && (
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle" size={20} color="#ef4444" />
          <Text style={styles.errorText}>{connectionError}</Text>
        </View>
      )}

      {/* Connect Button */}
      <TouchableOpacity
        style={[
          styles.connectButton,
          isConnecting && styles.connectButtonDisabled,
        ]}
        onPress={handleConnect}
        disabled={isConnecting}
      >
        {isConnecting ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <>
            <Ionicons name="link" size={22} color="#fff" />
            <Text style={styles.connectButtonText}>Connect</Text>
          </>
        )}
      </TouchableOpacity>

      {/* Help Link */}
      <TouchableOpacity style={styles.helpLink}>
        <Ionicons name="help-circle-outline" size={18} color="#71717a" />
        <Text style={styles.helpLinkText}>Having trouble connecting?</Text>
      </TouchableOpacity>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#09090b',
  },
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  header: {
    alignItems: 'center',
    marginBottom: 28,
  },
  headerIconContainer: {
    width: 72,
    height: 72,
    borderRadius: 20,
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    position: 'relative',
  },
  headerIconBadge: {
    position: 'absolute',
    bottom: -4,
    right: -4,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#22c55e',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#09090b',
  },
  headerTitle: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 8,
  },
  headerSubtitle: {
    color: '#71717a',
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: 20,
  },
  modeToggle: {
    flexDirection: 'row',
    backgroundColor: '#18181b',
    borderRadius: 14,
    padding: 4,
    marginBottom: 24,
  },
  modeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 10,
    gap: 8,
  },
  modeButtonActive: {
    backgroundColor: '#3b82f6',
  },
  modeText: {
    color: '#71717a',
    fontSize: 14,
    fontWeight: '600',
  },
  modeTextActive: {
    color: '#fff',
  },
  instructions: {
    backgroundColor: '#18181b',
    borderRadius: 14,
    padding: 16,
    marginBottom: 24,
    gap: 14,
  },
  instructionStep: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  stepNumber: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#3b82f6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepNumberText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  instructionText: {
    color: '#a1a1aa',
    fontSize: 14,
    flex: 1,
  },
  section: {
    marginBottom: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  refreshButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#18181b',
    justifyContent: 'center',
    alignItems: 'center',
  },
  label: {
    color: '#a1a1aa',
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 8,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#18181b',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#27272a',
  },
  inputIcon: {
    marginLeft: 14,
  },
  input: {
    flex: 1,
    padding: 16,
    color: '#fff',
    fontSize: 16,
  },
  codeInputContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  codeDigitWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  codeDigit: {
    width: 48,
    height: 60,
    backgroundColor: '#18181b',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#27272a',
    color: '#fff',
    fontSize: 28,
    fontWeight: '700',
    textAlign: 'center',
  },
  codeDigitFilled: {
    borderColor: '#3b82f6',
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
  },
  codeDash: {
    width: 12,
    height: 3,
    backgroundColor: '#3f3f46',
    borderRadius: 2,
    marginLeft: 8,
  },
  scanningContainer: {
    alignItems: 'center',
    padding: 40,
  },
  scanningIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  scanningText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  scanningHint: {
    color: '#71717a',
    fontSize: 13,
    marginTop: 6,
  },
  scanningProgress: {
    color: '#3b82f6',
    fontSize: 12,
    fontWeight: '500',
    marginTop: 4,
  },
  serverList: {
    gap: 10,
  },
  serverItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#18181b',
    borderRadius: 14,
    padding: 14,
    gap: 12,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  serverItemSelected: {
    borderColor: '#3b82f6',
    backgroundColor: 'rgba(59, 130, 246, 0.08)',
  },
  serverIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#27272a',
    justifyContent: 'center',
    alignItems: 'center',
  },
  serverIconSelected: {
    backgroundColor: 'rgba(59, 130, 246, 0.2)',
  },
  serverInfo: {
    flex: 1,
  },
  serverName: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  serverAddress: {
    color: '#71717a',
    fontSize: 13,
    marginTop: 2,
  },
  checkmark: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#3b82f6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  noServers: {
    alignItems: 'center',
    padding: 32,
  },
  noServersIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#18181b',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  noServersText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  noServersHint: {
    color: '#71717a',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 8,
    paddingHorizontal: 20,
    lineHeight: 20,
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 16,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    borderRadius: 10,
  },
  retryButtonText: {
    color: '#3b82f6',
    fontSize: 14,
    fontWeight: '600',
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    gap: 10,
  },
  errorText: {
    color: '#ef4444',
    fontSize: 14,
    flex: 1,
  },
  connectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#3b82f6',
    borderRadius: 14,
    padding: 18,
    gap: 10,
    marginTop: 8,
    shadowColor: '#3b82f6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  connectButtonDisabled: {
    opacity: 0.7,
  },
  connectButtonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
  },
  helpLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 20,
    paddingVertical: 10,
  },
  helpLinkText: {
    color: '#71717a',
    fontSize: 14,
  },
})
