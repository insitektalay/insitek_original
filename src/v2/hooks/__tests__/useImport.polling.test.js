import { renderHook } from '@testing-library/react-hooks'
import { act } from '@testing-library/react'
import { useImport } from '../useImport.js'
import { ImportProvider } from '../../contexts/ImportContext.jsx'

jest.useFakeTimers()

const mockJob = { id: 'job-1', state: 'PROCESSING', progress: 0 }

let fetchCount = 0

beforeEach(() => {
  fetchCount = 0
  global.fetch = jest.fn(() => {
    fetchCount += 1
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve([mockJob]),
    })
  })

  class MockWebSocket {
    constructor() {
      this.listeners = {}
      setTimeout(() => {
        // Open then close immediately to simulate drop
        this.listeners['open']?.forEach((cb) => cb({}))
        this.listeners['close']?.forEach((cb) => cb({}))
      }, 0)
    }
    addEventListener(ev, cb) {
      ;(this.listeners[ev] ||= []).push(cb)
    }
    send() {}
    close() {}
  }
  global.WebSocket = MockWebSocket
})

afterEach(() => {
  jest.clearAllMocks()
  jest.clearAllTimers()
})

describe('useImport polling fallback', () => {
  it('polls every 10s while socket down', async () => {
    renderHook(() => useImport(), { wrapper: ImportProvider })

    // First fetch immediately on mount
    expect(fetchCount).toBe(1)

    // Advance 10s to trigger first poll
    await act(async () => {
      jest.advanceTimersByTime(10000)
    })
    expect(fetchCount).toBe(2)

    // Advance another 10s -> another poll
    await act(async () => {
      jest.advanceTimersByTime(10000)
    })
    expect(fetchCount).toBe(3)
  })
}) 