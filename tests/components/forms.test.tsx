// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CustomerBookingTracker from '@/components/CustomerBookingTracker'
import ViewingRequest from '@/components/ViewingRequest'
import ChangePassword from '@/components/ChangePassword'

const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
let fetchMock: ReturnType<typeof vi.fn>
beforeEach(() => { fetchMock = vi.fn(); globalThis.fetch = fetchMock as any })
afterEach(() => { cleanup(); vi.restoreAllMocks() })
const sentBody = () => JSON.parse(fetchMock.mock.calls.at(-1)![1].body)

describe('CustomerBookingTracker', () => {
  const lookup = async (id = 'sw1a2b3c4', phone = '9876543210') => {
    const user = userEvent.setup(); render(<CustomerBookingTracker />)
    await user.type(screen.getByLabelText(/Booking ID/), id); await user.type(screen.getByLabelText(/Mobile number/), phone)
    await user.click(screen.getByRole('button', { name: /Track booking/ }))
    return user
  }
  const found = (bookingStatus: string, prepStatus: string) => reply(200, { bookingId: 'SW1A2B3C4', bookingStatus, prepStatus, startDate: '2026-12-01', endDate: '2026-12-03', eventDate: null, eventType: null })

  it('sends what was typed and shows where the booking is', async () => {
    fetchMock.mockResolvedValue(found('confirmed', 'alterations_pending')); await lookup()
    expect(await screen.findByText('Alterations in progress')).toBeTruthy()
    expect(sentBody()).toEqual({ bookingId: 'sw1a2b3c4', phone: '9876543210' })
    const steps = screen.getByRole('list', { name: 'Booking progress' }).querySelectorAll('li')
    expect([...steps].map(li => li.className)).toEqual(['done', 'done', 'current', '', '', ''])
  })
  it('ticks every step, Returned included, once the dress is back', async () => {
    fetchMock.mockResolvedValue(found('returned', 'delivered')); await lookup()
    await screen.findByText('Returned to Swaasa')
    const steps = screen.getByRole('list', { name: 'Booking progress' }).querySelectorAll('li')
    expect([...steps].every(li => li.className === 'done')).toBe(true)
  })
  it('shows no progress steps for a cancelled booking', async () => {
    fetchMock.mockResolvedValue(found('cancelled', 'not_started')); await lookup()
    await screen.findByText('Cancelled'); expect(screen.queryByRole('list', { name: 'Booking progress' })).toBeNull()
  })
  it('explains a wrong ID, too many tries, a server problem and no connection', async () => {
    fetchMock.mockResolvedValue(reply(404, {})); await lookup(); expect(await screen.findByText(/could not find a booking/)).toBeTruthy(); cleanup()
    fetchMock.mockResolvedValue(reply(429, {})); await lookup(); expect(await screen.findByText(/several attempts/)).toBeTruthy(); cleanup()
    fetchMock.mockResolvedValue(reply(503, { error: 'Tracking is not available right now.' })); await lookup(); expect(await screen.findByText(/not available right now/)).toBeTruthy(); cleanup()
    fetchMock.mockRejectedValue(new Error('offline')); await lookup(); expect(await screen.findByText(/check your connection/)).toBeTruthy()
  })
})

describe('ViewingRequest', () => {
  it('sends a viewing request and thanks the visitor by first name', async () => {
    fetchMock.mockResolvedValue(reply(200, { ok: true }))
    const user = userEvent.setup(); render(<ViewingRequest />)
    await user.type(screen.getByLabelText(/Your name/), 'Anjali Nair'); await user.type(screen.getByLabelText(/Mobile number/), '98765 43210')
    await user.click(screen.getByRole('button', { name: 'Request a visit' }))
    expect(await screen.findByText(/Thank you, Anjali/)).toBeTruthy()
    expect(sentBody()).toMatchObject({ kind: 'viewing', name: 'Anjali Nair', phone: '98765 43210', website: '' })   // the hidden bot-trap field is sent empty
  })
  it('can ask for a call instead, and then sends no visit date', async () => {
    fetchMock.mockResolvedValue(reply(200, { ok: true }))
    const user = userEvent.setup(); render(<ViewingRequest />)
    await user.click(screen.getByRole('radio', { name: /call/i }))
    await user.type(screen.getByLabelText(/Your name/), 'Anjali'); await user.type(screen.getByLabelText(/Mobile number/), '9876543210')
    await user.click(screen.getByRole('button', { name: 'Request a call' }))
    await screen.findByText(/We will call/); expect(sentBody()).toMatchObject({ kind: 'callback', visitDate: '' })
  })
  it('shows the server\'s reason, and a friendly line when the connection fails', async () => {
    fetchMock.mockResolvedValue(reply(429, { error: 'Too many requests. Please call or WhatsApp us.' }))
    const user = userEvent.setup(); render(<ViewingRequest />)
    await user.type(screen.getByLabelText(/Your name/), 'Anjali'); await user.type(screen.getByLabelText(/Mobile number/), '9876543210')
    await user.click(screen.getByRole('button', { name: 'Request a visit' }))
    expect(await screen.findByText(/Too many requests/)).toBeTruthy()
    fetchMock.mockRejectedValue(new Error('offline')); await user.click(screen.getByRole('button', { name: 'Request a visit' }))
    expect(await screen.findByText(/check your connection/)).toBeTruthy()
  })
})

describe('ChangePassword', () => {
  const open = (forced = true) => { const user = userEvent.setup(); render(<ChangePassword forced={forced} email="sales1@swaasa.test" />); return user }
  const fill = async (user: ReturnType<typeof userEvent.setup>, a: string, b = a) => {
    await user.type(screen.getByLabelText('New password'), a); await user.type(screen.getByLabelText('Type it again'), b)
    await user.click(screen.getByRole('button', { name: /Save/ }))
  }
  it('says the password is temporary when it is required, and offers no way to skip', () => {
    open(true); expect(screen.getByRole('heading').textContent).toMatch(/Choose your own password/); expect(screen.queryByText('Cancel')).toBeNull()
  })
  it('offers Cancel for a voluntary change', () => { open(false); expect(screen.getByRole('heading').textContent).toMatch(/Change your password/); expect(screen.getByText('Cancel')).toBeTruthy() })
  it('checks the password before calling the server', async () => {
    const user = open(); await fill(user, 'short')
    expect((await screen.findByRole('alert')).textContent).toMatch(/at least 10/)
    cleanup(); const u2 = open(); await fill(u2, 'Tulip-Harbour-48', 'Tulip-Harbour-49')
    expect((await screen.findByRole('alert')).textContent).toMatch(/not the same/)
    cleanup(); const u3 = open(); await fill(u3, 'sales1-Fresh-77')
    expect((await screen.findByRole('alert')).textContent).toMatch(/email name/)
    expect(fetchMock).not.toHaveBeenCalled()
  })
  it('saves a good password, and moves on to the staff app', async () => {
    const replace = vi.fn(); Object.defineProperty(window, 'location', { value: { ...window.location, replace }, writable: true })
    fetchMock.mockResolvedValue(reply(200, { ok: true })); const user = open(); await fill(user, 'Tulip-Harbour-48')
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/admin'))
    expect(fetchMock.mock.calls[0][0]).toBe('/api/account/password'); expect(sentBody()).toEqual({ password: 'Tulip-Harbour-48' })
  })
  it('shows the server\'s refusal and lets the person try again', async () => {
    fetchMock.mockResolvedValue(reply(400, { error: 'That password is too easy to guess. Choose something less common.' }))
    const user = open(); await fill(user, 'Tulip-Harbour-48')
    expect((await screen.findByRole('alert')).textContent).toMatch(/too easy to guess/)
    expect((screen.getByRole('button', { name: /Save/ }) as HTMLButtonElement).disabled).toBe(false)
  })
})
