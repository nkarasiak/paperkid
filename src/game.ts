// Screen flow: title → street select → route map → ride → training course → results → … → game over. C on the title rolls the credits.

import { jingle, music, say, sfx } from './audio'
import { touch, type Controls } from './io'
import { STREETS, buildCourse, buildStreet, subscriberPattern } from './street'
import { Ride, addScore, newDay, type DayStats, type Run } from './ride'
import { W, H, dark, drawHud, drawWorld, text } from './render'
import { version } from '../package.json'

const DAYS = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY']
// The operator settings from the manual [P], offered on the select screen.
const OPTIONS = [
  { label: 'LIVES', values: [3, 4, 5], names: ['3', '4', '5'] },
  { label: 'BONUS LIFE', values: [10000, 15000, 20000, 0], names: ['10000', '15000', '20000', 'NONE'] },
  { label: 'DIFFICULTY', values: [-1, 0, 1], names: ['EASY', 'NORMAL', 'HARD'] },
]
type State = 'title' | 'select' | 'map' | 'ride' | 'course' | 'results' | 'over' | 'credits'

const CREDITS = ['PAPER KID', `VERSION ${version}`, '', 'DIRECTED BY', 'NICOLAS KARASIAK', '', 'CODE BY', 'CLAUDE', '', 'PIXELS, MUSIC & VOICES', 'ALL MADE IN CODE', 'NOT ONE ASSET FILE', '', 'THE WHOLE GAME', 'FITS IN ONE 30 KB FILE', '',
  'AFTER THE ORIGINAL', 'PAPERBOY', 'ATARI GAMES, 1984', '', 'ORIGINAL DESIGN', 'JOHN SALWITZ', 'DAVE RALSTON', '', 'ORIGINAL MUSIC', 'HAL CANON', 'EARL VICKERS', '', 'THANKS FOR RIDING!', '', 'GITHUB.COM/NKARASIAK/PAPERKID']

interface Results { lines: [string, number][]; lost: number; regained: boolean; fired: boolean; perfect: boolean }

function loadHi(): number {
  try { return Number(localStorage.getItem('paper-kid-hi')) || 0 } catch { return 0 }
}

export class Game {
  state: State = 'title'
  t = 0
  sel = 0
  row = 0
  opts = [1, 1, 1]
  prevSteer = 0
  prevThrottle = 0
  hi = loadHi()
  newHi = false
  headline = ''
  run!: Run
  day!: DayStats
  ride!: Ride
  res!: Results

  private go(s: State) {
    this.state = s
    this.t = 0
    music(s === 'ride' || s === 'course' ? s : s === 'credits' ? 'ride' : null)
  }

  update(c: Controls) {
    this.t++
    const tap = c.steer && !this.prevSteer ? Math.sign(c.steer) : 0
    this.prevSteer = Math.abs(c.steer) > 0.5 ? c.steer : 0
    const vtap = c.throttle && !this.prevThrottle ? -Math.sign(c.throttle) : 0
    this.prevThrottle = Math.abs(c.throttle) > 0.5 ? c.throttle : 0
    switch (this.state) {
      case 'title':
        if (c.start) { sfx('select'); say('Paper Kid!'); this.go('select') }
        else if (c.credits) { sfx('select'); this.creditsRide(0); this.go('credits') }
        break
      case 'credits':
        // Autopilot: the kid cruises a real street, throwing now and then; next street when he reaches the end.
        this.ride.update({ steer: 0, throttle: 0, throw: this.t % 80 === 40, start: false })
        if (this.ride.finished) this.creditsRide(this.run.street + 1)
        if ((c.start || c.credits) && this.t > 20) this.go('title')
        break
      case 'select':
        if (vtap) { this.row = (this.row + vtap + 4) % 4; sfx('select') }
        if (tap && this.row === 0) { this.sel = (this.sel + tap + 3) % 3; sfx('select') }
        if (tap && this.row > 0) { const n = OPTIONS[this.row - 1].values.length; this.opts[this.row - 1] = (this.opts[this.row - 1] + tap + n) % n; sfx('select') }
        if (c.start && this.t > 10) this.newRun()
        break
      case 'map': if (c.start && this.t > 20) this.startDay(); break
      case 'ride':
        this.ride.update(c)
        if (!this.ride.finished) break
        if (this.ride.outcome === 'dead') this.gameOver('PAPER KID CALLS IT QUITS', 'I quit!')
        else { this.ride = new Ride(buildCourse(this.run.street, this.run.day), this.run, this.day); this.go('course') }
        break
      case 'course':
        this.ride.update(c)
        if (this.ride.finished) this.endDay()
        break
      case 'results':
        if (!c.start || this.t < 30) break
        if (this.res.fired) this.gameOver("PAPER KID FIRED! \"YOU'RE FIRED!\"", "You're fired!")
        else if (this.run.day === 6) this.gameOver('PAPER KID WINS DELIVERY AWARD', 'Congratulations, paper kid!', true)
        else { this.run.day++; this.go('map') }
        break
      case 'over': if (c.start && this.t > 60) this.go('title'); break
    }
  }

  private newRun() {
    const subs = subscriberPattern(this.sel)
    const [lives, nextLife, diff] = OPTIONS.map((o, i) => o.values[this.opts[i]])
    this.run = { street: this.sel, day: 0, score: 0, lives, nextLife, diff, subscribed: subs, original: subs.slice() }
    jingle('start')
    say(`Welcome to ${STREETS[this.sel].name.toLowerCase()}`)
    this.go('map')
  }

  private creditsRide(street: number) {
    street %= STREETS.length
    this.run = { street, day: 0, score: 0, lives: 99, nextLife: 0, diff: -1, subscribed: Array(20).fill(true), original: Array(20).fill(true) }
    this.ride = new Ride(buildStreet(street, 0), this.run, newDay())
    this.ride.intro = 0
  }

  private startDay() {
    this.day = newDay()
    const { street, day, subscribed, original, diff } = this.run
    const lost = original.filter(Boolean).length - subscribed.filter(Boolean).length
    this.ride = new Ride(buildStreet(street, day, subscribed.map(s => !s), lost, diff), this.run, this.day)
    say(DAYS[this.run.day].toLowerCase())
    this.go('ride')
  }

  private endDay() {
    const { run, day } = this, mult = STREETS[run.street].mult
    const kept = run.subscribed.map((s, i) => s && day.delivered[i] && !day.damaged[i])
    const subs = run.subscribed.filter(Boolean).length, delivered = kept.filter(Boolean).length
    const perfect = subs > 0 && delivered === subs
    const lines: [string, number][] = [[`DELIVERIES ${delivered}/${subs}`, delivered * 50 * mult]]
    if (perfect) lines.push(['PERFECT DELIVERY BONUS', delivered * 50 * mult])
    lines.push(['BREAKAGE BONUS', day.breakage])
    lines.push(['TRAINING TIME BONUS', this.ride.outcome === 'done' ? Math.ceil(this.ride.timer / 60) * 20 * mult : 0])
    for (const [, n] of lines) addScore(run, n)
    // A perfect day wins back one lost customer [P]; which one is [U], so take the first.
    let regained = false
    if (perfect) {
      const i = run.original.findIndex((o, i) => o && !kept[i])
      if (i >= 0) { kept[i] = true; regained = true }
    }
    run.subscribed = kept
    this.res = { lines, lost: subs - delivered, regained, perfect, fired: !kept.some(Boolean) }
    this.go('results')
    jingle('day')
    if (perfect) say('Perfect delivery!')
  }

  private gameOver(headline: string, voice: string, won = false) {
    this.headline = headline
    jingle(won ? 'win' : 'over')
    say(voice)
    this.newHi = this.run.score > this.hi
    if (this.newHi) {
      this.hi = this.run.score
      try { localStorage.setItem('paper-kid-hi', String(this.hi)) } catch { /* private mode: keep it in memory */ }
    }
    this.go('over')
  }

  render(ctx: CanvasRenderingContext2D) {
    switch (this.state) {
      case 'title': return this.renderTitle(ctx)
      case 'select': return this.renderSelect(ctx)
      case 'map': return this.renderMap(ctx)
      case 'ride': case 'course':
        drawWorld(ctx, this.ride)
        return drawHud(ctx, this.ride, this.run, this.day, `${DAYS[this.run.day]} · ${STREETS[this.run.street].name}`)
      case 'results': return this.renderResults(ctx)
      case 'over': return this.renderOver(ctx)
      case 'credits': return this.renderCredits(ctx)
    }
  }

  private newspaper(ctx: CanvasRenderingContext2D, masthead: string) {
    ctx.fillStyle = '#f1ead6'
    ctx.fillRect(0, 0, W, H)
    ctx.fillStyle = '#222'
    ctx.fillRect(20, 16, W - 40, 2)
    ctx.font = 'bold 30px Georgia, serif'
    ctx.textAlign = 'center'
    ctx.fillText(masthead, W / 2, 50)
    ctx.fillRect(20, 60, W - 40, 2)
    ctx.fillRect(20, 64, W - 40, 1)
  }

  private blink(ctx: CanvasRenderingContext2D, s: string, y: number) {
    if (touch) s = s.replace('PRESS SPACE', 'TAP')
    if (Math.floor(this.t / 30) % 2 === 0) text(ctx, s, W / 2, y, 12, '#c0392b', 'center', '')
  }

  private renderTitle(ctx: CanvasRenderingContext2D) {
    this.newspaper(ctx, 'THE DAILY ROUTE')
    text(ctx, 'EXTRA! EXTRA!', W / 2, 92, 12, '#555', 'center', '')
    ctx.font = 'bold 54px Georgia, serif'
    ctx.fillStyle = '#111'
    ctx.fillText('PAPER KID', W / 2, 150)
    text(ctx, 'ONE BIKE. TWENTY HOUSES. SEVEN DAYS.', W / 2, 180, 12, '#333', 'center', '')
    text(ctx, `HIGH SCORE ${String(this.hi).padStart(6, '0')}`, W / 2, 215, 12, '#333', 'center', '')
    const lines = touch ? ['PAD             STEER LEFT-RIGHT, SPEED UP-DOWN', 'THROW           THROW PAPER (TO THE LEFT)', 'II PAUSE  ·  ♪ MUTE  ·  3D VIEW']
      : ['ARROWS / WASD   STEER LEFT-RIGHT, SPEED UP-DOWN', 'SPACE / J       THROW PAPER (TO THE LEFT)', 'P PAUSE  ·  M MUTE  ·  V 3D VIEW  ·  C CREDITS  ·  GAMEPAD TOO']
    lines.forEach((l, i) => text(ctx, l, W / 2, 260 + i * 18, 11, '#444', 'center', ''))
    this.blink(ctx, 'PRESS SPACE TO START', 345)
  }

  private renderSelect(ctx: CanvasRenderingContext2D) {
    this.newspaper(ctx, 'CHOOSE YOUR ROUTE')
    STREETS.forEach((st, i) => {
      const x = 32 + i * 156, y = 84, on = i === this.sel
      ctx.fillStyle = on ? '#222' : '#ddd5bd'
      ctx.fillRect(x, y, 136, 150)
      if (on && this.row === 0) { ctx.fillStyle = '#c0392b'; ctx.fillRect(x, y + 146, 136, 4) }
      text(ctx, st.name, x + 68, y + 28, 13, on ? '#fff' : '#222', 'center', '')
      text(ctx, `SCORE ×${st.mult}`, x + 68, y + 50, 11, on ? '#ff0' : '#555', 'center', '')
      st.colors.forEach((c, k) => { ctx.fillStyle = c; ctx.fillRect(x + 18 + k * 21, y + 70, 16, 24); ctx.fillStyle = dark(c, 0.6); ctx.fillRect(x + 18 + k * 21, y + 64, 16, 6) })
      const blurb = [['COLUMNS, A CHURCH', 'KIDS AT PLAY'], ['BRICK ROWS', 'ROADWORKS, CATS'], ['TUDOR & GRAVES', 'THE REAPER WALKS']][i]
      blurb.forEach((b, k) => text(ctx, b, x + 68, y + 118 + k * 14, 10, on ? '#ccc' : '#555', 'center', ''))
    })
    OPTIONS.forEach((o, i) => {
      const y = 262 + i * 18, on = this.row === i + 1
      text(ctx, `${on ? '►' : ' '} ${o.label}`, 150, y, 12, on ? '#c0392b' : '#333', 'left', '')
      text(ctx, `◄ ${o.names[this.opts[i]]} ►`, 362, y, 12, on ? '#c0392b' : '#333', 'right', '')
    })
    text(ctx, touch ? '▲ ▼ ROW   ◄ ► CHOOSE   TAP CONFIRM' : '▲ ▼ ROW   ◄ ► CHOOSE   SPACE CONFIRM', W / 2, 335, 11, '#333', 'center', '')
  }

  private renderMap(ctx: CanvasRenderingContext2D) {
    const st = STREETS[this.run.street]
    this.newspaper(ctx, `${st.name} — ROUTE MAP`)
    // The street as seen from above: houses along a diagonal road, a cross street halfway.
    const lots = buildStreet(this.run.street, 0).lots
    const at = (t: number): [number, number] => [70 + t * 18, 330 - t * 10.5]
    const [ax, ay] = at(-1.2), [bx, by] = at(21.4)
    ctx.strokeStyle = '#555'
    ctx.lineWidth = 18
    ctx.beginPath(); ctx.moveTo(ax + 30, ay + 30); ctx.lineTo(bx + 30, by + 30); ctx.stroke()
    for (const t of [-0.75, 10.25, 20.75]) {
      const [cx, cy] = at(t)
      ctx.beginPath(); ctx.moveTo(cx - 30, cy - 4); ctx.lineTo(cx + 80, cy + 60); ctx.stroke()
    }
    for (let i = 0; i < 20; i++) {
      const [x, y] = at(i + (i >= 10 ? 1 : 0)), sub = this.run.subscribed[i]
      ctx.fillStyle = sub ? lots[i].roof : '#3b3631'
      ctx.beginPath(); ctx.moveTo(x - 1, y + 7); ctx.lineTo(x + 7, y); ctx.lineTo(x + 15, y + 7); ctx.fill()
      ctx.fillStyle = sub ? lots[i].color : '#5d564e'
      ctx.fillRect(x + 1, y + 7, 12, 10)
      if (sub) { ctx.fillStyle = '#c0392b'; ctx.fillRect(x + 15, y + 12, 3, 4) }
    }
    const n = this.run.subscribed.filter(Boolean).length
    text(ctx, `${DAYS[this.run.day]}   ·   ${n} CUSTOMERS`, W / 2, 96, 14, '#222', 'center', '')
    text(ctx, 'BRIGHT = DELIVER', 30, 140, 11, '#333', 'left', '')
    text(ctx, 'DARK = FAIR GAME', 30, 158, 11, '#333', 'left', '')
    text(ctx, `SCORE ${this.run.score}   LIVES ${this.run.lives}`, 30, 184, 11, '#333', 'left', '')
    this.blink(ctx, 'PRESS SPACE TO RIDE', 360)
  }

  private renderResults(ctx: CanvasRenderingContext2D) {
    const r = this.res
    this.newspaper(ctx, `${DAYS[this.run.day]}'S ROUTE`)
    r.lines.forEach(([label, n], i) => {
      text(ctx, label, 70, 110 + i * 26, 13, '#222', 'left', '')
      text(ctx, String(n), W - 70, 110 + i * 26, 13, '#222', 'right', '')
    })
    const y = 110 + r.lines.length * 26 + 20
    ctx.fillStyle = '#222'
    ctx.fillRect(70, y - 16, W - 140, 1)
    text(ctx, `SCORE ${this.run.score}`, W / 2, y + 6, 15, '#111', 'center', '')
    const news = r.fired ? 'ALL CUSTOMERS CANCELLED!'
      : r.perfect ? (r.regained ? 'PERFECT DAY! A CUSTOMER CAME BACK' : 'PERFECT DAY!')
      : `${r.lost} CUSTOMER${r.lost === 1 ? '' : 'S'} CANCELLED`
    text(ctx, news, W / 2, y + 36, 13, r.fired || r.lost ? '#c0392b' : '#1e8449', 'center', '')
    this.blink(ctx, 'PRESS SPACE', 355)
  }

  private renderOver(ctx: CanvasRenderingContext2D) {
    this.newspaper(ctx, 'THE DAILY ROUTE')
    text(ctx, 'LATE EDITION', W / 2, 92, 12, '#555', 'center', '')
    ctx.fillStyle = '#111'
    ctx.font = 'bold 22px Georgia, serif'
    ctx.fillText(this.headline, W / 2, 150, W - 40)
    text(ctx, `FINAL SCORE ${this.run.score}`, W / 2, 200, 15, '#222', 'center', '')
    text(ctx, `${STREETS[this.run.street].name} · ${DAYS[this.run.day]}`, W / 2, 225, 12, '#555', 'center', '')
    if (this.newHi) text(ctx, 'NEW HIGH SCORE!', W / 2, 265, 15, '#c0392b', 'center', '')
    if (this.t > 60) this.blink(ctx, 'PRESS SPACE', 345)
  }

  private renderCredits(ctx: CanvasRenderingContext2D) {
    drawWorld(ctx, this.ride)
    const x = 20, y = 20, w = 230, h = H - 40, gap = 22
    ctx.fillStyle = 'rgba(241,234,214,0.92)'
    ctx.fillRect(x, y, w, h)
    ctx.fillStyle = '#222'
    ctx.fillRect(x + 10, y + 8, w - 20, 2)
    ctx.fillRect(x + 10, y + h - 10, w - 20, 2)
    ctx.save()
    ctx.beginPath(); ctx.rect(x, y + 12, w, h - 24); ctx.clip()
    // Roll upward from the bottom edge, then start over.
    const roll = (this.t * 0.5) % (h + CREDITS.length * gap)
    CREDITS.forEach((l, i) => { // a line after a blank is a heading
      text(ctx, l, x + w / 2, y + h + i * gap - roll, i ? 11 : 20, i === 0 || CREDITS[i - 1] === '' ? '#c0392b' : '#222', 'center', '')
    })
    ctx.restore()
  }
}
