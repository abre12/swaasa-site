import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { DRESS_COLUMNS } from '@/lib/dressColumns'

describe('DRESS_COLUMNS', () => {
  it('names every column of the dresses table, so a new column is a decision', () => {
    const sql = readFileSync('supabase/schema-current.sql', 'utf8')
    const body = sql.match(/CREATE TABLE public\.dresses \(\n([\s\S]*?)\n\);/)![1]
    const cols = body.split('\n').map(l => l.trim()).filter(l => l && !/^(CONSTRAINT|PRIMARY|UNIQUE|CHECK|FOREIGN)/i.test(l)).map(l => l.split(/\s+/)[0])
    expect(DRESS_COLUMNS.split(',').sort()).toEqual(cols.sort())
  })
  it('has no duplicates or spaces (PostgREST reads the list literally)', () => {
    const list = DRESS_COLUMNS.split(',')
    expect(new Set(list).size).toBe(list.length)
    expect(DRESS_COLUMNS).not.toMatch(/\s/)
  })
})
