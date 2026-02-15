// File: src/renderer/components/TVRemotePanel.tsx
// Full-featured TV remote control panel with queue management

import React, { useState, useEffect, useCallback, useRef } from 'react'
import {
  X,
  Tv,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  Shuffle,
  Repeat,
  Repeat1,
  Monitor,
  Loader2,
  GripVertical,
  Trash2,
  Plus,
  StopCircle,
  RefreshCw
} from 'lucide-react'
import { formatDuration } from '../utils/formatters'

interface QueueItem {
  mediaId: string
  path: string
  title: string
  duration?: number
}

interface CastStatus {
  deviceId: string
  state: 'idle' | 'playing' | 'paused' | 'buffering' | 'stopped'
  currentTime: number
  duration: number
  volume: number
  muted: boolean
  mediaPath: string | null
}

interface QueueState {
  items: QueueItem[]
  currentIndex: number
  shuffleEnabled: boolean
  repeatMode: 'none' | 'one' | 'all'
  currentItem: QueueItem | null
}

interface Device {
  id: string
  name: string
  host: string
  type: 'dlna' | 'chromecast'
  status: 'idle' | 'playing' | 'paused' | 'buffering'
}

interface TVRemotePanelProps {
  isOpen: boolean
  onClose: () => void
  onAddMore?: () => void // Callback to open media picker
}

export function TVRemotePanel({ isOpen, onClose, onAddMore }: TVRemotePanelProps) {
  // Device state
  const [devices, setDevices] = useState<Device[]>([])
  const [activeDevice, setActiveDevice] = useState<Device | null>(null)
  const [isScanning, setIsScanning] = useState(false)
  const [showDeviceList, setShowDeviceList] = useState(false)

  // Playback state
  const [status, setStatus] = useState<CastStatus>({
    deviceId: '',
    state: 'idle',
    currentTime: 0,
    duration: 0,
    volume: 1,
    muted: false,
    mediaPath: null
  })

  // Queue state
  const [queue, setQueue] = useState<QueueState>({
    items: [],
    currentIndex: -1,
    shuffleEnabled: false,
    repeatMode: 'none',
    currentItem: null
  })

  // UI state
  const [isSeeking, setIsSeeking] = useState(false)
  const [seekValue, setSeekValue] = useState(0)
  const [showVolumeSlider, setShowVolumeSlider] = useState(false)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const [showManualEntry, setShowManualEntry] = useState(false)
  const [manualIp, setManualIp] = useState('')

  const progressRef = useRef<HTMLDivElement>(null)

  // Initialize - check current state
  useEffect(() => {
    if (!isOpen) return

    const init = async () => {
      try {
        // Check if already casting
        const isCasting = await window.api.dlna?.isCasting?.()
        if (isCasting) {
          const device = await window.api.dlna?.getActiveDevice?.()
          if (device) setActiveDevice(device)

          const currentStatus = await window.api.dlna?.getStatus?.()
          if (currentStatus) setStatus(currentStatus)

          const currentQueue = await window.api.dlna?.getQueue?.()
          if (currentQueue) setQueue(currentQueue)
        }

        // Start device discovery
        await startDiscovery()
      } catch (err) {
        console.error('[TVRemote] Init error:', err)
      }
    }

    init()

    // Cleanup on close
    return () => {
      window.api.dlna?.stopDiscovery?.()
    }
  }, [isOpen])

  // Subscribe to status updates
  useEffect(() => {
    if (!isOpen) return

    const unsubStatus = window.api.dlna?.onStatusUpdate?.((newStatus: CastStatus) => {
      if (!isSeeking) {
        setStatus(newStatus)
      }
    })

    const unsubQueue = window.api.dlna?.onQueueUpdated?.((newQueue: QueueState) => {
      setQueue(newQueue)
    })

    const unsubDevice = window.api.dlna?.onDeviceFound?.((device: Device) => {
      setDevices(prev => {
        const exists = prev.some(d => d.id === device.id)
        if (exists) return prev
        return [...prev, device]
      })
    })

    const unsubEnded = window.api.dlna?.onQueueEnded?.(() => {
      console.log('[TVRemote] Queue ended')
    })

    return () => {
      unsubStatus?.()
      unsubQueue?.()
      unsubDevice?.()
      unsubEnded?.()
    }
  }, [isOpen, isSeeking])

  const startDiscovery = async () => {
    setIsScanning(true)
    try {
      await window.api.dlna?.startDiscovery?.()
      const deviceList = await window.api.dlna?.getDevices?.() || []
      setDevices(deviceList)
    } catch (err) {
      console.error('[TVRemote] Discovery error:', err)
    } finally {
      setIsScanning(false)
    }
  }

  const handleSelectDevice = async (device: Device) => {
    setActiveDevice(device)
    setShowDeviceList(false)
    setShowManualEntry(false)
  }

  const handleManualConnect = async () => {
    if (!manualIp.trim()) return

    try {
      // Create a manual device entry
      const manualDevice: Device = {
        id: `manual-${manualIp.replace(/\./g, '-')}`,
        name: `TV @ ${manualIp}`,
        host: manualIp.trim(),
        type: 'dlna',
        status: 'idle'
      }

      // Try to connect via the DLNA service
      const connected = await window.api.dlna?.connectManual?.(manualIp.trim())
      if (connected) {
        setActiveDevice(manualDevice)
        setDevices(prev => {
          const exists = prev.some(d => d.host === manualIp.trim())
          if (exists) return prev
          return [...prev, manualDevice]
        })
      }

      setShowDeviceList(false)
      setShowManualEntry(false)
      setManualIp('')
    } catch (err) {
      console.error('[TVRemote] Manual connect error:', err)
    }
  }

  const handlePlayPause = async () => {
    try {
      if (status.state === 'playing') {
        await window.api.dlna?.pause?.()
      } else {
        await window.api.dlna?.play?.()
      }
    } catch (err) {
      console.error('[TVRemote] Play/pause error:', err)
    }
  }

  const handleStop = async () => {
    try {
      await window.api.dlna?.stop?.()
      setActiveDevice(null)
      setStatus({
        deviceId: '',
        state: 'idle',
        currentTime: 0,
        duration: 0,
        volume: 1,
        muted: false,
        mediaPath: null
      })
    } catch (err) {
      console.error('[TVRemote] Stop error:', err)
    }
  }

  const handlePrevious = async () => {
    try {
      await window.api.dlna?.playPrevious?.()
    } catch (err) {
      console.error('[TVRemote] Previous error:', err)
    }
  }

  const handleNext = async () => {
    try {
      await window.api.dlna?.playNext?.()
    } catch (err) {
      console.error('[TVRemote] Next error:', err)
    }
  }

  const handleSeek = async (position: number) => {
    try {
      await window.api.dlna?.seek?.(position)
      setStatus(prev => ({ ...prev, currentTime: position }))
    } catch (err) {
      console.error('[TVRemote] Seek error:', err)
    }
  }

  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!progressRef.current || status.duration <= 0) return
    const rect = progressRef.current.getBoundingClientRect()
    const percent = (e.clientX - rect.left) / rect.width
    const position = percent * status.duration
    handleSeek(position)
  }

  const handleVolumeChange = async (volume: number) => {
    try {
      await window.api.dlna?.setVolume?.(volume)
      setStatus(prev => ({ ...prev, volume }))
    } catch (err) {
      console.error('[TVRemote] Volume error:', err)
    }
  }

  const handleToggleShuffle = async () => {
    try {
      await window.api.dlna?.setShuffle?.(!queue.shuffleEnabled)
    } catch (err) {
      console.error('[TVRemote] Shuffle error:', err)
    }
  }

  const handleToggleRepeat = async () => {
    const modes: Array<'none' | 'one' | 'all'> = ['none', 'one', 'all']
    const currentIdx = modes.indexOf(queue.repeatMode)
    const nextMode = modes[(currentIdx + 1) % modes.length]
    try {
      await window.api.dlna?.setRepeat?.(nextMode)
    } catch (err) {
      console.error('[TVRemote] Repeat error:', err)
    }
  }

  const handlePlayAtIndex = async (index: number) => {
    try {
      await window.api.dlna?.playAtIndex?.(index)
    } catch (err) {
      console.error('[TVRemote] Play at index error:', err)
    }
  }

  const handleRemoveFromQueue = async (index: number) => {
    try {
      await window.api.dlna?.removeFromQueue?.(index)
    } catch (err) {
      console.error('[TVRemote] Remove error:', err)
    }
  }

  const handleClearQueue = async () => {
    try {
      await window.api.dlna?.clearQueue?.()
    } catch (err) {
      console.error('[TVRemote] Clear queue error:', err)
    }
  }

  // Drag and drop handlers
  const handleDragStart = (index: number) => {
    setDragIndex(index)
  }

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault()
    setDragOverIndex(index)
  }

  const handleDrop = async (index: number) => {
    if (dragIndex !== null && dragIndex !== index) {
      try {
        await window.api.dlna?.reorderQueue?.(dragIndex, index)
      } catch (err) {
        console.error('[TVRemote] Reorder error:', err)
      }
    }
    setDragIndex(null)
    setDragOverIndex(null)
  }

  const handleDragEnd = () => {
    setDragIndex(null)
    setDragOverIndex(null)
  }

  if (!isOpen) return null

  const isPlaying = status.state === 'playing'
  const hasQueue = queue.items.length > 0
  const progress = status.duration > 0 ? (status.currentTime / status.duration) * 100 : 0

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center">
      <div
        className="bg-zinc-900 rounded-2xl border border-white/20 shadow-2xl w-[95%] max-w-[500px] max-h-[90vh] overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-gradient-to-r from-blue-500/10 to-purple-500/10">
          <div className="flex items-center gap-2">
            <Tv size={20} className="text-blue-400" />
            <span className="font-semibold">TV Remote</span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-white/10 rounded-lg transition"
          >
            <X size={18} />
          </button>
        </div>

        {/* Device Selector */}
        <div className="px-4 py-3 border-b border-white/10">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowDeviceList(!showDeviceList)}
              className="flex-1 flex items-center gap-2 px-3 py-2 bg-white/5 hover:bg-white/10 rounded-xl border border-white/10 transition"
            >
              <Monitor size={16} className={activeDevice ? 'text-blue-400' : 'text-white/40'} />
              <span className="flex-1 text-left text-sm">
                {activeDevice ? activeDevice.name : 'Select a device...'}
              </span>
              {isScanning && <Loader2 size={14} className="animate-spin text-white/40" />}
            </button>
            <button
              onClick={startDiscovery}
              className="p-2 hover:bg-white/10 rounded-lg transition"
              title="Refresh devices"
            >
              <RefreshCw size={16} className={isScanning ? 'animate-spin' : ''} />
            </button>
          </div>

          {/* Device List Dropdown */}
          {showDeviceList && (
            <div className="mt-2 bg-zinc-800 rounded-xl border border-white/10 max-h-64 overflow-y-auto">
              {devices.length === 0 && !isScanning ? (
                <div className="px-4 py-3 text-sm text-white/50 text-center">
                  No devices found
                </div>
              ) : isScanning ? (
                <div className="px-4 py-3 text-sm text-white/50 text-center">
                  Scanning for devices...
                </div>
              ) : (
                devices.map(device => (
                  <button
                    key={device.id}
                    onClick={() => handleSelectDevice(device)}
                    className={`w-full flex items-center gap-3 px-3 py-2 hover:bg-white/10 transition ${
                      activeDevice?.id === device.id ? 'bg-blue-500/20' : ''
                    }`}
                  >
                    <Monitor size={16} className={activeDevice?.id === device.id ? 'text-blue-400' : 'text-white/60'} />
                    <div className="flex-1 text-left">
                      <div className="text-sm">{device.name}</div>
                      <div className="text-xs text-white/40">{device.host}</div>
                    </div>
                  </button>
                ))
              )}

              {/* Manual IP Entry */}
              <div className="border-t border-white/10 p-2">
                {showManualEntry ? (
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={manualIp}
                      onChange={(e) => setManualIp(e.target.value)}
                      placeholder="Enter TV IP (e.g. 192.168.1.100)"
                      className="flex-1 px-3 py-2 bg-black/30 border border-white/20 rounded-lg text-sm focus:outline-none focus:border-blue-500"
                      onKeyDown={(e) => e.key === 'Enter' && handleManualConnect()}
                      autoFocus
                    />
                    <button
                      onClick={handleManualConnect}
                      className="px-3 py-2 bg-blue-500/30 hover:bg-blue-500/40 text-blue-400 rounded-lg text-sm transition"
                    >
                      Connect
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowManualEntry(true)}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm text-white/60 hover:text-white hover:bg-white/10 rounded-lg transition"
                  >
                    <Plus size={14} />
                    Enter IP manually
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Now Playing */}
        <div className="px-4 py-4 border-b border-white/10">
          <div className="text-center mb-3">
            <div className="text-sm text-white/50 mb-1">Now Playing</div>
            <div className="font-medium truncate">
              {queue.currentItem?.title || 'Nothing playing'}
            </div>
          </div>

          {/* Progress Bar */}
          <div
            ref={progressRef}
            className="h-2 bg-white/10 rounded-full cursor-pointer group mb-2"
            onClick={handleProgressClick}
          >
            <div
              className="h-full bg-gradient-to-r from-blue-500 to-purple-500 rounded-full relative group-hover:h-3 transition-all"
              style={{ width: `${progress}%` }}
            >
              <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition" />
            </div>
          </div>

          {/* Time Display */}
          <div className="flex justify-between text-xs text-white/50">
            <span>{formatDuration(status.currentTime)}</span>
            <span>{formatDuration(status.duration)}</span>
          </div>
        </div>

        {/* Playback Controls */}
        <div className="px-4 py-4 border-b border-white/10">
          <div className="flex items-center justify-center gap-4">
            {/* Shuffle */}
            <button
              onClick={handleToggleShuffle}
              className={`p-2 rounded-lg transition ${
                queue.shuffleEnabled ? 'bg-blue-500/30 text-blue-400' : 'hover:bg-white/10 text-white/60'
              }`}
              title="Shuffle"
            >
              <Shuffle size={18} />
            </button>

            {/* Previous */}
            <button
              onClick={handlePrevious}
              className="p-2 hover:bg-white/10 rounded-lg transition"
              disabled={queue.items.length === 0}
            >
              <SkipBack size={24} />
            </button>

            {/* Play/Pause */}
            <button
              onClick={handlePlayPause}
              className="p-4 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full hover:opacity-90 transition shadow-lg"
            >
              {isPlaying ? <Pause size={28} fill="white" /> : <Play size={28} fill="white" />}
            </button>

            {/* Next */}
            <button
              onClick={handleNext}
              className="p-2 hover:bg-white/10 rounded-lg transition"
              disabled={queue.items.length === 0}
            >
              <SkipForward size={24} />
            </button>

            {/* Repeat */}
            <button
              onClick={handleToggleRepeat}
              className={`p-2 rounded-lg transition ${
                queue.repeatMode !== 'none' ? 'bg-blue-500/30 text-blue-400' : 'hover:bg-white/10 text-white/60'
              }`}
              title={`Repeat: ${queue.repeatMode}`}
            >
              {queue.repeatMode === 'one' ? <Repeat1 size={18} /> : <Repeat size={18} />}
            </button>
          </div>

          {/* Volume Control */}
          <div className="flex items-center justify-center gap-3 mt-4">
            <button
              onClick={() => handleVolumeChange(status.volume > 0 ? 0 : 0.5)}
              className="p-2 hover:bg-white/10 rounded-lg transition"
            >
              {status.volume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}
            </button>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={status.volume}
              onChange={e => handleVolumeChange(parseFloat(e.target.value))}
              className="w-32 h-1 bg-white/20 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white"
            />
            <span className="text-xs text-white/50 w-8">{Math.round(status.volume * 100)}%</span>
          </div>

          {/* Stop Casting */}
          {activeDevice && (
            <div className="flex justify-center mt-4">
              <button
                onClick={handleStop}
                className="flex items-center gap-2 px-4 py-2 bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 rounded-xl text-red-400 text-sm transition"
              >
                <StopCircle size={16} />
                Stop Casting
              </button>
            </div>
          )}
        </div>

        {/* Queue */}
        <div className="flex-1 overflow-hidden flex flex-col">
          <div className="flex items-center justify-between px-4 py-2 border-b border-white/10">
            <div className="text-sm font-medium">Queue ({queue.items.length})</div>
            <div className="flex items-center gap-2">
              {onAddMore && (
                <button
                  onClick={onAddMore}
                  className="flex items-center gap-1 px-2 py-1 text-xs bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 rounded-lg transition"
                >
                  <Plus size={12} />
                  Add
                </button>
              )}
              {hasQueue && (
                <button
                  onClick={handleClearQueue}
                  className="flex items-center gap-1 px-2 py-1 text-xs bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg transition"
                >
                  <Trash2 size={12} />
                  Clear
                </button>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {queue.items.length === 0 ? (
              <div className="px-4 py-8 text-center text-white/50 text-sm">
                Queue is empty. Add media to start casting.
              </div>
            ) : (
              <div className="divide-y divide-white/5">
                {queue.items.map((item, index) => (
                  <div
                    key={`${item.mediaId}-${index}`}
                    draggable
                    onDragStart={() => handleDragStart(index)}
                    onDragOver={e => handleDragOver(e, index)}
                    onDrop={() => handleDrop(index)}
                    onDragEnd={handleDragEnd}
                    className={`flex items-center gap-2 px-4 py-2 hover:bg-white/5 transition cursor-move ${
                      index === queue.currentIndex ? 'bg-blue-500/20' : ''
                    } ${dragOverIndex === index ? 'border-t-2 border-blue-500' : ''}`}
                    onClick={() => handlePlayAtIndex(index)}
                  >
                    <GripVertical size={14} className="text-white/30 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className={`text-sm truncate ${index === queue.currentIndex ? 'text-blue-400 font-medium' : ''}`}>
                        {item.title}
                      </div>
                      {item.duration && (
                        <div className="text-xs text-white/40">
                          {formatDuration(item.duration)}
                        </div>
                      )}
                    </div>
                    {index === queue.currentIndex && status.state === 'playing' && (
                      <div className="flex items-center gap-0.5">
                        <div className="w-0.5 h-3 bg-blue-400 animate-pulse" style={{ animationDelay: '0ms' }} />
                        <div className="w-0.5 h-4 bg-blue-400 animate-pulse" style={{ animationDelay: '150ms' }} />
                        <div className="w-0.5 h-2 bg-blue-400 animate-pulse" style={{ animationDelay: '300ms' }} />
                      </div>
                    )}
                    <button
                      onClick={e => {
                        e.stopPropagation()
                        handleRemoveFromQueue(index)
                      }}
                      className="p-1 hover:bg-red-500/20 rounded transition opacity-0 group-hover:opacity-100"
                    >
                      <Trash2 size={14} className="text-red-400" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-white/10 bg-white/5">
          <div className="text-[10px] text-white/40 text-center">
            Supports DLNA/UPnP compatible TVs and devices
          </div>
        </div>
      </div>
    </div>
  )
}

export default TVRemotePanel
