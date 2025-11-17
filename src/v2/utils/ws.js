// src/v2/utils/ws.js
// Simple WebSocket wrapper; can be extended later with reconnection logic.

export function createWebSocket(url, { onOpen, onMessage, onClose } = {}) {
  let socket
  let retries = 0

  const connect = () => {
    socket = new WebSocket(url)

    socket.addEventListener('open', (ev) => {
      retries = 0 // reset back-off on successful connect
      onOpen?.(ev, socket)
    })

    if (onMessage) socket.addEventListener('message', (ev) => onMessage(ev, socket))

    const scheduleReconnect = () => {
      const delay = Math.min(30000, 1000 * 2 ** retries) // cap 30s
      retries += 1
      setTimeout(connect, delay)
    }

    socket.addEventListener('close', (ev) => {
      onClose?.(ev, socket)
      scheduleReconnect()
    })

    socket.addEventListener('error', (ev) => {
      console.error('WebSocket error', ev)
      // Browsers usually fire close after error; if not, force close
      if (socket.readyState !== WebSocket.CLOSED) socket.close()
    })
  }

  connect()
  return {
    send: (...args) => socket?.send(...args),
    close: () => socket?.close(),
    get socket() {
      return socket
    },
  }
} 