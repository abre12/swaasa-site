import localFont from 'next/font/local'

// The three typefaces the site uses, served from the site's own address. The font files are in app/fonts/ (see the README there):
// nothing is downloaded from Google when the site is built, so a build can no longer fail because of Google's font service.
// Each face gets a size-matched stand-in while it loads (no jump in the layout), worked out by Next from the font file itself.
//  - Inter has a latin file and a latin-ext file. latin-ext is where the rupee sign lives. Each is limited to its own character range
//    (the same ranges Google uses), so the browser fetches the extra file only when a page really uses one of those characters.
//    The two are joined into one family name by `--font-inter` in globals.css.
// Next requires every value below to be written out literally (no helper functions or shared constants), so the repetition is on purpose.

export const cormorant = localFont({
  src: [
    { path: './fonts/cormorant-garamond-latin-500-normal.woff2', weight: '500', style: 'normal' },
    { path: './fonts/cormorant-garamond-latin-600-normal.woff2', weight: '600', style: 'normal' },
  ],
  display: 'swap',
  variable: '--font-cormorant',
  adjustFontFallback: 'Times New Roman',
})
export const interLatin = localFont({
  src: [
    { path: './fonts/inter-latin-400-normal.woff2', weight: '400', style: 'normal' },
    { path: './fonts/inter-latin-500-normal.woff2', weight: '500', style: 'normal' },
    { path: './fonts/inter-latin-600-normal.woff2', weight: '600', style: 'normal' },
    { path: './fonts/inter-latin-700-normal.woff2', weight: '700', style: 'normal' },
  ],
  declarations: [{ prop: 'unicode-range', value: 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD' }],
  display: 'swap',
  variable: '--font-inter-latin',
  adjustFontFallback: 'Arial',
})
export const interLatinExt = localFont({
  src: [
    { path: './fonts/inter-latin-ext-400-normal.woff2', weight: '400', style: 'normal' },
    { path: './fonts/inter-latin-ext-500-normal.woff2', weight: '500', style: 'normal' },
    { path: './fonts/inter-latin-ext-600-normal.woff2', weight: '600', style: 'normal' },
    { path: './fonts/inter-latin-ext-700-normal.woff2', weight: '700', style: 'normal' },
  ],
  declarations: [{ prop: 'unicode-range', value: 'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF' }],
  display: 'swap',
  variable: '--font-inter-ext',
  adjustFontFallback: false,
  preload: false,
})
export const playfair = localFont({
  src: [
    { path: './fonts/playfair-display-latin-600-normal.woff2', weight: '600', style: 'normal' },
    { path: './fonts/playfair-display-latin-700-normal.woff2', weight: '700', style: 'normal' },
  ],
  display: 'swap',
  variable: '--font-playfair',
  adjustFontFallback: 'Times New Roman',
})
export const fontVariables = `${cormorant.variable} ${interLatin.variable} ${interLatinExt.variable} ${playfair.variable}`
