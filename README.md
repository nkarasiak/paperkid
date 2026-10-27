# Paper Kid

I deliver your paper. I also break your windows. 🗞️🚲

Seven days, one street, one bike. Subscribers get their paper on the porch. Everyone else gets it through the window. I fit in one file, `paperkid.html` (about 25 KB), with no images, no sound files and no libraries. Ride with me at https://nkarasiak.github.io/paperkid/, or open the file in any modern browser.

## Riding with me

| Key | What I do |
| --- | --- |
| Arrows / WASD | Steer left and right, pedal faster or brake |
| Space / J | Throw a paper (always to the left); confirm on menus |
| Enter | Start |
| P / M | Pause / mute |
| C | Roll the credits, from the title screen |

I take a gamepad too (stick or d-pad, any face button).

**On a phone or tablet**, turn it sideways. Hold it upright and I stop and ask you to turn it, so I don't ride into a car while you do. The controls sit in the dark margins, out of my way:

| Touch | What I do |
| --- | --- |
| Pixel d-pad, left | Steer and change speed; diagonals work |
| THROW paper, right | Throw a paper |
| Tap the game | Start, confirm, or throw |
| II / ♪, top right | Pause / mute |

The credits still need the C key, so you can't roll them on a touch screen yet.

### My route

- **Three streets**: Easy Street (score ×1), Middle Road (×2) and Hard Way (×3). Each has its own houses, characters and hazards.
- **Options** on the street screen: lives, bonus-life score, difficulty.
- **My customers** live in the bright houses. Hit their mailbox (250) or their porch or door (100). Break their windows and they cancel.
- **Everyone else** lives in the dark houses. Their windows, mailboxes, lamps and statues are fair game for bonus points. Their dogs and cats come after me.
- **Every day** brings more traffic and more trouble. A perfect day wins a lost customer back. Lose them all and I'm fired. Make it through Sunday and I win.
- **After each day's ride** I hit the training course against the clock: targets, ramps, water jumps.

## How I'm made

Plain TypeScript and the browser's own APIs, with no runtime dependencies.

| File | What it does |
| --- | --- |
| `src/main.ts` | Canvas setup, pixel-perfect scaling, fixed 60 Hz game loop, pause |
| `src/game.ts` | Screen flow (title, street select, route map, ride, course, results, game over, credits), scoring, high score |
| `src/street.ts` | Street and course layouts from a seeded random generator, so every run of a street is the same |
| `src/ride.ts` | One day's ride: bike physics, papers, characters, collisions, deliveries and damage |
| `src/render.ts` | Draws the world in oblique projection, depth-sorted, plus the HUD |
| `src/pix.ts` | A tiny software rasterizer that turns 3D shapes into outlined pixel-art sprites |
| `src/sprites.ts` | Every piece of art (houses, me, cars, dogs, people, props) described as boxes, lines, discs and rings |
| `src/audio.ts` | Synthesized sound effects, an FM chiptune and spoken lines |
| `src/io.ts` | Keyboard, gamepad and touch input (the on-screen controls are built here) |

**My street.** The street is a 3D space: `s` runs along the street, `l` across it (0 at the back of the houses, growing toward the road), `z` up. The screen position is `x = 0.7·s + l`, `y = −s − z`, an oblique view like the 1980s home ports, drawn at 2× zoom. Objects are painted far-to-near each frame.

**My looks.** Nothing is loaded from files. Each sprite is described as 3D shapes with colors, or color functions for siding, shingles, bricks and leaves. On first use, `pix.ts` rasterizes it into a buffer, adds a dark outline, crops it into a small canvas and caches it. Ground textures are generated speckle patterns.

**My bike.** My speeds, steering, paper throw and crash timing were measured on the Atari ST port and converted to 60 Hz ticks (three fixed speeds: 0.42, 0.83 and 1.67 units per tick). Enemy speeds and point values are tuned guesses.

**My voice.** Everything is generated with the Web Audio API: square and noise effects, a two-operator FM chiptune (an original 16-bar tune) with kick, snare and hi-hat, and arcade-style voice lines from the browser's speech synthesizer. I remember if you muted me.

## Building me

```sh
npm install
npm run dev     # live dev server (open the printed URL; add ?sprites to see every sprite)
npm run check   # type-check
npm run build   # rebuilds paperkid.html
```

`npm run build` runs `src/pack.mjs`:

1. **Vite** bundles and minifies the TypeScript into one script (about 54 KB).
2. **Roadroller** compresses it into a self-decoding script (about 25 KB). Set `RR_LEVEL=2` for a longer search that saves only a few bytes.
3. That script is inlined into a minimal HTML page with a 🗞️ favicon (an inline SVG), so the result is one standalone file.

**Publishing.** `.github/workflows/pages.yml` publishes `paperkid.html` as the site's `index.html` on every push to `main`. It skips itself while the repository is private.

## Credits

Directed by Nicolas Karasiak, code by Claude. I'm after the original Paperboy (Atari Games, 1984), designed by John Salwitz and Dave Ralston with music by Hal Canon and Earl Vickers; all my art, music and code are original.
