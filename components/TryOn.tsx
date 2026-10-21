'use client'
import { useState } from 'react'
// Shrinks the photo on the phone before upload: faster, cheaper, and better for privacy.
async function shrink(file: File, max = 1024): Promise<Blob> {
  const bmp = await createImageBitmap(file); const k = Math.min(1, max / Math.max(bmp.width, bmp.height))
  const c = document.createElement('canvas'); c.width = bmp.width * k; c.height = bmp.height * k
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height)
  return new Promise(r => c.toBlob(b => r(b!), 'image/jpeg', 0.88))
}
export default function TryOn({ dressId, hasImage }: { dressId: string; hasImage: boolean }) {
  const [blob, setBlob] = useState<Blob | null>(null); const [prev, setPrev] = useState(''); const [ok, setOk] = useState(false)
  const [out, setOut] = useState(''); const [err, setErr] = useState(''); const [wait, setWait] = useState(false)
  if (!hasImage) return null
  async function pick(f?: File) { if (!f) return; const b = await shrink(f); setBlob(b); setPrev(URL.createObjectURL(b)); setOut(''); setErr('') }
  async function go() {
    setWait(true); setErr(''); setOut('')
    const fd = new FormData(); fd.append('selfie', blob!, 'selfie.jpg'); fd.append('dressId', dressId); fd.append('consent', 'yes')
    const r = await fetch('/api/tryon', { method: 'POST', body: fd }); const j = await r.json().catch(() => ({})); setWait(false)
    if (j.image) setOut(j.image); else setErr(j.error || 'Something went wrong.')
  }
  return (<div className="box"><h3>Try it on</h3>
    <p className="mut" style={{ fontSize: 13 }}>Take a clear, front-facing, full-length photo in good light. You will see this dress on you in about 30 seconds.</p>
    <input type="file" accept="image/*" capture="user" onChange={e => pick(e.target.files?.[0])} />
    {prev && <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}><img src={prev} alt="Your photo" style={{ height: 260 }} />{out && <img src={out} alt="Dress preview on you" style={{ height: 260 }} />}</div>}
    {blob && <><label style={{ display: 'block', margin: '10px 0', fontSize: 13 }}><input type="checkbox" checked={ok} onChange={e => setOk(e.target.checked)} style={{ width: 'auto' }} /> I agree to my photo being sent to our virtual try-on provider to create this preview. It is not saved by Swaasa and is deleted after the preview is made.</label>
      <button className="btn" disabled={!ok || wait} onClick={go}>{wait ? 'Fitting the dress…' : 'See it on me'}</button></>}
    {err && <p className="bad">{err}</p>}
    {out && <p className="mut" style={{ fontSize: 12 }}>Preview only. Actual fit, colour and drape may differ. <a href={out} download="swaasa-tryon.png">Save image</a></p>}</div>)
}
