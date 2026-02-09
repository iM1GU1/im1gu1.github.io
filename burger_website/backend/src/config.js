import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(__dirname, '..');
const configPath = process.env.RESTAURANTS_CONFIG_PATH
  ? path.resolve(backendRoot, process.env.RESTAURANTS_CONFIG_PATH)
  : path.resolve(backendRoot, 'config', 'restaurants.json');

function loadJsonFile(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const content = fs.readFileSync(filePath, 'utf8');
  if (!content.trim()) return null;
  return JSON.parse(content);
}

function parseTurnos(value) {
  if (!value) return null;
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch (error) {
      throw new Error('TURNOS env var must be valid JSON');
    }
  }
  return null;
}

function normalizeTurnos(turnos, capacityMax) {
  if (!Array.isArray(turnos) || turnos.length === 0) {
    throw new Error('Turnos config is required');
  }

  return turnos.map((turno) => {
    if (!turno.name || !turno.start || !turno.end) {
      throw new Error('Each turno must include name, start, and end');
    }
    if (!/^\d{2}:\d{2}$/.test(turno.start) || !/^\d{2}:\d{2}$/.test(turno.end)) {
      throw new Error('Turno start/end must use HH:mm format');
    }
    const turnoCapacity = Number(turno.capacityMax);
    return {
      name: turno.name,
      start: turno.start,
      end: turno.end,
      capacityMax:
        Number.isFinite(turnoCapacity) && turnoCapacity > 0
          ? turnoCapacity
          : capacityMax
    };
  });
}

function normalizeRestaurant(raw, envFallback = {}) {
  if (!raw) return null;

  const slug = raw.slug || envFallback.slug;
  if (!slug) {
    throw new Error('Restaurant slug is required');
  }

  const capacityMax = Number(raw.capacityMax ?? envFallback.capacityMax ?? process.env.CAPACITY_MAX ?? 0);
  const slotIntervalMinutes = Number(raw.slotIntervalMinutes ?? envFallback.slotIntervalMinutes ?? process.env.SLOT_INTERVAL_MINUTES ?? 15);
  const reservationDurationMinutes = Number(
    raw.reservationDurationMinutes ??
      envFallback.reservationDurationMinutes ??
      process.env.RESERVATION_DURATION_MINUTES ??
      90
  );

  const timezone = raw.timezone || envFallback.timezone || process.env.TIMEZONE || 'Europe/Madrid';
  const calendarId = raw.calendarId || envFallback.calendarId || process.env.GOOGLE_CALENDAR_ID;

  const turnos = normalizeTurnos(
    raw.turnos || envFallback.turnos,
    capacityMax
  );

  if (!calendarId) {
    throw new Error(`Missing calendarId for restaurant ${slug}`);
  }
  if (!Number.isFinite(capacityMax) || capacityMax <= 0) {
    throw new Error(`Invalid capacityMax for restaurant ${slug}`);
  }
  if (!Number.isFinite(slotIntervalMinutes) || slotIntervalMinutes <= 0) {
    throw new Error(`Invalid slotIntervalMinutes for restaurant ${slug}`);
  }
  if (!Number.isFinite(reservationDurationMinutes) || reservationDurationMinutes <= 0) {
    throw new Error(`Invalid reservationDurationMinutes for restaurant ${slug}`);
  }

  return {
    slug,
    name: raw.name || envFallback.name || slug,
    timezone,
    calendarId,
    capacityMax,
    slotIntervalMinutes,
    reservationDurationMinutes,
    turnos
  };
}

function buildEnvRestaurant() {
  const envTurnos = parseTurnos(process.env.TURNOS);
  const slug = process.env.RESTAURANT_SLUG || process.env.DEFAULT_RESTAURANT_SLUG;
  if (!slug || !envTurnos || !process.env.GOOGLE_CALENDAR_ID) return null;

  return normalizeRestaurant(
    {
      slug,
      name: process.env.RESTAURANT_NAME || slug,
      timezone: process.env.TIMEZONE || 'Europe/Madrid',
      calendarId: process.env.GOOGLE_CALENDAR_ID,
      capacityMax: process.env.CAPACITY_MAX,
      slotIntervalMinutes: process.env.SLOT_INTERVAL_MINUTES,
      reservationDurationMinutes: process.env.RESERVATION_DURATION_MINUTES,
      turnos: envTurnos
    },
    {}
  );
}

function loadRestaurants() {
  let restaurants = [];
  const fileData = loadJsonFile(configPath);
  if (fileData?.restaurants) {
    restaurants = fileData.restaurants.map((raw) => normalizeRestaurant(raw, {}));
  }

  const envRestaurant = buildEnvRestaurant();
  if (envRestaurant) {
    const existingIndex = restaurants.findIndex((r) => r.slug === envRestaurant.slug);
    if (existingIndex >= 0) {
      restaurants[existingIndex] = envRestaurant;
    } else {
      restaurants.push(envRestaurant);
    }
  }

  if (restaurants.length === 0) {
    throw new Error('No restaurant configuration found');
  }

  return restaurants;
}

const restaurants = loadRestaurants();

export function getDefaultRestaurantSlug() {
  return process.env.DEFAULT_RESTAURANT_SLUG || process.env.RESTAURANT_SLUG || restaurants[0]?.slug;
}

export function getRestaurantConfig(slug) {
  const target = slug || getDefaultRestaurantSlug();
  const restaurant = restaurants.find((r) => r.slug === target);
  if (!restaurant) {
    throw new Error(`Restaurant config not found for slug: ${target}`);
  }
  return restaurant;
}
