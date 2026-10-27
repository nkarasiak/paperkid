// Oblique projection of the ground plane: textured ground polygons + baked pixel sprites.

import { CAR_COLORS, type Actor, type DayStats, type Ride, type Run } from './ride'
import { SK, dark, hash, tile, type Sprite } from './pix'
import * as art from './sprites'
import { L, LANE_ONCOMING, LOT, type Static } from './street'

export { dark }
export const W = 512, H = 384
// World zoom and the kid's screen anchor, matching the ST port: ~72% across, ~62% down the play area.
const Z = 2, BX = 370, BY = 250
let cam = 0, camL = 150
const GROUND = new Set(['drain', 'finish', 'manhole', 'water', 'board']) // painted flat in the ground pass

type P3 = [number, number, number]
const px = (s: number, l: number, z: number): [number, number] => [BX + Z * (SK * (s - cam) + l - camL), BY - Z * (s - cam + z)]

type Fill = string | CanvasPattern
function poly(ctx: CanvasRenderingContext2D, fill: Fill, ...pts: P3[]) {
  ctx.beginPath()
  for (const [s, l, z] of pts) ctx.lineTo(...px(s, l, z))
  ctx.closePath()
  ctx.fillStyle = fill
  ctx.fill()
}

const quad = (ctx: CanvasRenderingContext2D, s0: number, s1: number, l0: number, l1: number, c: Fill) =>
  poly(ctx, c, [s0, l0, 0], [s1, l0, 0], [s1, l1, 0], [s0, l1, 0])

function ellipse(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, fill: string) {
  ctx.beginPath()
  ctx.ellipse(x, y, rx * Z, ry * Z, 0, 0, Math.PI * 2)
  ctx.fillStyle = fill
  ctx.fill()
}

function put(ctx: CanvasRenderingContext2D, sp: Sprite, s: number, l: number, z = 0) {
  const [x, y] = px(s, l, z)
  ctx.drawImage(sp.img, Math.round(x) - sp.ox * Z, Math.round(y) - sp.oy * Z, sp.img.width * Z, sp.img.height * Z)
}

export function text(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, size = 12, color = '#fff', align: CanvasTextAlign = 'left', shadow = '#000') {
  ctx.font = `bold ${size}px monospace`
  ctx.textAlign = align
  if (shadow) { ctx.fillStyle = shadow; ctx.fillText(s, x + 1, y + 1) }
  ctx.fillStyle = color
  ctx.fillText(s, x, y)
}

// Ground textures, anchored to the world so they scroll with it.
let pats: Record<'grassA' | 'grassB' | 'walk' | 'road' | 'dirt', CanvasPattern> | undefined
function ground(ctx: CanvasRenderingContext2D) {
  const speckle = (seed: number, base: string, lo: string, hi: string, pLo: number, pHi: number) =>
    ctx.createPattern(tile(16, 16, (x, y) => { const n = hash(x + seed, y); return n < pLo ? lo : n > 1 - pHi ? hi : base }), 'repeat')!
  pats ??= {
    grassA: speckle(0, '#4e9139', '#3f7d30', '#5ea64a', 0.14, 0.12),
    grassB: speckle(7, '#56993f', '#468836', '#66ae50', 0.14, 0.12),
    walk: speckle(50, '#bab7ae', '#a6a399', '#c8c5bc', 0.12, 0.06),
    road: speckle(90, '#46464d', '#38383e', '#56565e', 0.1, 0.08),
    dirt: speckle(130, '#b38b56', '#9a7444', '#c49c66', 0.16, 0.1),
  }
  const [ox, oy] = px(0, 0, 0)
  const m = new DOMMatrix([Z, 0, 0, Z, Math.round(ox), Math.round(oy)])
  for (const p of Object.values(pats)) p.setTransform(m)
  return pats
}

export function drawWorld(ctx: CanvasRenderingContext2D, r: Ride) {
  cam = Math.round(r.bike.s)
  // Follow the kid sideways with a dead zone, so the houses stay in view while riding the sidewalk.
  const l = Math.round(r.bike.l)
  if (l - camL > 50) camL = l - 50
  if (l - camL < -140) camL = l + 140
  const s0 = cam - 120, s1 = cam + 480, g = ground(ctx)
  if (r.world.mode === 'street') streetGround(ctx, r, s0, s1, g)
  else courseGround(ctx, r, s0, s1, g)

  for (const p of r.lying) if (p.s > s0 && p.s < s1) put(ctx, art.paper(0), p.s, p.l)

  // Painter's order: farther = larger s and smaller l along the view ray.
  const items: [number, () => void][] = []
  for (const o of r.world.statics) if (o.s1 > s0 && o.s0 < s1 && !GROUND.has(o.kind)) items.push([o.s0 - SK * o.l1, () => drawStatic(ctx, r, o)])
  for (const a of r.actors) items.push([a.s - a.ds - SK * (a.l + a.dl), () => drawActor(ctx, a)])
  for (const p of r.papers) items.push([p.s - SK * p.l, () => {
    const [gx, gy] = px(p.s, p.l, 0)
    ellipse(ctx, gx, gy, 3, 1.5, 'rgba(0,0,0,0.3)')
    put(ctx, art.paper(Math.floor(p.s / 6) % 2), p.s, p.l, p.z)
  }])
  items.push([r.bike.s - 8 - SK * (r.bike.l + 5), () => drawBike(ctx, r)])
  items.sort((a, b) => b[0] - a[0]).forEach(([, draw]) => draw())

  for (const p of r.popups) {
    const [x, y] = px(p.s, p.l, p.z + (50 - p.t) * 0.6)
    text(ctx, p.text, x, y, 11, p.color, 'center')
  }
}

function streetGround(ctx: CanvasRenderingContext2D, r: Ride, s0: number, s1: number, g: NonNullable<typeof pats>) {
  quad(ctx, s0, s1, -700, L.WALK, g.grassA)
  r.world.lots.forEach((lot, i) => {
    if (lot.s > s1 || lot.s + LOT < s0) return
    if (i % 2) quad(ctx, lot.s, lot.s + LOT, -700, L.WALK, g.grassB)
    quad(ctx, lot.s + 78, lot.s + 92, L.PORCH, L.WALK, '#c9b48a')
    for (let l = L.PORCH + 4; l < L.WALK; l += 10) quad(ctx, lot.s + 78, lot.s + 92, l, l + 1, '#b09a70')
  })
  quad(ctx, s0, s1, L.WALK, L.CURB, g.walk)
  for (let s = Math.floor(s0 / 30) * 30; s < s1; s += 30) quad(ctx, s, s + 1, L.WALK, L.CURB, '#94918a')
  quad(ctx, s0, s1, L.CURB, L.ROAD, g.road)
  quad(ctx, s0, s1, L.CURB, L.CURB + 3, '#dcd9d0')
  quad(ctx, s0, s1, L.CURB + 3, L.CURB + 4, '#2c2c30')
  quad(ctx, s0, s1, L.ROAD - 3, L.ROAD, '#dcd9d0')
  for (let s = Math.floor(s0 / 60) * 60; s < s1; s += 60) quad(ctx, s, s + 28, 229, 233, '#e9cf3f')
  quad(ctx, s0, s1, L.ROAD, L.FAR, g.walk)
  quad(ctx, s0, s1, L.FAR, 800, g.grassA)

  for (const [c0, c1] of r.world.crosses) {
    if (c1 < s0 || c0 > s1) continue
    const mid = (c0 + c1) / 2
    quad(ctx, c0, c1, -700, 800, g.road)
    for (let l = -700; l < 800; l += 40) quad(ctx, mid - 2, mid + 2, l, l + 20, '#e9cf3f')
    for (let s = c0 + 8; s < c1 - 8; s += 14) {
      quad(ctx, s, s + 7, L.WALK, L.CURB, '#ececec')
      quad(ctx, s, s + 7, L.ROAD, L.FAR, '#ececec')
    }
  }
  for (const o of r.world.statics) {
    if (o.s1 < s0 || o.s0 > s1) continue
    if (o.kind === 'drain') {
      quad(ctx, o.s0, o.s1, o.l0, o.l1, '#1a1a1e')
      for (let s = o.s0 + 2; s < o.s1 - 1; s += 3) quad(ctx, s, s + 1.5, o.l0 + 1, o.l1 - 1, '#5a5a62')
    } else if (o.kind === 'manhole') { // open, with its lid pushed aside
      quad(ctx, o.s0 - 1, o.s1 + 1, o.l0 - 1, o.l1 + 1, '#77777e')
      quad(ctx, o.s0, o.s1, o.l0, o.l1, '#0c0c0e')
      quad(ctx, o.s0 + 4, o.s1 + 6, o.l1 + 3, o.l1 + 15, '#5e5e66')
      for (let s = o.s0 + 6; s < o.s1 + 4; s += 3) quad(ctx, s, s + 1, o.l1 + 4, o.l1 + 14, '#4a4a50')
    }
  }
  const end = r.world.end
  if (end > s0 && end < s1) for (let l = L.CURB, k = 0; l < L.ROAD; l += 10, k++) quad(ctx, end, end + 8, l, l + 10, k % 2 ? '#111' : '#fff')
}

function courseGround(ctx: CanvasRenderingContext2D, r: Ride, s0: number, s1: number, g: NonNullable<typeof pats>) {
  quad(ctx, s0, s1, -700, 800, g.grassA)
  quad(ctx, s0, s1, 50, 310, g.dirt)
  quad(ctx, s0, s1, 48, 52, '#f4f1e8')
  quad(ctx, s0, s1, 308, 312, '#f4f1e8')
  for (let s = Math.floor(s0 / 120) * 120; s < s1; s += 120) quad(ctx, s, s + 2, 52, 308, '#a27c4a')
  for (const o of r.world.statics) {
    if (o.s1 < s0 || o.s0 > s1) continue
    if (o.kind === 'water') {
      quad(ctx, o.s0, o.s1, o.l0, o.l1, '#2e7fc0')
      for (let l = o.l0 + ((r.t >> 3) % 12); l < o.l1 - 4; l += 12) quad(ctx, o.s0 + 6, o.s0 + 7, l, l + 5, '#8fcbea')
    } else if (o.kind === 'board') {
      quad(ctx, o.s0, o.s1, o.l0, o.l1, '#a8783e')
      for (let l = o.l0 + 5; l < o.l1; l += 5) quad(ctx, o.s0, o.s1, l, l + 0.7, '#6e4a22')
    }
  }
}

function drawStatic(ctx: CanvasRenderingContext2D, r: Ride, o: Static) {
  const spr = (sp: Sprite) => put(ctx, sp, o.s0, o.l0)
  switch (o.kind) {
    case 'house': return spr(art.house(r.world.lots[o.lot], o.s0, r.subscriber(o.lot)))
    case 'porch': return spr(art.porch(r.world.lots[o.lot].porch))
    case 'mailbox': return spr(art.mailbox(r.subscriber(o.lot), o.hit, 100 + 2 * o.lot))
    case 'gate': return spr(art.gate())
    case 'sign': return spr(art.streetSign(r.run.street))
    case 'hedge': return spr(art.hedge())
    case 'fence': return spr(art.fence())
    case 'flowers': return spr(art.flowers(o.s1 - o.s0, o.hit))
    case 'tree': return spr(art.tree())
    case 'hydrant': return spr(art.hydrant())
    case 'can': return spr(art.trashcan())
    case 'ramp': return spr(art.ramp())
    case 'bundle': if (!o.hit) spr(art.bundle()); return
    case 'cone': return spr(art.cone())
    case 'barrel': return spr(art.barrel())
    case 'target': return spr(art.target(o.hit))
    case 'lamp': return spr(art.lamp(o.hit))
    case 'statue': return spr(art.statue(o.hit))
    case 'tomb': return spr(art.tomb(o.hit))
    case 'parked': return put(ctx, art.car(CAR_COLORS[Math.floor(o.s0) % CAR_COLORS.length], 'onc'), o.s0 + 22, o.l0 + 11)
  }
}

function drawActor(ctx: CanvasRenderingContext2D, a: Actor) {
  const [gx, gy] = px(a.s, a.l, 0), step = Math.floor(a.t / 8) % 2
  if (a.dead) {
    ctx.fillStyle = art.PEOPLE[a.kind]?.shirt ?? '#c0392b'
    ctx.fillRect(Math.round(gx) - 9 * Z, Math.round(gy) - 5 * Z, 15 * Z, 5 * Z)
    return ellipse(ctx, gx + 8 * Z, gy - 4 * Z, 3.5, 3.5, '#f2b98a')
  }
  switch (a.kind) {
    case 'car': return put(ctx, art.car(a.color, a.home === LANE_ONCOMING ? 'onc' : 'fwd'), a.s, a.l)
    case 'xcar': return put(ctx, art.car(a.color, 'x'), a.s, a.l)
    case 'curbcar': return put(ctx, art.car(a.color, 'onc'), a.s, a.l)
    case 'dog': return put(ctx, art.dog(a.vs < 0 ? -1 : 1, a.vs || a.vl ? Math.floor(a.t / 4) % 2 : 0), a.s, a.l)
    case 'mower': return put(ctx, art.lawnmower(), a.s - 5, a.l - 6)
    case 'skater': case 'dancer': case 'walker': case 'worker': case 'reaper': case 'owner': case 'kid':
      ellipse(ctx, gx, gy, 6, 2, 'rgba(0,0,0,0.25)')
      return put(ctx, art.person(a.kind, a.kind === 'dancer' ? Math.floor(a.t / 14) % 2 : a.kind === 'worker' ? (a.t >> 1) % 2 : step), a.s, a.l)
    case 'brawlers':
      ellipse(ctx, gx, gy, 12, 3, 'rgba(0,0,0,0.25)')
      put(ctx, art.person('brawlers', Math.floor(a.t / 10) % 2), a.s + 5, a.l)
      return put(ctx, art.person('brawler2', 1 - (Math.floor(a.t / 10) % 2)), a.s - 5, a.l)
    case 'tricycle': return put(ctx, art.tricycle(step), a.s, a.l)
    case 'rc': return put(ctx, art.rcCar(), a.s, a.l)
    case 'cat': return put(ctx, art.cat(a.vl ? Math.floor(a.t / 4) % 2 : 0), a.s, a.l)
    case 'whirl':
      for (let k = 0; k < 40; k++) {
        const ang = a.t * 0.35 + k * 0.9, rad = 2 + (k % 20) * 0.7
        ctx.fillStyle = k % 3 ? '#c8c4b8' : '#8a8478'
        ctx.fillRect(Math.round(gx + Math.cos(ang) * rad * Z), Math.round(gy - ((k % 20) * 2 + Math.sin(ang) * rad * 0.3) * Z), 2 * Z, 2 * Z)
      }
      return
    case 'tire':
      ellipse(ctx, gx, gy, 5, 2, 'rgba(0,0,0,0.3)')
      return put(ctx, art.tire(Math.floor(a.t / 3) % 4), a.s, a.l, a.z)
    case 'bees':
      for (let k = 0; k < 9; k++) {
        const ang = a.t * 0.25 + k * 0.7
        ctx.fillStyle = k % 2 ? '#111' : '#f1c40f'
        ctx.fillRect(Math.round(gx + Math.cos(ang * 1.7) * 9 * Z), Math.round(gy + (Math.sin(ang) * 7 - 22) * Z), 2 * Z, 2 * Z)
      }
  }
}

function drawBike(ctx: CanvasRenderingContext2D, r: Ride) {
  const b = r.bike
  if (b.invuln && (b.invuln >> 2) % 2) return
  const [gx, gy] = px(b.s, b.l, 0)
  ellipse(ctx, gx, gy, 9, 3, 'rgba(0,0,0,0.3)')
  if (b.crash > 76) { // crash burst
    const grow = 1 + (100 - b.crash) / 20
    ctx.beginPath()
    for (let k = 0; k < 16; k++) {
      const a = (k * Math.PI) / 8, rr = (k % 2 ? 6 : 15) * Z * grow
      ctx.lineTo(gx + Math.cos(a) * rr, gy - 10 * Z + Math.sin(a) * rr * 0.8)
    }
    ctx.fillStyle = b.crash % 4 < 2 ? '#ffe14a' : '#ff8a30'
    ctx.fill()
  }
  if (b.crash) return put(ctx, art.riderCrash(), b.s, b.l)
  put(ctx, art.rider(Math.floor(b.s / 5) % 4, b.throwT > 4), b.s, b.l, b.z)
}

const pad = (n: number, w: number) => String(n).padStart(w, '0')

export function drawHud(ctx: CanvasRenderingContext2D, r: Ride, run: Run, day: DayStats, label: string) {
  ctx.fillStyle = 'rgba(0,0,0,0.6)'
  ctx.fillRect(0, 0, W, 20)
  text(ctx, `SCORE ${pad(run.score, 6)}`, 6, 14)
  text(ctx, `LIVES ${run.lives}`, W - 6, 14, 12, '#fff', 'right')
  if (r.course) text(ctx, `TIME ${Math.ceil(r.timer / 60)}`, W / 2, 14, 12, r.timer < 600 ? '#f55' : '#ff0', 'center')
  else if (day.breakage) text(ctx, `BONUS ${day.breakage}`, W / 2, 14, 12, '#fc6', 'center')
  else text(ctx, label, W / 2, 14, 10, '#ccc', 'center')

  {
    const icon = art.paper(1)
    for (let k = 0; k < day.papers; k++) ctx.drawImage(icon.img, 4 + k * 16, 24, icon.img.width * 2, icon.img.height * 2)
    if (!day.papers) text(ctx, 'NO PAPERS!', 6, 34, 10, '#f55')
  }

  if (r.intro > 0 && r.course) {
    ctx.fillStyle = 'rgba(0,0,0,0.65)'
    ctx.fillRect(0, 150, W, 70)
    text(ctx, 'TRAINING GROUNDS', W / 2, 182, 20, '#fff', 'center')
    text(ctx, 'HIT TARGETS · JUMP RAMPS · BEAT THE CLOCK', W / 2, 205, 11, '#ff0', 'center')
  } else if (r.intro > 0) {
    // Full-screen day card before the ride, as in the original's flow.
    const [day, street] = label.split(' · ')
    ctx.fillStyle = '#12207a'
    ctx.fillRect(0, 0, W, H)
    text(ctx, day, W / 2, H / 2, 36, '#f0b030', 'center', '#060c3a')
    text(ctx, street, W / 2, H / 2 + 34, 13, '#c8d0ff', 'center', '')
  }
}

/** Debug: open the game with ?sprites to see every sprite at 2×. */
export function drawSheet(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = '#4e9139'
  ctx.fillRect(0, 0, W, H)
  ctx.save()
  const rows = [
    [art.rider(0, false), art.rider(1, false), art.rider(2, true), art.riderCrash(), art.dog(1, 0), art.dog(-1, 1), art.person('skater', 0), art.person('dancer', 0), art.person('dancer', 1)],
    [art.car('#c0392b', 'onc'), art.car('#2471a3', 'fwd'), art.car('#f1c40f', 'x')],
    [art.mailbox(true, false, 102), art.mailbox(false, false, 138), art.mailbox(false, true, 104), art.gate(), art.lawnmower(), art.streetSign(0)],
    [art.hydrant(), art.trashcan(), art.bundle(), art.tire(0), art.paper(0), art.paper(1), art.tree(), art.cone(), art.target(false)],
    [art.person('walker', 0), art.person('worker', 0), art.person('brawlers', 0), art.person('brawler2', 1), art.person('reaper', 0), art.person('owner', 1), art.person('kid', 0), art.tricycle(0), art.rcCar(), art.cat(0), art.cat(1)],
    [art.lamp(false), art.lamp(true), art.statue(false), art.statue(true), art.tomb(false), art.tomb(true), art.porch(0), art.porch(1), art.porch(2), art.mailbox(true, false, 0)],
  ]
  const tall = rows.reduce((n, row) => n + Math.max(...row.map(sp => sp.img.height)) + 4, 4)
  ctx.scale(Math.min(2, H / tall), Math.min(2, H / tall)) // 2× while it fits
  let y = 4
  for (const row of rows) {
    const h = Math.max(...row.map(sp => sp.img.height))
    let x = 4
    for (const sp of row) { ctx.drawImage(sp.img, x, y + h - sp.img.height); x += sp.img.width + 3 }
    y += h + 4
  }
  ctx.restore()
}
