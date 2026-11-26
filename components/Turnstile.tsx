'use client'
import { useEffect, useRef } from 'react'

// Cloudflare Turnstile bot check for the enquiry form. Without NEXT_PUBLIC_TURNSTILE_SITE_KEY it renders nothing and the form works as before
// (the server then skips the check too, see lib/turnstile.ts). "interaction-only" keeps the widget invisible unless Cloudflare needs the
// visitor to do something, so most people never see it. A token works once, so the form bumps `resetKey` after every attempt to get a new one.
type Api = { render: (el: HTMLElement, o: Record<string, unknown>) => string; reset: (id?: string) => void; remove: (id?: string) => void }
declare global { interface Window { turnstile?: Api } }

export const TURNSTILE_SITE_KEY = (process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || '').trim()
const SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
let loading: Promise<void> | null = null
function loadScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve()
  loading ??= new Promise<void>((ok, no) => {
    const s = document.createElement('script')
    s.src = SRC; s.async = true; s.defer = true
    s.onload = () => ok(); s.onerror = () => { loading = null; no(new Error('Turnstile did not load')) }
    document.head.appendChild(s)
  })
  return loading
}

export default function Turnstile({ onToken, resetKey = 0 }: { onToken: (token: string) => void; resetKey?: number }) {
  const box = useRef<HTMLDivElement>(null), widget = useRef<string | null>(null), first = useRef(true), cb = useRef(onToken)
  cb.current = onToken
  useEffect(() => {
    if (!TURNSTILE_SITE_KEY || !box.current) return
    let off = false
    loadScript().then(() => {
      if (off || !box.current || !window.turnstile) return
      widget.current = window.turnstile.render(box.current, {
        sitekey: TURNSTILE_SITE_KEY, action: 'lead', appearance: 'interaction-only', theme: 'light',
        callback: (t: string) => cb.current(t), 'expired-callback': () => cb.current(''), 'error-callback': () => cb.current(''),
      })
    }).catch(() => cb.current(''))
    return () => { off = true; if (widget.current && window.turnstile) { try { window.turnstile.remove(widget.current) } catch { /* already gone */ } widget.current = null } }
  }, [])
  useEffect(() => {
    if (first.current) { first.current = false; return }
    cb.current('')
    if (widget.current && window.turnstile) { try { window.turnstile.reset(widget.current) } catch { /* ignore */ } }
  }, [resetKey])
  if (!TURNSTILE_SITE_KEY) return null
  return <div ref={box} className="ch-viewing-wide" style={{ minHeight: 0 }} />
}
