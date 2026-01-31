declare module 'better-sqlite3' {
  namespace Database {
    type Database = any
  }
  function Database(filename: string, options?: any): any
  export = Database
}

declare module 'ffprobe-static' {
  const ffprobeStatic: { path: string }
  export = ffprobeStatic
}

declare module 'canvas-confetti' {
  function confetti(options?: any): Promise<null>
  namespace confetti {
    function create(canvas: HTMLCanvasElement, options?: any): typeof confetti
  }
  export = confetti
}
