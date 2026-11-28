'use client'

import { useEffect, useState } from 'react'
import { Ic } from './icons'

const BUCKET = 'homepage-category-images'
const COLUMNS = 'id, title, note, alt_text, image_url, storage_path, sort_order'
const MAX_BYTES = 12 * 1024 * 1024
const DEFAULT_CAPTION = 'Wedding lehengas, gowns, luxury salwars, sarees, Anarkalis, cape lehengas and shararas for weddings, sangeet, engagements and parties.'

type CategoryImage = {
  id: string | null
  localKey: string
  title: string
  note: string
  alt_text: string
  image_url: string | null
  storage_path: string | null
  original_storage_path: string | null
  sort_order: number
  file: File | null
}

function TileEditor({ item, index, busy, onChange, onSave, onDelete, onRemoveImage, onFile, onFileError }: {
  item: CategoryImage
  index: number
  busy: boolean
  onChange: (patch: Partial<CategoryImage>) => void
  onSave: () => void
  onDelete: () => void
  onRemoveImage: () => void
  onFile: (file: File | null) => void
  onFileError: (message: string) => void
}) {
  const [preview, setPreview] = useState<string | null>(item.image_url)
  useEffect(() => {
    if (!item.file) {
      setPreview(item.image_url)
      return
    }
    const url = URL.createObjectURL(item.file)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [item.file, item.image_url])

  return <article className="stg-homeimage-card">
    <div className="stg-homeimage-top"><b>Category {index + 1}{!item.id && <span className="stg-homeimage-new">New</span>}</b>
      <button className="btn alt sm" type="button" onClick={onDelete} disabled={busy}><Ic n="xc" s={15} /> Delete category</button>
    </div>
    <div className="stg-homeimage-edit">
      <div className="stg-homeimage-preview">{preview ? <img src={preview} alt="" /> : <div><Ic n="camera" s={24} /><span>No image selected</span></div>}</div>
      <div className="stg-homeimage-fields">
        <label className="stg-f"><span className="stg-l">Category name</span><input maxLength={60} value={item.title} onChange={e => onChange({ title: e.target.value })} placeholder="e.g. Festive Sarees" /></label>
        <label className="stg-f"><span className="stg-l">Short description</span><input maxLength={120} value={item.note} onChange={e => onChange({ note: e.target.value })} placeholder="A short phrase shown under the name" /></label>
        <label className="stg-f"><span className="stg-l">Image description for screen readers</span><input maxLength={180} value={item.alt_text} onChange={e => onChange({ alt_text: e.target.value })} placeholder="Describe the outfit in the image" /></label>
        <div className="stg-homeimage-upload">
          <label className="stg-f"><span className="stg-l">Choose an image</span><input key={`${item.localKey}:${item.file?.name ?? 'empty'}`} type="file" accept="image/png,image/jpeg,image/webp" onChange={e => {
            const file = e.target.files?.[0] ?? null
            if (file && !['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) { onFileError('Choose a PNG, JPG or WebP image.'); e.target.value = ''; return }
            if (file && file.size > MAX_BYTES) { onFileError('Choose an image smaller than 12 MB.'); e.target.value = ''; return }
            onFile(file)
          }} /></label>
          {item.file && <small>Selected: {item.file.name}</small>}
          {(item.image_url || item.file) && <button className="btn alt sm" type="button" onClick={onRemoveImage} disabled={busy}>Remove image</button>}
        </div>
      </div>
    </div>
    <div className="stg-homeimage-actions"><small>{item.file ? 'The new image uploads when you save.' : item.image_url ? 'Current image is shown on the homepage.' : 'This category currently has no image.'}</small>
      <button className="btn sm" type="button" onClick={onSave} disabled={busy}>{busy ? 'Saving…' : item.id ? 'Save changes' : 'Add category'}</button>
    </div>
  </article>
}

export default function HomeImagesSettings({ ctx }: { ctx: any }) {
  const [items, setItems] = useState<CategoryImage[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [captionError, setCaptionError] = useState('')
  const [caption, setCaption] = useState(DEFAULT_CAPTION)
  const [captionLoading, setCaptionLoading] = useState(true)
  const [captionBusy, setCaptionBusy] = useState(false)

  useEffect(() => {
    let current = true
    setLoading(true)
    ctx.sb.from('site_category_tiles').select(COLUMNS).order('sort_order').order('created_at')
      .then(({ data, error }: any) => {
        if (!current) return
        setLoading(false)
        if (error) { setError(`Could not load homepage images: ${error.message}`); return }
        setError('')
        setItems((data ?? []).map((row: any) => ({
          id: row.id, localKey: row.id, title: row.title, note: row.note, alt_text: row.alt_text,
          image_url: row.image_url, storage_path: row.storage_path, original_storage_path: row.storage_path,
          sort_order: row.sort_order, file: null,
        })))
      }, (reason: unknown) => {
        if (!current) return
        setLoading(false)
        setError(`Could not load homepage images: ${reason instanceof Error ? reason.message : 'Please try again.'}`)
      })
    return () => { current = false }
  }, [ctx.sb])

  useEffect(() => {
    let current = true
    ctx.sb.from('site_home_content').select('look_caption').eq('id', 1).maybeSingle()
      .then(({ data, error }: any) => {
        if (!current) return
        setCaptionLoading(false)
        if (error) {
          setCaptionError(`Could not load the Find your look caption: ${error.message}. Apply migration v39, then try again.`)
          return
        }
        setCaptionError('')
        if (typeof data?.look_caption === 'string') setCaption(data.look_caption)
      }, (reason: unknown) => {
        if (!current) return
        setCaptionLoading(false)
        setCaptionError(`Could not load the Find your look caption: ${reason instanceof Error ? reason.message : 'Please try again.'}. Apply migration v39 if it has not been run.`)
      })
    return () => { current = false }
  }, [ctx.sb])

  async function saveCaption() {
    if (caption.length > 320) { setCaptionError('The caption can be up to 320 characters.'); return }
    setCaptionBusy(true)
    setCaptionError('')
    try {
      const { error } = await ctx.sb.from('site_home_content').update({ look_caption: caption.trim() }).eq('id', 1)
      if (error) throw new Error(error.message)
      ctx.say('Find your look caption saved')
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : 'Please try again.'
      setCaptionError(`Could not save the Find your look caption: ${message}`)
      ctx.say('Homepage caption could not be saved')
    } finally {
      setCaptionBusy(false)
    }
  }

  function edit(localKey: string, patch: Partial<CategoryImage>) {
    setItems(rows => rows.map(row => row.localKey === localKey ? { ...row, ...patch } : row))
  }

  function add() {
    const sort_order = Math.max(0, ...items.map(row => row.sort_order)) + 10
    const localKey = `draft-${Date.now()}-${Math.random().toString(36).slice(2)}`
    setItems(rows => [...rows, { id: null, localKey, title: '', note: '', alt_text: '', image_url: null, storage_path: null, original_storage_path: null, sort_order, file: null }])
    setError('')
  }

  async function save(item: CategoryImage) {
    const title = item.title.trim()
    const note = item.note.trim()
    const alt_text = item.alt_text.trim()
    if (title.length < 2 || title.length > 60) { setError('Category names must be between 2 and 60 characters.'); return }
    if (note.length > 120) { setError('Short descriptions can be up to 120 characters.'); return }
    if ((item.file || item.image_url) && (alt_text.length < 5 || alt_text.length > 180)) { setError('Add an image description between 5 and 180 characters.'); return }
    if (!item.id && !item.file && !item.image_url) { setError('Choose an image before adding a new category.'); return }

    setBusy(item.localKey)
    setError('')
    let uploadedPath: string | null = null
    let savedToDatabase = false
    try {
      let image_url = item.image_url
      let storage_path = item.storage_path
      if (item.file) {
        const extension = item.file.type === 'image/jpeg' ? 'jpg' : item.file.type === 'image/webp' ? 'webp' : 'png'
        uploadedPath = `${crypto.randomUUID()}.${extension}`
        const { error: uploadError } = await ctx.sb.storage.from(BUCKET).upload(uploadedPath, item.file, {
          cacheControl: '31536000',
          contentType: item.file.type,
          upsert: false,
        })
        if (uploadError) throw new Error(uploadError.message)
        image_url = ctx.sb.storage.from(BUCKET).getPublicUrl(uploadedPath).data.publicUrl
        storage_path = uploadedPath
      }
      const values = { title, note, alt_text, image_url, storage_path, sort_order: item.sort_order }
      const result = item.id
        ? await ctx.sb.from('site_category_tiles').update(values).eq('id', item.id).select(COLUMNS).single()
        : await ctx.sb.from('site_category_tiles').insert(values).select(COLUMNS).single()
      if (result.error) throw new Error(result.error.message)
      savedToDatabase = true
      const saved = result.data
      setItems(rows => rows.map(row => row.localKey === item.localKey ? {
        id: saved.id, localKey: saved.id, title: saved.title, note: saved.note, alt_text: saved.alt_text,
        image_url: saved.image_url, storage_path: saved.storage_path, original_storage_path: saved.storage_path,
        sort_order: saved.sort_order, file: null,
      } : row))
      ctx.say('Homepage category saved')
      const oldPath = item.original_storage_path ?? item.storage_path
      if (oldPath && oldPath !== saved.storage_path) {
        try {
          const { error: cleanupError } = await ctx.sb.storage.from(BUCKET).remove([oldPath])
          if (cleanupError) setError(`Saved, but an older uploaded image could not be removed: ${cleanupError.message}`)
        } catch (reason) {
          setError(`Saved, but an older uploaded image could not be removed: ${reason instanceof Error ? reason.message : 'Please try again.'}`)
        }
      }
    } catch (reason) {
      if (uploadedPath && !savedToDatabase) {
        try { await ctx.sb.storage.from(BUCKET).remove([uploadedPath]) } catch {}
      }
      const message = reason instanceof Error ? reason.message : 'Please try again.'
      setError(`Could not save this category: ${message}`)
      ctx.say('Homepage category could not be saved')
    } finally {
      setBusy(null)
    }
  }

  async function removeCategory(item: CategoryImage) {
    if (item.id && !window.confirm(`Delete “${item.title}” from the homepage?`)) return
    setBusy(item.localKey)
    setError('')
    if (item.id) {
      try {
        const { error } = await ctx.sb.from('site_category_tiles').delete().eq('id', item.id)
        if (error) throw new Error(error.message)
      } catch (reason) {
        setBusy(null)
        setError(`Could not delete this category: ${reason instanceof Error ? reason.message : 'Please try again.'}`)
        ctx.say('Homepage category could not be deleted')
        return
      }
      if (item.storage_path) {
        try {
          const { error: storageError } = await ctx.sb.storage.from(BUCKET).remove([item.storage_path])
          if (storageError) setError(`Category deleted, but its uploaded image could not be removed: ${storageError.message}`)
        } catch (reason) {
          setError(`Category deleted, but its uploaded image could not be removed: ${reason instanceof Error ? reason.message : 'Please try again.'}`)
        }
      }
    }
    setItems(rows => rows.filter(row => row.localKey !== item.localKey))
    setBusy(null)
    ctx.say(item.id ? 'Homepage category deleted' : 'New category discarded')
  }

  function removeImage(item: CategoryImage) {
    edit(item.localKey, { image_url: null, storage_path: null, file: null })
  }

  return <div className="stg-homeimages">
    <section className="stg-homecaption" aria-labelledby="stg-homecaption-title">
      <div><h3 className="stg-gh" id="stg-homecaption-title">Find your look caption</h3><p className="stg-gd">This line appears beneath the homepage category images. Leave it blank to hide it.</p></div>
      <label className="stg-f"><span className="stg-l">Caption text</span><textarea maxLength={320} rows={3} value={caption} onChange={e => setCaption(e.target.value)} disabled={captionLoading || captionBusy} placeholder="Describe the outfit styles and occasions you offer" /></label>
      {captionError && <p className="stg-homeimages-error" role="alert">{captionError}</p>}
      <div className="stg-homecaption-actions"><small>{caption.length}/320 characters{captionLoading ? ' · Loading saved caption…' : ''}</small><button className="btn sm" type="button" onClick={() => void saveCaption()} disabled={captionLoading || captionBusy}>{captionBusy ? 'Saving…' : 'Save caption'}</button></div>
    </section>
    <div className="stg-homeimages-intro">
      <div><h3 className="stg-gh">Homepage category cards</h3><p className="stg-gd">Replace an image, remove an image, or add and delete category cards. Uploaded images appear on the public homepage after you save.</p></div>
      <button className="btn" type="button" onClick={add} disabled={loading}><Ic n="plus" s={17} /> Add category</button>
    </div>
    {error && <p className="stg-homeimages-error" role="alert">{error}</p>}
    {loading ? <p className="mut" style={{ margin: 0 }}>Loading homepage images…</p> : items.length === 0
      ? <div className="stg-homeimages-empty"><Ic n="camera" s={24} /><p>No category cards yet. Add a category and choose an image.</p></div>
      : <div className="stg-homeimages-list">{items.map((item, index) => <TileEditor
        key={item.localKey}
        item={item}
        index={index}
        busy={busy !== null}
        onChange={patch => edit(item.localKey, patch)}
        onSave={() => void save(item)}
        onDelete={() => void removeCategory(item)}
        onRemoveImage={() => removeImage(item)}
        onFile={file => { setError(''); edit(item.localKey, { file }) }}
        onFileError={message => setError(message)}
      />)}</div>}
  </div>
}
