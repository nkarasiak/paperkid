// One day's ride (or one training course): bike, papers, actors, collisions, scoring.

import { say, sfx } from './audio'
import type { Controls } from './io'
import { STREETS, L, LANE_ONCOMING, type ActorKind, type Static, type World } from './street'

export interface Run {
  street: number; day: number; score: number; lives: number; nextLife: number; diff: number
  subscribed: boolean[]
  original: boolean[]
}
export interface DayStats { delivered: boolean[]; damaged: boolean[]; papers: number; breakage: number }
export interface Actor {
  kind: ActorKind; s: number; l: number; z: number; vs: number; vl: number
  ds: number; dl: number; h: number; t: number; dead: number; color: string; home: number
}
export interface Paper { s: number; l: number; z: number; vs: number; vl: number; vz: number; done: boolean }
export interface Popup { s: number; l: number; z: number; text: string; color: string; t: number }

export const newDay = (): DayStats => ({ delivered: Array(20).fill(false), damaged: Array(20).fill(false), papers: 10, breakage: 0 })

export function addScore(run: Run, n: number) {
  run.score += n
  // ponytail: one bonus life, as the manual's "bonus life at 15,000" reads; whether it repeats is unverified.
  if (run.nextLife && run.score >= run.nextLife) { run.lives++; run.nextLife = 0; sfx('bonus') }
}

// Measured on the Atari ST port, converted to 60 Hz ticks (docs/research/measurements.md):
// three fixed speeds switched instantly, sideways steering, a flat fast paper throw, ~1.7 s crash.
const MIN = 0.42, NEUTRAL = 0.83, MAX = 1.67, STEER = 0.83, PAPER_VL = 4.1, CRASH_TICKS = 100
// ponytail: still guesses — the paper arc, jump and every enemy speed below; measure them next.
const GRAV = 0.03, JUMP = 2.2
// Characters a paper knocks over, and what that pays [P] p.1-7 "you might be pleased with the results!".
// ponytail: point values are guesses; breakdancer and brawlers scoring is [S].
const SMACK: Partial<Record<ActorKind, number>> = { skater: 100, dancer: 150, walker: 100, worker: 100, tricycle: 100, kid: 50, brawlers: 250, reaper: 500, owner: 100 }
export const CAR_COLORS = ['#c0392b', '#2471a3', '#f1c40f', '#1e8449', '#ecf0f1', '#7d3c98']

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))
const overlap = (s: number, l: number, ds: number, dl: number, o: Static) =>
  s + ds > o.s0 && s - ds < o.s1 && l + dl > o.l0 && l - dl < o.l1

export class Ride {
  bike = { s: -120, l: 148, z: 0, vz: 0, speed: NEUTRAL, crash: 0, invuln: 0, throwT: 0, slowT: 0, pushT: 0 }
  actors: Actor[] = []
  papers: Paper[] = []
  lying: { s: number; l: number }[] = []
  popups: Popup[] = []
  next = 0
  t = 0
  intro = 100
  timer = 30 * 60
  outcome: '' | 'done' | 'dead' | 'fail' = ''
  endT = 0
  mult: number
  swarms = 0

  constructor(public world: World, public run: Run, public day: DayStats) {
    this.mult = STREETS[run.street].mult
    if (this.course) { Object.assign(this.bike, { s: -60, l: 180 }); day.papers = 10 }
  }

  get course() { return this.world.mode === 'course' }
  get finished() { return this.outcome !== '' && this.endT > 60 }
  subscriber(i: number) { return !this.course && i >= 0 && this.run.subscribed[i] }

  update(c: Controls) {
    for (const p of this.popups) p.t--
    this.popups = this.popups.filter(p => p.t > 0)
    if (this.intro > 0) { this.intro--; return }
    if (this.outcome) { this.endT++; return }
    this.t++
    const b = this.bike
    this.updateActors()
    this.updatePapers()
    if (b.crash > 0) { if (--b.crash === 0) this.recover(); return }
    if (b.invuln > 0) b.invuln--
    if (b.throwT > 0) b.throwT--
    if (this.course && --this.timer <= 0) { this.outcome = 'fail'; this.pop(b, "TIME'S UP!", '#ff0'); return }

    b.speed = c.throttle > 0.3 ? MAX : c.throttle < -0.3 ? MIN : NEUTRAL
    if (b.pushT > 0) { b.pushT--; b.speed = MAX; b.l += Math.sin(this.t / 6) * 1.2 } // caught in the whirlwind
    b.s += b.speed
    b.l = clamp(b.l + c.steer * STEER, -10, 330)
    if (b.z > 0 || b.vz > 0) {
      b.z += b.vz
      b.vz -= 0.12
      if (b.z <= 0) b.z = b.vz = 0
    }
    if (c.throw && b.throwT === 0 && this.day.papers > 0) this.throwPaper()
    this.collideStatics()
    if (b.crash) return
    this.spawn()
    if (!this.course) this.bees()
    if (b.s >= this.world.end) {
      this.outcome = 'done'
      this.pop(b, this.course ? 'FINISH!' : 'ROUTE DONE!', '#7f7')
      sfx('bonus')
    }
  }

  private throwPaper() {
    const b = this.bike
    b.throwT = 12
    this.day.papers--
    const sunday = this.run.day === 6 && !this.course // Sunday papers are heavier [S]
    this.papers.push({ s: b.s, l: b.l - 6, z: b.z + 18, vs: b.speed, vl: sunday ? -3.4 : -PAPER_VL, vz: 0.6, done: false })
    sfx('throw')
  }

  private collideStatics() {
    const b = this.bike
    for (const o of this.world.statics) {
      if (!overlap(b.s, b.l, 8, 5, o)) continue
      if (o.kind === 'ramp') {
        if (b.z === 0 && b.vz === 0) {
          b.vz = JUMP
          sfx('jump')
          const n = (this.course ? 100 : 50) * this.mult
          addScore(this.run, n)
          this.pop(b, `+${n}`, '#fff')
          if (this.course) this.day.papers = 10 // course jumps restock papers [S]
        }
      } else if (o.kind === 'water') {
        const plank = this.world.statics.some(w => w.kind === 'board' && b.s > w.s0 && b.s < w.s1 && b.l > w.l0 && b.l < w.l1)
        if (b.z === 0 && !plank && !b.invuln) return this.crash()
      } else if (o.kind === 'flowers') {
        if (!o.hit && b.z === 0) { o.hit = true; if (!this.subscriber(o.lot)) this.breakage(50, b) } // [P] trampling a non-customer's flowers pays
      } else if (o.kind === 'bundle') {
        if (!o.hit) { o.hit = true; this.day.papers = 10; sfx('pickup'); this.pop(b, 'PAPERS!', '#fff') }
      } else if (o.solid && b.z < o.h && !b.invuln) {
        return this.crash()
      }
    }
  }

  private crash() {
    const b = this.bike
    b.crash = CRASH_TICKS
    b.z = b.vz = 0
    sfx('crash')
    say(['Ouch!', 'Whoa!', 'Hey!'][this.t % 3])
    this.pop(b, '%#@*!', '#ff4')
  }

  private recover() {
    const b = this.bike
    if (this.course) { this.outcome = 'fail'; return }
    if (--this.run.lives <= 0) { this.outcome = 'dead'; return }
    Object.assign(b, { speed: NEUTRAL, invuln: 60, slowT: 0, pushT: 0 }) // the ST restarts you where you fell
    this.actors = this.actors.filter(a => Math.abs(a.s - b.s) > 200)
  }

  private spawn() {
    const b = this.bike, sp = this.world.spawns
    while (this.next < sp.length && sp[this.next].s < b.s + 420) {
      const { kind, s, l } = sp[this.next++]
      this.addActor(kind, s, l)
      if (kind === 'rc') this.addActor('kid', s + 10, 106) // the kid on the lawn steering it
    }
    const x = this.world.traffic, period = Math.max(45, 110 - this.run.day * 10)
    if (x && b.s > x[0] - 450 && b.s < x[1] && this.t % period === 0) {
      const east = Math.random() < 0.5
      this.addActor('xcar', east ? x[0] + 45 : x[1] - 45, east ? -260 : 600)
    }
  }

  private addActor(kind: ActorKind, s: number, l: number) {
    const d = this.run.day
    const a: Actor = { kind, s, l, z: 0, vs: 0, vl: 0, ds: 6, dl: 4, h: 26, t: 0, dead: 0, home: l,
      color: CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)] }
    switch (kind) {
      case 'car': Object.assign(a, { ds: 22, dl: 11, vs: l === LANE_ONCOMING ? -(0.9 + d * 0.08) : 0.6 + d * 0.05 }); break
      case 'curbcar': Object.assign(a, { ds: 22, dl: 11 }); break
      case 'xcar': Object.assign(a, { ds: 11, dl: 22, vl: (l < 0 ? 1 : -1) * (2.2 + d * 0.2) }); break
      case 'dog': Object.assign(a, { ds: 8, dl: 4, h: 14 }); break
      case 'skater': a.vs = -0.8; break
      case 'tire': Object.assign(a, { ds: 4, dl: 3, h: 16, vs: -1.3 }); break
      case 'mower': Object.assign(a, { ds: 6, dl: 6, h: 9, vl: 0.5 }); break
      case 'bees': case 'whirl': Object.assign(a, { ds: 8, dl: 8, h: 40 }); break
      case 'walker': a.vs = -0.45; break
      case 'tricycle': Object.assign(a, { ds: 7, h: 18, vs: -0.6 }); break
      case 'brawlers': Object.assign(a, { ds: 11, dl: 5 }); break
      case 'cat': Object.assign(a, { ds: 3, dl: 6, h: 9 }); break
      case 'rc': Object.assign(a, { ds: 4, dl: 3, h: 5 }); break
      case 'kid': a.h = 15; break
    }
    this.actors.push(a)
  }

  /** Dawdle and the bees or the whirlwind come for you [P] p.1-7, taking turns. */
  private bees() {
    const b = this.bike
    b.slowT = b.speed < 0.6 ? b.slowT + 1 : 0
    if (b.slowT < 150) return
    b.slowT = 0
    if (this.actors.some(a => a.kind === 'bees' || a.kind === 'whirl')) return
    const whirl = this.swarms++ % 2 === 1
    this.addActor(whirl ? 'whirl' : 'bees', b.s - 140, b.l)
    this.pop(b, whirl ? 'WHOOSH!' : 'BZZZ!', '#ff0')
  }

  private chase(a: Actor, speed: number) {
    const b = this.bike, ds = b.s - a.s, dl = b.l - a.l, d = Math.hypot(ds, dl) || 1
    a.vs = (ds / d) * speed
    a.vl = (dl / d) * speed
  }

  private updateActors() {
    const b = this.bike
    for (const a of this.actors) {
      a.t++
      if (a.dead) { a.dead++; continue }
      switch (a.kind) {
        case 'dog': {
          const near = Math.hypot(b.s - a.s, b.l - a.l) < 180
          if (!near && a.vs === 0) a.t-- // the chase clock only runs once the dog has seen you
          if (near && a.t === 1) sfx('bark')
          if (near && a.t < 150) this.chase(a, 1.2)
          else a.vs = a.vl = 0
          break
        }
        case 'bees': this.chase(a, 1.2); break
        case 'curbcar': // ponytail: trigger distance and pull-out rates are guesses
          if (a.vs === 0 && a.s - b.s > 100) break // late enough that you see it swing out
          a.vs = Math.max(a.vs - 0.02, -(0.9 + this.run.day * 0.08))
          a.vl = a.l < LANE_ONCOMING ? 0.7 : 0
          break
        case 'whirl':
          if (b.pushT) { Object.assign(a, { s: b.s, l: b.l, vs: 0, vl: 0 }); continue }
          this.chase(a, 1.3)
          break
        case 'cat': // waits in the yard, then dashes for the road
          if (a.vl === 0 && Math.abs(b.s - a.s) < 110) a.vl = 1.8
          break
        case 'owner': if (a.t < 150) this.chase(a, 1); else a.vs = a.vl = 0; break
        case 'reaper': if (Math.hypot(b.s - a.s, b.l - a.l) < 200) this.chase(a, 0.55); else a.vs = a.vl = 0; break
        case 'rc': a.l = a.home + Math.sin(a.t / 18) * 45; break
        case 'brawlers': a.s += Math.sin(a.t / 5) * 0.4; break
        case 'dancer': a.l = a.home + Math.sin(a.t / 8) * 8; break
        case 'mower': if (Math.abs(a.l - a.home) > 20) a.vl = -a.vl; break
        case 'tire': a.z = Math.abs(Math.sin(a.t / 6)) * 6; break
      }
      a.s += a.vs
      a.l += a.vl
      if (b.crash || b.invuln || b.z >= a.h || Math.abs(a.s - b.s) >= a.ds + 8 || Math.abs(a.l - b.l) >= a.dl + 5) continue
      if (a.kind !== 'whirl') { this.crash(); continue }
      if (b.pushT) continue
      b.pushT = 120 // the whirlwind carries you along at full speed [P] p.1-7, then blows itself out
      a.t = 300
      say('Whoa!')
    }
    this.actors = this.actors.filter(a =>
      a.dead < 50 && a.s > b.s - 260 && a.s < b.s + 800 && a.l > -320 && a.l < 660 && !((a.kind === 'bees' || a.kind === 'whirl') && a.t > 420))
  }

  private updatePapers() {
    for (const p of this.papers) {
      p.s += p.vs
      p.l += p.vl
      p.z += p.vz
      p.vz -= GRAV
      this.paperHits(p)
      if (!p.done && p.z <= 0) { p.z = 0; this.drop(p) }
    }
    this.papers = this.papers.filter(p => !p.done)
  }

  private paperHits(p: Paper) {
    for (const a of this.actors) {
      if (a.dead || p.z >= a.h || Math.abs(a.s - p.s) >= a.ds + 3 || Math.abs(a.l - p.l) >= a.dl + 3) continue
      const pts = SMACK[a.kind]
      if (pts) {
        a.dead = 1
        addScore(this.run, pts * this.mult)
        this.pop(a, 'SMACK!', '#fff')
        sfx('smack')
      }
      return this.drop(p)
    }
    for (const o of this.world.statics) {
      if (!overlap(p.s, p.l, 3, 3, o) || p.z >= o.h) continue
      switch (o.kind) {
        case 'house': this.wallHit(p, o.lot); break
        case 'porch': this.deliver(o.lot, 100, p); break
        case 'mailbox':
          if (this.subscriber(o.lot)) this.deliver(o.lot, 250, p)
          else if (!o.hit) { o.hit = true; sfx('smack'); this.breakage(100, p) }
          break
        case 'lamp': case 'statue': case 'tomb':
          if (!o.hit) { o.hit = true; sfx('glass'); this.damage(o.lot, p) }
          break
        case 'target':
          if (o.hit || p.z < o.z0) break
          o.hit = true
          addScore(this.run, 250 * this.mult)
          this.pop(p, `+${250 * this.mult}`, '#7f7')
          sfx('glass')
          break
        case 'ramp': case 'bundle': case 'drain': case 'finish': case 'board': continue
      }
      return this.drop(p)
    }
  }

  private wallHit(p: Paper, i: number) {
    p.l = L.HOUSE + 2
    const lot = this.world.lots[i]
    const w = lot.windows.find(w => p.s >= w.s0 && p.s <= w.s1)
    if (w && p.z >= 20 && p.z <= 38) {
      if (w.broken) return
      w.broken = true
      sfx('glass')
      this.damage(i, p)
    } else if (p.s >= lot.door[0] - 10 && p.s <= lot.door[1] + 10) {
      this.deliver(i, 100, p)
    }
  }

  private deliver(i: number, pts: number, p: Paper) {
    if (!this.subscriber(i) || this.day.delivered[i]) return
    this.day.delivered[i] = true
    addScore(this.run, pts * this.mult)
    this.pop(p, `+${pts * this.mult}`, '#7f7')
    sfx('ding')
  }

  /** Breaking something at lot i: pays at a non-customer's, loses (and angers) a customer [P] p.1-6/1-7. */
  private damage(i: number, p: Paper) {
    if (!this.subscriber(i)) return this.breakage(100, p)
    if (this.day.damaged[i]) return
    this.day.damaged[i] = true
    this.pop(p, 'OOPS!', '#f55')
    say('Hey! You!')
    const d = this.world.lots[i].door
    this.addActor('owner', (d[0] + d[1]) / 2, L.PORCH)
  }

  private breakage(n: number, at: { s: number; l: number }) {
    this.day.breakage += n * this.mult
    this.pop(at, `+${n * this.mult}`, '#fc6')
  }

  private drop(p: Paper) {
    p.done = true
    this.lying.push({ s: p.s, l: p.l })
    if (this.lying.length > 60) this.lying.shift()
  }

  private pop(at: { s: number; l: number; z?: number }, text: string, color: string) {
    this.popups.push({ s: at.s, l: at.l, z: (at.z ?? 0) + 34, text, color, t: 50 })
  }
}
