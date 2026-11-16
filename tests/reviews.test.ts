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

import { pickManual, mergeReviews } from '@/lib/reviews'
describe('manual reviews', () => {
  const long = 'Rented a bridal lehenga for my sister wedding and the fitting support was wonderful'
  it('applies the 11-word rule to hand-picked reviews', () => {
    const out = pickManual([{ author: 'A', text: long }, { author: 'B', text: 'Lovely staff' }])
    expect(out).toHaveLength(1)
    expect(out[0].author).toBe('A')
  })
  it('shows a review once when it is both live and hand-picked, live first', () => {
    const live = pickReviews([r(5, long + '.', 9)])
    const manual = pickManual([{ author: 'Same person', text: long }, { author: 'B', text: 'Gorgeous collection and the team was so patient with every single alteration' }])
    const out = mergeReviews(live, manual)
    expect(out).toHaveLength(2)
    expect(out[0].author).toBe('A')
  })
  it('caps the list', () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ author: `P${i}`, text: `Review number ${i} has plenty of words in it to pass the filter easily` }))
    expect(mergeReviews([], pickManual(many), 8)).toHaveLength(8)
  })
})

import { MANUAL_REVIEWS } from '@/lib/reviews-manual'
describe('the shipped hand-picked list', () => {
  it('every entry passes the 11-word rule', () => { expect(pickManual(MANUAL_REVIEWS)).toHaveLength(MANUAL_REVIEWS.length) })
})
