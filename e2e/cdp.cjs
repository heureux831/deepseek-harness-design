// Minimal zero-dependency Chrome DevTools Protocol client.
const http = require('node:http')
const crypto = require('node:crypto')

function httpJson(port, path) {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port, path }, (res) => {
      let body = ''
      res.on('data', (c) => { body += c })
      res.on('end', () => { try { resolve(JSON.parse(body)) } catch (e) { reject(e) } })
    }).on('error', reject)
  })
}

class CDP {
  constructor(ws) { this.ws = ws; this.id = 0; this.pending = new Map(); this.events = [] }
  static async attach(port, targetFilter) {
    for (let i = 0; i < 60; i++) {
      try {
        const list = await httpJson(port, '/json/list')
        const target = list.find((t) => t.type === 'page' && (!targetFilter || t.url.includes(targetFilter)))
          || list.find((t) => t.type === 'page')
        if (target && target.webSocketDebuggerUrl) return new CDP(await CDP.connect(target.webSocketDebuggerUrl))
      } catch (e) { /* not up yet */ }
      await new Promise((r) => setTimeout(r, 500))
    }
    throw new Error('no debuggable page appeared')
  }
  static connect(url) {
    return new Promise((resolve, reject) => {
      const u = new URL(url)
      const key = crypto.randomBytes(16).toString('base64')
      const req = http.request({
        host: u.hostname, port: u.port, path: u.pathname + u.search,
        headers: {
          Connection: 'Upgrade', Upgrade: 'websocket',
          'Sec-WebSocket-Key': key, 'Sec-WebSocket-Version': '13',
        },
      })
      req.on('upgrade', (res, socket) => {
        socket.setNoDelay(true)
        resolve(new WsChannel(socket))
      })
      req.on('error', reject)
      req.end()
    })
  }
  send(method, params = {}, sessionId) {
    const id = ++this.id
    const msg = JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })
    this.ws.send(msg)
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      setTimeout(() => { if (this.pending.has(id)) { this.pending.delete(id); reject(new Error('timeout: ' + method)) } }, 30000)
    })
  }
}

// RFC6455 client framing, enough for text frames in both directions.
class WsChannel {
  constructor(socket) {
    this.socket = socket
    this.buffer = Buffer.alloc(0)
    this.handlers = []
    socket.on('data', (chunk) => {
      this.buffer = Buffer.concat([this.buffer, chunk])
      this.drain()
    })
  }
  onMessage(fn) { this.handlers.push(fn) }
  drain() {
    while (this.buffer.length >= 2) {
      const first = this.buffer[0]
      const second = this.buffer[1]
      const opcode = first & 0x0f
      const masked = (second & 0x80) !== 0
      let len = second & 0x7f
      let offset = 2
      if (len === 126) { len = this.buffer.readUInt16BE(2); offset = 4 }
      else if (len === 127) { len = Number(this.buffer.readBigUInt64BE(2)); offset = 10 }
      if (masked) offset += 4
      if (this.buffer.length < offset + len) return
      let payload = this.buffer.subarray(offset, offset + len)
      if (masked) {
        const mask = this.buffer.subarray(offset - 4, offset)
        payload = Buffer.from(payload.map((b, i) => b ^ mask[i % 4]))
      }
      this.buffer = this.buffer.subarray(offset + len)
      if (opcode === 0x1) {
        const text = payload.toString('utf8')
        for (const fn of this.handlers) fn(text)
      } else if (opcode === 0x8) {
        this.socket.end()
      } else if (opcode === 0x9) {
        this.sendFrame(payload, 0xa)
      }
    }
  }
  sendFrame(payload, opcode = 0x1) {
    const data = Buffer.isBuffer(payload) ? payload : Buffer.from(payload, 'utf8')
    const mask = crypto.randomBytes(4)
    let header
    if (data.length < 126) {
      header = Buffer.alloc(2)
      header[1] = 0x80 | data.length
    } else if (data.length < 65536) {
      header = Buffer.alloc(4)
      header[1] = 0x80 | 126
      header.writeUInt16BE(data.length, 2)
    } else {
      header = Buffer.alloc(10)
      header[1] = 0x80 | 127
      header.writeBigUInt64BE(BigInt(data.length), 2)
    }
    header[0] = 0x80 | opcode
    const masked = Buffer.from(data.map((b, i) => b ^ mask[i % 4]))
    this.socket.write(Buffer.concat([header, mask, masked]))
  }
  send(text) { this.sendFrame(text) }
  close() { try { this.socket.end() } catch (e) {} }
}

module.exports = { CDP, httpJson }
