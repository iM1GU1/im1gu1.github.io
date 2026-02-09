import { DateTime } from 'luxon';
import { getCalendarClient } from './googleCalendar.js';

const PAX_REGEX = /PAX\s*=\s*(\d+)/i;

function getEventText(event) {
  return `${event.summary || ''} ${event.description || ''}`;
}

function parsePax(event) {
  const text = getEventText(event);
  const match = text.match(PAX_REGEX);
  return match ? Number(match[1]) : 0;
}

function classifyEvent(event) {
  const text = getEventText(event).toUpperCase();
  if (text.includes('CERRADO')) return 'closed';
  if (text.includes('BLOQUEO')) return 'blocked';
  if (text.includes('RESERVA')) return 'reservation';
  return 'other';
}

function normalizeEvent(event, timezone) {
  if (!event.start || !event.end) return null;

  let start;
  let end;

  if (event.start.dateTime) {
    start = DateTime.fromISO(event.start.dateTime).setZone(timezone);
  } else if (event.start.date) {
    start = DateTime.fromISO(event.start.date, { zone: timezone });
  }

  if (event.end.dateTime) {
    end = DateTime.fromISO(event.end.dateTime).setZone(timezone);
  } else if (event.end.date) {
    end = DateTime.fromISO(event.end.date, { zone: timezone });
  }

  if (!start || !end) return null;

  return {
    id: event.id,
    start,
    end,
    type: classifyEvent(event),
    pax: parsePax(event)
  };
}

function overlaps(startA, endA, startB, endB) {
  return startA.toMillis() < endB.toMillis() && endA.toMillis() > startB.toMillis();
}

async function listEventsForRange({ calendarId, timeMin, timeMax, timezone }) {
  const calendar = await getCalendarClient();
  const response = await calendar.events.list({
    calendarId,
    timeMin: timeMin.toISO(),
    timeMax: timeMax.toISO(),
    singleEvents: true,
    orderBy: 'startTime',
    showDeleted: false,
    maxResults: 2500
  });

  const items = response.data.items || [];
  return items
    .map((event) => normalizeEvent(event, timezone))
    .filter(Boolean);
}

function buildSlotsForTurno({ turno, date, reservationDurationMinutes, slotIntervalMinutes, timezone }) {
  const shiftStart = DateTime.fromISO(`${date}T${turno.start}`, { zone: timezone });
  const shiftEnd = DateTime.fromISO(`${date}T${turno.end}`, { zone: timezone });
  const lastStart = shiftEnd.minus({ minutes: reservationDurationMinutes });

  const slots = [];
  let cursor = shiftStart;
  while (cursor <= lastStart) {
    slots.push(cursor);
    cursor = cursor.plus({ minutes: slotIntervalMinutes });
  }

  return slots;
}

function evaluateSlot({ slotStart, reservationDurationMinutes, party, capacityMax, events }) {
  const slotEnd = slotStart.plus({ minutes: reservationDurationMinutes });
  let totalPax = 0;
  let closed = false;

  for (const event of events) {
    if (!overlaps(event.start, event.end, slotStart, slotEnd)) {
      continue;
    }
    if (event.type === 'closed') {
      closed = true;
      break;
    }
    if (event.type === 'blocked' || event.type === 'reservation') {
      totalPax += event.pax;
    }
  }

  return {
    available: !closed && totalPax + party <= capacityMax,
    totalPax
  };
}

export async function computeAvailabilityForDate({ restaurant, date, party }) {
  const timezone = restaurant.timezone;
  const startOfDay = DateTime.fromISO(date, { zone: timezone }).startOf('day');
  const endOfDay = startOfDay.plus({ days: 1 });

  const events = await listEventsForRange({
    calendarId: restaurant.calendarId,
    timeMin: startOfDay,
    timeMax: endOfDay,
    timezone
  });

  let totalAvailableSlots = 0;

  const turnos = restaurant.turnos.map((turno) => {
    const slots = buildSlotsForTurno({
      turno,
      date,
      reservationDurationMinutes: restaurant.reservationDurationMinutes,
      slotIntervalMinutes: restaurant.slotIntervalMinutes,
      timezone
    });

    const slotData = slots.map((slotStart) => {
      const { available } = evaluateSlot({
        slotStart,
        reservationDurationMinutes: restaurant.reservationDurationMinutes,
        party,
        capacityMax: turno.capacityMax ?? restaurant.capacityMax,
        events
      });

      if (available) totalAvailableSlots += 1;

      return {
        time: slotStart.toFormat('HH:mm'),
        available
      };
    });

    return {
      turno: turno.name,
      slots: slotData
    };
  });

  return { turnos, totalAvailableSlots };
}

export async function checkSlotAvailability({ restaurant, date, time, party }) {
  const timezone = restaurant.timezone;
  const slotStart = DateTime.fromISO(`${date}T${time}`, { zone: timezone });
  const slotEnd = slotStart.plus({ minutes: restaurant.reservationDurationMinutes });

  const events = await listEventsForRange({
    calendarId: restaurant.calendarId,
    timeMin: slotStart.startOf('day'),
    timeMax: slotStart.startOf('day').plus({ days: 1 }),
    timezone
  });

  const turno = restaurant.turnos.find((t) => {
    const shiftStart = DateTime.fromISO(`${date}T${t.start}`, { zone: timezone });
    const shiftEnd = DateTime.fromISO(`${date}T${t.end}`, { zone: timezone });
    return slotStart >= shiftStart && slotEnd <= shiftEnd;
  });

  const capacityMax = turno?.capacityMax ?? restaurant.capacityMax;

  if (!turno) {
    return { available: false, totalPax: 0, capacityMax };
  }

  const { available, totalPax } = evaluateSlot({
    slotStart,
    reservationDurationMinutes: restaurant.reservationDurationMinutes,
    party,
    capacityMax,
    events
  });

  return { available, totalPax, capacityMax };
}

export async function createReservationEvent({ restaurant, start, end, name, party, phone, email, notes }) {
  const calendar = await getCalendarClient();

  const descriptionParts = [];
  if (phone) descriptionParts.push(`Tel: ${phone}`);
  if (email) descriptionParts.push(`Email: ${email}`);
  if (notes) descriptionParts.push(`Notas: ${notes}`);

  const event = {
    summary: `Reserva - ${name} - PAX=${party}`,
    description: descriptionParts.join('\n'),
    start: {
      dateTime: start.toISO(),
      timeZone: restaurant.timezone
    },
    end: {
      dateTime: end.toISO(),
      timeZone: restaurant.timezone
    }
  };

  const response = await calendar.events.insert({
    calendarId: restaurant.calendarId,
    requestBody: event
  });

  return response.data;
}

export async function findNextAvailableSlot({ restaurant, date, party, lookaheadDays }) {
  const timezone = restaurant.timezone;
  const startDate = DateTime.fromISO(date, { zone: timezone });

  for (let i = 1; i <= lookaheadDays; i += 1) {
    const candidate = startDate.plus({ days: i }).toISODate();
    const availability = await computeAvailabilityForDate({
      restaurant,
      date: candidate,
      party
    });

    for (const turno of availability.turnos) {
      const slot = turno.slots.find((s) => s.available);
      if (slot) {
        return { date: candidate, turno: turno.turno, time: slot.time };
      }
    }
  }

  return null;
}
