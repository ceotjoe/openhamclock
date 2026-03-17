#!/usr/bin/env node

const dgram = require('dgram');

function parseArgs(argv) {
  const options = {
    host: '127.0.0.1',
    port: 12060,
    intervalMs: 1000,
    count: 5,
    format: 'xml',
    broadcast: false,
    spotter: 'K1TEST',
    baseFreq: 14074.0,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    if (arg === '--host' && next) {
      options.host = next;
      index += 1;
      continue;
    }
    if (arg === '--port' && next) {
      options.port = parseInt(next, 10) || options.port;
      index += 1;
      continue;
    }
    if (arg === '--interval' && next) {
      options.intervalMs = Math.max(100, parseInt(next, 10) || options.intervalMs);
      index += 1;
      continue;
    }
    if (arg === '--count' && next) {
      if (next === '0' || next.toLowerCase() === 'continuous') {
        options.count = 0;
      } else {
        options.count = Math.max(1, parseInt(next, 10) || options.count);
      }
      index += 1;
      continue;
    }
    if (arg === '--format' && next) {
      options.format = String(next).toLowerCase();
      index += 1;
      continue;
    }
    if (arg === '--spotter' && next) {
      options.spotter = String(next).toUpperCase();
      index += 1;
      continue;
    }
    if (arg === '--freq' && next) {
      options.baseFreq = parseFloat(next) || options.baseFreq;
      index += 1;
      continue;
    }
    if (arg === '--broadcast') {
      options.broadcast = true;
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      options.help = true;
      continue;
    }
  }

  return options;
}

function printHelp() {
  console.log(`UDP spot test generator for OpenHamClock

Usage:
  node scripts/send-udp-spots.js [options]

Options:
  --host <host>         Destination host (default: 127.0.0.1)
  --port <port>         Destination UDP port (default: 12060)
  --interval <ms>       Delay between spots (default: 1000)
  --count <n|0>         Number of spots to send; 0 = continuous (default: 5)
  --format <xml|json|dx>
                        Payload format (default: xml)
  --spotter <call>      Spotter callsign to use (default: K1TEST)
  --freq <mhz>          Starting frequency in MHz (default: 14074.0)
  --broadcast           Enable UDP broadcast on the socket
  --help                Show this message

Examples:
  npm run test:udp-spots
  npm run test:udp-spots -- --host 192.168.68.255 --broadcast --count 0
  node scripts/send-udp-spots.js --format dx --count 3 --freq 7.074
`);
}

const sampleSpots = [
  { dxCall: 'W1AW', comment: 'FT8 test spot from OpenHamClock' },
  { dxCall: 'K3LR', comment: 'CW test spot from OpenHamClock' },
  { dxCall: 'N0CALL', comment: 'SSB test spot from OpenHamClock' },
  { dxCall: 'VP8LP', comment: 'DX test spot from OpenHamClock' },
  { dxCall: 'ZS1ANF', comment: 'UDP spot generator sanity check' },
];

function isoTimestampNoMillis(date) {
  return new Date(date.getTime() - date.getMilliseconds()).toISOString();
}

function buildXmlSpot(spotter, dxCall, frequency, comment, timestamp) {
  return `<?xml version="1.0"?><spot><action>add</action><dxcall>${dxCall}</dxcall><frequency>${frequency.toFixed(1)}</frequency><spottercall>${spotter}</spottercall><comment>${comment}</comment><timestamp>${timestamp}</timestamp></spot>`;
}

function buildJsonSpot(spotter, dxCall, frequency, comment, timestamp) {
  return JSON.stringify({
    spotter,
    dxCall,
    frequency,
    comment,
    timestamp,
  });
}

function buildDxDeSpot(spotter, dxCall, frequency, comment, date) {
  const hh = String(date.getUTCHours()).padStart(2, '0');
  const mm = String(date.getUTCMinutes()).padStart(2, '0');
  const khz = (frequency * 1000).toFixed(1);
  return `DX de ${spotter}: ${khz} ${dxCall} ${comment} ${hh}${mm}Z`;
}

function buildPayload(format, spotter, dxCall, frequency, comment, timestamp, date) {
  if (format === 'json') return buildJsonSpot(spotter, dxCall, frequency, comment, timestamp);
  if (format === 'dx') return buildDxDeSpot(spotter, dxCall, frequency, comment, date);
  return buildXmlSpot(spotter, dxCall, frequency, comment, timestamp);
}

function sendPacket(socket, host, port, payload) {
  return new Promise((resolve, reject) => {
    const buffer = Buffer.from(payload, 'utf8');
    socket.send(buffer, port, host, (error) => {
      if (error) reject(error);
      else resolve(buffer.length);
    });
  });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  if (!['xml', 'json', 'dx'].includes(options.format)) {
    throw new Error(`Unsupported format: ${options.format}`);
  }

  const socket = dgram.createSocket('udp4');
  if (options.broadcast) {
    socket.bind(() => {
      socket.setBroadcast(true);
    });
  }

  let sent = 0;
  const total = options.count;

  const tick = async () => {
    const sample = sampleSpots[sent % sampleSpots.length];
    const now = new Date();
    const frequency = options.baseFreq + (sent % 5) * 0.1;
    const timestamp = isoTimestampNoMillis(now);
    const payload = buildPayload(
      options.format,
      options.spotter,
      sample.dxCall,
      frequency,
      sample.comment,
      timestamp,
      now,
    );

    const bytes = await sendPacket(socket, options.host, options.port, payload);
    sent += 1;

    console.log(
      `[${sent}${total === 0 ? '/∞' : `/${total}`}]: sent ${options.format.toUpperCase()} UDP spot ${options.spotter} -> ${sample.dxCall} ${frequency.toFixed(3)} MHz (${bytes} bytes)`,
    );

    if (total !== 0 && sent >= total) {
      socket.close();
      return;
    }

    setTimeout(() => {
      tick().catch((error) => {
        console.error('Send failed:', error.message);
        socket.close();
        process.exitCode = 1;
      });
    }, options.intervalMs);
  };

  tick().catch((error) => {
    console.error('Send failed:', error.message);
    socket.close();
    process.exitCode = 1;
  });
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
