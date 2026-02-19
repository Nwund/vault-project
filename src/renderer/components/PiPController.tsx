// File: src/renderer/components/PiPController.tsx
// Picture-in-Picture controller with advanced options

import React, { useState, useCallback, useEffect } from 'react'
import { PictureInPicture2, Maximize2, Minimize2, Move, X, Pin, PinOff, Monitor, Layout } from 'lucide-react'

interface PiPControllerProps { videoRef: React.RefObject<HTMLVideoElement>; onPiPChange?: (active: boolean) => void; className?: string }

export function PiPController({ videoRef, onPiPChange, className = '' }: PiPControllerProps) {
  const [isPiP, setIsPiP] = useState(false)
  const [pipWindow, setPipWindow] = useState<PictureInPictureWindow | null>(null)
  const [size, setSize] = useState<'small' | 'medium' | 'large'>('medium')
  const [alwaysOnTop, setAlwaysOnTop] = useState(true)
  const [autoEnter, setAutoEnter] = useState(false)

  const sizes = { small: { w: 320, h: 180 }, medium: { w: 480, h: 270 }, large: { w: 640, h: 360 } }

  const enterPiP = useCallback(async () => {
    const video = videoRef.current
    if (!video || !document.pictureInPictureEnabled) return
    try {
      const pip = await video.requestPictureInPicture()
      setPipWindow(pip); setIsPiP(true); onPiPChange?.(true)
      pip.addEventListener('resize', () => {})
      pip.onresize = () => {}
    } catch (e) { console.error('PiP failed:', e) }
  }, [videoRef, onPiPChange])

  const exitPiP = useCallback(async () => {
    if (document.pictureInPictureElement) {
      await document.exitPictureInPicture()
      setIsPiP(false); setPipWindow(null); onPiPChange?.(false)
    }
  }, [onPiPChange])

  const togglePiP = useCallback(() => isPiP ? exitPiP() : enterPiP(), [isPiP, enterPiP, exitPiP])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    const handleEnter = () => { setIsPiP(true); onPiPChange?.(true) }
    const handleLeave = () => { setIsPiP(false); setPipWindow(null); onPiPChange?.(false) }
    video.addEventListener('enterpictureinpicture', handleEnter)
    video.addEventListener('leavepictureinpicture', handleLeave)
    return () => { video.removeEventListener('enterpictureinpicture', handleEnter); video.removeEventListener('leavepictureinpicture', handleLeave) }
  }, [videoRef, onPiPChange])

  useEffect(() => {
    if (!autoEnter) return
    const handleVisibility = () => { if (document.hidden && videoRef.current && !videoRef.current.paused) enterPiP() }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [autoEnter, videoRef, enterPiP])

  const supported = document.pictureInPictureEnabled

  return (
    <div className={`bg-zinc-900 rounded-xl border border-zinc-700 overflow-hidden ${className}`}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <div className="flex items-center gap-2"><PictureInPicture2 size={16} className="text-[var(--primary)]" /><span className="font-semibold text-sm">Picture in Picture</span></div>
        <button onClick={togglePiP} disabled={!supported} className={`px-3 py-1.5 rounded text-sm ${isPiP ? 'bg-red-500' : 'bg-[var(--primary)]'} disabled:opacity-50`}>{isPiP ? 'Exit PiP' : 'Enter PiP'}</button>
      </div>
      {!supported ? <div className="p-4 text-center text-zinc-500 text-sm">PiP not supported in this browser</div> : <div className="p-4 space-y-4">
        {/* Size selector */}
        <div><div className="text-xs text-zinc-500 mb-2">Window Size</div>
        <div className="flex gap-2">{(['small', 'medium', 'large'] as const).map(s => <button key={s} onClick={() => setSize(s)} className={`flex-1 py-2 rounded text-xs ${size === s ? 'bg-[var(--primary)]' : 'bg-zinc-800'}`}>{s.charAt(0).toUpperCase() + s.slice(1)}<br/><span className="text-[10px] opacity-60">{sizes[s].w}×{sizes[s].h}</span></button>)}</div></div>
        {/* Options */}
        <div className="space-y-3">
          <label className="flex items-center justify-between"><div className="flex items-center gap-2"><Pin size={12} className="text-zinc-500" /><span className="text-sm">Always on top</span></div>
          <button onClick={() => setAlwaysOnTop(!alwaysOnTop)} className={`w-8 h-5 rounded-full transition ${alwaysOnTop ? 'bg-[var(--primary)]' : 'bg-zinc-700'}`}><div className={`w-3 h-3 rounded-full bg-white transform transition ${alwaysOnTop ? 'translate-x-4' : 'translate-x-1'}`} /></button></label>
          <label className="flex items-center justify-between"><div className="flex items-center gap-2"><Monitor size={12} className="text-zinc-500" /><span className="text-sm">Auto-enter on tab switch</span></div>
          <button onClick={() => setAutoEnter(!autoEnter)} className={`w-8 h-5 rounded-full transition ${autoEnter ? 'bg-[var(--primary)]' : 'bg-zinc-700'}`}><div className={`w-3 h-3 rounded-full bg-white transform transition ${autoEnter ? 'translate-x-4' : 'translate-x-1'}`} /></button></label>
        </div>
        {/* Status */}
        {isPiP && <div className="flex items-center gap-2 p-2 bg-[var(--primary)]/10 rounded text-sm"><Layout size={14} className="text-[var(--primary)]" /><span>PiP mode active</span></div>}
      </div>}
    </div>
  )
}
export default PiPController
