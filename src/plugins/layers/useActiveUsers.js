import { useState, useEffect, useRef } from 'react';
import { apiFetch } from '../../utils/apiFetch';

// 👥 Active Users layer — shows other OpenHamClock users on the map in real time.
// Opt-in: enabling the layer starts a heartbeat that reports your callsign and
// grid-square-derived location (rounded to ~1 km) to the server.

export const metadata = {
  id: 'active-users',
  name: 'Active Users',
  description: 'Show other OpenHamClock operators on the map',
  icon: '👥',
  category: 'fun',
  defaultEnabled: false,
  defaultOpacity: 0.85,
  version: '1.0.0',
};

const HEARTBEAT_INTERVAL = 2 * 60 * 1000; // 2 minutes
const FETCH_INTERVAL = 60 * 1000; // 1 minute

export function useLayer({ enabled = false, opacity = 0.85, map = null, callsign, locator }) {
  const [users, setUsers] = useState([]);
  const markersRef = useRef([]);
  const heartbeatRef = useRef(null);

  // Parse own location from locator for heartbeat
  const ownLocation = useRef(null);
  useEffect(() => {
    if (!locator || locator.length < 4) {
      ownLocation.current = null;
      return;
    }
    // Simple Maidenhead to lat/lon (center of grid)
    const g = locator.toUpperCase();
    const lonField = (g.charCodeAt(0) - 65) * 20 - 180;
    const latField = (g.charCodeAt(1) - 65) * 10 - 90;
    const lonSquare = parseInt(g[2]) * 2;
    const latSquare = parseInt(g[3]) * 1;
    let lat = latField + latSquare + 0.5;
    let lon = lonField + lonSquare + 1;
    if (g.length >= 6) {
      const lonSub = (g.charCodeAt(4) - 65) * (2 / 24);
      const latSub = (g.charCodeAt(5) - 65) * (1 / 24);
      lat = latField + latSquare + latSub + 1 / 48;
      lon = lonField + lonSquare + lonSub + 1 / 24;
    }
    ownLocation.current = { lat, lon };
  }, [locator]);

  // Heartbeat — report presence when layer is enabled
  useEffect(() => {
    if (!enabled || !callsign || callsign === 'N0CALL' || !ownLocation.current) return;

    const sendHeartbeat = async () => {
      try {
        await apiFetch('/api/presence', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            callsign,
            lat: ownLocation.current.lat,
            lon: ownLocation.current.lon,
            grid: locator || '',
          }),
        });
      } catch {
        // Silently fail — not critical
      }
    };

    sendHeartbeat();
    heartbeatRef.current = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL);
    return () => clearInterval(heartbeatRef.current);
  }, [enabled, callsign, locator]);

  // Fetch active users
  useEffect(() => {
    if (!enabled) {
      setUsers([]);
      return;
    }

    const fetchUsers = async () => {
      try {
        const res = await apiFetch('/api/presence');
        if (res?.ok) {
          const data = await res.json();
          setUsers(data.users || []);
        }
      } catch {
        // Silently fail
      }
    };

    // Small delay on first fetch so heartbeat registers before we query
    const initialDelay = setTimeout(fetchUsers, 2000);
    const interval = setInterval(fetchUsers, FETCH_INTERVAL);
    return () => {
      clearTimeout(initialDelay);
      clearInterval(interval);
    };
  }, [enabled]);

  // Render markers
  useEffect(() => {
    if (!map || typeof L === 'undefined') return;

    // Clear old markers
    markersRef.current.forEach((m) => {
      try {
        map.removeLayer(m);
      } catch {}
    });
    markersRef.current = [];

    if (!enabled || users.length === 0) return;

    const myCall = (callsign || '').toUpperCase();
    const newMarkers = [];

    users.forEach((user) => {
      if (!user.lat || !user.lon) return;
      const isMe = user.call === myCall;

      const bg = isMe ? 'rgba(34, 197, 94, 0.9)' : 'rgba(99, 102, 241, 0.85)';
      const border = isMe ? 'rgba(34, 197, 94, 0.6)' : 'rgba(255,255,255,0.3)';
      const label = isMe ? `${user.call} (you)` : user.call;

      const icon = L.divIcon({
        className: 'active-user-icon',
        html: `<div style="
          background: ${bg};
          color: #fff;
          font-size: 9px;
          font-weight: 700;
          font-family: 'JetBrains Mono', monospace;
          padding: 2px 5px;
          border-radius: 4px;
          border: 1px solid ${border};
          white-space: nowrap;
          box-shadow: 0 1px 4px rgba(0,0,0,0.4);
          line-height: 1.2;
        ">${label}</div>`,
        iconSize: null,
        iconAnchor: [20, 10],
      });

      const marker = L.marker([user.lat, user.lon], {
        icon,
        opacity,
        zIndexOffset: isMe ? 6000 : 5000,
      }).addTo(map);

      const ageStr = user.age < 1 ? 'just now' : `${user.age}m ago`;
      const popupColor = isMe ? '#22c55e' : '#6366f1';
      marker.bindPopup(`
        <div style="font-family: 'JetBrains Mono', monospace; min-width: 140px;">
          <div style="font-size: 14px; font-weight: bold; color: ${popupColor}; margin-bottom: 4px;">
            👥 ${user.call}${isMe ? ' (you)' : ''}
          </div>
          <div style="font-size: 11px; color: #888;">
            ${user.grid ? `Grid: ${user.grid}<br>` : ''}
            Last seen: ${ageStr}
          </div>
        </div>
      `);

      newMarkers.push(marker);
    });

    markersRef.current = newMarkers;

    return () => {
      newMarkers.forEach((m) => {
        try {
          map.removeLayer(m);
        } catch {}
      });
    };
  }, [enabled, users, map, opacity, callsign]);

  return { users, userCount: users.length };
}
