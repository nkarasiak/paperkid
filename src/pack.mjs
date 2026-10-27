// Builds the whole game into one standalone HTML file, paperkid.html: Vite bundles and minifies,
// Roadroller compresses the JS into a self-decoding script.
import { build } from 'vite'
import { Packer } from 'roadroller'
import { writeFileSync } from 'node:fs'

const out = await build({ root: 'src', logLevel: 'warn', build: { write: false, modulePreload: { polyfill: false } } })
const js = [out].flat()[0].output.find(f => f.type === 'chunk').code
const packer = new Packer([{ data: js, type: 'js', action: 'eval' }])
await packer.optimize(Number(process.env.RR_LEVEL ?? 1)) // 2 searches longer for a few more bytes
const { firstLine, secondLine } = packer.makeDecoder()
const code = firstLine + secondLine
if (/<\/script/i.test(code)) throw Error('packed code contains </script')
const icon = `data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><text y='27' font-size='28'>%F0%9F%97%9E%EF%B8%8F</text></svg>` // 🗞️
const html = `<!doctype html><meta name=viewport content="width=device-width,initial-scale=1"><title>Paper Kid</title><link rel=icon href="${icon}"><style>body{margin:0;height:100dvh;background:#111;display:grid;place-items:center}canvas{image-rendering:pixelated}</style><canvas width=512 height=384></canvas><script>${code}</script>`
writeFileSync('paperkid.html', html)
console.log(`paperkid.html ${html.length} bytes (minified JS ${js.length})`)
