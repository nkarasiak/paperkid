// Tiny software rasterizer that bakes crisp, outlined pixel-art sprites from 3D shapes drawn
// in the same oblique projection as the world: x = SK·s + l, y = -s - z.

export interface Sprite { img: HTMLCanvasElement; ox: number; oy: number } // (ox, oy) = local origin inside img
export type V3 = [number, number, number]
/** A colour, or a function of the two surface coordinates (world units); '' skips the pixel. */
export type Col = string | ((u: number, v: number) => string)

/** Horizontal skew per unit along the street; ~0.7 matches the home ports' street angle (about 55°). */
export const SK = 0.7

const SW = 400, SH = 400, OX = 150, OY = 300
const buf = new Uint32Array(SW * SH)
const rgbCache = new Map<string, number>()

export const dark = (hex: string, f: number) =>
  '#' + [1, 3, 5].map(i => Math.min(255, Math.round(parseInt(hex.slice(i, i + 2), 16) * f)).toString(16).padStart(2, '0')).join('')

/** Deterministic 0..1 noise for dithering textures. */
export function hash(a: number, b: number) {
  let h = (Math.floor(a) * 374761393 + Math.floor(b) * 668265263) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

export function rgb(c: string) {
  let n = rgbCache.get(c)
  if (n === undefined) {
    const v = parseInt(c.slice(1), 16)
    n = ((0xff << 24) | ((v & 0xff) << 16) | (v & 0xff00) | ((v >> 16) & 0xff)) >>> 0 // ABGR, little-endian
    rgbCache.set(c, n)
  }
  return n
}

const at = (col: Col, u: number, v: number) => (typeof col === 'string' ? col : col(u, v))

export class Painter {
  x0 = SW; y0 = SH; x1 = -1; y1 = -1
  /** Uniform scale about the sprite origin, e.g. for children. */
  k = 1

  dot(x: number, y: number, c: string) {
    if (!c) return
    x = Math.round(x) + OX
    y = Math.round(y) + OY
    if (x < 1 || y < 1 || x >= SW - 1 || y >= SH - 1) return
    buf[y * SW + x] = rgb(c)
    if (x < this.x0) this.x0 = x
    if (x > this.x1) this.x1 = x
    if (y < this.y0) this.y0 = y
    if (y > this.y1) this.y1 = y
  }

  pt(s: number, l: number, z: number, c: string) { this.dot((SK * s + l) * this.k, (-s - z) * this.k, c) }

  /** Parallelogram from a along e1 and e2 (or the triangle a, a+e1, a+e2). */
  quad(a: V3, e1: V3, e2: V3, col: Col, tri = false) {
    const L1 = Math.hypot(...e1), L2 = Math.hypot(...e2)
    const n1 = Math.ceil(L1 * 2.5) + 1, n2 = Math.ceil(L2 * 2.5) + 1
    for (let i = 0; i <= n1; i++) {
      for (let j = 0; j <= n2; j++) {
        const u = i / n1, v = j / n2
        if (tri && u + v > 1) continue
        this.pt(a[0] + e1[0] * u + e2[0] * v, a[1] + e1[1] * u + e2[1] * v, a[2] + e1[2] * u + e2[2] * v, at(col, u * L1, v * L2))
      }
    }
  }

  /** Axis-aligned box; only the three visible faces (near -s, street-side +l, top). */
  box(s0: number, s1: number, l0: number, l1: number, z0: number, z1: number, c: string, side?: Col, near?: Col, top?: Col) {
    if (s0 > s1) [s0, s1] = [s1, s0]
    this.quad([s0, l0, z0], [0, l1 - l0, 0], [0, 0, z1 - z0], near ?? dark(c, 0.68))
    this.quad([s0, l1, z0], [s1 - s0, 0, 0], [0, 0, z1 - z0], side ?? dark(c, 0.84))
    this.quad([s0, l0, z1], [s1 - s0, 0, 0], [0, l1 - l0, 0], top ?? c)
  }

  /** Thick 3D line (round brush in screen space). */
  line(a: V3, b: V3, c: string, w = 1) {
    const n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) * 2.5) + 1
    for (let i = 0; i <= n; i++) {
      const t = i / n
      const s = a[0] + (b[0] - a[0]) * t, l = a[1] + (b[1] - a[1]) * t, z = a[2] + (b[2] - a[2]) * t
      if (w <= 1) this.pt(s, l, z, c)
      else this.disc([s, l, z], w / 2, c)
    }
  }

  /** Screen-space filled disc centred on a 3D point; col gets the pixel offset (dx, dy). */
  disc(p: V3, r: number, col: Col) {
    const cx = (SK * p[0] + p[1]) * this.k, cy = (-p[0] - p[2]) * this.k
    r *= this.k
    const R = Math.ceil(r)
    for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
      if (dx * dx + dy * dy <= r * r + 0.3) this.dot(cx + dx, cy + dy, at(col, dx, dy))
    }
  }

  /** Ring of radius r in the plane spanned by unit axes a and b; col gets (angle, depth into the ring). */
  ring(c: V3, a: V3, b: V3, r: number, col: Col, thick = 1) {
    for (let t = 0; t < thick; t += 0.4) {
      const rr = r - t, n = Math.ceil(rr * 16)
      for (let i = 0; i < n; i++) {
        const th = (i / n) * Math.PI * 2, cs = Math.cos(th) * rr, sn = Math.sin(th) * rr
        this.pt(c[0] + a[0] * cs + b[0] * sn, c[1] + a[1] * cs + b[1] * sn, c[2] + a[2] * cs + b[2] * sn, at(col, th, t))
      }
    }
  }

  /** Outline the silhouette, crop, and hand back a canvas. Resets the shared buffer. */
  done(outline: string): Sprite {
    const { x0, y0, x1, y1 } = this
    if (x1 < 0) return { img: document.createElement('canvas'), ox: 0, oy: 0 }
    if (outline) {
      const o = rgb(outline), edge: number[] = []
      for (let y = y0 - 1; y <= y1 + 1; y++) for (let x = x0 - 1; x <= x1 + 1; x++) {
        const i = y * SW + x
        if (!buf[i] && (buf[i - 1] || buf[i + 1] || buf[i - SW] || buf[i + SW])) edge.push(i)
      }
      for (const i of edge) buf[i] = o
    }
    const X0 = x0 - 1, Y0 = y0 - 1, w = x1 - x0 + 3, h = y1 - y0 + 3
    const img = document.createElement('canvas')
    img.width = w
    img.height = h
    const id = new ImageData(w, h), out = new Uint32Array(id.data.buffer)
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = (Y0 + y) * SW + X0 + x
      out[y * w + x] = buf[i]
      buf[i] = 0
    }
    img.getContext('2d')!.putImageData(id, 0, 0)
    return { img, ox: OX - X0, oy: OY - Y0 }
  }
}

/** A sprite's recipe. Baked on demand: to outlined pixels here (bake), or to a mesh for the 3D view (gl.ts). */
export interface Art { draw: (p: Painter) => void; outline: string; s?: Sprite; m?: unknown }
const cache = new Map<string, Art>()

/** The (cached) recipe for a sprite. */
export function sprite(key: string, draw: (p: Painter) => void, outline = '#161616'): Art {
  let a = cache.get(key)
  if (!a) cache.set(key, (a = { draw, outline }))
  return a
}

/** Bake (once) a recipe into an outlined pixel sprite. */
export function bake(a: Art): Sprite {
  if (!a.s) {
    const p = new Painter()
    a.draw(p)
    a.s = p.done(a.outline)
  }
  return a.s
}

/** Small repeating texture from a colour function of pixel (x, y). */
export function tile(w: number, h: number, col: (x: number, y: number) => string): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const g = c.getContext('2d')!
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { g.fillStyle = col(x, y); g.fillRect(x, y, 1, 1) }
  return c
}
