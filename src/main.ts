import { Game } from './game'
import { poll, touch } from './io'
import { toggleMute } from './audio'
import { canvasScale, nextView, resetView, tuneView } from './gl'
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
  if (e.code === 'KeyV') nextView()
  // By the typed character, so it works on any keyboard layout; ( ) are direct keys on AZERTY.
  if ('[('.includes(e.key)) tuneView(-1, 0)
  if ('])'.includes(e.key)) tuneView(1, 0)
  if (e.key === '-') tuneView(0, -1)
  if ('=+'.includes(e.key)) tuneView(0, 1)
  if (e.key === 'PageUp') tuneView(0, 0, -1)
  if (e.key === 'PageDown') tuneView(0, 0, 1)
  if (e.key === '0' || e.code === 'Digit0') resetView() // Digit0: the 0 key on AZERTY types à without Shift
})
// Two fingers on a trackpad (or a mouse wheel): up/down zooms, sideways (or Shift + wheel) turns the camera around
// the kid, a pinch (sent as Ctrl + wheel) changes the lens. Amounts follow how far the fingers moved: 100 px is one
// zoom step. preventDefault keeps the browser from zooming the page or swiping back a page.
addEventListener('wheel', e => {
  e.preventDefault()
  const k = e.deltaMode ? 33 : 1
  if (e.ctrlKey) tuneView((e.deltaY * k) / 20, 0)
  else tuneView(0, 0, (e.deltaY * k) / 100, (e.deltaX * k) / 5)
}, { passive: false })
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
  const k = game.state === 'ride' || game.state === 'course' || game.state === 'credits' ? canvasScale() : 1
  if (canvas.width !== W * k) { canvas.width = W * k; canvas.height = H * k; ctx.imageSmoothingEnabled = false }
  ctx.setTransform(k, 0, 0, k, 0, 0) // everything still draws in 512×384 units
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
