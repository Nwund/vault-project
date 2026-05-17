// File: src/renderer/utils/heart-rate-ble.ts
//
// #345 G-121 — Edge-by-heart-rate session controller via Web Bluetooth
// + standard Heart Rate Service (UUID 0x180D). Works with any
// HRM band exposing the GATT HRS profile: Polar H10, Coros HRM, all
// Apple-Watch-via-third-party-apps (HeartCast etc.), Garmin chest
// strap, Wahoo TICKR, etc.
//
// Service:        0000180d-0000-1000-8000-00805f9b34fb
// Measurement:    00002a37-0000-1000-8000-00805f9b34fb (notify)
//
// Spec parses flag byte + uint8/uint16 BPM. We expose a clean
// EventEmitter-style API for the renderer session controller.

const HRS_UUID = 0x180d
const HR_MEASUREMENT_UUID = 0x2a37

export interface HrReading {
  bpm: number
  timestamp: number
}

export interface HrHandle {
  device: BluetoothDevice
  onReading: (cb: (r: HrReading) => void) => () => void
  disconnect: () => void
}

function parseHrMeasurement(value: DataView): number {
  const flags = value.getUint8(0)
  // bit 0 = 0 → uint8 BPM; bit 0 = 1 → uint16 LE BPM
  if (flags & 0x01) return value.getUint16(1, true)
  return value.getUint8(1)
}

export async function connectHeartRateBand(): Promise<HrHandle> {
  if (!('bluetooth' in navigator)) throw new Error('Web Bluetooth not available')
  const device = await (navigator as any).bluetooth.requestDevice({
    filters: [{ services: [HRS_UUID] }],
  }) as BluetoothDevice
  const server = await device.gatt!.connect()
  const service = await server.getPrimaryService(HRS_UUID)
  const characteristic = await service.getCharacteristic(HR_MEASUREMENT_UUID)
  await characteristic.startNotifications()

  const subscribers = new Set<(r: HrReading) => void>()
  characteristic.addEventListener('characteristicvaluechanged', (ev: any) => {
    const value = ev.target.value as DataView
    const bpm = parseHrMeasurement(value)
    const reading: HrReading = { bpm, timestamp: Date.now() }
    for (const cb of subscribers) {
      try { cb(reading) } catch { /* ignore */ }
    }
  })

  return {
    device,
    onReading: (cb) => { subscribers.add(cb); return () => subscribers.delete(cb) },
    disconnect: () => {
      try { characteristic.stopNotifications() } catch { /* ignore */ }
      if (device.gatt?.connected) device.gatt.disconnect()
    },
  }
}

/** Edge-zone controller: once BPM crosses `edgeThreshold` for `holdMs`
 *  continuously, fire a callback. Reset when BPM falls below
 *  `coolThreshold`. */
export class EdgeZoneMonitor {
  private inZoneSince: number | null = null
  private firedThisCycle = false
  constructor(
    private edgeThreshold: number,
    private coolThreshold: number,
    private holdMs: number,
    private onEdge: (bpm: number, heldMs: number) => void,
  ) {}
  feed(reading: HrReading): void {
    if (reading.bpm >= this.edgeThreshold) {
      if (this.inZoneSince === null) this.inZoneSince = reading.timestamp
      const held = reading.timestamp - this.inZoneSince
      if (!this.firedThisCycle && held >= this.holdMs) {
        this.firedThisCycle = true
        this.onEdge(reading.bpm, held)
      }
    } else if (reading.bpm < this.coolThreshold) {
      this.inZoneSince = null
      this.firedThisCycle = false
    }
  }
}
