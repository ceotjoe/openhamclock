/**
 * useIBPRBN — RBN cross-reference for IBP beacons
 *
 * Polls /api/rbn/spots for every IBP beacon callsign and returns a Map
 * of callsign → { maxSNR, count } so IBPPanel can show which beacons
 * are currently being heard by RBN skimmers.
 *
 * All 18 callsigns are queried once per poll (they hit the server's
 * in-memory RBN store — each lookup is O(1) and returns instantly if
 * the beacon hasn't been heard recently).
 */
import { useState, useEffect } from 'react';
import { IBP_BEACONS } from '../utils/ibp.js';

const POLL_INTERVAL = 60_000; // 60 s — one full IBP cycle between polls
const WINDOW_MINUTES = 5; // look back 5 min (covers ~1.7 full IBP cycles)

const ALL_CALLSIGNS = IBP_BEACONS.map((b) => b.callsign);

async function fetchBeaconSpots(callsign) {
  const res = await fetch(`/api/rbn/spots?callsign=${encodeURIComponent(callsign)}&minutes=${WINDOW_MINUTES}&mode=dx`, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) return null;
  const json = await res.json();
  if (!json.spots?.length) return null;
  const snrs = json.spots.map((s) => s.snr).filter((s) => s != null);
  const maxSNR = snrs.length ? Math.max(...snrs) : null;
  const count = new Set(json.spots.map((s) => s.callsign)).size;
  return { maxSNR, count };
}

/**
 * Returns a Map<callsign, { maxSNR: number|null, count: number }>
 * for all IBP beacons that have RBN spots in the last WINDOW_MINUTES.
 * Absent from the map means no recent spots.
 */
export function useIBPRBN() {
  const [data, setData] = useState(new Map());

  useEffect(() => {
    let active = true;

    async function poll() {
      const entries = await Promise.all(
        ALL_CALLSIGNS.map(async (cs) => {
          try {
            const result = await fetchBeaconSpots(cs);
            return result ? [cs, result] : null;
          } catch (_) {
            return null;
          }
        }),
      );
      if (active) {
        setData(new Map(entries.filter(Boolean)));
      }
    }

    poll();
    const id = setInterval(poll, POLL_INTERVAL);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, []); // poll all 18 callsigns — no deps needed, list is a constant

  return data;
}
