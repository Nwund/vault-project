// File: src/renderer/components/ui/DurationDisplay.tsx
//
// Formatted total-duration display ("3d 14h 42m" / "2h 15m" / "47m").
// Extracted from App.tsx as part of #48 phase A.

export function DurationDisplay({ totalSeconds }: { totalSeconds: number }) {
  const days = Math.floor(totalSeconds / 86400)
  const hours = Math.floor((totalSeconds % 86400) / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)

  if (days > 0) {
    return (
      <span className="font-mono">
        <span className="text-white font-bold">{days}</span>
        <span className="text-[var(--muted)]">d </span>
        <span className="text-white font-bold">{hours.toString().padStart(2, '0')}</span>
        <span className="text-[var(--muted)]">h </span>
        <span className="text-white font-bold">{minutes.toString().padStart(2, '0')}</span>
        <span className="text-[var(--muted)]">m</span>
      </span>
    )
  }

  if (hours > 0) {
    return (
      <span className="font-mono">
        <span className="text-white font-bold">{hours}</span>
        <span className="text-[var(--muted)]">h </span>
        <span className="text-white font-bold">{minutes.toString().padStart(2, '0')}</span>
        <span className="text-[var(--muted)]">m</span>
      </span>
    )
  }

  return (
    <span className="font-mono">
      <span className="text-white font-bold">{minutes}</span>
      <span className="text-[var(--muted)]">m</span>
    </span>
  )
}
