import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'

// The fonts are bundled in the repo (app/fonts) and served by the site itself. Nothing is fetched from Google, neither by a visitor's browser
// nor by the build (a build used to fail whenever Google's font service answered unexpectedly).
const css = readFileSync('app/globals.css', 'utf8')
const layout = readFileSync('app/layout.tsx', 'utf8')
const fonts = readFileSync('app/fonts.ts', 'utf8')

describe('self-hosted fonts', () => {
  it('nothing loads from Google, in the page or in the build', () => {
    expect(layout).not.toMatch(/fonts\.googleapis\.com|fonts\.gstatic\.com/)
    expect(css).not.toMatch(/fonts\.googleapis\.com|@import/)
    expect(fonts).not.toMatch(/next\/font\/google/)
    expect(fonts).toMatch(/from 'next\/font\/local'/)
  })
  it('every font file named in app/fonts.ts is in the repo', () => {
    const paths = [...fonts.matchAll(/path: '\.\/(fonts\/[^']+\.woff2)'/g)].map(m => 'app/' + m[1])
    expect(paths).toHaveLength(12)
    for (const p of paths) expect(existsSync(p), p).toBe(true)
  })
  it('keeps every weight the site uses, and the licences are shipped with the fonts', () => {
    const has = (file: string) => expect(fonts).toContain(`./fonts/${file}.woff2`)
    for (const w of [500, 600]) has(`cormorant-garamond-latin-${w}-normal`)
    for (const w of [400, 500, 600, 700]) { has(`inter-latin-${w}-normal`); has(`inter-latin-ext-${w}-normal`) }
    for (const w of [600, 700]) has(`playfair-display-latin-${w}-normal`)
    for (const l of ['Inter-OFL', 'CormorantGaramond-OFL', 'PlayfairDisplay-OFL']) expect(existsSync(`app/fonts/licenses/${l}.txt`), l).toBe(true)
  })
  it('the rupee sign (U+20B9) is covered: it sits in the latin-ext range, which has its own Inter file', () => {
    const ext = fonts.match(/inter-latin-ext-400[\s\S]*?unicode-range', value: '([^']+)'/)![1]
    expect(ext).toContain('U+20AD-20C0')   // 20AD to 20C0 includes 20B9
    expect(fonts).toMatch(/--font-inter-ext/)
  })
  it('the layout applies all the font variables to <html>', () => {
    expect(layout).toMatch(/<html lang="en" className=\{fontVariables\}/)
    for (const v of ['--font-cormorant', '--font-inter-latin', '--font-inter-ext', '--font-playfair']) expect(fonts).toContain(`'${v}'`)
  })
  it('the stylesheet reads the fonts through variables, never by their family names, and joins Inter\'s two files', () => {
    expect(css).not.toMatch(/"Cormorant Garamond"|"Playfair Display"/)
    expect(css).not.toMatch(/(?<![\w-])Inter(?![\w-])/)
    for (const v of ['--font-cormorant', '--font-inter', '--font-playfair']) expect(css).toContain(`var(${v})`)
    expect(css).toContain('html{--font-inter:var(--font-inter-latin),var(--font-inter-ext)}')
  })
})
