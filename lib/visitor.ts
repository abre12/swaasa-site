import { createHmac } from 'crypto'

// A keyed hash of the visitor's IP address. The database limiters store this, never the address itself, so a leaked table reveals no IPs.
export function visitorIp(request: Request): string {
  return request.headers.get('x-vercel-forwarded-for')?.split(',')[0].trim()
    || request.headers.get('x-forwarded-for')?.split(',')[0].trim()
    || 'unknown'
}
export const visitorHash = (ip: string, key: string): string => createHmac('sha256', key).update(ip).digest('hex')
