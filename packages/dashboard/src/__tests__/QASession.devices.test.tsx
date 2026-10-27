import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { BreadcrumbProvider } from '@/hooks/useBreadcrumb'
import type { BrowserToRelay } from '@tapflowio/protocol'
import type { BrowserInbound, SessionInfo } from '@/lib/types'
import { withQuery } from './withQuery'

// Fork (FORK.md): the Devices page opens any device of any Mac without a build — iOS and Android alike — and
// leaving a device keeps it running, so the viewer is handed the one way to stop it.
//
// The mocks follow `QASession.aiHolder.test.tsx`: the point is the page, not the socket.
const { send } = vi.hoisted(() => ({ send: vi.fn<(msg: BrowserToRelay) => void>() }))
let deliver: ((msg: BrowserInbound) => void) | null = null
vi.mock('@/hooks/useRelay', () => ({
  useRelay: (onMessage: (msg: BrowserInbound) => void) => {
    deliver = onMessage
    return { send, connected: true }
  },
}))
// Stable objects only: a fresh `build` per call is a new dependency every render (see the aiHolder test).
const { loader, BUILD } = vi.hoisted(() => {
  const BUILD = { id: 7, app_id: 3, name: 'Demo', platform: 'ios', status_label: null, version_name: '1.0', build_number: '1' }
  return { BUILD, loader: { build: null as typeof BUILD | null } }
})
vi.mock('@/hooks/useBuildLoader', () => ({ useBuildLoader: () => loader }))
vi.mock('@/components/SessionPanel', () => ({ SessionPanel: () => <div /> }))
const { viewer } = vi.hoisted(() => ({ viewer: { onShutdown: undefined as (() => void) | undefined } }))
// A real control stands in for the toolbar's confirmed shutdown, so the focus it had goes down with the viewer.
vi.mock('@/components/DeviceViewer', () => ({
  DeviceViewer: (props: { onShutdown?: () => void }) => {
    viewer.onShutdown = props.onShutdown
    return <div data-testid="device-viewer"><button onClick={props.onShutdown}>Confirm shutdown</button></div>
  },
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }))

const { QASession } = await import('../pages/QASession')

const admission = { booting: false, overloaded: false, memoryRefuses: [] }
const AGENTS: SessionInfo[] = [
  {
    agentName: 'studio-mac-ios', platform: 'ios', capabilities: ['full-reset'], admission,
    devices: [{ id: 'sim-1', name: 'iPhone 17', platform: 'ios', status: 'booted', osVersion: 'iOS 26.2', sessionId: 'sess-ios', busy: false }],
  },
  {
    agentName: 'studio-mac-android', platform: 'android', capabilities: ['full-reset'], admission,
    devices: [{ id: 'avd:Pixel_9', name: 'Pixel 9', platform: 'android', status: 'shutdown', osVersion: 'Android 15', sessionId: 'sess-android', busy: false }],
  },
]

async function renderAt(path: string) {
  render(withQuery(
    <MemoryRouter initialEntries={[path]}>
      <BreadcrumbProvider><QASession /></BreadcrumbProvider>
    </MemoryRouter>,
  ))
  await vi.waitFor(() => expect(deliver).not.toBeNull())
  await act(async () => { deliver!({ type: 'agents:listed', sessions: AGENTS }) })
}

beforeEach(() => {
  send.mockClear()
  loader.build = null
  viewer.onShutdown = undefined
})

describe('QASession without a build — the Devices page', () => {
  it('lists the Macs with iOS devices by default', async () => {
    await renderAt('/devices')
    expect(await screen.findByText('studio-mac-ios')).toBeTruthy()
    expect(screen.queryByText('studio-mac-android')).toBeNull()
  })

  it('lists the Macs with Android devices when the platform is Android', async () => {
    await renderAt('/devices?platform=android')
    expect(await screen.findByText('studio-mac-android')).toBeTruthy()
    expect(screen.queryByText('studio-mac-ios')).toBeNull()
  })

  it('switches between the platforms', async () => {
    const user = userEvent.setup()
    await renderAt('/devices')
    await user.click(screen.getByRole('tab', { name: 'Android' }))
    expect(await screen.findByText('studio-mac-android')).toBeTruthy()
    await user.click(screen.getByRole('tab', { name: 'iOS' }))
    expect(await screen.findByText('studio-mac-ios')).toBeTruthy()
  })

  it('offers no full reset, which would erase a device nobody uploaded a build for', async () => {
    const user = userEvent.setup()
    await renderAt('/devices')
    await user.click(await screen.findByText('studio-mac-ios'))
    expect(await screen.findByRole('button', { name: /iPhone 17/ })).toBeTruthy()
    expect(screen.queryByLabelText('Full reset')).toBeNull()
  })

  it('hands the viewer a shutdown that stops the device and goes back to the device list', async () => {
    const user = userEvent.setup()
    await renderAt('/devices')
    await user.click(await screen.findByText('studio-mac-ios'))
    await user.click(await screen.findByRole('button', { name: /iPhone 17/ }))
    expect(await screen.findByTestId('device-viewer')).toBeTruthy()
    expect(viewer.onShutdown, 'the viewer was given no way to stop the device').toBeTypeOf('function')

    await user.click(screen.getByRole('button', { name: 'Confirm shutdown' }))

    expect(send).toHaveBeenCalledWith({ type: 'device:shutdown', sessionId: 'sess-ios', payload: { deviceId: 'sim-1' } })
    expect(screen.queryByTestId('device-viewer')).toBeNull()
    expect(await screen.findByRole('button', { name: /iPhone 17/ })).toBeTruthy()
    // The viewer that had focus is gone; focus goes to the first control of the device list, not to `body`.
    expect(document.activeElement).toBe(screen.getByLabelText('Search devices'))
  })
})

describe('QASession with a build', () => {
  it('keeps no platform switch: the build decides the platform', async () => {
    loader.build = BUILD
    await renderAt('/app-center/build?id=7')
    expect(await screen.findByText('studio-mac-ios')).toBeTruthy()
    expect(screen.queryByRole('tab', { name: 'Android' })).toBeNull()
  })

  it('still offers the full reset for a build under test', async () => {
    loader.build = BUILD
    const user = userEvent.setup()
    await renderAt('/app-center/build?id=7')
    await user.click(await screen.findByText('studio-mac-ios'))
    expect(await screen.findByLabelText('Full reset')).toBeTruthy()
  })
})
