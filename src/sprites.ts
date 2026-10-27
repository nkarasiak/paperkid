// All game art, drawn as 3D shapes and baked to outlined pixel sprites (see pix.ts).
// Every sprite's local origin is its object's (s, l, z) = (0, 0, 0) corner or centre, as noted.

import { dark, hash, sprite, tile, type Painter, type V3 } from './pix'
import { HOUSE_H, HOUSE_LEN, L, STREETS, type Lot } from './street'

const SKIN = '#f2b98a', JEANS = '#3b4f8f', SHOE = '#f4f4ec', TIRE = '#262626', CHROME = '#b8bcc4'
const X: V3 = [1, 0, 0], Y: V3 = [0, 1, 0], Z: V3 = [0, 0, 1]

const siding = (base: string) => { const line = dark(base, 0.86); return (_u: number, v: number) => (v % 5 < 0.9 ? line : base) }
const shingles = (base: string) => {
  const d = dark(base, 0.72), hi = dark(base, 1.12)
  return (u: number, v: number) => {
    const row = Math.floor(v / 3.5)
    if (v % 3.5 < 0.8) return d
    if ((u + row * 3.5) % 7 < 0.8) return d
    return v % 3.5 > 2.8 ? hi : base
  }
}
const brick = (base: string) => { const m = dark(base, 0.62); return (u: number, v: number) => (v % 3 < 0.7 || (u + Math.floor(v / 3) * 3) % 6 < 0.7 ? m : base) }
const tudor = (base: string) => (u: number, v: number) =>
  u % 16 < 1.6 || v % 22 < 1.4 || Math.abs((u % 16) - ((v % 22) * 16) / 22) < 1 ? '#4a2e1a' : base
const stone = (base: string) => (u: number, v: number) => (v % 5 < 0.7 || (u + Math.floor(v / 5) * 4) % 8 < 0.7 ? dark(base, 0.8) : base)
const STAINED = ['#c0392b', '#2471a3', '#f1c40f', '#1e8449', '#8e44ad']
const leafy = (base: string) => (u: number, v: number) => {
  const n = hash(u * 1.3, v * 1.3)
  return n < 0.22 ? dark(base, 1.3) : n > 0.8 ? dark(base, 0.7) : base
}

// Ground textures: 16×16 speckles, one texel per world unit, by name so both the 2D and 3D views can tile them.
const SPECKLE: Record<string, [number, string, string, string, number, number]> = {
  grassA: [0, '#4e9139', '#3f7d30', '#5ea64a', 0.14, 0.12],
  grassB: [7, '#56993f', '#468836', '#66ae50', 0.14, 0.12],
  walk: [50, '#bab7ae', '#a6a399', '#c8c5bc', 0.12, 0.06],
  road: [90, '#46464d', '#38383e', '#56565e', 0.1, 0.08],
  dirt: [130, '#b38b56', '#9a7444', '#c49c66', 0.16, 0.1],
}
let tiles: Record<string, HTMLCanvasElement> | undefined
export const groundTiles = () => (tiles ??= Object.fromEntries(Object.entries(SPECKLE).map(([k, [seed, base, lo, hi, pLo, pHi]]) =>
  [k, tile(16, 16, (x, y) => { const n = hash(x + seed, y); return n < pLo ? lo : n > 1 - pHi ? hi : base })])))

// ---------------------------------------------------------------- houses (origin: house s0, l = 0)

/** Lot.style picks the wall, window shape and extras; customers are bright, non-customers dark [P] p.1-6. */
export function house(lot: Lot, s0: number, sub: boolean) {
  const st = lot.style, church = st === 'church'
  const wall = church ? (sub ? '#d8d2c4' : '#6a6862') : st === 'octagon' ? (sub ? '#c4c8cc' : '#5e6266') : sub ? lot.color : '#6c635a'
  const roof = church ? (sub ? '#4d5d73' : '#2e3238') : sub ? lot.roof : '#3a342e'
  const shutter = sub ? dark(lot.roof, 0.9) : '#2e2a26', glass = sub ? '#8fcbea' : '#56656c'
  const wins = lot.windows.map(w => ({ a: w.s0 - s0, b: w.s1 - s0, broken: w.broken }))
  const d = { a: lot.door[0] - s0, b: lot.door[1] - s0 }
  const key = `house${st}${wall}${roof}${lot.chimney}${wins.map(w => +w.broken).join('')}`
  return sprite(key, p => {
    const D = HOUSE_LEN, F = L.HOUSE, Hh = HOUSE_H, R = church ? 34 : 26
    const lines = ({ brick, tudor, church: stone } as Record<string, typeof siding>)[st]?.(wall) ?? siding(wall)
    // Window shape around its centre (dx, dy); g grows it for the frame.
    const inWin = (dx: number, dy: number, hw: number, g: number) => {
      const W2 = hw + g, H2 = 9 + g
      if (Math.abs(dx) > W2 || Math.abs(dy) > H2) return false
      if (st === 'octagon') return Math.abs(dx) + Math.abs(dy) <= W2 + H2 - 5
      if (church) return dy < 2 || Math.abs(dx) <= (H2 - dy) * 1.5 // pointed arch
      return true
    }
    const front = (u: number, v: number) => {
      for (const w of wins) {
        const dx = u - (w.a + w.b) / 2, dy = v - 29, hw = (w.b - w.a) / 2
        if (inWin(dx, dy, hw, 2)) {
          if (!inWin(dx, dy, hw, 0)) return church ? dark(wall, 0.7) : '#f4f1e6'
          if (w.broken) return hash(u * 2, v * 2) < 0.22 ? '#cfe9f7' : '#141414'
          if (church) return (u + v) % 4 < 0.7 || (u - v + 40) % 4 < 0.7 ? '#222' : sub ? STAINED[Math.floor(hash(u / 4, v / 4) * 5)] : '#4a4458'
          if (Math.abs(dx) < 0.6 || Math.abs(dy) < 0.6) return '#f4f1e6'
          return v > 33 && u - w.a < 6 ? '#d6f0fb' : glass
        }
        if ((st === 'plain' || st === 'brick') && v >= 18 && v <= 40 && ((u >= w.a - 7 && u < w.a - 2) || (u > w.b + 2 && u <= w.b + 7))) {
          return v % 3 < 0.7 ? dark(shutter, 0.75) : shutter
        }
      }
      if (u >= d.a - 1.5 && u <= d.b + 1.5 && v <= 34) {
        if (u < d.a || u > d.b || v > 32) return '#f4f1e6'
        if (Math.abs(u - (d.b - 3)) < 1 && Math.abs(v - 15) < 1) return '#f0c840'
        return (u - d.a) % 9 < 0.8 || v % 10 < 0.8 ? '#5a361d' : '#7a4a28'
      }
      if (v < 3) return dark(wall, 0.7) // foundation
      if (st === 'columns' && v > Hh - 5) return '#f4f1e6' // frieze
      return lines(u, v)
    }
    p.quad([0, 0, 0], [0, F, 0], [0, 0, Hh], siding(dark(wall, 0.72)))
    p.quad([0, 0, Hh], [0, F, 0], [0, F / 2, R], siding(dark(wall, 0.72)), true)
    p.quad([0, F, 0], [D, 0, 0], [0, 0, Hh], front)
    p.quad([0, 0, Hh], [D, 0, 0], [0, F / 2, R], shingles(dark(roof, 0.72)))
    if (lot.chimney && !church) p.box(96, 106, 12, 22, 60, Hh + R + 12, '#a24c38', (u, v) => ((v % 4 < 0.8 || (u + Math.floor(v / 4) * 2) % 5 < 0.8) ? '#7a3828' : '#a24c38'))
    p.quad([0, F, Hh], [D, 0, 0], [0, -F / 2, R], shingles(roof))
    p.line([0, F + 0.5, Hh], [D, F + 0.5, Hh], dark(roof, 0.55))
    if (st === 'columns') for (const s of [2, 44, 84, 124]) p.box(s, s + 4, F, F + 4, 0, Hh - 4, '#f4f1e6', (_u, v) => (v % 3 < 1 ? '#dcd8cc' : '#f4f1e6'))
    if (church) {
      // Bell tower rising out of the ridge, with a spire and a cross.
      const T = Hh + R - 6, top = T + 34
      p.box(98, 118, 22, 42, T, top, wall, (u, v) => (Math.abs(u - 10) < 3 && v > 18 && v < 28 ? '#1a1a1a' : stone(dark(wall, 0.84))(u, v)), stone(dark(wall, 0.68)))
      p.quad([98, 22, top], [0, 20, 0], [10, 10, 26], dark(roof, 0.72), true)
      p.quad([98, 42, top], [20, 0, 0], [10, -10, 26], roof, true)
      p.line([108, 32, top + 26], [108, 32, top + 36], '#e8d070', 1.2)
      p.line([108, 29, top + 32], [108, 35, top + 32], '#e8d070', 1.2)
    }
  })
}

/** Porch variants: plain slab with a step, tiered steps, or a railed brick stoop. */
export const porch = (v: number) => sprite(`porch${v}`, p => {
  if (v === 2) {
    p.box(0, 38, 0, 16, 0, 6, '#b8442e', brick('#b8442e'), brick('#a63c28'))
    for (const s of [1, 34]) p.box(s, s + 3, 13, 16, 6, 18, '#f4f1e6')
    p.box(0, 38, 14, 15, 15, 16.5, '#f4f1e6')
    p.box(11, 27, 16, 21, 0, 3, '#a63c28')
    return
  }
  p.box(0, 38, 0, 16, 0, 6, '#d6cfc0', (u, w) => (u % 5 < 0.7 && w > 1 ? '#bdb5a5' : '#cbc3b3'))
  p.box(11, 27, 16, 21, 0, v ? 4 : 3, '#c6beae')
  if (v) p.box(9, 29, 21, 26, 0, 2, '#bdb5a5')
})

// 3×5 pixel glyphs, rows top to bottom.
const LETTERS: Record<string, string> = {
  A: '010101111101101', D: '110101101101110', E: '111100110100111', H: '101101111101101', I: '111010010010111',
  L: '100100100100111', M: '101111111101101', R: '110101110101101', S: '011100010001110', T: '111010010010010',
  W: '101101111111101', Y: '101101010010010', ' ': '000000000000000',
}

/** Yellow diamond street-name sign on a post, at the corner where each day starts. */
export function streetSign(street: number) {
  const words = STREETS[street].name.replace('STREET', 'ST').replace('ROAD', 'RD').split(' ')
  return sprite(`sign${street}`, p => {
    p.box(2, 4, 2, 4, 0, 24, '#8a8a8a')
    // A flat plate facing the player (-s), 24 wide × 14 tall: one word per row of 3×5 letters.
    const plate = (u: number, v: number) => {
      const y = 13 - Math.floor(v), row = Math.floor(y / 6), ry = y % 6, word = words[row]
      if (!word || ry > 4) return '#f0c020'
      const c = Math.floor(u - 0.5) - Math.floor((24 - (word.length * 4 - 1)) / 2), g = word[Math.floor(c / 4)]
      if (c < 0 || c % 4 === 3 || !g) return '#f0c020'
      return LETTERS[g][ry * 3 + (c % 4)] === '1' ? '#1a1a1a' : '#f0c020'
    }
    p.box(-1, 0, -9, 15, 24, 38, '#f0c020', undefined, plate)
  })
}

// 3×5 pixel digits, rows top to bottom.
const DIGITS = ['111101101101111', '010110010010111', '111001111100111', '111001111001111', '101101111001001',
  '111100111001111', '111100111101111', '111001010010010', '111101111101111', '111101111001111']

/** Customers get our own paper's box, with its name on the side; non-customers a plain numbered mailbox. */
export function mailbox(sub: boolean, hit: boolean, num: number) {
  if (sub) return sprite('paperbox', p => {
    p.box(2, 4, 5, 7, 0, 15, '#6b4a2b')
    const plate = (u: number, v: number) => {
      const c = Math.floor(u - 0.5) - 1, row = 7 - Math.floor(v), g = 'DAILY'[Math.floor(c / 4)]
      return c >= 0 && c % 4 < 3 && row >= 0 && row < 5 && g && LETTERS[g][row * 3 + (c % 4)] === '1' ? '#f4f1e6' : '#1f4fa8'
    }
    p.box(0, 6, -8, 13, 15, 25, '#1f4fa8', undefined, plate)
    p.box(0.5, 5.5, -8, 13, 25, 26.5, '#2a62c8')
  })
  const c = '#2c2c2c', ink = '#f0d040', digits = String(num)
  return sprite(`mailbox${hit}${num}`, p => {
    if (hit) {
      p.box(2, 4, 5, 7, 0, 4, '#6b4a2b')
      p.box(0, 6, 9, 21, 0, 7, c)
      return
    }
    p.box(2, 4, 5, 7, 0, 18, '#6b4a2b')
    // Near face carries the number: u runs along l (columns), v up z (rows).
    const plate = (u: number, v: number) => {
      const col = Math.floor(u - 0.5), row = 5 - Math.floor(v), d = Math.floor(col / 4)
      if (row < 0 || row > 4 || col < 0 || col % 4 === 3 || d >= digits.length) return dark(c, 0.8)
      return DIGITS[+digits[d]][row * 3 + (col % 4)] === '1' ? ink : dark(c, 0.8)
    }
    p.box(0, 6, 0, 12, 18, 25, c, undefined, plate)
    p.box(0.5, 5.5, 0, 12, 25, 26.5, dark(c, 1.08))
  })
}

// ---------------------------------------------------------------- breakage targets (origin: s0, l0)

export const lamp = (hit: boolean) => sprite(`lamp${hit}`, p => {
  p.box(1, 3, 1, 3, 0, 28, '#2a2a2e')
  p.box(-0.5, 4.5, -0.5, 4.5, 27, 28, '#2a2a2e')
  if (hit) { for (const [s, l] of [[-3, 2], [5, -1], [2, 6]]) p.pt(s, l, 0.5, '#e8f4fa'); return }
  p.box(0, 4, 0, 4, 28, 33, '#fbe9a0', (u, v) => (u % 2 < 0.6 ? '#2a2a2e' : v > 3 ? '#fff6c8' : '#f4d870'))
  p.box(-0.5, 4.5, -0.5, 4.5, 33, 34.5, '#2a2a2e')
})

export const statue = (hit: boolean) => sprite(`statue${hit}`, p => {
  const marble = '#d5d8dc'
  p.box(0, 10, 0, 10, 0, 8, '#a6acaf')
  if (hit) { for (let k = 0; k < 6; k++) p.box(k * 2 - 4, k * 2 - 2.5, (k * 7) % 12 - 1, (k * 7) % 12 + 1, 0, 1.5, marble); return }
  p.box(3.5, 6.5, 3, 7, 8, 13, marble)
  p.box(3, 7, 2.5, 7.5, 13, 21, marble)
  p.line([5, 7.5, 19], [5, 10, 26], marble, 1.6)
  p.disc([5, 5, 23.5], 2.4, (dx, dy) => (dx > 0 && dy > 0 ? '#b8bcc0' : marble))
})

export const tomb = (hit: boolean) => sprite(`tomb${hit}`, p => {
  const g = '#9aa0a4'
  if (hit) { p.box(-9, 3, 0, 8, 0, 2.5, g); return }
  const cross = (u: number, v: number) => ((Math.abs(u - 4) < 0.6 && v > 3 && v < 9) || (Math.abs(v - 7) < 0.6 && u > 2.5 && u < 5.5) ? '#5c6266' : dark(g, 0.84))
  p.box(0, 3, 0, 8, 0, 9, g, undefined, cross)
  p.disc([1.5, 4, 9], 4, (_dx, dy) => (dy > 0 ? '' : g))
  p.box(-1, 4, -1, 9, 0, 1, '#6c7276')
})

export const tree = () => sprite('tree', p => {
  p.box(3, 9, 3, 9, 0, 34, '#6b4a2b', (_u, v) => (hash(3, v) < 0.3 ? '#4e3420' : '#5e4026'))
  const leaves = (dx: number, dy: number) => {
    const n = hash(dx + 40, dy + 40)
    const g = dx + dy < -6 ? '#4fa046' : dx + dy > 6 ? '#24602a' : '#357f34'
    return n < 0.12 ? '#62b856' : n > 0.9 ? '#1d4f22' : g
  }
  for (const [s, l, z, r] of [[6, 6, 42, 14], [0, 9, 48, 10], [12, 2, 50, 10], [6, 6, 56, 10], [8, 12, 46, 8]] as const) p.disc([s, l, z], r, leaves)
})

export const hedge = () => sprite('hedge', p => p.box(0, 8, 0, 110, 0, 14, '#2f7a2c', leafy('#286b26'), leafy('#215a20'), leafy('#3a8a35')))

export const fence = () => sprite('fence', p => {
  for (let l = 0; l < 108; l += 6) {
    p.box(2, 4, l, l + 3, 0, 12, '#f2f0e8')
    p.pt(3, l + 1.5, 13, '#f2f0e8')
  }
  p.box(2.5, 3.5, 0, 108, 3, 4.2, '#d8d4c8')
  p.box(2.5, 3.5, 0, 108, 8, 9.2, '#d8d4c8')
})

/** Brick pillars with wrought-iron railings between them (origin: s0, first pillar). */
export const gate = () => sprite('gate', p => {
  const brick = (u: number, v: number) => (v % 3 < 0.7 || (u + Math.floor(v / 3) * 2) % 4 < 0.6 ? '#7a2e22' : '#b8442e')
  const pillar = (l: number) => {
    p.box(1, 7, l, l + 6, 0, 22, '#c4503a', brick, brick)
    p.box(0.4, 7.6, l - 0.6, l + 6.6, 22, 24, '#d6d0c2')
  }
  pillar(0)
  for (let l = 7.5; l < 74; l += 3) {
    p.line([4, l, 0], [4, l, 18], '#2a2a2e')
    p.pt(4, l, 19, '#2a2a2e')
  }
  p.box(3.6, 4.4, 6, 74, 4, 5, '#2a2a2e')
  p.box(3.6, 4.4, 6, 74, 15, 16, '#2a2a2e')
  pillar(74)
})

export const lawnmower = () => sprite('lawnmower', p => {
  for (const s of [1, 8]) for (const l of [0, 10]) p.box(s - 1, s + 1, l, l + 1.5, 0, 3, '#1e1e1e')
  p.box(0, 10, 1, 11, 2, 6, '#d83030')
  p.box(3, 7, 4, 8, 6, 9, '#2a2a2a')
  p.line([1, 3, 6], [-6, 3, 14], '#888', 1.2)
  p.line([1, 9, 6], [-6, 9, 14], '#888', 1.2)
  p.line([-6, 3, 14], [-6, 9, 14], '#222', 1.4)
})

export const flowers = (len: number, trampled: boolean) => sprite(`flowers${len}${trampled}`, p => {
  p.box(0, len, 0, 8, 0, 1, '#5b3a22')
  if (trampled) { for (let s = 2; s < len; s += 5) p.pt(s, 3 + (s % 3), 1, '#f04a6a'); return }
  const petals = ['#f04a6a', '#f8d838', '#f6f6f6', '#b060e0', '#ff8a30']
  for (let s = 2; s < len - 1; s += 3.5) for (const l of [2, 5.5]) {
    const k = Math.floor(hash(s, l) * petals.length)
    p.line([s, l, 1], [s, l, 4], '#3a8a35')
    p.disc([s, l, 5], 1, petals[k])
  }
}, '')

export const hydrant = () => sprite('hydrant', p => {
  p.box(1.5, 6.5, 1.5, 6.5, 0, 10, '#d83030')
  p.box(3, 5, 6.5, 8.5, 5, 7.5, '#b82020')
  p.box(1, 7, 1, 7, 10, 11.5, '#e04848')
  p.box(2.5, 5.5, 2.5, 5.5, 11.5, 14, '#d83030')
})

export const trashcan = () => sprite('can', p => {
  p.box(0, 10, 0, 6, 0, 14, '#8a9098', (_u, v) => (v % 4 < 0.8 ? '#6c7178' : '#8a9098'))
  p.box(-0.5, 10.5, -0.5, 6.5, 14, 15.5, '#a2a8b0')
  p.box(4, 6, 2, 4, 15.5, 17, '#6c7178')
})

export const bundle = () => sprite('bundle', p => {
  p.box(0, 12, 0, 10, 0, 8, '#f4f1e6', (u, v) => (Math.abs(u - 6) < 0.6 ? '#c83030' : v % 2 < 0.6 ? '#dedad0' : '#f4f1e6'),
    (u, v) => (Math.abs(u - 5) < 0.6 ? '#c83030' : v % 2 < 0.6 ? '#cfcabd' : '#e4e0d4'),
    (u, v) => (Math.abs(u - 6) < 0.6 || Math.abs(v - 5) < 0.6 ? '#c83030' : '#faf8f0'))
})

export const ramp = () => sprite('ramp', p => {
  p.quad([0, 30, 0], [22, 0, 0], [22, 0, 6], '#6e5432', true)
  p.quad([0, 0, 0], [22, 0, 6], [0, 30, 0], (u, v) => (u % 4.6 < 0.8 ? '#6a4e2c' : v % 10 < 0.6 ? '#7a5c36' : '#94723f'))
  p.box(21, 22.5, 0, 30, 0, 6, '#f1c40f')
})

export const cone = () => sprite('cone', p => {
  p.box(0, 8, 0, 8, 0, 1.2, '#e06a10')
  for (let z = 1; z < 12; z += 0.5) p.disc([4, 4, z], 4 * (1 - z / 13), z > 5 && z < 7.5 ? '#f6f6f6' : z / 12 + 0.2 > 0.8 ? '#ff9a40' : '#f07a20')
})

export const barrel = () => sprite('barrel', p =>
  p.box(0, 14, 0, 14, 0, 18, '#2f6fb3', (_u, v) => (v % 6 < 1 ? '#1d4a7a' : '#2a62a0'), (_u, v) => (v % 6 < 1 ? '#1a4170' : '#255890')))

export function target(hit: boolean) {
  return sprite(`target${hit}`, p => {
    if (hit) { p.box(-6, 16, 2, 10, 0, 1.5, '#c0392b'); return }
    p.box(4, 6, 5, 7, 0, 22, '#7a7a7a')
    p.disc([5, 6, 31], 11, (dx, dy) => { const r = Math.hypot(dx, dy); return r > 8 ? '#d03030' : r > 5 ? '#f6f6f6' : r > 2.4 ? '#d03030' : '#f6f6f6' })
  })
}

// ---------------------------------------------------------------- characters (origin: ground centre)

/** The paper kid. frame 0..3 = crank angle; throwing raises the left arm. */
export function rider(frame: number, throwing: boolean) {
  return sprite(`rider${frame}${throwing}`, p => {
    const shirt = '#d83a30', cap = '#2a5ad8', th = -(frame * Math.PI) / 2 // front pedal goes down: forward pedalling
    const crank: V3 = [0, 0, 4.5]
    const pedal = (side: number): V3 => [crank[0] + 3 * Math.cos(th) * side, 2.4 * side, crank[2] + 3 * Math.sin(th) * side]
    const leg = (side: number) => {
      const hip: V3 = [-2, 1.8 * side, 13], foot = pedal(side)
      const knee: V3 = [(hip[0] + foot[0]) / 2 + 3, 2.2 * side, (hip[2] + foot[2]) / 2 + 2.5]
      p.line(hip, knee, side > 0 ? JEANS : dark(JEANS, 0.8), 2.4)
      p.line(knee, foot, side > 0 ? JEANS : dark(JEANS, 0.8), 2)
      p.box(foot[0] - 1, foot[0] + 1.6, foot[1] - 0.6, foot[1] + 0.6, foot[2] - 0.4, foot[2] + 0.8, side > 0 ? SHOE : '#c8c8c0')
    }
    const wheel = (s: number) => {
      p.ring([s, 0, 4], X, Z, 4, TIRE, 1.6)
      p.ring([s, 0, 4], X, Z, 1.2, CHROME, 1.2)
    }
    // far side first
    if (throwing) {
      p.line([0, -2.8, 22], [0.5, -6.5, 23.5], shirt, 2)
      p.line([0.5, -6.5, 23.5], [1.5, -9.5, 25], SKIN, 1.8)
      p.box(0.5, 4, -11, -9, 24.5, 26.5, '#f4f1e6')
    } else {
      p.line([0, -2.8, 22], [4.5, -3, 16], shirt, 1.8)
    }
    leg(-1)
    wheel(6)
    p.line([-6, 0, 4], crank, '#f0c818', 1.4)
    p.line(crank, [-2, 0, 12], '#f0c818', 1.6)
    p.line([-6, 0, 4], [-2, 0, 12], '#f0c818', 1.4)
    p.line([-2, 0, 12], [4, 0, 13.5], '#f0c818', 1.6)
    p.line([4, 0, 13.5], [6, 0, 4], CHROME, 1.3)
    p.line([4, 0, 13.5], [4.5, 0, 16], CHROME)
    p.line([4.5, -3.2, 16], [4.5, 3.2, 16], CHROME)
    p.box(-3.8, -0.4, -1, 1, 12, 13.2, '#202020')
    // Wicker basket on the handlebars, loaded with papers.
    const weave = (u: number, v: number) => ((Math.floor(u * 1.5) + Math.floor(v * 1.5)) % 2 ? '#b8782e' : '#d89a48')
    p.box(5, 9, -2.6, 2.6, 13, 17.5, '#d89a48', weave, weave)
    for (const l of [-1.4, 0.4]) p.box(5.6, 8.4, l, l + 1.4, 17.5, 19.5, '#f6f4ec')
    wheel(-6)
    p.box(-3, 1, -2.8, 2.8, 13, 23, shirt, (u, v) => (v > 9 ? dark(shirt, 0.9) : dark(shirt, 0.84)))
    leg(1)
    p.line([0, 2.8, 22], [2.5, 3.6, 19], shirt, 2)
    p.line([2.5, 3.6, 19], [4.5, 3.2, 16], SKIN, 1.6)
    p.box(-1, 0.6, -1, 1, 23, 25, SKIN)
    p.disc([-0.5, 0, 27.6], 3.5, (dx, dy) => (dx > 1.5 && dy > -1 ? SKIN : '#6b3a1c'))
    p.disc([-0.3, 0, 29.4], 3.3, (_dx, dy) => (dy < 0.5 ? (dy < -2 ? dark(cap, 1.2) : cap) : ''))
    p.box(1.8, 4.5, -2.2, 2.2, 29, 29.8, dark(cap, 0.8))
  })
}

export const riderCrash = () => sprite('crash', p => {
  p.ring([-6, -4, 0.4], X, Y, 3.6, TIRE, 1.3)
  p.ring([3, -6, 0.4], X, Y, 3.6, TIRE, 1.3)
  p.line([-6, -4, 0.6], [3, -6, 0.6], '#e8c020', 1.4)
  p.line([-2, 4, 1], [-6, 12, 1], JEANS, 2.4)
  p.line([0, 4, 1], [3, 12, 1], JEANS, 2.4)
  p.box(-3, 2, -1, 5, 0, 4, '#d83a30')
  p.line([1, -1, 2], [5, -4, 2], SKIN, 1.6)
  p.disc([-0.5, -3.5, 3], 3.4, SKIN)
  p.disc([7, 4, 1], 2.6, '#2a5ad8')
})

export function dog(dir: number, frame: number) {
  return sprite(`dog${dir}${frame}`, p => {
    const S = (s: number) => s * dir, fur = '#b06a2c', shade = '#7a461a'
    const legs = (l: number, c: string) => {
      for (const ls of [4, -4]) {
        const sw = (frame ? 1.6 : -1.6) * Math.sign(ls) * (l > 0 ? 1 : -1)
        p.line([S(ls), l, 6], [S(ls + sw), l, 0.5], c, 1.6)
      }
    }
    legs(-1.6, shade)
    p.line([S(-6), 0, 9], [S(-9), 0, frame ? 14 : 12], fur, 1.4)
    p.box(S(-6.5), S(5), -2.6, 2.6, 5, 10.5, fur)
    p.box(S(4), S(9), -2.2, 2.2, 8, 14, fur)
    p.box(S(8.5), S(12), -1.3, 1.3, 8.5, 11.5, dark(fur, 1.1))
    p.pt(S(12), 0, 11, '#111')
    p.box(S(4.5), S(6.5), -2.4, -1, 14, 16.5, shade)
    p.box(S(4.5), S(6.5), 1, 2.4, 14, 16.5, shade)
    p.pt(S(9), 2.3, 12.5, '#111')
    legs(1.6, fur)
  })
}

/** A cat dashing across toward the road (+l). */
export function cat(frame: number) {
  return sprite(`cat${frame}`, p => {
    const fur = '#3a3a3a', sw = frame ? 1.4 : -1.4
    for (const [l, s] of [[-3, -1.2], [3, -1.2], [-3, 1.2], [3, 1.2]]) p.line([s, l, 4], [s, l + sw * Math.sign(l), 0.5], fur, 1.2)
    p.line([0, -4, 5], [0, -7, frame ? 10 : 8], fur, 1.2)
    p.box(-1.6, 1.6, -4.5, 4, 3.5, 7, fur)
    p.box(-1.8, 1.8, 3, 6.5, 5, 9, fur)
    for (const s of [-1.2, 1.2]) p.pt(s, 5.5, 10, fur)
    p.pt(-1.8, 5.8, 7.5, '#9be04a')
  })
}

export function tricycle(frame: number) {
  return sprite(`tricycle${frame}`, p => {
    for (const l of [-4, 4]) p.ring([4, l, 2.5], X, Z, 2.5, TIRE, 1.2)
    p.line([4, -4, 2.5], [4, 4, 2.5], '#c0392b', 1.2)
    p.line([4, 0, 2.5], [-4, 0, 9], '#c0392b', 1.6)
    p.line([-4, -3, 12], [-4, 3, 12], CHROME, 1)
    p.box(0, 3, -2, 2, 7, 8.5, '#222')
    const legOff = frame ? 1 : -1
    for (const side of [-1, 1]) p.line([1, 1.4 * side, 9], [-4, 1.4 * side, 5 + legOff * side], JEANS, 1.6)
    p.box(-0.5, 2.5, -2.4, 2.4, 9, 16, '#f1c40f')
    for (const side of [-1, 1]) p.line([0, 2.6 * side, 15], [-4, 2.8 * side, 12], SKIN, 1.2)
    p.disc([1, 0, 18.5], 2.6, (dx, dy) => (dy < -1 ? '#c0392b' : SKIN))
    p.ring([-4, 0, 5], X, Z, 5, (th, t) => (t < 0.5 && (th * 2 + frame) % 2 < 0.5 ? '#555' : TIRE), 1.4)
  })
}

export const rcCar = () => sprite('rc', p => {
  for (const s of [-3, 2]) for (const l of [-3, 2]) p.box(s, s + 1.4, l, l + 1, 0, 1.6, TIRE)
  p.box(-4, 4, -2.6, 2.6, 1, 3, '#e74c3c')
  p.box(-1, 2, -1.8, 1.8, 3, 4.5, '#2a2a2a')
  p.line([3, 2, 3], [3, 2, 9], '#888')
})

export const PEOPLE: Record<string, { shirt: string; pants: string; hair: string; skin?: string }> = {
  skater: { shirt: '#2f8fd8', pants: '#2a2a2a', hair: '#e0b040' },
  dancer: { shirt: '#8e44ad', pants: '#f1c40f', hair: '#2a1a10' },
  walker: { shirt: '#27ae60', pants: '#5d4037', hair: '#c8c8c8' },
  worker: { shirt: '#f39c12', pants: '#34495e', hair: '#f1c40f' },
  brawlers: { shirt: '#ecf0f1', pants: '#2c3e50', hair: '#2a1a10' },
  brawler2: { shirt: '#c0392b', pants: '#2c3e50', hair: '#d35400' },
  reaper: { shirt: '#1c1c24', pants: '#1c1c24', hair: '#1c1c24', skin: '#e8e4d8' },
  owner: { shirt: '#d7a1e0', pants: '#d7a1e0', hair: '#bbbbbb' },
  kid: { shirt: '#e74c3c', pants: '#2471a3', hair: '#6b3a1c' },
}

/** A pedestrian facing the player (-s). frame 0/1 = stride. */
export function person(kind: string, frame: number) {
  return sprite(`person${kind}${frame}`, p => {
    const c = PEOPLE[kind], zo = kind === 'skater' ? 2 : 0, step = frame ? 1.5 : -1.5, skin = c.skin ?? SKIN
    if (kind === 'kid') p.k = 0.65
    const crouch = kind === 'dancer' && frame ? -4 : 0
    const still = kind === 'dancer' || kind === 'skater' || kind === 'worker' || kind === 'kid'
    const fists = kind === 'owner' || kind.startsWith('brawler')
    if (kind === 'skater') {
      p.box(-6, 6, -1.8, 1.8, 0.8, 1.8, '#3a3a3a')
      for (const s of [-4, 4]) p.box(s - 1, s + 1, -1.8, 1.8, 0, 0.8, '#d0d0d0')
    }
    for (const side of [-1, 1]) {
      const st = still ? 0 : step * side
      p.line([st, 1.2 * side, zo], [0, 1.2 * side, zo + 9 + crouch], c.pants, 2.2)
      p.box(st - 1.6, st + 1.2, 1.2 * side - 0.9, 1.2 * side + 0.9, zo, zo + 1.4, '#2a2a2a')
    }
    const hz = zo + crouch
    if (kind === 'reaper') p.box(-2, 2, -3.6, 3.6, 0, 12, c.shirt) // robe
    if (kind === 'worker') { // jackhammer, shaking
      const j = frame ? 0.8 : 0
      p.line([-4, 0, j], [-4, 0, 8 + j], CHROME, 1.4)
      p.box(-5.5, -2.5, -1.5, 1.5, 8 + j, 13 + j, '#4a4a4a')
      p.line([-4, -3, 14 + j], [-4, 3, 14 + j], '#222', 1.2)
    }
    p.box(-1.4, 1.4, -3, 3, hz + 9, hz + 18, c.shirt)
    for (const side of [-1, 1]) {
      const hand: V3 = kind === 'dancer' && !frame ? [0, 5 * side, hz + 25]
        : kind === 'skater' ? [0, 7 * side, hz + 15]
        : kind === 'worker' ? [-4, 2.6 * side, 14 + (frame ? 0.8 : 0)]
        : fists ? [-3, 2.4 * side, hz + 19 + (frame === (side > 0 ? 1 : 0) ? 4 : 0)]
        : [-step * side, 3.6 * side, hz + 10]
      p.line([0, 3.4 * side, hz + 17], hand, c.shirt, 1.8)
      p.disc(hand, 0.9, skin)
    }
    if (kind === 'reaper') { // scythe
      p.line([-3, 4.5, 2], [-3, 4.5, 32], '#6b4a2b', 1.2)
      p.line([-3, 4.5, 32], [-3, -3, 29], '#d8dce0', 1.4)
    }
    p.disc([0, 0, hz + 21.5], 3.2, (dx, dy) => (dy < -1.2 || (dy < 0 && Math.abs(dx) > 2.4) ? c.hair : skin))
    if (kind === 'reaper') p.disc([0, 0, hz + 22.5], 3.6, (dx, dy) => (Math.abs(dx) > 2 || dy < -1.5 ? c.hair : ''))
    p.pt(-3, -0.4, hz + 21.6, '#1a1a1a')
    p.pt(-3, 1.6, hz + 21.6, '#1a1a1a')
  })
}

export function car(color: string, kind: 'fwd' | 'onc' | 'x') {
  return sprite(`car${color}${kind}`, p => {
    const along = kind !== 'x', DS = along ? 22 : 11, DL = along ? 11 : 22
    for (const s of along ? [-14, 14] : [-DS + 1, DS - 5]) for (const l of along ? [-DL + 0.5, DL - 2.5] : [-14, 12]) p.box(s - 3, s + 3, l, l + 2, 0, 6, TIRE)
    p.box(-DS, DS, -DL, DL, 3, 12, color, (u, v) => (v < 1.2 ? dark(color, 0.6) : dark(color, 0.84)))
    const glass = (base: string) => (u: number, v: number) => (v < 1 || u % 9 < 1.1 ? base : v > 5 ? '#c4e6f6' : '#7fb7d8')
    if (along) p.box(-11, 8, -DL + 2, DL - 2, 12, 20, color, glass(dark(color, 0.84)), glass(dark(color, 0.68)))
    else p.box(-DS + 2, DS - 2, -9, 10, 12, 20, color, glass(dark(color, 0.84)), glass(dark(color, 0.68)))
    const lamp = kind === 'onc' ? '#fff6c0' : '#e02020'
    if (along) for (const l of [-DL + 1.5, DL - 4.5]) p.box(-DS - 0.4, -DS, l, l + 3, 7, 10, lamp)
    p.box(-DS - 0.6, -DS, -DL, DL, 2.5, 4, CHROME)
  })
}

export function tire(frame: number) {
  return sprite(`tire${frame}`, p => p.ring([0, 0, 6], X, Z, 6, (th, t) => (t < 0.5 && (th * 3 + frame) % 2 < 0.6 ? '#555' : '#1e1e1e'), 2.6))
}

export function paper(frame: number) {
  return sprite(`paper${frame}`, p => {
    if (frame) p.box(-1, 1, -2.6, 2.6, 0, 2, '#f4f1e6', (u) => (Math.abs(u - 2.6) < 0.6 ? '#c83030' : '#e2ded2'))
    else p.box(-2.6, 2.6, -1, 1, 0, 2, '#f4f1e6', (u) => (Math.abs(u - 2.6) < 0.6 ? '#c83030' : '#e2ded2'))
  })
}
