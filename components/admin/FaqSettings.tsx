'use client'

import { useEffect, useState } from 'react'
import { Ic } from './icons'

type FaqEntry = {
  id: string | null
  localKey: string
  question: string
  answer: string
  sort_order: number
}

const columns = 'id, question, answer, sort_order'

export default function FaqSettings({ ctx }: { ctx: any }) {
  const [items, setItems] = useState<FaqEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let current = true
    setLoading(true)
    ctx.sb.from('site_faqs').select(columns).order('sort_order').order('created_at')
      .then(({ data, error }: any) => {
        if (!current) return
        setLoading(false)
        if (error) {
          setError(`Could not load FAQs: ${error.message}`)
          return
        }
        setError('')
        setItems((data ?? []).map((row: any) => ({ id: row.id, localKey: row.id, question: row.question, answer: row.answer, sort_order: row.sort_order })))
      }, (reason: unknown) => {
        if (!current) return
        setLoading(false)
        setError(`Could not load FAQs: ${reason instanceof Error ? reason.message : 'Please try again.'}`)
      })
    return () => { current = false }
  }, [ctx.sb])

  function change(localKey: string, field: 'question' | 'answer', value: string) {
    setItems(rows => rows.map(row => row.localKey === localKey ? { ...row, [field]: value } : row))
  }

  function add() {
    const sort_order = Math.max(0, ...items.map(row => row.sort_order)) + 10
    const localKey = `draft-${Date.now()}-${Math.random().toString(36).slice(2)}`
    setItems(rows => [...rows, { id: null, localKey, question: '', answer: '', sort_order }])
    setError('')
  }

  async function save(row: FaqEntry) {
    const question = row.question.trim()
    const answer = row.answer.trim()
    if (question.length < 3 || question.length > 180) {
      setError('Questions must be between 3 and 180 characters.')
      return
    }
    if (!answer || answer.length > 3000) {
      setError('Answers must be between 1 and 3,000 characters.')
      return
    }

    setBusy(row.localKey)
    setError('')
    const values = { question, answer, sort_order: row.sort_order }
    let result: any
    try {
      result = row.id
        ? await ctx.sb.from('site_faqs').update(values).eq('id', row.id).select(columns).single()
        : await ctx.sb.from('site_faqs').insert(values).select(columns).single()
    } catch (reason) {
      setBusy(null)
      setError(`Could not save this FAQ: ${reason instanceof Error ? reason.message : 'Please try again.'}`)
      ctx.say('FAQ could not be saved')
      return
    }
    setBusy(null)
    if (result.error) {
      setError(`Could not save this FAQ: ${result.error.message}`)
      ctx.say('FAQ could not be saved')
      return
    }
    const saved = result.data
    setItems(rows => rows.map(item => item.localKey === row.localKey
      ? { id: saved.id, localKey: saved.id, question: saved.question, answer: saved.answer, sort_order: saved.sort_order }
      : item))
    ctx.say('FAQ saved')
  }

  async function remove(row: FaqEntry) {
    if (row.id && !window.confirm('Remove this question and answer from the public website?')) return
    setBusy(row.localKey)
    setError('')
    if (row.id) {
      let error: any
      try {
        ({ error } = await ctx.sb.from('site_faqs').delete().eq('id', row.id))
      } catch (reason) {
        setBusy(null)
        setError(`Could not remove this FAQ: ${reason instanceof Error ? reason.message : 'Please try again.'}`)
        ctx.say('FAQ could not be removed')
        return
      }
      if (error) {
        setBusy(null)
        setError(`Could not remove this FAQ: ${error.message}`)
        ctx.say('FAQ could not be removed')
        return
      }
    }
    setItems(rows => rows.filter(item => item.localKey !== row.localKey))
    setBusy(null)
    ctx.say(row.id ? 'FAQ removed' : 'New FAQ discarded')
  }

  return <div className="stg-faq">
    <div className="stg-faq-intro">
      <div><h3 className="stg-gh">Questions on your website</h3><p className="stg-gd">Edit a question or answer, then save it to publish. New questions appear at the bottom of the list.</p></div>
      <button className="btn" type="button" onClick={add} disabled={loading}><Ic n="plus" s={17} /> Add a question</button>
    </div>
    {error && <p className="stg-faq-error" role="alert">{error}</p>}
    {loading ? <p className="mut" style={{ margin: 0 }}>Loading FAQs…</p> : items.length === 0
      ? <div className="stg-faq-empty"><Ic n="help" s={22} /><p>No questions yet. Add one to show it on the public website.</p></div>
      : <div className="stg-faq-list">{items.map((row, index) => <article className="stg-faq-card" key={row.localKey}>
        <div className="stg-faq-card-head"><b>Question {index + 1}{!row.id && <span className="stg-faq-draft">New</span>}</b>
          <button className="btn alt sm" type="button" onClick={() => void remove(row)} disabled={busy !== null}><Ic n="xc" s={15} /> Remove</button>
        </div>
        <label className="stg-f"><span className="stg-l">Question</span><input value={row.question} maxLength={180} onChange={e => change(row.localKey, 'question', e.target.value)} placeholder="e.g. Can I choose my own rental dates?" /></label>
        <label className="stg-f"><span className="stg-l">Answer</span><textarea value={row.answer} maxLength={3000} rows={4} onChange={e => change(row.localKey, 'answer', e.target.value)} placeholder="Write a clear answer for your customers." /></label>
        <div className="stg-faq-save"><small>{row.question.length}/180 · {row.answer.length}/3,000 characters</small><button className="btn sm" type="button" onClick={() => void save(row)} disabled={busy !== null}>{busy === row.localKey ? 'Saving…' : 'Save FAQ'}</button></div>
      </article>)}</div>}
  </div>
}
