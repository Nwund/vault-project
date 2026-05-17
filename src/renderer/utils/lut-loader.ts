// File: src/renderer/utils/lut-loader.ts
//
// #228 A-04 — .cube LUT loader + WebGL2 3D-texture color grade. Parses
// Adobe Cube LUT files (industry-standard color-grading LUTs) and
// applies them in real-time over a <video> via a 1-pass shader.
//
// Cube file format (text):
//   TITLE "..."
//   LUT_3D_SIZE 33        # cube edge length (17 / 25 / 33 / 64 common)
//   DOMAIN_MIN 0 0 0      # optional
//   DOMAIN_MAX 1 1 1      # optional
//   r g b                 # size^3 triplets, B fastest, then G, then R
//
// Render pipeline:
//   1. Bind input video as 2D texture.
//   2. Sample its RGB.
//   3. Use the RGB as a 3D coord into the LUT 3D texture.
//   4. Write the sampled color to canvas.
//
// Caller wires a video <-> canvas pair via attachLutCanvas(video, canvas, lut).
// The canvas is drawn over the video element in the player UI.

export interface CubeLut {
  size: number               // edge length
  domainMin: [number, number, number]
  domainMax: [number, number, number]
  /** Float32Array of length size^3 * 3, RGB packed, B fastest then G then R. */
  data: Float32Array
  title?: string
}

export function parseCube(source: string): CubeLut {
  let size = 0
  let domainMin: [number, number, number] = [0, 0, 0]
  let domainMax: [number, number, number] = [1, 1, 1]
  let title: string | undefined
  const triplets: number[] = []
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    if (line.startsWith('TITLE')) {
      const m = /^TITLE\s+"(.*)"$/.exec(line); if (m) title = m[1]
      continue
    }
    if (line.startsWith('LUT_3D_SIZE')) {
      const m = /^LUT_3D_SIZE\s+(\d+)/.exec(line); if (m) size = Number(m[1])
      continue
    }
    if (line.startsWith('LUT_1D_SIZE')) {
      throw new Error('1D LUTs not supported — convert to 3D')
    }
    if (line.startsWith('DOMAIN_MIN')) {
      const parts = line.split(/\s+/).slice(1).map(Number)
      if (parts.length === 3) domainMin = [parts[0], parts[1], parts[2]]
      continue
    }
    if (line.startsWith('DOMAIN_MAX')) {
      const parts = line.split(/\s+/).slice(1).map(Number)
      if (parts.length === 3) domainMax = [parts[0], parts[1], parts[2]]
      continue
    }
    const parts = line.split(/\s+/).map(Number)
    if (parts.length === 3 && parts.every((n) => Number.isFinite(n))) {
      triplets.push(parts[0], parts[1], parts[2])
    }
  }
  if (!size) throw new Error('LUT_3D_SIZE missing')
  const expected = size * size * size * 3
  if (triplets.length !== expected) {
    throw new Error(`LUT triplet count mismatch: got ${triplets.length / 3}, expected ${size ** 3}`)
  }
  return { size, domainMin, domainMax, data: new Float32Array(triplets), title }
}

const VS = `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = vec2(aPos.x * 0.5 + 0.5, 0.5 - aPos.y * 0.5);
  gl_Position = vec4(aPos, 0.0, 1.0);
}`

const FS = `#version 300 es
precision highp float;
precision highp sampler3D;
in vec2 vUv;
uniform sampler2D uVideo;
uniform sampler3D uLut;
uniform float uLutSize;
uniform float uStrength;
out vec4 outColor;

vec3 sampleLut(vec3 rgb) {
  // Bring rgb into [0.5/size, 1 - 0.5/size] to stay inside texel centers,
  // preventing wrap/clamp artifacts at the edges.
  float scale = (uLutSize - 1.0) / uLutSize;
  float offset = 0.5 / uLutSize;
  vec3 coord = rgb * scale + offset;
  return texture(uLut, coord).rgb;
}

void main() {
  vec4 src = texture(uVideo, vUv);
  vec3 graded = sampleLut(clamp(src.rgb, 0.0, 1.0));
  vec3 mixed = mix(src.rgb, graded, uStrength);
  outColor = vec4(mixed, src.a);
}`

export interface LutCanvasHandle {
  setLut: (lut: CubeLut | null) => void
  setStrength: (s: number) => void
  destroy: () => void
}

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type)!
  gl.shaderSource(sh, src); gl.compileShader(sh)
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(sh)
    gl.deleteShader(sh)
    throw new Error(`shader compile failed: ${info}`)
  }
  return sh
}

export function attachLutCanvas(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
  initialLut: CubeLut | null,
  initialStrength = 1,
): LutCanvasHandle {
  const gl = canvas.getContext('webgl2', { premultipliedAlpha: false }) as WebGL2RenderingContext | null
  if (!gl) throw new Error('webgl2 unavailable')

  const program = gl.createProgram()!
  gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VS))
  gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FS))
  gl.linkProgram(program)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(`program link failed: ${gl.getProgramInfoLog(program)}`)
  }
  gl.useProgram(program)

  // Full-screen tri.
  const vbo = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
  const aPos = gl.getAttribLocation(program, 'aPos')
  gl.enableVertexAttribArray(aPos)
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0)

  // Video texture.
  const videoTex = gl.createTexture()
  gl.activeTexture(gl.TEXTURE0)
  gl.bindTexture(gl.TEXTURE_2D, videoTex)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  gl.uniform1i(gl.getUniformLocation(program, 'uVideo'), 0)

  // LUT 3D texture.
  const lutTex = gl.createTexture()
  gl.activeTexture(gl.TEXTURE1)
  gl.bindTexture(gl.TEXTURE_3D, lutTex)
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE)
  gl.uniform1i(gl.getUniformLocation(program, 'uLut'), 1)

  const uLutSize = gl.getUniformLocation(program, 'uLutSize')
  const uStrength = gl.getUniformLocation(program, 'uStrength')

  let lut: CubeLut | null = null
  let strength = initialStrength
  gl.uniform1f(uStrength, strength)

  const uploadLut = (l: CubeLut | null) => {
    lut = l
    if (!l) return
    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_3D, lutTex)
    gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGB16F, l.size, l.size, l.size, 0, gl.RGB, gl.FLOAT, l.data)
    gl.uniform1f(uLutSize, l.size)
  }
  if (initialLut) uploadLut(initialLut)

  let rafId: number | null = null
  let destroyed = false

  const render = () => {
    if (destroyed) return
    rafId = requestAnimationFrame(render)
    if (video.videoWidth === 0 || !lut) return
    if (canvas.width !== video.videoWidth) canvas.width = video.videoWidth
    if (canvas.height !== video.videoHeight) canvas.height = video.videoHeight
    gl.viewport(0, 0, canvas.width, canvas.height)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, videoTex)
    try {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video)
    } catch { return }
    gl.drawArrays(gl.TRIANGLES, 0, 3)
  }
  rafId = requestAnimationFrame(render)

  return {
    setLut: (l) => uploadLut(l),
    setStrength: (s) => {
      strength = Math.max(0, Math.min(1, s))
      gl.uniform1f(uStrength, strength)
    },
    destroy: () => {
      destroyed = true
      if (rafId !== null) cancelAnimationFrame(rafId)
      gl.deleteTexture(videoTex); gl.deleteTexture(lutTex)
      gl.deleteBuffer(vbo); gl.deleteProgram(program)
    },
  }
}
