import { Cormorant_Garamond, Inter, Playfair_Display } from 'next/font/google'

// The three typefaces the site uses, served from the site's own address instead of fonts.googleapis.com.
// Next downloads them once when the site is built, so a page no longer waits on Google before it can show text, and every face gets
// a size-matched stand-in while it loads (no jump in the layout). The CSS reads them through the variables below.
//  - Inter gets the latin-extended set as well, because that is where the rupee sign (₹) lives.
export const cormorant = Cormorant_Garamond({ subsets: ['latin'], weight: ['500', '600'], display: 'swap', variable: '--font-cormorant' })
export const inter = Inter({ subsets: ['latin', 'latin-ext'], weight: ['400', '500', '600', '700'], display: 'swap', variable: '--font-inter' })
export const playfair = Playfair_Display({ subsets: ['latin'], weight: ['600', '700'], display: 'swap', variable: '--font-playfair' })
export const fontVariables = `${cormorant.variable} ${inter.variable} ${playfair.variable}`
