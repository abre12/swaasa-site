import Script from 'next/script'

// Privacy-friendly visitor counts and speed data: Vercel Web Analytics and Speed Insights. They set no cookies and keep no personal data, so no cookie
// banner is needed. The scripts come from this site's own address (/_vercel/...), which is why the Content-Security-Policy needs nothing extra.
// Turn them on once in Vercel > the project > Analytics (and Speed Insights). Until then the script address simply does not exist and nothing happens.
// Only the public pages include this component, so staff screens and the staff's own visits never reach the numbers.
// Custom events (the enquiry-sent event below) are, as far as I know, a paid-plan feature of Vercel Analytics; without it they are ignored.
// The number of enquiries is always available in the database (the leads table), whatever the plan.
export default function Analytics() {
  if (process.env.VERCEL !== '1') return null          // local development and CI builds: nothing to load
  return <>
    <Script id="va-init" strategy="afterInteractive">{'window.va=window.va||function(){(window.vaq=window.vaq||[]).push(arguments)};'}</Script>
    <Script id="va" src="/_vercel/insights/script.js" strategy="afterInteractive" data-sdkn="swaasa-site" />
    <Script id="si-init" strategy="afterInteractive">{'window.si=window.si||function(){(window.siq=window.siq||[]).push(arguments)};'}</Script>
    <Script id="si" src="/_vercel/speed-insights/script.js" strategy="afterInteractive" data-sdkn="swaasa-site" />
  </>
}
