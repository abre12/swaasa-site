# Fonts

The three typefaces the site uses, **bundled in the repo** so a build never has to download anything from Google (a build used to fail whenever
Google's font service answered unexpectedly). Files are the unmodified `.woff2` files from the open-source `@fontsource` packages (v5.3.0),
which are the same files Google Fonts serves.

| Family | Files here | Used for |
|---|---|---|
| Inter (latin + latin-ext, 400 500 600 700) | `inter-*` | staff app and most text. latin-ext holds the rupee sign |
| Cormorant Garamond (latin, 500 600) | `cormorant-garamond-*` | customer home page headings |
| Playfair Display (latin, 600 700) | `playfair-display-*` | staff page titles |

All three are licensed under the SIL Open Font License 1.1 (texts in `licenses/`), which allows bundling and self-hosting.
They are declared in `app/fonts.ts`. To change a weight, add the matching `.woff2` here and list it in that file.
