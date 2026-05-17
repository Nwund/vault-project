// File: src/renderer/utils/esp32-haptic.ts
//
// #279 C-55 — ESP32 BLE GATT haptic protocol via Web Bluetooth. Pairs
// with a Vault-haptic firmware (custom ESP32 sketch) exposing one
// service with two characteristics:
//
//   Service UUID:       1b9e0001-9eb6-4b6d-9a2f-1f8d99e96c12
//   Intensity (write):  1b9e0002-…  uint8 [0-255]
//   Pattern (write):    1b9e0003-…  uint8[] (pattern bytes)
//
// Patterns are pairs of (intensity, ms) tuples. The firmware loops
// the pattern until a new one is written.
//
// Lives in renderer because Web Bluetooth is browser-only.

const SERVICE_UUID = '1b9e0001-9eb6-4b6d-9a2f-1f8d99e96c12'
const INTENSITY_CHAR_UUID = '1b9e0002-9eb6-4b6d-9a2f-1f8d99e96c12'
const PATTERN_CHAR_UUID = '1b9e0003-9eb6-4b6d-9a2f-1f8d99e96c12'

export interface HapticDeviceHandle {
  device: BluetoothDevice
  setIntensity: (level: number) => Promise<void>
  playPattern: (pattern: Array<[intensity: number, ms: number]>) => Promise<void>
  disconnect: () => void
}

export async function connectHapticDevice(): Promise<HapticDeviceHandle> {
  if (!('bluetooth' in navigator)) throw new Error('Web Bluetooth not available')
  const device = await (navigator as any).bluetooth.requestDevice({
    filters: [{ services: [SERVICE_UUID] }, { namePrefix: 'VAULT-HAPTIC' }],
    optionalServices: [SERVICE_UUID],
  }) as BluetoothDevice
  const server = await device.gatt!.connect()
  const service = await server.getPrimaryService(SERVICE_UUID)
  const intensityChar = await service.getCharacteristic(INTENSITY_CHAR_UUID)
  const patternChar = await service.getCharacteristic(PATTERN_CHAR_UUID)

  return {
    device,
    setIntensity: async (level: number) => {
      const v = Math.max(0, Math.min(255, Math.round(level)))
      await intensityChar.writeValueWithoutResponse(new Uint8Array([v]))
    },
    playPattern: async (pattern) => {
      const bytes: number[] = []
      for (const [i, ms] of pattern) {
        bytes.push(Math.max(0, Math.min(255, Math.round(i))))
        const msClamped = Math.max(0, Math.min(65535, Math.round(ms)))
        bytes.push((msClamped >> 8) & 0xff, msClamped & 0xff)
      }
      await patternChar.writeValueWithoutResponse(new Uint8Array(bytes))
    },
    disconnect: () => {
      if (device.gatt?.connected) device.gatt.disconnect()
    },
  }
}

/** Built-in pattern library — caller picks via name. */
export const HAPTIC_PATTERNS = {
  pulse: [[200, 300], [0, 300]] as Array<[number, number]>,
  build: [[40, 200], [80, 200], [120, 200], [160, 200], [200, 200], [255, 400], [0, 100]] as Array<[number, number]>,
  climax: [[255, 100], [0, 50], [255, 100], [0, 50], [255, 100], [0, 50], [255, 600], [0, 1000]] as Array<[number, number]>,
  edge: [[200, 100], [0, 80], [200, 100], [0, 80], [200, 100], [0, 80]] as Array<[number, number]>,
}
