import { renderHook, act } from '@testing-library/react-hooks'
import { waitFor } from '@testing-library/react'
import { useImport } from '../useImport.js'

// ----- Mocks --------------------------------------------------------

const mockJob = { id: 'job-1', state: 'PROCESSING', progress: 0 }

global.fetch = jest.fn(() =>
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve([mockJob]),
  })
)

class MockWebSocket {
  static instances = []
  constructor(url) {
    this.url = url
    this.listeners = {}
    MockWebSocket.instances.push(this)
  }
  addEventListener(event, cb) {
    ;(this.listeners[event] ||= []).push(cb)
  }
  send() {}
  close() {
    this.closed = true
  }
  trigger(event, data) {
    const ev = { data }
    ;(this.listeners[event] || []).forEach((cb) => cb(ev))
  }
}

global.WebSocket = MockWebSocket

// ----- Tests --------------------------------------------------------

describe('useImport hook', () => {
  afterEach(() => {
    jest.clearAllMocks()
    MockWebSocket.instances.length = 0
  })

  it('fetches active job on mount', async () => {
    const { result } = renderHook(() => useImport())

    await waitFor(() => expect(result.current.activeJob).toEqual(mockJob))

    expect(fetch).toHaveBeenCalledWith('http://localhost:3001/api/import-jobs?status=active')
  })

  it('updates job progress via WebSocket message', async () => {
    const { result } = renderHook(() => useImport())

    await waitFor(() => result.current.activeJob)

    const ws = MockWebSocket.instances[0]
    act(() => {
      ws.trigger('message', JSON.stringify({
        type: 'progress',
        importId: mockJob.id,
        stage: 'Downloading',
        progress: 55,
      }))
    })

    expect(result.current.activeJob.progress).toBe(55)
    expect(result.current.activeJob.stage).toBe('Downloading')
    expect(result.current.activeJob.state).toBe('PROCESSING')
  })
}) 