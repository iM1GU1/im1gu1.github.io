import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { DateTime } from 'luxon';
import { getRestaurantConfig, getDefaultRestaurantSlug } from './config.js';
import { computeAvailabilityForDate, findNextAvailableSlot, checkSlotAvailability, createReservationEvent } from './reservations.js';
import { getCache, setCache } from './cache.js';

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT || 3000);
const CACHE_TTL_SECONDS = Number(process.env.CACHE_TTL_SECONDS || 0);
const LOOKAHEAD_DAYS = Number(process.env.NEXT_AVAILABLE_LOOKAHEAD_DAYS || 30);

app.use(cors());
app.use(express.json({ limit: '1mb' }));

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(__dirname, '..');
const staticDir = process.env.STATIC_DIR
  ? path.resolve(backendRoot, process.env.STATIC_DIR)
  : null;
if (staticDir) {
  app.use(express.static(staticDir));
}

app.get('/api/health', (req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

function resolveRestaurantSlug(req) {
  return (
    req.query.restaurant ||
    req.query.slug ||
    req.headers['x-restaurant-slug'] ||
    getDefaultRestaurantSlug()
  );
}

function requireQueryParam(req, res, name) {
  const value = req.query[name];
  if (!value) {
    res.status(400).json({ ok: false, error: `Missing query param: ${name}` });
    return null;
  }
  return value;
}

function parseParty(value) {
  const party = Number(value);
  if (!Number.isInteger(party) || party <= 0) {
    return null;
  }
  return party;
}

function validateDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }
  const parsed = DateTime.fromISO(value);
  return parsed.isValid ? value : null;
}

function validateTime(value) {
  if (!/^\d{2}:\d{2}$/.test(value)) {
    return null;
  }
  const parsed = DateTime.fromISO(`2024-01-01T${value}`);
  return parsed.isValid ? value : null;
}

app.get('/api/availability', async (req, res, next) => {
  try {
    const dateRaw = requireQueryParam(req, res, 'date');
    if (!dateRaw) return;
    const date = validateDate(dateRaw);
    if (!date) {
      res.status(400).json({ ok: false, error: 'Invalid date format' });
      return;
    }

    const partyRaw = requireQueryParam(req, res, 'party');
    if (!partyRaw) return;
    const party = parseParty(partyRaw);
    if (!party) {
      res.status(400).json({ ok: false, error: 'Invalid party size' });
      return;
    }

    const slug = resolveRestaurantSlug(req);
    const restaurant = getRestaurantConfig(slug);

    const cacheKey = `availability:${slug}:${date}:${party}`;
    if (CACHE_TTL_SECONDS > 0) {
      const cached = getCache(cacheKey);
      if (cached) {
        res.json(cached);
        return;
      }
    }

    const availability = await computeAvailabilityForDate({
      restaurant,
      date,
      party
    });

    let response = {
      ok: true,
      date,
      party,
      timezone: restaurant.timezone,
      turnos: availability.turnos
    };

    if (availability.totalAvailableSlots === 0 && LOOKAHEAD_DAYS > 0) {
      const nextAvailable = await findNextAvailableSlot({
        restaurant,
        date,
        party,
        lookaheadDays: LOOKAHEAD_DAYS
      });
      if (nextAvailable) {
        response.next_available = nextAvailable;
      }
    }

    if (CACHE_TTL_SECONDS > 0) {
      setCache(cacheKey, response, CACHE_TTL_SECONDS);
    }

    res.json(response);
  } catch (error) {
    next(error);
  }
});

app.post('/api/book', async (req, res, next) => {
  try {
    const { date, time, party, name, phone, email, notes, restaurant: bodySlug } = req.body || {};
    const slug = bodySlug || resolveRestaurantSlug(req);
    const restaurant = getRestaurantConfig(slug);

    const dateValue = validateDate(date);
    const timeValue = validateTime(time);
    const partyValue = parseParty(party);

    if (!dateValue || !timeValue || !partyValue || !name) {
      res.status(400).json({ ok: false, error: 'Missing or invalid reservation fields' });
      return;
    }

    if (!phone && !email) {
      res.status(400).json({ ok: false, error: 'Provide at least phone or email' });
      return;
    }

    const slotCheck = await checkSlotAvailability({
      restaurant,
      date: dateValue,
      time: timeValue,
      party: partyValue
    });

    if (!slotCheck.available) {
      res.status(409).json({ ok: false, reason: 'NO_AVAILABILITY' });
      return;
    }

    const start = DateTime.fromISO(`${dateValue}T${timeValue}`, { zone: restaurant.timezone });
    const end = start.plus({ minutes: restaurant.reservationDurationMinutes });

    const event = await createReservationEvent({
      restaurant,
      start,
      end,
      name,
      party: partyValue,
      phone,
      email,
      notes
    });

    res.json({ ok: true, eventId: event.id });
  } catch (error) {
    next(error);
  }
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ ok: false, error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`Reservation API listening on port ${PORT}`);
});
