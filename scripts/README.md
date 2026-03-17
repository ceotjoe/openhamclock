# UDP Spot Test Scripts

This folder includes two small Node.js scripts for testing OpenHamClock's local-network UDP DX spot listener.

## Scripts

### `send-udp-spots.js`

Sends a simple stream of test spots to a UDP host and port.

- Default format: MacLoggerDX-style XML `<spot>` payloads
- Optional formats: JSON and `DX de ...` text lines
- Best when you want a predictable, focused test

Run it with:

```bash
npm run test:udp-spots
```

Common examples:

```bash
npm run test:udp-spots -- --count 1
```

```bash
npm run test:udp-spots -- --host 192.168.68.255 --broadcast --count 0
```

```bash
npm run test:udp-spots -- --format dx --count 3 --freq 7.074
```

### `send-udp-spots-mixed.js`

Cycles through multiple payload styles that OpenHamClock currently parses:

1. MacLoggerDX XML
2. JSON
3. `DX de` text
4. Caret-delimited
5. Semicolon-delimited
6. Tab-delimited

This is useful when you want to validate parser coverage rather than only one source format.

Run it with:

```bash
npm run test:udp-spots:mixed
```

Continuous broadcast example:

```bash
npm run test:udp-spots:mixed -- --host 192.168.68.255 --broadcast --count 0
```

## Options

Both scripts support these options:

- `--host <host>` destination IP or hostname, default `127.0.0.1`
- `--port <port>` UDP port, default `12060`
- `--interval <ms>` delay between packets
- `--count <n|0>` packet count, where `0` means continuous
- `--spotter <call>` spotter callsign to send
- `--freq <mhz>` starting frequency in MHz
- `--broadcast` enable UDP broadcast mode

`send-udp-spots.js` also supports:

- `--format <xml|json|dx>`

## Typical workflow

1. Start OpenHamClock.
2. In Settings, select `UDP Spots (Local Network)`.
3. Leave UDP IP blank for local receive testing, or use a broadcast address if you are intentionally broadcasting.
4. Set UDP port to `12060` unless you changed it.
5. Run one of the test scripts.
6. Confirm spots appear in the DX Cluster panel and on the map.

## Notes

- For local testing on the same machine, use `127.0.0.1`.
- For LAN broadcast testing, use your subnet's broadcast address and include `--broadcast`.
- Continuous mode (`--count 0`) is useful for soak testing and parser troubleshooting.
