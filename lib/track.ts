// Sends a named event to Vercel Analytics, if it is loaded. Never throws, never sends anything typed by the visitor.
export function trackEvent(name: string, data?: Record<string, string | number | boolean>): void {
  try { (window as unknown as { va?: (a: string, b: unknown) => void }).va?.('event', { name, ...(data ? { data } : {}) }) } catch { /* analytics must never break the page */ }
}
