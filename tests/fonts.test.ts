import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

// The fonts are served by the site itself (next/font), not fetched from Google by every visitor's browser.
const css = readFileSync('app/globals.css', 'utf8')
const layout = readFileSync('app/layout.tsx', 'utf8')
const fonts = readFileSync('app/fonts.ts', 'utf8')

describe('self-hosted fonts', () => {
  it('the page no longer loads a stylesheet from fonts.googleapis.com', () => {
    expect(layout).not.toMatch(/fonts\.googleapis\.com|fonts\.gstatic\.com/)
    expect(css).not.toMatch(/fonts\.googleapis\.com|@import/)
  })
  it('the layout applies the three font variables to <html>', () => {
    expect(layout).toMatch(/<html lang="en" className=\{fontVariables\}/)
    for (const v of ['--font-cormorant', '--font-inter', '--font-playfair']) expect(fonts).toContain(`'${v}'`)
  })
  it('the stylesheet reads the fonts through those variables, never by their old names', () => {
    expect(css).not.toMatch(/"Cormorant Garamond"|"Playfair Display"/)
    expect(css).not.toMatch(/(?<![\w-])Inter(?![\w-])/)
    for (const v of ['--font-cormorant', '--font-inter', '--font-playfair']) expect(css).toContain(`var(${v})`)
  })
  it('keeps every weight the old link loaded, and the rupee sign set for Inter', () => {
    expect(fonts).toMatch(/Cormorant_Garamond\(\{[^}]*weight: \['500', '600'\]/)
    expect(fonts).toMatch(/Inter\(\{[^}]*subsets: \['latin', 'latin-ext'\][^}]*weight: \['400', '500', '600', '700'\]/)
    expect(fonts).toMatch(/Playfair_Display\(\{[^}]*weight: \['600', '700'\]/)
  })
})
