#!/usr/bin/env node

const dgram = require('dgram');

function parseArgs(argv) {
  const options = {
    host: '127.0.0.1',
    port: 12060,
    intervalMs: 1200,
    count: 6,
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
  console.log(`Mixed UDP spot test generator for OpenHamClock

Usage:
  node scripts/send-udp-spots-mixed.js [options]

Options:
  --host <host>         Destination host (default: 127.0.0.1)
  --port <port>         Destination UDP port (default: 12060)
  --interval <ms>       Delay between spots (default: 1200)
  --count <n|0>         Number of packets to send; 0 = continuous (default: 6)
  --spotter <call>      Spotter callsign to use (default: K1TEST)
  --freq <mhz>          Starting frequency in MHz (default: 14074.0)
  --broadcast           Enable UDP broadcast on the socket
  --help                Show this message

This script cycles through multiple payload styles that OpenHamClock accepts:
  1. MacLoggerDX XML
  2. JSON
  3. DX de text line
  4. Caret-delimited
  5. Semicolon-delimited
  6. Tab-delimited
`);
}

const sampleSpots = [
  { dxCall: 'W1AW', comment: 'FT8 mixed-format test spot' },
  { dxCall: 'K3LR', comment: 'CW mixed-format test spot' },
  { dxCall: 'VP8LP', comment: 'DX mixed-format test spot' },
  { dxCall: 'ZS1ANF', comment: 'UDP parser validation spot' },
  { dxCall: 'HB9AFZ', comment: 'Mixed generator sanity check' },
  { dxCall: 'JA1NUT', comment: 'Tab delimited parser test' },
];

function isoTimestampNoMillis(date) {
  return new Date(date.getTime() - date.getMilliseconds()).toISOString();
}

function hhmmz(date) {
  return `${String(date.getUTCHours()).padStart(2, '0')}${String(date.getUTCMinutes()).padStart(2, '0')}Z`;
}

function buildPayload(variantIndex, spotter, dxCall, frequency, comment, timestamp, now) {
  const variant = variantIndex % 6;

  if (variant === 0) {
    return {
      label: 'xml',
      payload: `<?xml version="1.0"?><spot><action>add</action><dxcall>${dxCall}</dxcall><frequency>${frequency.toFixed(1)}</frequency><spottercall>${spotter}</spottercall><comment>${comment}</comment><timestamp>${timestamp}</timestamp></spot>`,
    };
  }

  if (variant === 1) {
    return {
      label: 'json',
      payload: JSON.stringify({ spotter, dxCall, frequency, comment, timestamp }),
    };
  }

  if (variant === 2) {
    return {
      label: 'dx',
      payload: `DX de ${spotter}: ${(frequency * 1000).toFixed(1)} ${dxCall} ${comment} ${hhmmz(now)}`,
    };
  }

  if (variant === 3) {
    return {
      label: 'caret',
      payload: `${spotter}^${(frequency * 1000).toFixed(1)}^${dxCall}^${comment}^${hhmmz(now)}`,
    };
  }

  if (variant === 4) {
    return {
      label: 'semicolon',
      payload: `${spotter};${frequency.toFixed(3)};${dxCall};${comment};${timestamp}`,
    };
  }

  return {
    label: 'tab',
    payload: `${spotter}\t${frequency.toFixed(3)}\t${dxCall}\t${comment}\t${timestamp}`,
  };
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
    const frequency = options.baseFreq + (sent % sampleSpots.length) * 0.05;
    const timestamp = isoTimestampNoMillis(now);
    const { label, payload } = buildPayload(
      sent,
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
      `[${sent}${total === 0 ? '/∞' : `/${total}`}]: sent ${label.toUpperCase()} UDP spot ${options.spotter} -> ${sample.dxCall} ${frequency.toFixed(3)} MHz (${bytes} bytes)`,
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
