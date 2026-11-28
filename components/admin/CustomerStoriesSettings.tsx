'use client'

import { useEffect, useState } from 'react'
import { Ic } from './icons'

const BUCKET = 'customer-story-images'
const COLUMNS = 'id, customer_name, quote, image_urls, image_alts, storage_paths, sort_order, is_published, show_in_gallery'
const MAX_BYTES = 12 * 1024 * 1024
type OrderGroup = 'stories' | 'gallery'
type StoryPhoto = { localKey: string; image_url: string; alt_text: string; storage_path: string | null; file: File | null }
type Story = {
  id: string | null; localKey: string; kind: OrderGroup; customer_name: string; quote: string; photos: StoryPhoto[];
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
  const [orderSaving, setOrderSaving] = useState<OrderGroup | null>(null)
  const [orderDirty, setOrderDirty] = useState<Record<OrderGroup, boolean>>({ stories: false, gallery: false })
  const [dragging, setDragging] = useState<{ key: string; kind: OrderGroup } | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let current = true
    ctx.sb.from('site_customer_stories').select(COLUMNS).order('sort_order').order('created_at', { ascending: false }).then(({ data, error }: any) => {
      if (!current) return
      setLoading(false)
      if (error) { setError(`Could not load customer stories: ${error.message}`); return }
      setError('')
      setItems((data ?? []).map((row: any) => ({
        id: row.id, localKey: row.id, kind: row.quote?.trim() ? 'stories' : 'gallery', customer_name: row.customer_name, quote: row.quote,
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

  const reviewItems = items.filter(item => item.kind === 'stories')
  const galleryItems = items.filter(item => item.kind === 'gallery')

  function edit(localKey: string, update: Partial<Story>) {
    setItems(rows => rows.map(row => row.localKey === localKey ? { ...row, ...update } : row))
  }

  function addStory() {
    const localKey = key()
    const sort_order = Math.min(0, ...items.map(row => row.sort_order)) - 10
    setItems(rows => [{ id: null, localKey, kind: 'stories', customer_name: '', quote: '', photos: [], originalStoragePaths: [], sort_order, is_published: true, show_in_gallery: false }, ...rows])
    setError('')
  }

  function addGallerySet() {
    const localKey = key()
    const sort_order = Math.min(0, ...items.map(row => row.sort_order)) - 10
    setItems(rows => [{ id: null, localKey, kind: 'gallery', customer_name: '', quote: '', photos: [], originalStoragePaths: [], sort_order, is_published: true, show_in_gallery: true }, ...rows])
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

  function reorder(kind: OrderGroup, fromKey: string, toKey: string) {
    if (fromKey === toKey) return
    setItems(rows => {
      const group = rows.filter(row => row.kind === kind)
      const rest = rows.filter(row => row.kind !== kind)
      const from = group.findIndex(row => row.localKey === fromKey)
      const to = group.findIndex(row => row.localKey === toKey)
      if (from < 0 || to < 0) return rows
      const [moved] = group.splice(from, 1)
      group.splice(to, 0, moved)
      return [...group.map((row, index) => ({ ...row, sort_order: (index + 1) * 10 })), ...rest]
    })
    setOrderDirty(current => ({ ...current, [kind]: true }))
  }

  function move(kind: OrderGroup, localKey: string, offset: -1 | 1) {
    const group = items.filter(row => row.kind === kind)
    const index = group.findIndex(row => row.localKey === localKey)
    const target = group[index + offset]
    if (target) reorder(kind, localKey, target.localKey)
  }

  async function saveOrder(kind: OrderGroup) {
    const ordered = items.filter(row => row.kind === kind)
    setOrderSaving(kind)
    setError('')
    try {
      const results = await Promise.all(ordered.map((item, index) => item.id
        ? ctx.sb.from('site_customer_stories').update({ sort_order: (index + 1) * 10 }).eq('id', item.id)
        : Promise.resolve({ error: null })))
      const failed = results.find((result: any) => result.error)
      if (failed?.error) throw new Error(failed.error.message)
      setOrderDirty(current => ({ ...current, [kind]: ordered.some(item => !item.id) }))
      ctx.say('Display order saved')
    } catch (reason) {
      setError(`Could not save the display order: ${reason instanceof Error ? reason.message : 'Please try again.'}`)
      ctx.say('Display order could not be saved')
    } finally { setOrderSaving(null) }
  }

  async function save(item: Story) {
    const customer_name = item.customer_name.trim()
    const quote = item.kind === 'stories' ? item.quote.trim() : ''
    if (customer_name.length > 120 || quote.length > 4000) { setError('Names are limited to 120 characters and stories to 4,000 characters.'); return }
    if (item.kind === 'stories' && (!customer_name || !quote)) { setError('A review card needs both a customer name and a story. Add photo-only content in the gallery section below.'); return }
    if (item.kind === 'gallery' && !item.photos.length) { setError('Add at least one photo to this photo set.'); return }
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
        is_published: item.kind === 'stories' ? item.is_published : item.is_published && item.show_in_gallery,
        show_in_gallery: item.kind === 'gallery' ? item.show_in_gallery : false,
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
        id: saved.id, localKey: saved.id, kind: item.kind, customer_name: saved.customer_name, quote: saved.quote,
        photos: (saved.image_urls ?? []).map((image_url: string, i: number) => ({
          localKey: `${saved.id}-photo-${i}-${Date.now()}`, image_url, alt_text: saved.image_alts?.[i] ?? '', storage_path: saved.storage_paths?.[i] || null, file: null,
        })),
        originalStoragePaths: (saved.storage_paths ?? []).filter(Boolean),
        sort_order: saved.sort_order, is_published: saved.is_published, show_in_gallery: saved.show_in_gallery,
      } : row))
      ctx.say(item.kind === 'stories' ? 'Customer story saved' : 'Photo gallery saved')
      if (orderDirty[item.kind]) setOrderDirty(current => ({ ...current, [item.kind]: true }))
      if (removedPaths.length) {
        const { error: cleanupError } = await ctx.sb.storage.from(BUCKET).remove(removedPaths)
        if (cleanupError) setError(`Saved, but a removed photo could not be cleared from storage: ${cleanupError.message}`)
      }
    } catch (reason) {
      if (!savedToDatabase && uploadedPaths.length) { try { await ctx.sb.storage.from(BUCKET).remove(uploadedPaths) } catch {} }
      setError(`Could not save this ${item.kind === 'stories' ? 'story' : 'photo set'}: ${reason instanceof Error ? reason.message : 'Please try again.'}`)
      ctx.say('Customer content could not be saved')
    } finally { setBusy(null) }
  }

  async function remove(item: Story) {
    if (item.id && !window.confirm(`Delete ${item.kind === 'stories' ? item.customer_name : item.customer_name || 'this photo set'}?`)) return
    setBusy(item.localKey)
    setError('')
    if (item.id) {
      const { error: deleteError } = await ctx.sb.from('site_customer_stories').delete().eq('id', item.id)
      if (deleteError) { setBusy(null); setError(`Could not delete this entry: ${deleteError.message}`); return }
      if (item.originalStoragePaths.length) {
        const { error: cleanupError } = await ctx.sb.storage.from(BUCKET).remove(item.originalStoragePaths)
        if (cleanupError) setError(`Entry deleted, but a stored photo could not be removed: ${cleanupError.message}`)
      }
    }
    setItems(rows => rows.filter(row => row.localKey !== item.localKey))
    setBusy(null)
    ctx.say(item.id ? 'Customer content deleted' : 'New entry discarded')
  }

  function reorderProps(item: Story, kind: OrderGroup, index: number, count: number) {
    const locked = busy !== null || orderSaving !== null
    return {
      onDragOver: (event: React.DragEvent<HTMLElement>) => { if (dragging?.kind === kind) { event.preventDefault(); event.dataTransfer.dropEffect = 'move' } },
      onDrop: (event: React.DragEvent<HTMLElement>) => {
        event.preventDefault()
        if (dragging?.kind === kind) reorder(kind, dragging.key, item.localKey)
        setDragging(null)
      },
      orderControls: <div className="stg-story-order-controls">
        <span className="stg-story-drag-handle" draggable={!locked} title="Drag to reorder" aria-label="Drag to reorder" onDragStart={event => {
          event.dataTransfer.effectAllowed = 'move'
          event.dataTransfer.setData('text/plain', item.localKey)
          setDragging({ key: item.localKey, kind })
        }} onDragEnd={() => setDragging(null)}>⠿</span>
        <button type="button" disabled={locked || index === 0} onClick={() => move(kind, item.localKey, -1)} aria-label={`Move ${kind === 'stories' ? 'story' : 'photo set'} up`}>↑</button>
        <button type="button" disabled={locked || index === count - 1} onClick={() => move(kind, item.localKey, 1)} aria-label={`Move ${kind === 'stories' ? 'story' : 'photo set'} down`}>↓</button>
      </div>,
    }
  }

  function renderItem(item: Story, kind: OrderGroup, index: number, count: number) {
    const locked = busy !== null || orderSaving !== null
    const order = reorderProps(item, kind, index, count)
    const isReview = kind === 'stories'
    return <article className="stg-story-card" key={item.localKey} onDragOver={order.onDragOver} onDrop={order.onDrop}>
      <div className="stg-story-top"><div className="stg-story-top-left">{order.orderControls}<b>{isReview ? `Review ${index + 1}` : item.customer_name.trim() ? `Swipeable album · ${item.customer_name}` : `Photo-only strip · set ${index + 1}`}{!item.id && <span className="stg-homeimage-new">New</span>}</b></div>
        <button className="btn alt sm" type="button" disabled={locked} onClick={() => void remove(item)}><Ic n="xc" s={15} /> Delete</button>
      </div>
      <div className="stg-story-fields">
        {isReview ? <>
          <label className="stg-f"><span className="stg-l">Customer name</span><input disabled={locked} value={item.customer_name} maxLength={120} onChange={e => edit(item.localKey, { customer_name: e.target.value })} placeholder="e.g. Customer name" /></label>
          <label className="stg-f"><span className="stg-l">Review or story</span><textarea disabled={locked} rows={5} value={item.quote} maxLength={4000} onChange={e => edit(item.localKey, { quote: e.target.value })} placeholder="Add the customer's words" /></label>
        </> : <label className="stg-f stg-story-group-name"><span className="stg-l">Customer or album name <small>(optional; leave blank for an unnamed photo strip)</small></span><input disabled={locked} value={item.customer_name} maxLength={120} onChange={e => edit(item.localKey, { customer_name: e.target.value })} placeholder="Add a name to group photos into a swipeable album" /></label>}
      </div>
      <div className="stg-story-flags">
        {isReview
          ? <label><input type="checkbox" disabled={locked} checked={item.is_published} onChange={e => edit(item.localKey, { is_published: e.target.checked })} /> Show review on Customer Stories</label>
          : <label><input type="checkbox" disabled={locked} checked={item.is_published && item.show_in_gallery} onChange={e => edit(item.localKey, { is_published: e.target.checked, show_in_gallery: e.target.checked })} /> Show photos in the public gallery</label>}
      </div>
      {item.photos.length > 0 && <div className="stg-story-photos">{item.photos.map(photo => <PhotoPreview key={photo.localKey} photo={photo} busy={locked}
        onAlt={alt_text => edit(item.localKey, { photos: item.photos.map(current => current.localKey === photo.localKey ? { ...current, alt_text } : current) })}
        onRemove={() => edit(item.localKey, { photos: item.photos.filter(current => current.localKey !== photo.localKey) })} />)}</div>}
      <label className="stg-f stg-story-upload"><span className="stg-l">{isReview ? 'Add photos to this review card' : 'Add photos to this gallery set'}</span><input type="file" disabled={locked} accept="image/png,image/jpeg,image/webp" multiple onChange={e => { addPhotos(item, e.target.files); e.currentTarget.value = '' }} /><small>PNG, JPG or WebP · up to 12 MB each · select several photos to create a swipeable set</small></label>
      <div className="stg-story-save"><small>{isReview ? item.is_published ? 'Published as a review card after saving.' : 'Hidden from the public stories page.' : item.customer_name.trim() ? 'Photos in this set are grouped in one swipeable album.' : 'These photos appear by themselves in the auto-moving celebrations strip.'}</small><button className="btn sm" type="button" disabled={locked} onClick={() => void save(item)}>{busy === item.localKey ? 'Saving…' : item.id ? 'Save changes' : isReview ? 'Add review' : 'Add photos'}</button></div>
    </article>
  }

  return <div className="stg-stories">
    {error && <p className="stg-stories-error" role="alert">{error}</p>}
    <section className="stg-stories-section" aria-labelledby="stg-reviews-title">
      <div className="stg-stories-intro"><div><h3 className="stg-gh" id="stg-reviews-title">Review cards</h3><p className="stg-gd">These entries include a customer name and their words. Their photos stay with the review and are not repeated in the photo galleries. Drag the grip or use the arrows, then save the order.</p></div>
        <div className="stg-stories-actions"><button className="btn alt sm" type="button" onClick={() => void saveOrder('stories')} disabled={!orderDirty.stories || busy !== null || orderSaving !== null}>{orderSaving === 'stories' ? 'Saving order…' : 'Save order'}</button><button className="btn" type="button" onClick={addStory} disabled={loading || busy !== null || orderSaving !== null}><Ic n="plus" s={17} /> Add review</button></div>
      </div>
      {loading ? <p className="mut" style={{ margin: 0 }}>Loading customer stories…</p> : reviewItems.length === 0
        ? <div className="stg-stories-empty"><Ic n="camera" s={24} /><p>No review cards yet. Add a customer name and their words; photos are optional.</p></div>
        : <div className="stg-stories-list">{reviewItems.map((item, index) => renderItem(item, 'stories', index, reviewItems.length))}</div>}
    </section>

    <section className="stg-stories-section" aria-labelledby="stg-gallery-title">
      <div className="stg-stories-intro"><div><h3 className="stg-gh" id="stg-gallery-title">Photo-only galleries</h3><p className="stg-gd">Add photos without creating a review card. Leave the album name blank for the seamless celebrations strip, or enter the same customer name on related sets to group them into a swipeable album below it. Drag the grip or use the arrows to change order.</p></div>
        <div className="stg-stories-actions"><button className="btn alt sm" type="button" onClick={() => void saveOrder('gallery')} disabled={!orderDirty.gallery || busy !== null || orderSaving !== null}>{orderSaving === 'gallery' ? 'Saving order…' : 'Save order'}</button><button className="btn" type="button" onClick={addGallerySet} disabled={loading || busy !== null || orderSaving !== null}><Ic n="plus" s={17} /> Add photo set</button></div>
      </div>
      {loading ? <p className="mut" style={{ margin: 0 }}>Loading photo gallery…</p> : galleryItems.length === 0
        ? <div className="stg-stories-empty"><Ic n="camera" s={24} /><p>No photo-only sets yet. Add a set here; it will not appear as a story card.</p></div>
        : <div className="stg-stories-list">{galleryItems.map((item, index) => renderItem(item, 'gallery', index, galleryItems.length))}</div>}
    </section>
  </div>
}
