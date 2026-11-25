'use client'
// Small background jobs the staff app runs about the device and the login (not about bookings): photo links, screen size, clock, idle sign-out.
import { useEffect, useRef, useState } from 'react'
import { signDressRows } from '@/lib/dressImages'
import { clockSkew, setClockOffset } from '@/lib/util'

/** Private photo links expire after an hour; renew them every 45 minutes while the app stays open. */
export function useSignedPhotoRefresh(sb: any, dresses: any[], setDresses: (rows: any[]) => void) {
  const latest = useRef<any[]>([])
  useEffect(() => {
    latest.current = dresses
  }, [dresses])
  useEffect(() => {
    let alive = true
    const timer = window.setInterval(
      () => {
        const rows = latest.current
        if (rows.length)
          void signDressRows(sb, rows, 3600)
            .then(next => {
              if (alive) setDresses(next)
            })
            .catch(() => {})
      },
      45 * 60 * 1000
    )
    return () => {
      alive = false
      window.clearInterval(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- set once per sign-in; setDresses is a state setter and never changes
  }, [sb])
}

/** True on a phone-sized screen (the same 860px the stylesheet switches layout at). */
export function useIsMobile(): boolean {
  const [mobile, setMobile] = useState(false)
  useEffect(() => {
    const m = window.matchMedia('(max-width: 860px)'),
      f = () => setMobile(m.matches)
    f()
    m.addEventListener('change', f)
    return () => m.removeEventListener('change', f)
  }, [])
  return mobile
}

/**
 * OP-6: use the server's clock for "today" and the hour. Measured at start-up and every 30 minutes; if the phone is more than 2 minutes off,
 * the app says so. `onSynced` runs after each successful measurement so the screens redraw with the corrected date. Returns the drift in minutes.
 */
export function useServerClock(onSynced: () => void): number {
  const [skewMin, setSkewMin] = useState(0)
  const synced = useRef(onSynced)
  synced.current = onSynced
  useEffect(() => {
    let live = true
    const sync = async () => {
      try {
        const t0 = Date.now(),
          r = await fetch('/api/time', { cache: 'no-store' }),
          t1 = Date.now()
        if (!r.ok) return
        const j = await r.json()
        if (!live || typeof j.now !== 'number') return
        setClockOffset(j.now - (t0 + t1) / 2)
        setSkewMin(Math.round(clockSkew() / 60000))
        synced.current()
      } catch {
        /* offline: keep the last offset */
      }
    }
    sync()
    const t = setInterval(sync, 30 * 60000)
    return () => {
      live = false
      clearInterval(t)
    }
  }, [])
  return skewMin
}

/** Sign out after a long idle period, so a shop computer or tablet left open does not stay logged in all night. */
export function useIdleSignOut(sb: any, idleMinutes = 60) {
  useEffect(() => {
    let last = Date.now()
    const bump = () => {
        last = Date.now()
      },
      evs = ['pointerdown', 'keydown', 'scroll', 'touchstart']
    evs.forEach(e => window.addEventListener(e, bump, { passive: true }))
    const t = setInterval(async () => {
      if (Date.now() - last > idleMinutes * 60000) {
        clearInterval(t)
        await sb.auth.signOut()
        window.location.replace('/login')
      }
    }, 30000)
    return () => {
      clearInterval(t)
      evs.forEach(e => window.removeEventListener(e, bump))
    }
  }, [sb, idleMinutes])
}
