// Input: keyboard + gamepad, normalized once per tick.

import { unlockAudio } from './audio'
import { paper } from './sprites'
import { bake } from './pix'

export interface Controls { steer: number; throttle: number; throw: boolean; start: boolean; credits?: boolean }

const held = new Set<string>()
const pressed = new Set<string>()
let padWas = false

addEventListener('keydown', e => {
  unlockAudio()
  if (!e.repeat) pressed.add(e.code)
  held.add(e.code)
  if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault()
})
addEventListener('keyup', e => held.delete(e.code))
addEventListener('blur', () => held.clear())

const any = (...codes: string[]) => codes.some(c => held.has(c))

export function poll(): Controls {
  let steer = +any('ArrowRight', 'KeyD') - +any('ArrowLeft', 'KeyA')
  let throttle = +any('ArrowUp', 'KeyW') - +any('ArrowDown', 'KeyS')
  let thr = pressed.has('Space') || pressed.has('KeyJ') || pressed.has('KeyK')
  let start = pressed.has('Space') || pressed.has('Enter')
  for (const gp of navigator.getGamepads?.() ?? []) {
    if (!gp) continue
    const [ax = 0, ay = 0] = gp.axes
    const btn = (i: number) => gp.buttons[i]?.pressed ?? false
    if (Math.abs(ax) > 0.2) steer = ax
    if (Math.abs(ay) > 0.2) throttle = -ay
    if (btn(14)) steer = -1
    if (btn(15)) steer = 1
    if (btn(12)) throttle = 1
    if (btn(13)) throttle = -1
    const down = [0, 1, 2, 3, 9].some(btn)
    if (down && !padWas) { thr = start = true; unlockAudio() }
    padWas = down
  }
  const credits = pressed.has('KeyC')
  pressed.clear()
  return { steer, throttle, throw: thr, start, credits }
}

// Touch: a pixel d-pad and a paper to throw, drawn in the side margins of a landscape screen.
// They fire the same key events as the keyboard. main.ts sets --g, the margin width.
export const touch = matchMedia('(pointer: coarse)').matches
const key = (code: string, down: boolean) => {
  if (held.has(code) === down) return
  dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code }))
  document.querySelectorAll(`[data-k=${code}]`).forEach(e => e.classList.toggle('on', down))
}
if (touch) {
  addEventListener('touchend', unlockAudio) // touchend counts as a user gesture on iOS, pointerdown doesn't
  const ink = '#f1ead6', red = '#c0392b'
  const css = document.createElement('style')
  css.textContent = `body{touch-action:none;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none}
.t{position:fixed;transform:translate(-50%,-50%);font:bold 11px monospace;color:${ink};display:grid;place-items:center;opacity:.45}
#pad .on,.t.on{color:#fff;background:${red};border-color:${red};opacity:1}
#pad{left:calc(var(--g)/2);top:62%;--c:min(40px,calc(var(--g)/3 - 6px));grid-template:repeat(3,var(--c))/repeat(3,var(--c));place-items:stretch;opacity:1}
#pad b{display:grid;place-items:center;border:2px solid ${ink}55;background:${ink}1a;color:${ink}88;font-size:12px}
#thr{right:calc(var(--g)/2);top:62%;transform:translate(50%,-50%);width:min(96px,calc(var(--g) - 16px));aspect-ratio:1;border:2px dashed ${ink}66;border-radius:50%;align-content:center;gap:6px;opacity:1;color:${ink}99}
#thr img{width:56%;image-rendering:pixelated}
#thr.on img{transform:rotate(-20deg) scale(1.1)}
#rot{position:fixed;inset:0;background:${ink};color:#222;font:bold 22px Georgia,serif;text-align:center;place-items:center;display:none}
@media (orientation:portrait){#rot{display:grid}}`
  document.head.append(css)
  const el = (id: string, html: string, style = '') => {
    const e = document.createElement('div')
    e.id = id
    e.className = 't'
    e.innerHTML = html
    e.style.cssText = style
    document.body.append(e)
    return e
  }
  const hold = (e: HTMLElement, code: string) => {
    e.dataset.k = code
    e.onpointerdown = () => key(code, true)
    e.onpointerup = e.onpointercancel = () => key(code, false)
  }
  const pad = el('pad', '<i></i><b data-k=ArrowUp>▲</b><i></i><b data-k=ArrowLeft>◀</b><b></b><b data-k=ArrowRight>▶</b><i></i><b data-k=ArrowDown>▼</b><i></i>')
  pad.onpointerdown = pad.onpointermove = e => {
    const r = pad.getBoundingClientRect(), x = (e.clientX - r.x) / r.width - 0.5, y = (e.clientY - r.y) / r.height - 0.5
    key('ArrowLeft', x < -1 / 6); key('ArrowRight', x > 1 / 6); key('ArrowUp', y < -1 / 6); key('ArrowDown', y > 1 / 6)
  }
  pad.onpointerup = pad.onpointercancel = () => ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].forEach(c => key(c, false))
  hold(el('thr', `<img src="${bake(paper(1)).img.toDataURL()}">THROW`), 'Space')
  hold(el('pause', 'II', 'right:calc(var(--g)/2);top:28px;transform:translate(50%,-50%);padding:8px'), 'KeyP')
  hold(el('mute', '♪', 'right:calc(var(--g)/2);top:68px;transform:translate(50%,-50%);padding:8px'), 'KeyM')
  hold(el('view', '3D', 'right:calc(var(--g)/2);top:108px;transform:translate(50%,-50%);padding:8px'), 'KeyV')
  el('rot', '<p>EXTRA! EXTRA!<br><br>TURN YOUR PHONE<br>SIDEWAYS TO RIDE</p>', 'transform:none;opacity:1')
  hold(document.querySelector('canvas')!, 'Space') // tap the screen to start, confirm or throw
}
