/* ────────────────────────────────────────────────────────────
   ServiceFinder – renderer/app.js
   All Google Maps integration, IPC calls, UI logic
   ──────────────────────────────────────────────────────────── */

'use strict';

// ── State ─────────────────────────────────────────────────────────────────────
const state = {
  theme: 'dark',
  addressSourceUrl: '',
  serviceDatabaseUrl: '',
  randomPopulateUrl: '',
  googleMapsApiKey: '',
  map: null,
  addressMarker: null,
  addressLatLng: null,
  serviceMarkers: [],
  rippleOverlay: null,
  infoWindow: null,
  activeResultItem: null,
  searchRadius: 5,
};

// ── DOM Refs ──────────────────────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);

const DOM = {
  body:          document.body,
  themeIcon:     $('theme-icon'),
  btnTheme:      $('btn-theme'),
  btnClose:      $('btn-close'),
  btnMinimize:   $('btn-minimize'),
  btnMaximize:   $('btn-maximize'),

  inputAddressUrl:  $('input-address-url'),
  inputServiceUrl:  $('input-service-url'),
  inputPopulateUrl: $('input-populate-url'),
  inputRadius:      $('input-radius'),

  dotAddress:  $('dot-address'),
  dotService:  $('dot-service'),
  dotPopulate: $('dot-populate'),

  btnFetch:    $('btn-fetch'),
  btnSearch:   $('btn-search'),
  btnPopulate: $('btn-populate'),

  sectionAddress: $('section-address'),
  addressText:    $('address-text'),
  coordsText:     $('coords-text'),

  resultCount: $('result-count'),
  resultsList: $('results-list'),

  mapDiv:         $('map'),
  mapPlaceholder: $('map-placeholder'),
  rippleSvg:      $('ripple-svg'),
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function setDot(dot, status) {
  dot.className = 'status-dot';
  if (status) dot.classList.add(status);
}

function setBusy(btn, busy) {
  const text    = btn.querySelector('.btn-text');
  const spinner = btn.querySelector('.btn-spinner');
  btn.disabled  = busy;
  if (busy) {
    text.classList.add('hidden');
    spinner.classList.remove('hidden');
    btn.classList.add('pulsing');
  } else {
    text.classList.remove('hidden');
    spinner.classList.add('hidden');
    btn.classList.remove('pulsing');
  }
}

function updateResultCount(n) {
  DOM.resultCount.textContent = n;
  DOM.resultCount.classList.remove('flip');
  void DOM.resultCount.offsetWidth; // reflow
  DOM.resultCount.classList.add('flip');
  setTimeout(() => DOM.resultCount.classList.remove('flip'), 400);
}

function renderStars(rating) {
  const full  = Math.floor(rating);
  const half  = rating % 1 >= 0.5 ? 1 : 0;
  const empty = 5 - full - half;
  return '★'.repeat(full) + (half ? '½' : '') + '☆'.repeat(empty);
}

// ── Theme ─────────────────────────────────────────────────────────────────────

function applyTheme(theme) {
  state.theme = theme;
  DOM.body.className = `theme-${theme}`;
  DOM.themeIcon.textContent = theme === 'dark' ? '🌙' : '☀️';
  if (state.map) applyMapStyle();
}

function toggleTheme() {
  const next = state.theme === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  window.api.saveSettings({ theme: next });
}

// ── Google Maps ───────────────────────────────────────────────────────────────

const DARK_MAP_STYLES = [
  { elementType: 'geometry',            stylers: [{ color: '#1a1f2e' }] },
  { elementType: 'labels.text.fill',    stylers: [{ color: '#8ec3b9' }] },
  { elementType: 'labels.text.stroke',  stylers: [{ color: '#1a3646' }] },
  { featureType: 'water',               elementType: 'geometry', stylers: [{ color: '#0d1b2a' }] },
  { featureType: 'water',               elementType: 'labels.text.fill', stylers: [{ color: '#515c6d' }] },
  { featureType: 'road',                elementType: 'geometry', stylers: [{ color: '#2b3447' }] },
  { featureType: 'road',                elementType: 'geometry.stroke', stylers: [{ color: '#1e2433' }] },
  { featureType: 'road.highway',        elementType: 'geometry', stylers: [{ color: '#3a4761' }] },
  { featureType: 'road.highway',        elementType: 'labels.text.fill', stylers: [{ color: '#b0bcd0' }] },
  { featureType: 'administrative',      elementType: 'geometry', stylers: [{ color: '#253048' }] },
  { featureType: 'administrative.country', elementType: 'labels.text.fill', stylers: [{ color: '#9da5b3' }] },
  { featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{ color: '#c4c9d0' }] },
  { featureType: 'poi',                 elementType: 'geometry', stylers: [{ color: '#283044' }] },
  { featureType: 'poi',                 elementType: 'labels.text.fill', stylers: [{ color: '#6f9ba8' }] },
  { featureType: 'poi.park',            elementType: 'geometry', stylers: [{ color: '#1e2a3a' }] },
  { featureType: 'transit',             elementType: 'geometry', stylers: [{ color: '#2f3948' }] },
];

const LIGHT_MAP_STYLES = [
  { elementType: 'geometry',            stylers: [{ color: '#f5f5f5' }] },
  { elementType: 'labels.text.fill',    stylers: [{ color: '#616161' }] },
  { featureType: 'water',               elementType: 'geometry', stylers: [{ color: '#c9d8f0' }] },
  { featureType: 'road',                elementType: 'geometry', stylers: [{ color: '#ffffff' }] },
  { featureType: 'road.highway',        elementType: 'geometry', stylers: [{ color: '#dadada' }] },
  { featureType: 'poi.park',            elementType: 'geometry', stylers: [{ color: '#e5f0e0' }] },
];

function applyMapStyle() {
  if (!state.map) return;
  state.map.setOptions({
    styles: state.theme === 'dark' ? DARK_MAP_STYLES : LIGHT_MAP_STYLES,
  });
}

function initMap() {
  if (!window.google || !window.google.maps) return;

  state.map = new google.maps.Map(DOM.mapDiv, {
    center: { lat: 6.9271, lng: 79.8612 },
    zoom: 13,
    disableDefaultUI: false,
    zoomControl: true,
    streetViewControl: false,
    fullscreenControl: false,
    mapTypeControl: false,
    styles: state.theme === 'dark' ? DARK_MAP_STYLES : LIGHT_MAP_STYLES,
  });

  state.infoWindow = new google.maps.InfoWindow();

  DOM.mapPlaceholder.style.display = 'none';
}

function loadGoogleMaps(apiKey) {
  if (!apiKey) {
    DOM.mapPlaceholder.style.display = 'flex';
    return;
  }

  const script = document.createElement('script');
  script.src   = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=places&callback=__sfMapReady`;
  script.async = true;
  script.defer = true;

  window.__sfMapReady = () => {
    initMap();
    delete window.__sfMapReady;
  };

  document.head.appendChild(script);
}

// ── Ripple Overlay ────────────────────────────────────────────────────────────

class RippleOverlay extends google.maps.OverlayView {
  constructor(latLng) {
    super();
    this.latLng = latLng;
    this.div    = null;
  }

  onAdd() {
    this.div = DOM.rippleSvg;
    this.div.style.display = 'block';
    const panes = this.getPanes();
    panes.overlayLayer.appendChild(this.div);
  }

  draw() {
    if (!this.div) return;
    const proj  = this.getProjection();
    const point = proj.fromLatLngToDivPixel(this.latLng);
    if (!point) return;
    this.div.style.left = `${point.x}px`;
    this.div.style.top  = `${point.y}px`;
  }

  onRemove() {
    if (this.div && this.div.parentNode) {
      this.div.parentNode.removeChild(this.div);
    }
    this.div = null;
    DOM.rippleSvg.style.display = 'none';
  }
}

function showRipple(latLng) {
  if (!window.google) return;
  removeRipple();
  state.rippleOverlay = new RippleOverlay(latLng);
  state.rippleOverlay.setMap(state.map);
}

function removeRipple() {
  if (state.rippleOverlay) {
    state.rippleOverlay.setMap(null);
    state.rippleOverlay = null;
  }
}

// ── Address Marker ────────────────────────────────────────────────────────────

function placeAddressMarker(latLng, label) {
  if (!window.google) return;

  if (state.addressMarker) {
    state.addressMarker.setMap(null);
  }

  state.addressMarker = new google.maps.Marker({
    position: latLng,
    map: state.map,
    title: label || 'Address',
    animation: google.maps.Animation.DROP,
    icon: {
      path: google.maps.SymbolPath.CIRCLE,
      scale: 10,
      fillColor: '#00d4ff',
      fillOpacity: 1,
      strokeColor: '#ffffff',
      strokeWeight: 2,
    },
    zIndex: 10,
  });

  state.map.panTo(latLng);
  state.map.setZoom(14);
  showRipple(latLng);
}

// ── Service Markers ───────────────────────────────────────────────────────────

function clearServiceMarkers() {
  state.serviceMarkers.forEach((m) => m.setMap(null));
  state.serviceMarkers = [];
}

function placeServiceMarker(person, delay) {
  if (!window.google) return;

  setTimeout(() => {
    const latLng = { lat: parseFloat(person.lat), lng: parseFloat(person.lng) };

    const initials = (person.name || 'S')
      .split(' ')
      .map((w) => w[0])
      .join('')
      .substring(0, 2)
      .toUpperCase();

    const svgIcon = `
      <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 36 36">
        <circle cx="18" cy="18" r="16" fill="#7c3aed" stroke="#ffffff" stroke-width="2"/>
        <text x="18" y="23" font-family="DM Sans, sans-serif" font-size="12"
              font-weight="700" fill="white" text-anchor="middle">${initials}</text>
      </svg>`;

    const marker = new google.maps.Marker({
      position: latLng,
      map: state.map,
      title: person.name,
      animation: google.maps.Animation.DROP,
      icon: {
        url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svgIcon)}`,
        scaledSize: new google.maps.Size(36, 36),
        anchor: new google.maps.Point(18, 18),
      },
      zIndex: 5,
    });

    const infoContent = `
      <div style="
        font-family: DM Sans, sans-serif;
        padding: 6px 2px;
        min-width: 160px;
        color: #1a202c;
      ">
        <div style="font-weight:700;font-size:14px;margin-bottom:4px;">${escapeHtml(person.name)}</div>
        <div style="color:#7c3aed;font-size:12px;margin-bottom:4px;">${escapeHtml(person.service || '')}</div>
        <div style="color:#f59e0b;font-size:13px;">
          ${'★'.repeat(Math.round(person.rating || 0))}${'☆'.repeat(5 - Math.round(person.rating || 0))}
          <span style="color:#616161;font-size:11px;margin-left:4px;">${parseFloat(person.rating || 0).toFixed(1)}</span>
        </div>
      </div>`;

    marker.addListener('click', () => {
      state.infoWindow.setContent(infoContent);
      state.infoWindow.open(state.map, marker);
      highlightResult(person.id);
    });

    state.serviceMarkers.push(marker);
  }, delay);
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ── Results List ──────────────────────────────────────────────────────────────

function renderResults(people) {
  DOM.resultsList.innerHTML = '';
  if (!people || people.length === 0) {
    DOM.resultsList.innerHTML = '<div class="empty-state">No service providers found in this area.</div>';
    updateResultCount(0);
    return;
  }

  people.forEach((person, i) => {
    const item = document.createElement('div');
    item.className = 'result-item';
    item.dataset.id = person.id;
    item.style.animationDelay = `${i * 60}ms`;

    item.innerHTML = `
      <div class="result-name">${escapeHtml(person.name)}</div>
      <div class="result-meta">
        <span class="result-service">${escapeHtml(person.service || '')}</span>
        <span class="result-rating">${renderStars(person.rating || 0)} ${parseFloat(person.rating || 0).toFixed(1)}</span>
      </div>`;

    item.addEventListener('click', () => {
      highlightResult(person.id);
      // Pan to that marker
      const marker = state.serviceMarkers.find(
        (_, idx) => idx === i
      );
      if (marker) {
        state.map.panTo(marker.getPosition());
        google.maps.event.trigger(marker, 'click');
      }
    });

    DOM.resultsList.appendChild(item);
  });

  updateResultCount(people.length);
}

function highlightResult(id) {
  if (state.activeResultItem) {
    state.activeResultItem.classList.remove('active');
  }
  const el = DOM.resultsList.querySelector(`[data-id="${id}"]`);
  if (el) {
    el.classList.add('active');
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    state.activeResultItem = el;
  }
}

// ── Address Fetching ──────────────────────────────────────────────────────────

async function geocodeAddress(addressStr) {
  return new Promise((resolve, reject) => {
    if (!window.google) return reject(new Error('Google Maps not loaded'));
    const geocoder = new google.maps.Geocoder();
    geocoder.geocode({ address: addressStr }, (results, status) => {
      if (status === 'OK' && results[0]) {
        resolve(results[0].geometry.location);
      } else {
        reject(new Error(`Geocoding failed: ${status}`));
      }
    });
  });
}

async function fetchAddress() {
  const url = DOM.inputAddressUrl.value.trim();
  if (!url) return;

  setDot(DOM.dotAddress, 'loading');
  setBusy(DOM.btnFetch, true);

  try {
    const result = await window.api.fetchUrl(url);
    if (!result.success) throw new Error(result.error);

    const data = result.data;
    let latLng, label;

    if (data.lat !== undefined && data.lng !== undefined) {
      latLng = { lat: parseFloat(data.lat), lng: parseFloat(data.lng) };
      label  = data.address || `${data.lat}, ${data.lng}`;
    } else if (data.address) {
      if (!window.google) throw new Error('Google Maps not loaded — cannot geocode');
      const loc = await geocodeAddress(data.address);
      latLng    = { lat: loc.lat(), lng: loc.lng() };
      label     = data.address;
    } else {
      throw new Error('Response must have { address } or { lat, lng }');
    }

    state.addressLatLng = latLng;
    DOM.addressText.textContent = label;
    DOM.coordsText.textContent  = `${latLng.lat.toFixed(6)}, ${latLng.lng.toFixed(6)}`;
    DOM.sectionAddress.style.display = '';

    if (window.google) placeAddressMarker(latLng, label);

    setDot(DOM.dotAddress, 'success');
  } catch (err) {
    setDot(DOM.dotAddress, 'error');
    console.error('Fetch address error:', err.message);
    DOM.addressText.textContent = `Error: ${err.message}`;
    DOM.sectionAddress.style.display = '';
  } finally {
    setBusy(DOM.btnFetch, false);
  }
}

// ── Service Search ────────────────────────────────────────────────────────────

async function searchServices() {
  const baseUrl = DOM.inputServiceUrl.value.trim();
  if (!baseUrl) return;
  if (!state.addressLatLng) {
    alert('Please fetch an address first.');
    return;
  }

  const radius = parseInt(DOM.inputRadius.value, 10) || 5;
  const url    = `${baseUrl}?lat=${state.addressLatLng.lat}&lng=${state.addressLatLng.lng}&radius=${radius}`;

  setDot(DOM.dotService, 'loading');
  setBusy(DOM.btnSearch, true);

  try {
    const result = await window.api.fetchUrl(url);
    if (!result.success) throw new Error(result.error);

    const people = Array.isArray(result.data) ? result.data : [];

    clearServiceMarkers();
    if (window.google) {
      people.forEach((p, i) => placeServiceMarker(p, i * 80));
    }
    renderResults(people);
    setDot(DOM.dotService, 'success');
  } catch (err) {
    setDot(DOM.dotService, 'error');
    console.error('Search error:', err.message);
  } finally {
    setBusy(DOM.btnSearch, false);
  }
}

// ── Random Populate ───────────────────────────────────────────────────────────

async function populateRandom() {
  const url = DOM.inputPopulateUrl.value.trim();
  if (!url) return;

  setDot(DOM.dotPopulate, 'loading');
  setBusy(DOM.btnPopulate, true);

  try {
    const result = await window.api.fetchUrl(url);
    if (!result.success) throw new Error(result.error);

    setDot(DOM.dotPopulate, 'success');

    // Auto-search after populate if address is set
    if (state.addressLatLng && DOM.inputServiceUrl.value.trim()) {
      await searchServices();
    } else {
      const msg = result.data && result.data.message ? result.data.message : 'Database populated!';
      console.log(msg);
    }
  } catch (err) {
    setDot(DOM.dotPopulate, 'error');
    console.error('Populate error:', err.message);
  } finally {
    setBusy(DOM.btnPopulate, false);
  }
}

// ── Settings Persistence ──────────────────────────────────────────────────────

async function loadSettings() {
  const settings = await window.api.getSettings();

  state.googleMapsApiKey = settings.googleMapsApiKey || '';

  if (settings.addressSourceUrl)  DOM.inputAddressUrl.value  = settings.addressSourceUrl;
  if (settings.serviceDatabaseUrl) DOM.inputServiceUrl.value = settings.serviceDatabaseUrl;
  if (settings.randomPopulateUrl)  DOM.inputPopulateUrl.value = settings.randomPopulateUrl;

  applyTheme(settings.theme || 'dark');

  // Load Google Maps after we have the API key
  loadGoogleMaps(state.googleMapsApiKey);
}

async function saveUrlSettings() {
  await window.api.saveSettings({
    addressSourceUrl:  DOM.inputAddressUrl.value.trim(),
    serviceDatabaseUrl: DOM.inputServiceUrl.value.trim(),
    randomPopulateUrl: DOM.inputPopulateUrl.value.trim(),
  });
}

// ── Event Wiring ──────────────────────────────────────────────────────────────

function wireEvents() {
  // Titlebar
  DOM.btnClose.addEventListener('click',    () => window.api.windowClose());
  DOM.btnMinimize.addEventListener('click', () => window.api.windowMinimize());
  DOM.btnMaximize.addEventListener('click', () => window.api.windowMaximize());
  DOM.btnTheme.addEventListener('click',    toggleTheme);

  // URL actions
  DOM.btnFetch.addEventListener('click',    fetchAddress);
  DOM.btnSearch.addEventListener('click',   searchServices);
  DOM.btnPopulate.addEventListener('click', populateRandom);

  // Persist URLs on blur
  [DOM.inputAddressUrl, DOM.inputServiceUrl, DOM.inputPopulateUrl].forEach((inp) => {
    inp.addEventListener('blur', saveUrlSettings);
    // Allow Enter to trigger the associated action
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') inp.blur();
    });
  });

  // Enter on address URL → fetch
  DOM.inputAddressUrl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') fetchAddress();
  });
  DOM.inputServiceUrl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') searchServices();
  });
  DOM.inputPopulateUrl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') populateRandom();
  });
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────

(async function init() {
  wireEvents();
  await loadSettings();
})();
