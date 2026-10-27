// Street and training-course layouts, generated from a fixed seed so every run of a street is identical.
// World axes: s = distance along the street, l = lateral (0 = back of the houses, growing toward the road), z = height.

// Lot and cross-street lengths measured on the Atari ST port (docs/research/measurements.md).
export const LOT = 240, HOUSE_H = 56, HOUSE_LEN = 130, CROSS = 220
export const L = { HOUSE: 64, PORCH: 80, WALK: 136, CURB: 160, ROAD: 300, FAR: 320 }
export const LANE_ONCOMING = 200, LANE_FORWARD = 262

export type ActorKind = 'car' | 'xcar' | 'curbcar' | 'dog' | 'skater' | 'tire' | 'dancer' | 'mower' | 'bees' | 'whirl'
  | 'walker' | 'worker' | 'rc' | 'kid' | 'tricycle' | 'brawlers' | 'cat' | 'reaper' | 'owner'
export type StaticKind =
  | 'house' | 'porch' | 'mailbox' | 'hedge' | 'tree' | 'hydrant' | 'can' | 'drain'
  | 'ramp' | 'bundle' | 'target' | 'cone' | 'barrel' | 'finish' | 'fence' | 'flowers' | 'gate' | 'sign'
  | 'lamp' | 'statue' | 'tomb' | 'parked' | 'manhole' | 'water' | 'board'
export type HouseStyle = 'plain' | 'columns' | 'octagon' | 'brick' | 'tudor' | 'church'

export interface Static {
  kind: StaticKind
  s0: number; s1: number; l0: number; l1: number
  h: number; z0: number
  solid: boolean
  lot: number
  hit: boolean
}

export interface Lot {
  s: number
  color: string
  roof: string
  windows: { s0: number; s1: number; broken: boolean }[]
  door: [number, number]
  chimney: boolean
  style: HouseStyle
  porch: number
}

export interface Spawn { s: number; l: number; kind: ActorKind }

export interface World {
  mode: 'street' | 'course'
  lots: Lot[]
  statics: Static[]
  spawns: Spawn[]
  end: number
  /** Cross streets as [s0, s1]; the street starts and ends on one, as in the original. */
  crosses: [number, number][]
  /** The cross street with traffic. */
  traffic?: [number, number]
}

const ROOFS = ['#8c3b2e', '#4d5d73', '#6b4f3a', '#3f6650', '#7a5c8a']

// Each street has its own houses, characters and course [P] p.1-7; which goes where is our own design.
// pool: street characters, one more unlocked each day. yard: what non-customers send after you.
// ponytail: every probability here is a guess; tune against the 120-180 s game length the manual targets.
interface StreetDef {
  name: string; mult: number; seed: number; busy: number; ramps: number; colors: string[]
  styles: HouseStyle[]; church: number; pool: ActorKind[]; yard: ActorKind[]
  lamps: number; statues: number; parked: number; manholes: number
  course: { water: number; barrels: number }
}
export const STREETS: StreetDef[] = [
  { name: 'EASY STREET', mult: 1, seed: 3, busy: 0.25, ramps: 0.15, colors: ['#e8c170', '#9fd3c7', '#f4a6a6', '#b5d99c', '#c9b6e4'],
    styles: ['plain', 'columns', 'octagon'], church: 6, yard: ['dog'],
    pool: ['car', 'walker', 'skater', 'car', 'tire', 'rc', 'tricycle', 'dancer', 'walker'],
    lamps: 0.3, statues: 0.15, parked: 0, manholes: 0, course: { water: 0.1, barrels: 0.2 } },
  { name: 'MIDDLE ROAD', mult: 2, seed: 19, busy: 0.4, ramps: 0.25, colors: ['#f0b27a', '#85c1e9', '#f7dc6f', '#a3e4d7', '#e6b0aa'],
    styles: ['brick', 'brick', 'plain', 'columns'], church: -1, yard: ['dog', 'cat'],
    pool: ['car', 'skater', 'worker', 'car', 'tire', 'tricycle', 'dancer', 'brawlers', 'rc'],
    lamps: 0.35, statues: 0.2, parked: 0.3, manholes: 0.2, course: { water: 0.2, barrels: 0.3 } },
  { name: 'HARD WAY', mult: 3, seed: 31, busy: 0.55, ramps: 0.35, colors: ['#d98880', '#aed6f1', '#f9e79f', '#abebc6', '#d7bde2'],
    styles: ['tudor', 'tudor', 'octagon', 'brick'], church: 13, yard: ['cat', 'dog', 'dog'],
    pool: ['car', 'brawlers', 'worker', 'reaper', 'tire', 'car', 'skater', 'dancer', 'reaper'],
    lamps: 0.3, statues: 0.25, parked: 0.35, manholes: 0.3, course: { water: 0.3, barrels: 0.4 } },
]

// mulberry32
function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const pick = <T>(r: () => number, xs: T[]) => xs[Math.floor(r() * xs.length)]

export function subscriberPattern(street: number): boolean[] {
  const r = rng(STREETS[street].seed + 999)
  const idx = [...Array(20).keys()].sort(() => r() - 0.5)
  const subs = Array(20).fill(false)
  idx.slice(0, 10).forEach(i => (subs[i] = true))
  return subs
}

function adder(list: Static[]) {
  return (kind: StaticKind, s0: number, s1: number, l0: number, l1: number, h: number, solid = true, lot = -1, z0 = 0) =>
    list.push({ kind, s0, s1, l0, l1, h, z0, solid, lot, hit: false })
}

/** hostile[i]: lot i is not a customer today. lost: customers lost so far. diff: -1 easy, 0 normal, 1 hard. */
export function buildStreet(street: number, day: number, hostile: boolean[] = [], lost = 0, diff = 0): World {
  const def = STREETS[street], r = rng(def.seed)
  const lots: Lot[] = [], statics: Static[] = [], add = adder(statics)

  const spawns: Spawn[] = []
  for (let i = 0; i < 20; i++) {
    const s = i * LOT + (i >= 10 ? CROSS : 0)
    lots.push({
      s,
      color: pick(r, def.colors),
      roof: pick(r, ROOFS),
      windows: [{ s0: s + 32, s1: s + 54, broken: false }, { s0: s + 116, s1: s + 138, broken: false }],
      door: [s + 76, s + 94],
      chimney: r() < 0.5,
      style: i === def.church ? 'church' : pick(r, def.styles),
      porch: Math.floor(r() * 3),
    })
    const church = i === def.church
    add('house', s + 20, s + 20 + HOUSE_LEN, 0, L.HOUSE, HOUSE_H, true, i)
    add('porch', s + 66, s + 104, L.HOUSE, L.PORCH, 6, false, i)
    add('mailbox', s + 196, s + 202, 122, 134, 26, true, i)
    // Breakage targets [P] p.1-7: yard lamps and statues anywhere, tombstones in the churchyard.
    if (r() < def.lamps) add('lamp', s + 12, s + 16, 112, 116, 34, true, i)
    if (!church && r() < def.statues) add('statue', s + 176, s + 186, 74, 84, 26, true, i)
    if (church) for (let k = 0; k < 8; k++) { const ts = s + 30 + (k % 4) * 30, tl = 78 + (k >> 2) * 18; add('tomb', ts, ts + 3, tl, tl + 8, 12, true, i) }
    if (r() < 0.6) {
      const k = r()
      if (k < 0.67) add(k < 0.34 ? 'hedge' : 'fence', s, s + 8, 0, 110, 14)
      else add('gate', s, s + 8, 30, 110, 22)
    }
    if (!church && r() < 0.6) { add('flowers', s + 22, s + 60, L.HOUSE, L.HOUSE + 8, 0, false, i); add('flowers', s + 108, s + 146, L.HOUSE, L.HOUSE + 8, 0, false, i) }
    if (r() < 0.35) add('tree', s + 214, s + 226, 92, 104, 60)
    if (r() < 0.3) { const hs = s + 20 + r() * 160; add('hydrant', hs, hs + 8, 140, 148, 14) }
    if (r() < 0.3) { const cs = s + r() * 200; add('can', cs, cs + 10, 150, 158, 16) }
    if (r() < 0.25) { const ds = s + r() * 210; add('drain', ds, ds + 16, 163, 177, 1) }
    if (r() < def.ramps) { const rs = s + r() * 200, rl = 190 + r() * 80; add('ramp', rs, rs + 22, rl, rl + 30, 6, false) }
    if (r() < def.parked) {
      const ps = s + 20 + r() * 150
      if (r() < 0.4) spawns.push({ s: ps + 22, l: 173, kind: 'curbcar' }) // pulls out as you come
      else add('parked', ps, ps + 44, 162, 184, 20)
    }
    if (r() < def.manholes) { const ms = s + r() * 200, ml = 200 + r() * 80; add('manhole', ms, ms + 14, ml, ml + 14, 1) }
    // A bundle at almost every house, on the lawn or the sidewalk, as on the ST.
    if (r() < 0.5) add('bundle', s + 160, s + 172, 104, 114, 8, false)
    else { const bs = s + 20 + r() * 160; add('bundle', bs, bs + 12, 142, 152, 8, false) }
    if (r() < 0.25) spawns.push({ s: s + 170, l: 108, kind: 'mower' }) // riderless mower crossing the lawn
  }
  add('sign', -40, -34, 122, 128, 30, true) // street-name sign on the corner lawn, clear of the sidewalk

  // Each day is a superset of the previous one: more kinds, more often. Losing customers makes it worse [P] p.1-7.
  const r2 = rng(def.seed * 31 + day + 1), busy = def.busy + day * 0.04 + lost * 0.03 + diff * 0.1
  const pool = def.pool.slice(0, 3 + day)
  for (let i = 1; i < 20; i++) {
    for (let k = 0; k < 2; k++) {
      if (r2() >= busy) continue
      const kind = pick(r2, pool), lane = r2() < 0.5 ? LANE_ONCOMING : LANE_FORWARD
      const l = { car: lane, tire: lane, rc: 150, reaper: 140, tricycle: 146 }[kind as string] ?? 148
      spawns.push({ s: lots[i].s + r2() * LOT, l, kind })
    }
    // Non-customers attack [P] p.1-7: their dogs and cats wait in the yard.
    if (hostile[i] && r2() < 0.3 + day * 0.04 + diff * 0.1) spawns.push({ s: lots[i].s + 180, l: 100, kind: pick(r2, def.yard) })
  }
  spawns.sort((a, b) => a.s - b.s)

  const last = 20 * LOT + CROSS
  return {
    mode: 'street', lots, statics, spawns,
    end: last + CROSS / 2,
    crosses: [[-CROSS, 0], [10 * LOT, 10 * LOT + CROSS], [last, last + CROSS]],
    traffic: [10 * LOT, 10 * LOT + CROSS],
  }
}

export function buildCourse(street: number, day: number): World {
  const def = STREETS[street].course, r = rng(STREETS[street].seed * 7 + day), statics: Static[] = [], add = adder(statics)
  const len = 2000 + day * 100
  for (let s = 160; s < len - 120; s += 100 + r() * 60) {
    const roll = r(), l = 80 + r() * 190
    if (roll < def.water) {
      // A water channel across the track [ST]: cross on the plank, or speed up and jump it from the ramp.
      const bl = 70 + r() * 200, rl = bl < 180 ? bl + 60 : bl - 90
      add('water', s + 30, s + 48, 50, 310, 1, false)
      add('board', s + 20, s + 58, bl, bl + 20, 0, false) // longer than the water by the bike's reach
      add('ramp', s, s + 22, rl, rl + 34, 6, false)
      s += 60
    } else if (roll < 0.35) add('ramp', s, s + 22, l, l + 34, 6, false)
    else if (roll < 1 - def.barrels) add('cone', s, s + 8, l, l + 8, 12)
    else add('barrel', s, s + 14, l, l + 14, 18)
  }
  for (let s = 220; s < len - 60; s += 200 + r() * 80) add('target', s, s + 10, 28, 40, 40, true, -1, 12)
  add('finish', len, len + 16, 50, 310, 0, false)
  return { mode: 'course', lots: [], statics, spawns: [], end: len + 8, crosses: [] }
}
