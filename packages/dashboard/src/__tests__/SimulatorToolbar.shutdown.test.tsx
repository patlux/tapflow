// Fork (FORK.md): leaving a device keeps it running, so the toolbar is where a tester stops one on purpose.
//
// Same rules as the restart next to it: the last control of the Device group, behind a confirmation, and the
// visible label contained in the accessible name.
import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SimulatorToolbar } from '@/components/device/shared/SimulatorToolbar'

function toolbar({ onShutdown }: { onShutdown?: () => void } = {}) {
  return render(
    <SimulatorToolbar
      reboot={{ pending: false, onReboot: () => {} }}
      shutdown={onShutdown ? { onShutdown } : undefined}
      joined
      onScreenshot={() => {}}
      onRecordToggle={() => {}}
      recordState="idle"
      onRotate={() => {}}
      onDeepLink={() => {}}
      deviceSlot={<button aria-label="Software keyboard" />}
    />,
  )
}

describe('shutting the device down from the toolbar', () => {
  it('closes the Device group, after the restart', () => {
    toolbar({ onShutdown: () => {} })
    const device = within(screen.getByRole('group', { name: 'Device' }))
    const names = device.getAllByRole('button').map((b) => b.getAttribute('aria-label') ?? '')
    expect(names.slice(-2)).toEqual(['Restart the device', 'Shut down the device'])
  })

  it('is not offered when the viewer passes no handler', () => {
    toolbar()
    expect(screen.queryByRole('button', { name: 'Shut down the device' })).toBeNull()
  })

  it('does not shut down on the click that opens the dialog', async () => {
    const onShutdown = vi.fn()
    toolbar({ onShutdown })
    await userEvent.click(screen.getByRole('button', { name: 'Shut down the device' }))
    expect(screen.getByRole('alertdialog'), 'no confirmation was raised').toBeTruthy()
    expect(onShutdown, 'the device stopped before anyone confirmed').not.toHaveBeenCalled()
  })

  it('shuts nothing down when the dialog is dismissed', async () => {
    const onShutdown = vi.fn()
    toolbar({ onShutdown })
    await userEvent.click(screen.getByRole('button', { name: 'Shut down the device' }))
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onShutdown).not.toHaveBeenCalled()
  })

  it('puts focus back on the control when the dialog is dismissed', async () => {
    // The dialog is opened by state, not by an `AlertDialogTrigger`, so Radix has no trigger to return focus to.
    toolbar({ onShutdown: () => {} })
    const control = screen.getByRole('button', { name: 'Shut down the device' })
    await userEvent.click(control)
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await vi.waitFor(() => expect(document.activeElement).toBe(control))
  })

  it('shuts down once when it is confirmed', async () => {
    const onShutdown = vi.fn()
    toolbar({ onShutdown })
    await userEvent.click(screen.getByRole('button', { name: 'Shut down the device' }))
    await userEvent.click(screen.getByRole('button', { name: 'Shut down' }))
    expect(onShutdown).toHaveBeenCalledTimes(1)
  })

  it('shows the same words it answers to', async () => {
    toolbar({ onShutdown: () => {} })
    const button = screen.getByRole('button', { name: 'Shut down the device' })
    await userEvent.hover(button)
    const tip = await screen.findByRole('tooltip')
    expect(button.getAttribute('aria-label'), 'the visible label is not part of the name').toContain(tip.textContent)
  })
})
