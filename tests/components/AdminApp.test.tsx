// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { fakeSupabase, stubBrowser } from '../helpers/fakeSupabase'

vi.mock('@/lib/supabase/client', () => ({ supa: () => fakeSupabase() }))
import AdminApp from '@/components/AdminApp'

// A safety net for the staff app: it opens, and every screen in the menu draws without crashing, for each role, with an empty shop.
// (It cannot judge how it looks. It catches the crash that makes the whole app go blank after an edit.)
let errors: unknown[][]
beforeEach(() => { stubBrowser(); errors = []; vi.spyOn(console, 'error').mockImplementation((...a) => { errors.push(a) }) })
afterEach(() => { cleanup(); vi.restoreAllMocks() })

const sidebar = () => document.querySelector('aside.adm-side') as HTMLElement
const crashed = () => errors.filter(e => /Error|Uncaught|Cannot read|is not a function|is not defined/.test(String(e[0]) + String(e[1] ?? '')) && !/not wrapped in act/.test(String(e[0])))

describe('AdminApp', () => {
  it.each([['owner', 'Owner'], ['manager', 'Manager']])('opens for the %s and every menu screen draws', async (role, name) => {
    const user = userEvent.setup()
    render(<AdminApp role={role} name={name} />)
    await waitFor(() => expect(within(sidebar()).getAllByRole('button').length).toBeGreaterThan(3))
    const buttons = within(sidebar()).getAllByRole('button').filter(b => (b.textContent || '').trim() && !b.classList.contains('adm-out'))
    const labels = buttons.map(b => (b.textContent || '').trim())
    expect(labels.length).toBeGreaterThanOrEqual(role === 'owner' ? 10 : 6)
    for (const label of labels) {
      const btn = within(sidebar()).getAllByRole('button').find(b => (b.textContent || '').trim() === label)!
      await user.click(btn)
      await waitFor(() => expect(document.querySelector('main.adm-main')!.textContent!.length).toBeGreaterThan(0))
    }
    expect(crashed(), JSON.stringify(crashed().map(e => String(e[0]).slice(0, 200)))).toHaveLength(0)
  }, 60000)

  it('opens the preparation role on its own screen', async () => {
    render(<AdminApp role="preparation" name="Tailor" />)
    await waitFor(() => expect(document.querySelector('main.adm-main')!.textContent!.length).toBeGreaterThan(0))
    expect(within(sidebar()).queryByText('Finance')).toBeNull()
    expect(crashed()).toHaveLength(0)
  })

  it('signs out from the sign-out button', async () => {
    const user = userEvent.setup()
    render(<AdminApp role="owner" name="Owner" />)
    await user.click(await screen.findByRole('button', { name: 'Sign out' }))
  })
})
