// Web Audio: synthesized sfx, an FM-style chiptune (original composition) and spoken voice lines.

let ac: AudioContext | undefined
let master: GainNode | undefined
let muted = false
try { muted = localStorage.getItem('paper-kid-mute') === '1' } catch { /* storage blocked */ }

export function unlockAudio() {
  if (!ac) {
    ac = new AudioContext()
    master = ac.createGain()
    master.gain.value = muted ? 0 : 1
    master.connect(ac.destination)
    setInterval(tick, 25)
  }
  if (ac.state === 'suspended') ac.resume()
}

export function toggleMute() {
  muted = !muted
  if (master) master.gain.value = muted ? 0 : 1
  if (muted) speechSynthesis?.cancel()
  try { localStorage.setItem('paper-kid-mute', muted ? '1' : '0') } catch { /* storage blocked */ }
}
export const isMuted = () => muted

// ---------------------------------------------------------------- voices

function tone(freq: number, dur: number, type: OscillatorType = 'square', vol = 0.06, slide = 0, delay = 0) {
  if (!ac || !master) return
  const t = ac.currentTime + delay, o = ac.createOscillator(), g = ac.createGain()
  o.type = type
  o.frequency.setValueAtTime(freq, t)
  if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur)
  g.gain.setValueAtTime(vol, t)
  g.gain.exponentialRampToValueAtTime(0.001, t + dur)
  o.connect(g).connect(master)
  o.start(t)
  o.stop(t + dur)
}

let noiseBuf: AudioBuffer | undefined
function noise(dur: number, vol: number, type: BiquadFilterType = 'highpass', freq = 0, t = ac?.currentTime ?? 0) {
  if (!ac || !master) return
  if (!noiseBuf) {
    noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate)
    const d = noiseBuf.getChannelData(0)
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
  }
  const src = ac.createBufferSource(), g = ac.createGain(), f = ac.createBiquadFilter()
  src.buffer = noiseBuf
  f.type = type
  f.frequency.value = freq
  g.gain.setValueAtTime(vol, t)
  g.gain.exponentialRampToValueAtTime(0.001, t + dur)
  src.connect(f).connect(g).connect(master)
  src.start(t, Math.random() * 0.5)
  src.stop(t + dur)
}

/** Two-operator FM note, in the spirit of the YM2151 the arcade board used. */
function fm(freq: number, t: number, dur: number, vol: number, ratio: number, index: number) {
  if (!ac || !master) return
  const car = ac.createOscillator(), mod = ac.createOscillator(), mg = ac.createGain(), g = ac.createGain()
  car.frequency.value = freq
  mod.frequency.value = freq * ratio
  mg.gain.setValueAtTime(freq * index, t)
  mg.gain.exponentialRampToValueAtTime(freq * index * 0.15 + 1, t + dur)
  mod.connect(mg).connect(car.frequency)
  g.gain.setValueAtTime(0.0001, t)
  g.gain.linearRampToValueAtTime(vol, t + 0.006)
  g.gain.exponentialRampToValueAtTime(0.001, t + dur)
  car.connect(g).connect(master)
  car.start(t)
  mod.start(t)
  car.stop(t + dur + 0.02)
  mod.stop(t + dur + 0.02)
}

export type Sfx = 'throw' | 'ding' | 'crash' | 'glass' | 'pickup' | 'smack' | 'jump' | 'bonus' | 'select' | 'bark'

export function sfx(name: Sfx) {
  switch (name) {
    case 'throw': return tone(500, 0.1, 'triangle', 0.06, 250)
    case 'ding': tone(880, 0.1); return tone(1320, 0.2, 'square', 0.06, 0, 0.08)
    case 'crash': noise(0.45, 0.35); return tone(160, 0.35, 'sawtooth', 0.08, 40)
    case 'glass': noise(0.3, 0.25, 'highpass', 3000); return tone(2400, 0.12, 'square', 0.03, 4200)
    case 'pickup': tone(520, 0.06); return tone(780, 0.1, 'square', 0.06, 0, 0.06)
    case 'smack': return noise(0.12, 0.3, 'highpass', 400)
    case 'jump': return tone(260, 0.25, 'square', 0.05, 720)
    case 'select': return tone(660, 0.05)
    case 'bark': tone(420, 0.08, 'sawtooth', 0.07, 240); return tone(380, 0.1, 'sawtooth', 0.07, 200, 0.14)
    case 'bonus': [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.12, 'square', 0.05, 0, i * 0.08))
  }
}

/** Spoken lines through the browser's speech synthesizer, pitched down for an arcade-robot feel. */
export function say(text: string) {
  if (muted || typeof speechSynthesis === 'undefined') return
  const u = new SpeechSynthesisUtterance(text)
  u.pitch = 0.3
  u.rate = 0.95
  u.volume = 0.9
  speechSynthesis.cancel()
  speechSynthesis.speak(u)
}

// ---------------------------------------------------------------- music

const SEMI: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }
const hz = (n: string) => {
  const m = /^([A-G])([#b]?)(\d)$/.exec(n)!
  const k = SEMI[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + (Number(m[3]) + 1) * 12
  return 440 * 2 ** ((k - 69) / 12)
}

// 16 bars of eighth notes; '-' holds, '.' rests. I–vi–IV–V verse, IV–V–iii–vi bridge.
const LEAD = [
  'E5 . G5 E5 C5 . D5 E5', '. C5 A4 . C5 E5 D5 C5', 'F5 . A5 F5 C5 . D5 F5', 'G5 - - D5 B4 - G4 .',
  'E5 . G5 E5 C6 . B5 A5', 'G5 - E5 . A5 G5 E5 C5', 'D5 . F5 A5 G5 F5 E5 D5', 'C5 - - . G4 . . .',
  'A5 . A5 G5 F5 . C5 .', 'B4 . D5 G5 - . F5 E5', 'E5 . G5 B5 - . G5 E5', 'A5 - - . E5 . C5 A4',
  'C6 . A5 F5 C5 . F5 A5', 'B5 . G5 D5 B4 . D5 G5', 'C6 - G5 E5 C5 E5 G5 C6', 'B5 - - . D5 . G4 .',
].map(bar => bar.split(' '))
const ROOTS = ['C2', 'A1', 'F1', 'G1', 'C2', 'A1', 'F1', 'G1', 'F1', 'G1', 'E2', 'A1', 'F1', 'G1', 'C2', 'G1'].map(hz)
const BASS = [0, null, 12, 0, null, 12, 7, 12]
const EIGHTH = 60 / 152 / 2

let playing = false, tempo = 1, step = 0, nextT = 0

export function music(mode: 'ride' | 'course' | null) {
  if (!mode) { playing = false; return }
  tempo = mode === 'course' ? 1.18 : 1
  if (playing || !ac) return
  playing = true
  step = 0
  nextT = ac.currentTime + 0.05
}

function tick() {
  if (!ac || !playing) return
  while (nextT < ac.currentTime + 0.12) {
    playStep(step, nextT)
    nextT += EIGHTH / 2 / tempo
    step = (step + 1) % (LEAD.length * 16)
  }
}

function playStep(i: number, t: number) {
  const bar = i >> 4, s16 = i & 15, e = EIGHTH / tempo
  if (s16 % 2 === 0) {
    const notes = LEAD[bar], k = s16 / 2, tok = notes[k]
    if (tok !== '.' && tok !== '-') {
      let len = 1
      while (notes[k + len] === '-') len++
      fm(hz(tok), t, len * e * 0.92, 0.045, 1, 2.2)
      fm(hz(tok) * 2.005, t, len * e * 0.6, 0.012, 3, 0.8)
    }
    const off = BASS[k]
    if (off !== null) fm(ROOTS[bar] * 2 ** (off / 12), t, e * 0.85, 0.11, 1, 3.5)
  }
  if (s16 === 0 || s16 === 8 || (s16 === 10 && bar % 2)) {
    const o = ac!.createOscillator(), g = ac!.createGain()
    o.frequency.setValueAtTime(130, t)
    o.frequency.exponentialRampToValueAtTime(40, t + 0.14)
    g.gain.setValueAtTime(0.25, t)
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.16)
    o.connect(g).connect(master!)
    o.start(t)
    o.stop(t + 0.17)
  }
  if (s16 === 4 || s16 === 12) noise(0.13, 0.16, 'bandpass', 1800, t)
  if (s16 % 2 === 0) noise(0.03, s16 % 4 ? 0.05 : 0.03, 'highpass', 7000, t)
}

const JINGLES: Record<string, [string, number][]> = {
  start: [['C5', 1], ['E5', 1], ['G5', 1], ['C6', 1], ['G5', 1], ['C6', 3]],
  day: [['G5', 1], ['A5', 1], ['B5', 1], ['C6', 2], ['B5', 1], ['C6', 3]],
  over: [['G4', 2], ['F#4', 2], ['F4', 2], ['E4', 5]],
  win: [['C5', 1], ['C5', 1], ['C5', 1], ['C6', 3], ['G5', 1], ['E5', 1], ['C6', 4]],
}

export function jingle(name: keyof typeof JINGLES) {
  if (!ac) return
  let t = ac.currentTime + 0.03
  for (const [n, len] of JINGLES[name]) {
    fm(hz(n), t, len * EIGHTH * 0.95, 0.06, 1, 2.2)
    fm(hz(n) / 2, t, len * EIGHTH * 0.9, 0.05, 1, 3)
    t += len * EIGHTH
  }
}
