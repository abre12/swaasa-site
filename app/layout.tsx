import './globals.css'
import Link from 'next/link'
export const metadata = { title: 'Swaasa Wedding Rentals · Breathe your fashion', description: 'Bridal and occasion wear rentals in Trivandrum, Kerala.' }
export default function Root({ children }: { children: React.ReactNode }) {
  return (<html lang="en"><head><link rel="preconnect" href="https://fonts.googleapis.com" />
    <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600&family=Inter:wght@400;500&display=swap" rel="stylesheet" /></head>
    <body><header className="top"><Link href="/" className="brand"><img src="/logo-mark.png" alt="" />SWAASA</Link>
      <nav><Link href="/#collection">Collection</Link><Link href="/booking">My booking</Link><Link href="/admin">Staff</Link></nav></header>
      {children}
      <footer>© Swaasa Wedding Rentals, Trivandrum · <a href="https://www.instagram.com/swaasa_rentals/" target="_blank" rel="noopener">Instagram</a> · {process.env.STORE_PHONE}</footer></body></html>)
}
