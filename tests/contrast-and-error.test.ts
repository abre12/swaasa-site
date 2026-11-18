import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

// Audit M7 guard: the small admin text colours must keep meeting the WCAG AA ratio (4.5:1), and no text may go below 12 px.
const css = readFileSync('app/globals.css', 'utf8')

function lum(hex: string) {
  const h = hex.replace('#', '')
  const [r, g, b] = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255).map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const ratio = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05) }
const rootBlocks = css.match(/:root\{[^}]*\}/g) || []
const light = rootBlocks[0]!, dark = rootBlocks[1]!
const pick = (block: string, name: string) => (block.match(new RegExp(`--${name}:(#[0-9a-fA-F]{6})`)) || [])[1]

describe('colour contrast (audit M7)', () => {
  for (const [label, block] of [['light', light], ['dark', dark]] as const) {
    const bgs = ['bg', 'card', 'blush'].map(n => [n, pick(block, n)] as const)
    for (const name of ['mut', 'gold']) {
      it(`${label} --${name} is at least 4.5:1 on every surface`, () => {
        const fg = pick(block, name)
        for (const [n, bg] of bgs) expect(ratio(fg, bg), `${name} on ${n}`).toBeGreaterThanOrEqual(4.5)
      })
    }
  }
  it('no text is set below 12px', () => {
    expect(css.match(/font-size:\s*(?<![\d.])(?:[0-9]|1[01])(?:\.\d+)?px/g) || []).toEqual([])
    expect(css.match(/font:\s*[^;}]*?(?<![\d.])(?:[0-9]|1[01])(?:\.\d+)?px/g) || []).toEqual([])
  })
})

// Audit M6 guard: the public error page must not use staff wording or send customers to the admin login.
describe('public error page (audit M6)', () => {
  for (const file of ['app/error.tsx', 'app/global-error.tsx']) {
    it(`${file} is written for customers`, () => {
      const src = readFileSync(file, 'utf8')
      expect(src).not.toMatch(/owner/i)
      expect(src).not.toMatch(/\/admin/)
      expect(src).toMatch(/href="\/"/)
    })
  }
})
