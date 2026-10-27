import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AppSidebar } from '@/components/AppSidebar'
import { SidebarProvider } from '@/components/ui/sidebar'
import { withQuery } from './withQuery'

// Fork (FORK.md): the Devices page lists every device of every Mac without a build, so it is a top-level entry.
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 1, email: 'a@test.local', displayName: null, avatarUrl: null, role: 'Admin' }, loading: false }),
}))
vi.mock('next-themes', () => ({ useTheme: () => ({ resolvedTheme: 'light' }) }))

beforeEach(() => {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false, media: query, onchange: null,
    addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
  }))
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ items: [] }) })))
})
afterEach(() => vi.unstubAllGlobals())

function renderAt(path: string) {
  render(withQuery(<MemoryRouter initialEntries={[path]}><SidebarProvider><AppSidebar /></SidebarProvider></MemoryRouter>))
}

describe('the sidebar lists the Devices page', () => {
  it('links to /devices', async () => {
    renderAt('/app-center')
    const link = await screen.findByRole('link', { name: /^devices$/i })
    expect(link.getAttribute('href')).toBe('/devices')
  })

  it('marks it as the current page on /devices, and not on App Center', async () => {
    renderAt('/devices')
    const devices = await screen.findByRole('link', { name: /^devices$/i })
    const appCenter = await screen.findByRole('link', { name: /app center/i })
    expect(devices.getAttribute('data-active')).toBe('true')
    expect(appCenter.getAttribute('data-active')).not.toBe('true')
  })
})
