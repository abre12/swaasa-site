'use client'

import { useEffect, useState } from 'react'
import { Ic } from './icons'

const BUCKET = 'customer-story-images'
const COLUMNS = 'id, customer_name, quote, image_urls, image_alts, storage_paths, sort_order, is_published, show_in_gallery'
const MAX_BYTES = 12 * 1024 * 1024
type StoryPhoto = { localKey: string; image_url: string; alt_text: string; storage_path: string | null; file: File | null }
type Story = {
  id: string | null; localKey: string; customer_name: string; quote: string; photos: StoryPhoto[];
  originalStoragePaths: string[]; sort_order: number; is_published: boolean; show_in_gallery: boolean
}

function PhotoPreview({ photo, busy, onAlt, onRemove }: { photo: StoryPhoto; busy: boolean; onAlt: (alt_text: string) => void; onRemove: () => void }) {
  const [src, setSrc] = useState(photo.image_url)
  useEffect(() => {
    if (!photo.file) { setSrc(photo.image_url); return }
    const url = URL.createObjectURL(photo.file)
    setSrc(url)
    return () => URL.revokeObjectURL(url)
  }, [photo.file, photo.image_url])
  return <div className="stg-story-photo">
    {src ? <img src={src} alt="" /> : <div className="stg-story-photo-empty">Photo pending upload</div>}
    <label className="stg-f"><span className="stg-l">Image description</span><input disabled={busy} value={photo.alt_text} maxLength={180} onChange={e => onAlt(e.target.value)} placeholder="Describe the photo" /></label>
    <button className="btn alt sm" type="button" disabled={busy} onClick={onRemove}>Remove photo</button>
  </div>
}

function key() { return `story-${crypto.randomUUID()}` }

export default function CustomerStoriesSettings({ ctx }: { ctx: any }) {
  const [items, setItems] = useState<Story[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let current = true
    ctx.sb.from('site_customer_stories').select(COLUMNS).order('sort_order').order('created_at').then(({ data, error }: any) => {
      if (!current) return
      setLoading(false)
      if (error) { setError(`Could not load customer stories: ${error.message}`); return }
      setError('')
      setItems((data ?? []).map((row: any) => ({
        id: row.id, localKey: row.id, customer_name: row.customer_name, quote: row.quote,
        photos: (row.image_urls ?? []).map((image_url: string, i: number) => ({
          localKey: `${row.id}-photo-${i}`, image_url, alt_text: row.image_alts?.[i] ?? '', storage_path: row.storage_paths?.[i] || null, file: null,
        })),
        originalStoragePaths: (row.storage_paths ?? []).filter(Boolean),
        sort_order: row.sort_order, is_published: row.is_published, show_in_gallery: row.show_in_gallery,
      })))
    }, (reason: unknown) => {
      if (!current) return
      setLoading(false)
      setError(`Could not load customer stories: ${reason instanceof Error ? reason.message : 'Please try again.'}`)
    })
    return () => { current = false }
  }, [ctx.sb])

  function edit(localKey: string, update: Partial<Story>) {
    setItems(rows => rows.map(row => row.localKey === localKey ? { ...row, ...update } : row))
  }

  function add() {
    const localKey = key()
    setItems(rows => [...rows, { id: null, localKey, customer_name: '', quote: '', photos: [], originalStoragePaths: [], sort_order: Math.max(0, ...rows.map(row => row.sort_order)) + 10, is_published: true, show_in_gallery: true }])
    setError('')
  }

  function addPhotos(item: Story, files: FileList | null) {
    const selected = Array.from(files ?? [])
    const invalid = selected.find(file => !['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > MAX_BYTES)
    if (invalid) {
      setError(invalid.size > MAX_BYTES ? 'Each photo must be smaller than 12 MB.' : 'Choose PNG, JPG or WebP photos.')
      return
    }
    setError('')
    const additions = selected.map(file => ({ localKey: key(), image_url: '', alt_text: '', storage_path: null, file }))
    edit(item.localKey, { photos: [...item.photos, ...additions] })
  }

  async function save(item: Story) {
    const customer_name = item.customer_name.trim()
    const quote = item.quote.trim()
    if (customer_name.length > 120 || quote.length > 4000) { setError('Names are limited to 120 characters and stories to 4,000 characters.'); return }
    if (quote && !customer_name) { setError('Add a customer name for a story with a review.'); return }
    if (!quote && !item.photos.length) { setError('Add a review or at least one photo.'); return }
    if (item.photos.some(photo => photo.alt_text.trim().length < 5 || photo.alt_text.trim().length > 180)) { setError('Give every photo a description between 5 and 180 characters.'); return }

    setBusy(item.localKey)
    setError('')
    const uploadedPaths: string[] = []
    let savedToDatabase = false
    try {
      const photos: StoryPhoto[] = []
      for (const photo of item.photos) {
        if (!photo.file) { photos.push(photo); continue }
        const ext = photo.file.type === 'image/jpeg' ? 'jpg' : photo.file.type === 'image/webp' ? 'webp' : 'png'
        const path = `${crypto.randomUUID()}.${ext}`
        const { error: uploadError } = await ctx.sb.storage.from(BUCKET).upload(path, photo.file, { cacheControl: '31536000', contentType: photo.file.type, upsert: false })
        if (uploadError) throw new Error(uploadError.message)
        uploadedPaths.push(path)
        photos.push({ ...photo, image_url: ctx.sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl, storage_path: path, file: null })
      }
      const values = {
        customer_name, quote,
        image_urls: photos.map(photo => photo.image_url),
        image_alts: photos.map(photo => photo.alt_text.trim()),
        storage_paths: photos.map(photo => photo.storage_path ?? ''),
        sort_order: Number.isFinite(+item.sort_order) ? +item.sort_order : 0,
        is_published: item.is_published,
        show_in_gallery: item.show_in_gallery,
      }
      const result = item.id
        ? await ctx.sb.from('site_customer_stories').update(values).eq('id', item.id).select(COLUMNS).single()
        : await ctx.sb.from('site_customer_stories').insert(values).select(COLUMNS).single()
      if (result.error) throw new Error(result.error.message)
      savedToDatabase = true
      const saved = result.data
      const savedPaths = new Set((saved.storage_paths ?? []).filter(Boolean))
      const removedPaths = item.originalStoragePaths.filter(path => !savedPaths.has(path))
      setItems(rows => rows.map(row => row.localKey === item.localKey ? {
        id: saved.id, localKey: saved.id, customer_name: saved.customer_name, quote: saved.quote,
        photos: (saved.image_urls ?? []).map((image_url: string, i: number) => ({
          localKey: `${saved.id}-photo-${i}-${Date.now()}`, image_url, alt_text: saved.image_alts?.[i] ?? '', storage_path: saved.storage_paths?.[i] || null, file: null,
        })),
        originalStoragePaths: (saved.storage_paths ?? []).filter(Boolean),
        sort_order: saved.sort_order, is_published: saved.is_published, show_in_gallery: saved.show_in_gallery,
      } : row))
      ctx.say('Customer story saved')
      const cleanupPaths = [...new Set([...removedPaths])]
      if (cleanupPaths.length) {
        const { error: cleanupError } = await ctx.sb.storage.from(BUCKET).remove(cleanupPaths)
        if (cleanupError) setError(`Saved, but a removed photo could not be cleared from storage: ${cleanupError.message}`)
      }
    } catch (reason) {
      if (!savedToDatabase && uploadedPaths.length) { try { await ctx.sb.storage.from(BUCKET).remove(uploadedPaths) } catch {} }
      setError(`Could not save this story: ${reason instanceof Error ? reason.message : 'Please try again.'}`)
      ctx.say('Customer story could not be saved')
    } finally { setBusy(null) }
  }

  async function remove(item: Story) {
    if (item.id && !window.confirm(`Delete ${item.customer_name || 'this photo-only entry'} from Customer Stories?`)) return
    setBusy(item.localKey)
    setError('')
    if (item.id) {
      const { error: deleteError } = await ctx.sb.from('site_customer_stories').delete().eq('id', item.id)
      if (deleteError) { setBusy(null); setError(`Could not delete this story: ${deleteError.message}`); return }
      const paths = item.originalStoragePaths
      if (paths.length) {
        const { error: cleanupError } = await ctx.sb.storage.from(BUCKET).remove(paths)
        if (cleanupError) setError(`Story deleted, but a stored photo could not be removed: ${cleanupError.message}`)
      }
    }
    setItems(rows => rows.filter(row => row.localKey !== item.localKey))
    setBusy(null)
    ctx.say(item.id ? 'Customer story deleted' : 'New story discarded')
  }

  return <div className="stg-stories">
    <div className="stg-stories-intro"><div><h3 className="stg-gh">Customer stories and photo gallery</h3><p className="stg-gd">Add a customer name and review for a story card, or leave both blank for a photo-only gallery entry. Add several images to make them swipeable together.</p></div>
      <button className="btn" type="button" onClick={add} disabled={loading}><Ic n="plus" s={17} /> Add story</button>
    </div>
    {error && <p className="stg-stories-error" role="alert">{error}</p>}
    {loading ? <p className="mut" style={{ margin: 0 }}>Loading customer stories…</p> : items.length === 0
      ? <div className="stg-stories-empty"><Ic n="camera" s={24} /><p>No customer stories yet. Add one with a review, photos, or both.</p></div>
      : <div className="stg-stories-list">{items.map((item, index) => <article className="stg-story-card" key={item.localKey}>
        <div className="stg-story-top"><b>Story {index + 1}{!item.id && <span className="stg-homeimage-new">New</span>}</b><button className="btn alt sm" type="button" disabled={busy !== null} onClick={() => void remove(item)}><Ic n="xc" s={15} /> Delete</button></div>
        <div className="stg-story-fields">
          <label className="stg-f"><span className="stg-l">Customer name <small>(leave blank for photo-only)</small></span><input disabled={busy !== null} value={item.customer_name} maxLength={120} onChange={e => edit(item.localKey, { customer_name: e.target.value })} placeholder="e.g. Customer name" /></label>
          <label className="stg-f"><span className="stg-l">Review or story <small>(leave blank for photo-only)</small></span><textarea disabled={busy !== null} rows={5} value={item.quote} maxLength={4000} onChange={e => edit(item.localKey, { quote: e.target.value })} placeholder="Add the customer's words" /></label>
          <label className="stg-f"><span className="stg-l">Display order</span><input disabled={busy !== null} type="number" value={item.sort_order} onChange={e => edit(item.localKey, { sort_order: +e.target.value })} /></label>
        </div>
        <div className="stg-story-flags">
          <label><input type="checkbox" disabled={busy !== null} checked={item.is_published} onChange={e => edit(item.localKey, { is_published: e.target.checked })} /> Show on Customer Stories</label>
          <label><input type="checkbox" disabled={busy !== null} checked={item.show_in_gallery} onChange={e => edit(item.localKey, { show_in_gallery: e.target.checked })} /> Include photos in the photo-only gallery</label>
        </div>
        <div className="stg-story-photos">{item.photos.map(photo => <PhotoPreview key={photo.localKey} photo={photo} busy={busy !== null}
          onAlt={alt_text => edit(item.localKey, { photos: item.photos.map(current => current.localKey === photo.localKey ? { ...current, alt_text } : current) })}
          onRemove={() => edit(item.localKey, { photos: item.photos.filter(current => current.localKey !== photo.localKey) })} />)}</div>
        <label className="stg-f stg-story-upload"><span className="stg-l">Add photos to this story</span><input type="file" disabled={busy !== null} accept="image/png,image/jpeg,image/webp" multiple onChange={e => { addPhotos(item, e.target.files); e.currentTarget.value = '' }} /><small>PNG, JPG or WebP · up to 12 MB each</small></label>
        <div className="stg-story-save"><small>{item.is_published ? 'Published on the public stories page after saving.' : 'Hidden from the public stories page.'}</small><button className="btn sm" type="button" disabled={busy !== null} onClick={() => void save(item)}>{busy === item.localKey ? 'Saving…' : item.id ? 'Save changes' : 'Add story'}</button></div>
      </article>)}</div>}
  </div>
}
