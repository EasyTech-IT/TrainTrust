import { api } from './api.js';
import { esc } from './ui.js';

let leafletPromise;
export function loadLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  leafletPromise ??= new Promise((resolve, reject) => {
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = 'vendor/leaflet/leaflet.css';
    document.head.append(css);
    const s = document.createElement('script');
    s.src = 'vendor/leaflet/leaflet.js';
    s.onload = () => resolve(window.L);
    s.onerror = () => {
      leafletPromise = null;
      reject(new Error('Die Karte konnte nicht geladen werden.'));
    };
    document.head.append(s);
  });
  return leafletPromise;
}

const fmtDist = (m) => (m >= 1000 ? `${(m / 1000).toFixed(1).replace('.', ',')} km` : `${m} m`);

// Karte mit Bahnhöfen. Tippen setzt „Ich bin hier“, der Standort-Knopf nutzt GPS, „Live“ folgt dir.
export async function mountMap(root, { onNearby, onLeave }) {
  const L = await loadLeaflet();
  const el = root.querySelector('#map');
  const saved = JSON.parse(localStorage.getItem('tt_lastpos') || 'null');
  const start = saved ? [saved.lat, saved.lon] : [50.05, 8.6];
  const map = L.map(el, { zoomControl: true, attributionControl: true }).setView(start, saved ? 14 : 10);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>-Mitwirkende',
  }).addTo(map);

  const stationLayer = L.layerGroup().addTo(map);
  const stationRenderer = L.canvas({ padding: 0.5 });
  const meIcon = L.divIcon({ className: 'me-pin', html: '<span class="pulse"></span><span class="core"></span>', iconSize: [34, 34], iconAnchor: [17, 17] });
  let me = null;
  let accuracy = null;
  let follow = false;
  let watchId = null;
  let lastNearby = 0;
  let boxTimer;
  let stationRequest = 0;

  const loadStations = async () => {
    const request = ++stationRequest;
    const status = root.querySelector('#map-status');
    const b = map.getBounds();
    try {
      const { stations, truncated } = await api('GET', `/stations?bbox=${b.getSouth()},${b.getWest()},${b.getNorth()},${b.getEast()}`);
      if (request !== stationRequest) return;
      stationLayer.clearLayers();
      for (const s of stations) {
        L.circleMarker([s.lat, s.lon], {
          renderer: stationRenderer,
          radius: 8,
          color: '#ffffff',
          weight: 2,
          fillColor: '#0057d9',
          fillOpacity: 1,
          title: s.name,
        })
          .bindPopup(
            `<b>${esc(s.name)}</b><br><a href="#/station/${s.id}">Abfahrten ansehen</a><br><a href="#/route?from=${s.id}">Hier starten</a><br><a href="#/route?to=${s.id}">Hier als Ziel</a>`
          )
          .addTo(stationLayer);
      }
      status.textContent = stations.length
        ? `${truncated ? 'Mehr als ' : ''}${stations.length} Haltestellen im Kartenausschnitt. ${truncated ? 'Zoome näher heran, um alle einzeln zu sehen.' : 'Tippe auf einen Punkt, um die Haltestelle auszuwählen.'}`
        : 'In diesem Kartenausschnitt wurden keine Haltestellen gefunden.';
    } catch (e) {
      if (request !== stationRequest) return;
      stationLayer.clearLayers();
      status.textContent = `${e.message} Bewege die Karte, um es erneut zu versuchen.`;
    }
  };
  map.on('moveend', () => {
    clearTimeout(boxTimer);
    boxTimer = setTimeout(loadStations, 250);
  });
  loadStations();

  const setMe = (lat, lon, acc, source) => {
    if (!me) me = L.marker([lat, lon], { icon: meIcon, keyboard: false, zIndexOffset: 1000 }).addTo(map);
    else me.setLatLng([lat, lon]);
    accuracy?.remove();
    accuracy = acc && acc > 25 ? L.circle([lat, lon], { radius: acc, color: '#0060eb', weight: 1, fillOpacity: 0.08 }).addTo(map) : null;
    localStorage.setItem('tt_lastpos', JSON.stringify({ lat, lon, source }));
    if (Date.now() - lastNearby > 8000) {
      lastNearby = Date.now();
      onNearby(lat, lon, source);
    }
  };

  map.on('click', (e) => {
    stopLive();
    lastNearby = 0;
    setMe(e.latlng.lat, e.latlng.lng, 0, 'tap');
  });

  const locate = () =>
    new Promise((resolve) => {
      if (!navigator.geolocation) return resolve(false);
      navigator.geolocation.getCurrentPosition(
        (p) => {
          lastNearby = 0;
          setMe(p.coords.latitude, p.coords.longitude, p.coords.accuracy, 'gps');
          map.flyTo([p.coords.latitude, p.coords.longitude], Math.max(map.getZoom(), 15));
          resolve(true);
        },
        () => resolve(false),
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 10000 }
      );
    });

  function stopLive() {
    if (watchId !== null) navigator.geolocation.clearWatch(watchId);
    watchId = null;
    follow = false;
    const b = root.querySelector('#live');
    if (b) b.setAttribute('aria-pressed', 'false');
  }
  const startLive = () => {
    if (!navigator.geolocation) return false;
    follow = true;
    watchId = navigator.geolocation.watchPosition(
      (p) => {
        setMe(p.coords.latitude, p.coords.longitude, p.coords.accuracy, 'gps');
        if (follow) map.panTo([p.coords.latitude, p.coords.longitude], { animate: true });
      },
      () => stopLive(),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 }
    );
    root.querySelector('#live').setAttribute('aria-pressed', 'true');
    return true;
  };
  map.on('dragstart', () => (follow = false));

  onLeave(() => {
    stopLive();
    map.remove();
  });

  if (saved) setMe(saved.lat, saved.lon, 0, saved.source);
  setTimeout(() => map.invalidateSize(), 200);
  return { locate, startLive, stopLive, isLive: () => watchId !== null, fmtDist };
}
