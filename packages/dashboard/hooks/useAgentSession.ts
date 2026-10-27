import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useRelay } from '@/hooks/useRelay'
import type { DeviceSummary, BrowserInbound, SessionInfo } from '@/lib/types'
import type { FormFactor } from '@tapflowio/protocol'

export function useAgentSession(os: string) {
  const [sessions, setSessions] = useState<SessionInfo[]>([])
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null)
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [deviceId, setDeviceId] = useState('')
  // The last form factor known for the active device: from the pick, then from any listing that
  // names one. The list is rebuilt every few seconds and leaves out a device whose agent is
  // reconnecting, so reading it live would blank the value — and flip an iPad's volume tooltips back —
  // for as long as the agent is away. A listing without one never clears it.
  const [activeFormFactor, setActiveFormFactor] = useState<FormFactor | undefined>(undefined)
  const [booting, setBooting] = useState(false)
  const [status, setStatus] = useState('')

  // ref to avoid stale closure in shutdown callbacks
  const activeSessionRef = useRef({ sessionId: activeSessionId, deviceId })
  useEffect(() => {
    activeSessionRef.current = { sessionId: activeSessionId, deviceId }
  }, [activeSessionId, deviceId])

  const handleMessage = useCallback((msg: BrowserInbound) => {
    if (msg.type === 'agents:listed') {
      setSessions(msg.sessions)
      const { deviceId: active } = activeSessionRef.current
      const known = active ? msg.sessions.flatMap((s) => s.devices).find((d) => d.id === active)?.formFactor : undefined
      if (known) setActiveFormFactor(known)
    }
    if (msg.type === 'session:joined') { setBooting(false); setStatus('Connected') }
    if (msg.type === 'error') { setBooting(false); setStatus(`Error: ${msg.message}`) }
  }, [])

  const { send, connected } = useRelay(handleMessage)

  useEffect(() => {
    if (!connected) return
    send({ type: 'agents:list' })
    const id = setInterval(() => send({ type: 'agents:list' }), 5000)
    return () => clearInterval(id)
  }, [connected, send])

  // Fork (FORK.md): **leaving a device keeps it running.** Every way out of a device view sends
  // `session:leave`, which releases the session and keeps the device up, the same as a CI run leaving. The
  // relay does not count down a dashboard holder either, so a closed tab keeps the device running too. Only
  // `shutdownDevice` stops a device.
  //
  // Unmount teardown. **A layout effect, so it runs before `useRelay` closes the socket.** React runs passive
  // cleanups in declaration order and `useRelay`'s comes first, so as a `useEffect` this send found the socket
  // already CLOSING and was dropped. Layout cleanups run during the commit, before any passive one.
  useLayoutEffect(() => {
    return () => {
      const { sessionId } = activeSessionRef.current
      if (sessionId) send({ type: 'session:leave', sessionId })
    }
  }, [send])

  const agentGroups = sessions.filter((s) => s.devices.some((d) => d.platform === os))

  const startDevice = useCallback((d: DeviceSummary) => {
    setActiveFormFactor(d.formFactor)
    setDeviceId(d.id)
    setBooting(true)
    setStatus('Booting…')
    setActiveSessionId(d.sessionId)
  }, [])

  const resetDevice = useCallback(() => setDeviceId(''), [])

  const leaveActiveSession = useCallback(() => {
    const { sessionId } = activeSessionRef.current
    if (sessionId) send({ type: 'session:leave', sessionId })
  }, [send])

  const handleBack = useCallback(() => {
    leaveActiveSession()
    setActiveSessionId(null)
    setBooting(false)
    setStatus('')
  }, [leaveActiveSession])

  /**
   * Stops the open device and goes back to the device list of the same Mac.
   *
   * **No `requestId`, on purpose.** Nothing here waits for `device:shutdown-done`: the view is gone the
   * moment this returns, and the device list shows the new state on its next refresh. The relay
   * originates this message itself, so its correlator is optional by contract. See 「Lifecycle
   * correlation」 in protocol/AGENTS.md.
   */
  const shutdownDevice = useCallback(() => {
    const { sessionId, deviceId: dId } = activeSessionRef.current
    if (!sessionId || !dId) return
    send({ type: 'device:shutdown', sessionId, payload: { deviceId: dId } })
    setActiveSessionId(null)
    setBooting(false)
    setStatus('')
    send({ type: 'agents:list' })
  }, [send])

  const handleBackToMacs = useCallback(() => {
    leaveActiveSession()
    setActiveSessionId(null)
    setSelectedAgent(null)
    setBooting(false)
    setStatus('')
    send({ type: 'agents:list' })
  }, [leaveActiveSession, send])

  /**
   * The relay told us the session is gone (the agent went away). Same destination as
   * `handleBackToMacs` but deliberately **not** the same function: there is no session left, so a
   * `session:leave` would be addressed to a sessionId the relay has already dropped. The relay
   * discards it silently (that case has no `else` branch), so nothing breaks — it is simply a
   * message sent about something that no longer exists.
   *
   * The immediate `agents:list` matters here. The list otherwise refreshes on a 5s interval, and
   * this flow puts the user back on it and invites them to pick again straight away — with a stale
   * list that would mean joining a sessionId the relay has already dropped.
   */
  const handleSessionEnded = useCallback(() => {
    setActiveSessionId(null)
    setSelectedAgent(null)
    setBooting(false)
    setStatus('')
    send({ type: 'agents:list' })
  }, [send])

  return {
    sessions,
    activeFormFactor,
    selectedAgent,
    setSelectedAgent,
    activeSessionId,
    deviceId,
    booting,
    status,
    send,
    connected,
    agentGroups,
    startDevice,
    resetDevice,
    handleBack,
    handleBackToMacs,
    handleSessionEnded,
    shutdownDevice,
  }
}
