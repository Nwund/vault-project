// File: src/renderer/utils/apple-watch-haptic.ts
//
// #374 H-150 — Apple Watch haptic sub-toy mode. Bridges Vault →
// iPhone → Apple Watch via a tiny companion "Vault Haptic Receiver"
// SwiftUI app (lives at apple-companion/, not in this repo) that
// exposes a BLE peripheral:
//
//   Service:        4a8b0001-9eb6-4b6d-9a2f-1f8d99e96c12
//   Trigger char:   4a8b0002-…  uint8 [pattern-id 0-255]
//   Intensity char: 4a8b0003-…  uint8 [0-100]
//
// When Vault writes a pattern-id, the companion app calls
// WKInterfaceDevice.current().play(_:) on the watch with the
// corresponding WKHapticType (notification / success / failure /
// click / start / stop / directionUp / directionDown).
//
// Patterns 0-7 map to those 8 system haptics; 8-15 reserved for custom
// looped sequences.

const SERVICE_UUID = '4a8b0001-9eb6-4b6d-9a2f-1f8d99e96c12'
const TRIGGER_UUID = '4a8b0002-9eb6-4b6d-9a2f-1f8d99e96c12'
const INTENSITY_UUID = '4a8b0003-9eb6-4b6d-9a2f-1f8d99e96c12'

export type WatchHaptic =
  | 'notification' | 'success' | 'failure' | 'click'
  | 'start' | 'stop' | 'directionUp' | 'directionDown'
  | 'custom1' | 'custom2' | 'custom3' | 'custom4'

const HAPTIC_TO_ID: Record<WatchHaptic, number> = {
  notification: 0, success: 1, failure: 2, click: 3,
  start: 4, stop: 5, directionUp: 6, directionDown: 7,
  custom1: 8, custom2: 9, custom3: 10, custom4: 11,
}

export interface AppleWatchHandle {
  device: BluetoothDevice
  fire: (haptic: WatchHaptic) => Promise<void>
  setIntensity: (level: number) => Promise<void>
  disconnect: () => void
}

export async function connectAppleWatchBridge(): Promise<AppleWatchHandle> {
  if (!('bluetooth' in navigator)) throw new Error('Web Bluetooth not available')
  const device = await (navigator as any).bluetooth.requestDevice({
    filters: [{ services: [SERVICE_UUID] }, { namePrefix: 'VAULT-WATCH' }],
    optionalServices: [SERVICE_UUID],
  }) as BluetoothDevice
  const server = await device.gatt!.connect()
  const service = await server.getPrimaryService(SERVICE_UUID)
  const trigger = await service.getCharacteristic(TRIGGER_UUID)
  const intensity = await service.getCharacteristic(INTENSITY_UUID)

  return {
    device,
    fire: async (haptic) => {
      const id = HAPTIC_TO_ID[haptic]
      await trigger.writeValueWithoutResponse(new Uint8Array([id]))
    },
    setIntensity: async (level) => {
      const v = Math.max(0, Math.min(100, Math.round(level)))
      await intensity.writeValueWithoutResponse(new Uint8Array([v]))
    },
    disconnect: () => {
      if (device.gatt?.connected) device.gatt.disconnect()
    },
  }
}

/** Pattern player — kick a haptic every step of a sequence. */
export interface SequenceStep {
  haptic: WatchHaptic
  delayMs: number
}

export async function playSequence(handle: AppleWatchHandle, steps: SequenceStep[]): Promise<void> {
  for (const step of steps) {
    await handle.fire(step.haptic)
    if (step.delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, step.delayMs))
    }
  }
}
