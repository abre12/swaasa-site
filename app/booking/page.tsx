import Link from 'next/link'
import CustomerBookingTracker from '@/components/CustomerBookingTracker'

export const metadata = {
  title: 'Track your Swaasa booking',
  robots: { index: false, follow: false },
}

export default function BookingLookup() {
  return <main className="customer-home">
    <div className="ch-shell">
      <header className="ch-nav">
        <Link className="ch-brand" href="/" aria-label="Swaasa Wedding Rentals home">
          <img src="/logo-mark.png" alt="" />
          <span><b>Swaasa</b><small>Wedding Rentals</small></span>
        </Link>
        <nav aria-label="Main navigation"><Link className="ch-nav-cta" href="/">Back to Swaasa <span aria-hidden="true">↗</span></Link></nav>
      </header>
      <CustomerBookingTracker />
    </div>
  </main>
}
