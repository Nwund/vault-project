// Type declarations for dlnacasts2
declare module 'dlnacasts2' {
  import { EventEmitter } from 'events'

  interface DLNAPlayer {
    name: string
    host: string
    xml: string
    play(url: string, options?: PlayOptions, callback?: (err: Error | null) => void): void
    play(callback?: (err: Error | null) => void): void
    pause(callback?: (err: Error | null) => void): void
    stop(callback?: (err: Error | null) => void): void
    seek(position: number, callback?: (err: Error | null) => void): void
    volume(level: number, callback?: (err: Error | null) => void): void
    status(callback: (err: Error | null, status: PlayerStatus) => void): void
  }

  interface PlayOptions {
    title?: string
    type?: string
    autoplay?: boolean
    seek?: number
  }

  interface PlayerStatus {
    playerState: 'PLAYING' | 'PAUSED' | 'STOPPED' | 'BUFFERING' | 'IDLE'
    currentTime?: number
    media?: {
      duration?: number
    }
    volume?: {
      level?: number
      muted?: boolean
    }
  }

  interface DLNACastsBrowser extends EventEmitter {
    players: DLNAPlayer[]
    destroy(): void
    on(event: 'update', listener: (player: DLNAPlayer) => void): this
    on(event: string, listener: (...args: any[]) => void): this
  }

  function dlnacasts(): DLNACastsBrowser
  export = dlnacasts
}
