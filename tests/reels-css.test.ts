import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

// Regression guard: the dots' enlarged tap area (an absolutely positioned ::before) must only apply to the
// dot buttons. On phones the prev/next arrows live inside .cl-dots too; if the rule matches them, their
// un-positioned ::before stretches over the whole reels section and swallows every tap and swipe.
describe('reels carousel css', () => {
  const css = readFileSync('app/globals.css', 'utf8')
  it('scopes the dots tap-target pseudo-element to direct child buttons only', () => {
    expect(css).not.toMatch(/\.cl-dots\s+button\s*:{1,2}before/)
    expect(css).toMatch(/\.cl-dots>button:before\{[^}]*position:absolute/)
  })
})
