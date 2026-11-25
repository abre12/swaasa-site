// A stand-in for the browser's Supabase client, for screen tests: every table is empty, every call succeeds, nothing touches the network.
// Any method not listed returns the stand-in itself, so a chain such as .from('x').select('*').or(...).order(...).limit(5) works and can be awaited.
export function fakeSupabase(overrides: { settings?: Record<string, unknown> } = {}): any {
  const settings = { advance_pct: 50, advance_min: 1000, tailor_days: 3, buffer_days: 1, ...(overrides.settings ?? {}) }
  const make = (table = ''): any => new Proxy(function () {}, {
    get: (_t, prop: string) => {
      if (prop === 'then') return (done: (v: unknown) => unknown) => done({ data: [], error: null, count: 0 })
      if (prop === 'single' || prop === 'maybeSingle') return async () => ({ data: table === 'settings' ? settings : null, error: null })
      if (prop === 'from') return (t: string) => make(t)
      if (prop === 'auth') return { getUser: async () => ({ data: { user: { id: 'u1', email: 'owner@swaasa.test', app_metadata: {} } } }), signOut: async () => ({}),
        mfa: { getAuthenticatorAssuranceLevel: async () => ({ data: { currentLevel: 'aal2', nextLevel: 'aal2' } }), listFactors: async () => ({ data: { totp: [] } }) } }
      if (prop === 'channel') return () => { const c: any = { on: () => c, subscribe: () => c, unsubscribe: () => {} }; return c }
      if (prop === 'removeChannel') return async () => {}
      if (prop === 'rpc') return async () => ({ data: null, error: null })
      if (prop === 'storage') return { from: () => ({ createSignedUrls: async () => ({ data: [], error: null }), createSignedUrl: async () => ({ data: null, error: null }), upload: async () => ({ error: null }), remove: async () => ({ error: null }) }) }
      return () => make(table)
    },
    apply: () => make(table),
  })
  return make()
}

/** Browser features jsdom does not have, as harmless stand-ins. Call once at the top of a screen test. */
export function stubBrowser() {
  window.matchMedia = ((q: string) => ({ matches: false, media: q, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false })) as any
  ;(globalThis as any).IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} takeRecords() { return [] } }
  ;(globalThis as any).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} }
  window.scrollTo = (() => {}) as any
  ;(Element.prototype as any).scrollIntoView = () => {}
  globalThis.fetch = (async (url: string) => String(url).includes('/api/time') ? new Response(JSON.stringify({ now: Date.now() })) : new Response('{}', { status: 200 })) as any
}
