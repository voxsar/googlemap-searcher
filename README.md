# ServiceFinder – Nearby Service Locator

A modern Electron desktop application that fetches an address, plots it on an interactive Google Map, searches a URL-based database for nearby service providers, and displays them as pins with animated concentric ripple circles. Supports polished dark mode and light mode.

---

## Features

- **URL Configuration Panel** – three configurable endpoints stored persistently via `electron-store`
- **Address Fetching** – supports `{ address }` or `{ lat, lng }` JSON responses; geocodes address strings via Google Maps Geocoding API
- **Animated Ripple Effect** – SVG `<circle>` rings anchored to the address pin via `OverlayView`, scaling correctly on zoom/pan
- **Service Provider Markers** – custom violet SVG markers; clicking opens a styled InfoWindow
- **Sidebar Results List** – scrollable list with stagger-in animation; clicking highlights the map marker
- **Random Populate** – seeds the service database with fake nearby entries; markers drop in sequentially
- **Dark / Light Mode Toggle** – moon/sun button in titlebar; smooth CSS transition; Google Map style adapts; persisted across sessions
- **Frameless Window** – custom titlebar with traffic-light controls
- **Secure IPC** – all HTTP calls go through the main process; `contextIsolation: true`, `nodeIntegration: false`

---

## Quick Start

### 1. Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [npm](https://www.npmjs.com/) 9+

### 2. Install dependencies

```bash
npm install
```

### 3. Configure API key

```bash
cp .env.example .env
# Edit .env and add your Google Maps API Key
```

Required Google APIs (enable in [Google Cloud Console](https://console.cloud.google.com/)):
- **Maps JavaScript API**
- **Geocoding API**

### 4. Run the app

```bash
npm start
```

### 5. (Optional) Start the mock server

In a separate terminal:

```bash
npm run mock-server
# Starts at http://localhost:3000
```

Then set the ServiceFinder URL fields to:
| Field | URL |
|---|---|
| Address Source URL | `http://localhost:3000/address` |
| Service Database URL | `http://localhost:3000/services` |
| Random Populate URL | `http://localhost:3000/populate` |

---

## Mock Server Endpoints

All endpoints require `GET` requests and return JSON.

### `GET /address`

Returns the current address. Response format:

```json
{ "lat": 6.9271, "lng": 79.8612, "address": "1 Galle Face Terrace, Colombo" }
```
or
```json
{ "address": "1 Galle Face Terrace, Colombo 00300, Sri Lanka" }
```

### `GET /services?lat={lat}&lng={lng}&radius={km}`

Returns nearby service providers within the given radius.

```json
[
  { "id": 1, "name": "James Silva", "service": "Plumber", "lat": 6.930, "lng": 79.855, "rating": 4.8 },
  ...
]
```

### `GET /populate?lat={lat}&lng={lng}&radius={km}&count={n}`

Seeds the in-memory database with random service providers near the given coordinates.

```json
{ "message": "Successfully populated database with 15 service providers.", "count": 15 }
```

---

## Project Structure

```
servicefinder/
├── main.js              # Main process (window, IPC, fetch, electron-store)
├── preload.js           # Context bridge (secure IPC)
├── renderer/
│   ├── index.html       # App layout (titlebar, sidebar, map)
│   ├── app.js           # Renderer logic (Maps, ripple, markers, UI)
│   └── styles.css       # Dark/light themes, animations, glassmorphism
├── mock-server.js       # Offline mock Express-compatible server
├── package.json
├── .env.example         # API key template
└── README.md
```

---

## Build for distribution

```bash
npm run build
```

Outputs platform-specific installers to `dist/` via `electron-builder`.

---

## Environment Variables

| Variable | Description |
|---|---|
| `GOOGLE_MAPS_API_KEY` | Your Google Maps JavaScript API key |

The API key is loaded from `.env` in the main process and injected into the renderer at runtime. It is **never** exposed in renderer source files.

---

## Technology Stack

| Layer | Tech |
|---|---|
| Desktop shell | Electron 39 |
| Persistence | electron-store |
| HTTP (main process) | node-fetch |
| Maps | Google Maps JavaScript API |
| Fonts | Syne · JetBrains Mono · DM Sans |
| Mock server | Node.js built-in `http` (no dependencies) |