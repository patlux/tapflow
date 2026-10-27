import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { WebSocket } from 'ws'
import { RelayServer } from '../RelayServer'
import { initDb, closeDb } from '../db'
import { waitForOpen, waitForType, waitForTypeOrNull } from '@tapflowio/test-utils'
import type { AgentRegistered, DeviceBoot, SessionJoined } from '@tapflowio/protocol'

// Fork (FORK.md): a person's dashboard tab going away leaves the device running. The device is
// shut down only when someone asks for it. Automation keeps upstream's idle countdown, because the relay
// counts and reclaims the devices automation starts.
describe('the idle countdown after a holder socket closes', () => {
  let server: RelayServer
  let port: number
  let tmpDir: string
  const sockets: WebSocket[] = []
  const idleTimeoutMs = 100

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tapflow-dashboard-leave-'))
    initDb(path.join(tmpDir, 'test.db'))
  })
  afterAll(() => {
    closeDb()
    fs.rmSync(tmpDir, { recursive: true })
  })
  afterEach(async () => {
    for (const s of sockets.splice(0)) s.close()
    await server.stop()
  })

  async function open(): Promise<WebSocket> {
    const ws = new WebSocket(`ws://localhost:${port}`)
    sockets.push(ws)
    await waitForOpen(ws)
    return ws
  }

  /** Starts the relay, registers one agent with device `a`, and returns the agent socket and its session. */
  async function setUp(): Promise<{ agentWs: WebSocket; sessionId: string }> {
    server = new RelayServer({ port: 0, idleTimeoutMs })
    await server.start()
    const address = server.address()
    if (address === null || typeof address === 'string') throw new Error('relay has no TCP address')
    port = address.port
    const agentWs = await open()
    agentWs.send(JSON.stringify({
      type: 'agent:register', agentId: 'mac-1', agentName: 'mac-1-ios', platform: 'ios',
      devices: [{ id: 'a', name: 'a', platform: 'ios', status: 'shutdown' }],
    }))
    const reply = await waitForType<AgentRegistered>(agentWs, 'agent:registered')
    const sessionId = reply.registeredSessions.find((r) => r.deviceId === 'a')?.sessionId
    if (sessionId === undefined) throw new Error('device a was not registered')
    return { agentWs, sessionId }
  }

  /** Joins as `clientKind`, boots the device and waits until the agent reports it running. */
  async function holdRunningDevice(agentWs: WebSocket, sessionId: string, clientKind?: 'dashboard' | 'mcp'): Promise<WebSocket> {
    const holder = await open()
    holder.send(JSON.stringify({ type: 'session:start', sessionId, ...(clientKind ? { clientKind } : {}) }))
    await waitForType<SessionJoined>(holder, 'session:joined')
    holder.send(JSON.stringify({ type: 'device:boot', sessionId, requestId: 'boot-1', payload: { deviceId: 'a' } }))
    await waitForType<DeviceBoot>(agentWs, 'device:boot')
    agentWs.send(JSON.stringify({ type: 'device:ready', sessionId, requestId: 'boot-1', payload: { deviceId: 'a', cold: true } }))
    await waitForType(holder, 'device:ready')
    return holder
  }

  it('does not shut the device down when a dashboard tab closes', async () => {
    const { agentWs, sessionId } = await setUp()
    const holder = await holdRunningDevice(agentWs, sessionId, 'dashboard')
    holder.close()
    expect(await waitForTypeOrNull(agentWs, 'device:shutdown', idleTimeoutMs * 4)).toBeNull()
  })

  it('still shuts the device down when an MCP client goes away', async () => {
    const { agentWs, sessionId } = await setUp()
    const holder = await holdRunningDevice(agentWs, sessionId, 'mcp')
    holder.close()
    const shutdown = await waitForType<{ type: 'device:shutdown'; sessionId: string }>(agentWs, 'device:shutdown')
    expect(shutdown.sessionId).toBe(sessionId)
  })

  it('still shuts the device down for a client that does not say what it is', async () => {
    const { agentWs, sessionId } = await setUp()
    const holder = await holdRunningDevice(agentWs, sessionId)
    holder.close()
    const shutdown = await waitForType<{ type: 'device:shutdown'; sessionId: string }>(agentWs, 'device:shutdown')
    expect(shutdown.sessionId).toBe(sessionId)
  })
})
