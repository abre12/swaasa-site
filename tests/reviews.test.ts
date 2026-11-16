import { describe, it, expect } from 'vitest'
import { pickReviews, wordCount } from '@/lib/reviews'

const r = (rating: number, text: string, i = 1) => ({ name: `places/x/reviews/${i}`, rating, text: { text }, authorAttribution: { displayName: 'A' } })

describe('pickReviews', () => {
  it('counts words', () => { expect(wordCount('  one two   three ')).toBe(3) })
  it('keeps only 5-star reviews with more than 10 words', () => {
    const out = pickReviews([
      r(5, 'Lovely lehenga and wonderful staff who helped us at every single step', 1), // 12 words
      r(5, 'Amazing service', 2),                                                       // too short
      r(4, 'Great collection and very helpful team, would happily recommend to everyone', 3), // not 5 stars
      r(5, 'one two three four five six seven eight nine ten', 4),                      // exactly 10: excluded
      r(5, 'one two three four five six seven eight nine ten eleven', 5),               // 11: included
    ])
    expect(out.map(x => x.id)).toEqual(['places/x/reviews/1', 'places/x/reviews/5'])
  })
})
