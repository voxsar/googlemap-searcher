#!/usr/bin/env node
/**
 * mock-server.js
 *
 * A simple Node.js mock server that simulates all three ServiceFinder endpoints.
 * Run with: node mock-server.js
 *
 * Endpoints:
 *   GET /address         → returns a sample address or lat/lng
 *   GET /services        → returns nearby service providers (supports lat, lng, radius query params)
 *   GET /populate        → seeds the in-memory database with random fake entries
 */

'use strict';

const http  = require('http');
const url   = require('url');

const PORT = 3000;

// ── In-memory "database" ─────────────────────────────────────────────────────
const SERVICE_TYPES = ['Plumber', 'Electrician', 'Carpenter', 'Painter', 'HVAC Tech', 'Locksmith', 'Cleaner', 'Handyman'];
const FIRST_NAMES   = ['James', 'Maria', 'Kevin', 'Priya', 'Mohammed', 'Sanjay', 'Emily', 'Carlos', 'Aisha', 'Liam'];
const LAST_NAMES    = ['Silva', 'Perera', 'Johnson', 'Nair', 'Hassan', 'Patel', 'Brown', 'Lopez', 'Khan', 'Smith'];

let serviceDb = [];
let nextId    = 1;

// Seeded address location (Colombo, Sri Lanka)
const BASE_LOCATION = { lat: 6.9271, lng: 79.8612, address: '1 Galle Face Terrace, Colombo 00300, Sri Lanka' };

function randomInRange(min, max) {
  return min + Math.random() * (max - min);
}

function randomFrom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function generatePerson(baseLat, baseLng, radiusKm) {
  // 1 degree of lat ≈ 111 km
  const spread = (radiusKm / 111) * 0.9;
  return {
    id:      nextId++,
    name:    `${randomFrom(FIRST_NAMES)} ${randomFrom(LAST_NAMES)}`,
    service: randomFrom(SERVICE_TYPES),
    lat:     baseLat + randomInRange(-spread, spread),
    lng:     baseLng + randomInRange(-spread, spread),
    rating:  parseFloat(randomInRange(3.0, 5.0).toFixed(1)),
    phone:   `+94 7${Math.floor(randomInRange(10000000, 99999999))}`,
  };
}

function seedDatabase(baseLat, baseLng, count = 12, radiusKm = 5) {
  serviceDb = [];
  nextId    = 1;
  for (let i = 0; i < count; i++) {
    serviceDb.push(generatePerson(baseLat, baseLng, radiusKm));
  }
}

// Seed on startup
seedDatabase(BASE_LOCATION.lat, BASE_LOCATION.lng);

// ── Request Handlers ──────────────────────────────────────────────────────────

function sendJson(res, status, data) {
  const body = JSON.stringify(data, null, 2);
  res.writeHead(status, {
    'Content-Type':  'application/json',
    'Content-Length': Buffer.byteLength(body),
    'Access-Control-Allow-Origin': '*',
  });
  res.end(body);
}

function handleAddress(req, res) {
  // Randomly return either lat/lng format or address string format
  const useLatLng = Math.random() > 0.5;
  if (useLatLng) {
    sendJson(res, 200, {
      lat:     BASE_LOCATION.lat,
      lng:     BASE_LOCATION.lng,
      address: BASE_LOCATION.address,
    });
  } else {
    sendJson(res, 200, {
      address: BASE_LOCATION.address,
    });
  }
}

function handleServices(req, res, query) {
  const lat    = parseFloat(query.lat)    || BASE_LOCATION.lat;
  const lng    = parseFloat(query.lng)    || BASE_LOCATION.lng;
  const radius = parseFloat(query.radius) || 5;

  // Filter by radius (approximate great-circle distance)
  function distanceKm(a, b) {
    const R  = 6371;
    const dLat = ((b.lat - a.lat) * Math.PI) / 180;
    const dLng = ((b.lng - a.lng) * Math.PI) / 180;
    const aVal =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(aVal), Math.sqrt(1 - aVal));
  }

  const results = serviceDb.filter(
    (p) => distanceKm({ lat, lng }, { lat: p.lat, lng: p.lng }) <= radius
  );

  sendJson(res, 200, results);
}

function handlePopulate(req, res, query) {
  const lat    = parseFloat(query.lat)    || BASE_LOCATION.lat;
  const lng    = parseFloat(query.lng)    || BASE_LOCATION.lng;
  const radius = parseFloat(query.radius) || 5;
  const count  = Math.min(parseInt(query.count, 10) || 15, 50);

  seedDatabase(lat, lng, count, radius);
  sendJson(res, 200, {
    message: `Successfully populated database with ${serviceDb.length} service providers.`,
    count:   serviceDb.length,
  });
}

// ── HTTP Server ───────────────────────────────────────────────────────────────

const server = http.createServer((req, res) => {
  const parsed   = url.parse(req.url, true);
  const pathname = parsed.pathname.replace(/\/+$/, '');
  const query    = parsed.query;

  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET' });
    res.end();
    return;
  }

  if (req.method !== 'GET') {
    sendJson(res, 405, { error: 'Method Not Allowed' });
    return;
  }

  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);

  switch (pathname) {
    case '/address':
      handleAddress(req, res);
      break;
    case '/services':
      handleServices(req, res, query);
      break;
    case '/populate':
      handlePopulate(req, res, query);
      break;
    default:
      sendJson(res, 404, {
        error:     'Not Found',
        endpoints: ['/address', '/services', '/populate'],
      });
  }
});

server.listen(PORT, () => {
  console.log(`\n✅  ServiceFinder Mock Server running at http://localhost:${PORT}\n`);
  console.log('Available endpoints:');
  console.log(`  GET http://localhost:${PORT}/address   → current address`);
  console.log(`  GET http://localhost:${PORT}/services  → nearby service providers`);
  console.log(`  GET http://localhost:${PORT}/populate  → seed database with random data`);
  console.log('\nConfigure ServiceFinder URL fields to point to these endpoints.\n');
});
