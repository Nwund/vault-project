// File: src/main/services/chromecast-sender.ts
//
// #183 — Chromecast sender via chromecast-api. Discovers Chromecast
// devices on the LAN via mDNS, sends media via the Default Media
// Receiver (the always-on built-in Chromecast app). Pairs with the
// existing DLNA service which targets a different device class.
//
// Wraps the chromecast-api library (~80KB minified, mDNS via
// multicast-dns) — no protocol-level work needed in Vault.

let chromecastModule: any = null
let browser: any = null
const devices: Map<string, any> = new Map()

async function ensureBrowser(): Promise<any> {
  if (browser) return browser
  try {
    // chromecast-api has no type declarations on npm; suppress with the
    // dynamic-import cast pattern.
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    const mod: any = await import('chromecast-api')
    chromecastModule = mod.default ?? mod
    browser = new chromecastModule()
    browser.on('device', (device: any) => {
      console.log(`[Chromecast] discovered: ${device.friendlyName} (${device.host})`)
      devices.set(device.friendlyName, device)
    })
  } catch (err) {
    console.warn('[Chromecast] init failed:', err)
    throw err
  }
  return browser
}

export async function discoverChromecasts(): Promise<Array<{ name: string; host: string }>> {
  await ensureBrowser()
  // Give mDNS a moment to gather; chromecast-api emits 'device' over time.
  await new Promise((r) => setTimeout(r, 2000))
  return Array.from(devices.values()).map((d: any) => ({
    name: String(d.friendlyName ?? 'Chromecast'),
    host: String(d.host ?? ''),
  }))
}

export async function castToChromecast(args: {
  deviceName: string
  mediaUrl: string
  title?: string
  contentType?: string
}): Promise<{ ok: boolean; error?: string }> {
  try {
    await ensureBrowser()
    const device = devices.get(args.deviceName)
    if (!device) return { ok: false, error: `Device "${args.deviceName}" not found. Run discoverChromecasts() first.` }
    return await new Promise((resolve) => {
      device.play(args.mediaUrl, (err: any) => {
        if (err) resolve({ ok: false, error: err?.message ?? String(err) })
        else resolve({ ok: true })
      })
    })
  } catch (err: any) {
    return { ok: false, error: err?.message ?? String(err) }
  }
}

export async function chromecastControl(args: {
  deviceName: string
  action: 'pause' | 'resume' | 'stop' | 'seek'
  seekSeconds?: number
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const device = devices.get(args.deviceName)
    if (!device) return { ok: false, error: 'Device not found' }
    return await new Promise((resolve) => {
      const cb = (err: any) => err ? resolve({ ok: false, error: err.message }) : resolve({ ok: true })
      if (args.action === 'pause') device.pause(cb)
      else if (args.action === 'resume') device.resume(cb)
      else if (args.action === 'stop') device.stop(cb)
      else if (args.action === 'seek') device.seek(args.seekSeconds ?? 0, cb)
      else resolve({ ok: false, error: 'unknown action' })
    })
  } catch (err: any) {
    return { ok: false, error: err?.message ?? String(err) }
  }
}
