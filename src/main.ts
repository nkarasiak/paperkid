import { Game } from './game'
import { poll, touch } from './io'
import { toggleMute } from './audio'
import { W, H, drawSheet, text } from './render'

const canvas = document.querySelector('canvas')!
const ctx = canvas.getContext('2d')!
ctx.imageSmoothingEnabled = false
const sheet = location.search.includes('sprites')

// Largest integer scale in device pixels; fractional only when the window is smaller than 512×384.
function fit() {
  const k = Math.min(innerWidth / W, innerHeight / H), dpr = devicePixelRatio
  const s = k >= 1 ? Math.floor(k * dpr) / dpr : k
  canvas.style.width = `${W * s}px`
  canvas.style.height = `${H * s}px`
  document.body.style.setProperty('--g', `${(innerWidth - W * s) / 2}px`)
  if (touch && innerHeight > innerWidth) paused = true // the phone turned upright mid-ride
}
let paused = false
addEventListener('resize', fit)
fit()

const game = new Game()
Object.assign(window, { game }) // handy in the devtools console

addEventListener('keydown', e => {
  if (e.code === 'KeyP') paused = !paused
  if (e.code === 'KeyM') toggleMute()
})
document.addEventListener('visibilitychange', () => { if (document.hidden) paused = true })

const STEP = 1000 / 60
let acc = 0, last = performance.now()
function frame(now: number) {
  acc += Math.min(now - last, 250)
  last = now
  while (acc >= STEP) {
    const c = poll()
    if (!paused) game.update(c)
    acc -= STEP
  }
  if (sheet) drawSheet(ctx)
  else game.render(ctx)
  if (paused) {
    ctx.fillStyle = 'rgba(0,0,0,0.6)'
    ctx.fillRect(0, 0, W, H)
    text(ctx, touch ? 'PAUSED — TAP II' : 'PAUSED — PRESS P', W / 2, H / 2, 16, '#fff', 'center')
  }
  requestAnimationFrame(frame)
}
requestAnimationFrame(frame)
