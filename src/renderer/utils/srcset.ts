// File: src/renderer/utils/srcset.ts
//
// #341 F-117 — Build <img srcset> strings for 1x/2x/3x on 4K/5K
// displays. Vault's thumbnail pipeline writes a single 480w PNG;
// this helper requests the same path with a `?w=960` / `?w=1440`
// query so the IPC range layer can re-encode on demand (it does
// already; the thumb-server treats unknown widths as transcode
// requests).
//
// Most callers just need:
//
//   <img src={src} srcSet={srcSetFor(src, 480)} />
//
// On 1x screens the browser picks src; on 2x it picks 960w; on 3x
// (Apple Studio Display, 5K iMac) it picks 1440w.

export function srcSetFor(baseSrc: string, baseWidth: number): string {
  if (!baseSrc) return ''
  const sep = baseSrc.includes('?') ? '&' : '?'
  return [
    `${baseSrc} ${baseWidth}w`,
    `${baseSrc}${sep}w=${baseWidth * 2} ${baseWidth * 2}w`,
    `${baseSrc}${sep}w=${baseWidth * 3} ${baseWidth * 3}w`,
  ].join(', ')
}

export function sizesFor(maxColumns: number): string {
  // Heuristic: cap to viewport / N columns, with a minimum tile of 240px.
  return `(min-width: 1200px) ${Math.max(240, Math.floor(1200 / maxColumns))}px, 240px`
}
