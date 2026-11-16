// Test helper: a FAKE console that answers DDP SRCH on 127.0.0.1. It replays replies built from
// the documented reply format (shared/ddp-samples.json). Tests that use it prove VantaFlow's
// logic, NOT that detection works with a physical console.
import dgram from 'node:dgram';

// replyFor(message) → reply text, or null to stay silent (e.g. to test timeouts).
export async function startFakeConsole(replyFor) {
  const socket = dgram.createSocket('udp4');
  const received = [];
  socket.on('message', (buf, rinfo) => {
    const text = buf.toString('utf8');
    received.push(text);
    const reply = replyFor(text);
    if (reply) socket.send(Buffer.from(reply, 'utf8'), rinfo.port, rinfo.address);
  });
  await new Promise((done) => socket.bind(0, '127.0.0.1', done));
  return { port: socket.address().port, received, close: () => new Promise((done) => socket.close(done)) };
}
