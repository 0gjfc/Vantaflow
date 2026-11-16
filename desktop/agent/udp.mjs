// Desktop network transport: one UDP request, replies collected until a deadline.
// The only network code in the desktop app; providers and the UI never touch sockets.
import dgram from 'node:dgram';

export class NetworkError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

// Sends `message` to address:port and resolves with every reply received before `timeoutMs`
// (or right after the first reply when `first` is true). Rejects only on socket errors.
export function exchange({ address, port, message, timeoutMs = 2000, broadcast = false, first = false }) {
  return new Promise((resolve, reject) => {
    const socket = dgram.createSocket('udp4');
    const replies = [];
    let done = false;
    const finish = (err) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      socket.close();
      if (err) reject(new NetworkError(err.code === 'ETIMEDOUT' ? 'timeout' : 'network-error', `${err.code ?? 'Error'}: ${err.message}`));
      else resolve(replies);
    };
    const timer = setTimeout(() => finish(), timeoutMs);
    socket.on('error', finish);
    socket.on('message', (buf, rinfo) => {
      replies.push({ text: buf.toString('utf8'), from: rinfo.address, port: rinfo.port });
      if (first) finish();
    });
    socket.bind(0, () => {
      if (broadcast) socket.setBroadcast(true);
      socket.send(Buffer.from(message, 'utf8'), port, address, (err) => { if (err) finish(err); });
    });
  });
}
