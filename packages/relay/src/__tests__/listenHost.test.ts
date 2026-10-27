import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'

// Fork (FORK.md): the relay can listen on one address only, so a pilot can bind it to a tailnet address
// instead of every interface. Without the setting it keeps upstream's dual-stack wildcard bind.

describe('local.host in the relay config', () => {
  let exitSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.resetModules()
    vi.unstubAllEnvs()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('process.exit') })
  })
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it('is null by default', async () => {
    const { config } = await import('../lib/config.js')
    expect(config.local.host).toBeNull()
    expect(exitSpy).not.toHaveBeenCalled()
  })

  it('takes TAPFLOW_HOST', async () => {
    vi.stubEnv('TAPFLOW_HOST', '100.93.110.116')
    const { config } = await import('../lib/config.js')
    expect(config.local.host).toBe('100.93.110.116')
    expect(exitSpy).not.toHaveBeenCalled()
  })

  it('ignores an empty TAPFLOW_HOST', async () => {
    vi.stubEnv('TAPFLOW_HOST', '')
    const { config } = await import('../lib/config.js')
    expect(config.local.host).toBeNull()
  })
})

describe('the address the relay listens on', () => {
  let tmpDir: string

  beforeEach(() => {
    vi.resetModules()
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tapflow-listen-host-'))
  })
  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true })
  })

  async function listenAddress(host?: string): Promise<string> {
    const { initDb, closeDb } = await import('../db')
    const { RelayServer } = await import('../RelayServer')
    initDb(path.join(tmpDir, 'test.db'))
    const server = new RelayServer({ port: 0, ...(host !== undefined ? { host } : {}) })
    await server.start()
    try {
      const address = server.address()
      if (address === null || typeof address === 'string') throw new Error('relay has no TCP address')
      return address.address
    } finally {
      await server.stop()
      closeDb()
    }
  }

  it('binds every interface when no host is given', async () => {
    expect(await listenAddress()).toBe('::')
  })

  it('binds only the given address', async () => {
    expect(await listenAddress('127.0.0.1')).toBe('127.0.0.1')
  })
})
