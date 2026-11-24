import { useEffect, useRef, type RefObject } from 'react'

// CH-7: a dialog should (1) put the cursor in it when it opens, (2) keep Tab inside it, (3) close on Escape and
// (4) give the cursor back to the button that opened it. `dep` changes whenever a (new) dialog opens; falsy means closed.
export function useDialogFocus(ref: RefObject<HTMLElement | null>, dep: unknown, onEscape: () => void) {
  const esc = useRef(onEscape); esc.current = onEscape
  useEffect(() => {
    const el = ref.current; if (!dep || !el) return
    const opener = document.activeElement as HTMLElement | null
    const focusables = () => Array.from(el.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input:not([disabled]):not([type=hidden]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')).filter(x => x.offsetParent !== null)
    const first = el.querySelector<HTMLElement>('input:not([type=hidden]):not([type=file]),select,textarea') || focusables()[0]
    first?.focus()
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); esc.current(); return }
      if (e.key !== 'Tab') return
      const f = focusables(); if (!f.length) return
      const a = f[0], z = f[f.length - 1]
      if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus() } else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus() }
    }
    el.addEventListener('keydown', key)
    return () => { el.removeEventListener('keydown', key); if (opener && document.contains(opener)) opener.focus() }
  }, [dep, ref])
}
