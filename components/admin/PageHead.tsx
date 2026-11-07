import { Ic } from './icons'

// One page header for every admin module: icon tile, title, one-line description and (optionally) the page's main actions on the right.
// On phones the top app bar already shows the page name, so only the description and actions are repeated there.
export default function PageHead({ icon, title, sub, badge, children }: { icon: string; title: string; sub?: string; badge?: React.ReactNode; children?: React.ReactNode }) {
  return <header className="ph">
    <span className="ph-ic" aria-hidden="true"><Ic n={icon} s={26} /></span>
    <div className="ph-t"><h1>{title}{badge}</h1>{sub && <p>{sub}</p>}</div>
    {children && <div className="ph-act">{children}</div>}
  </header>
}
