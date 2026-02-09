# Burger House - Sistema de Reservas

Este proyecto incluye un frontend estatico y un backend en Node.js para gestionar reservas sincronizadas con Google Calendar.

## Requisitos
- Node.js 18+
- Un calendario de Google compartido con una Service Account

## Backend (API)

### 1) Instalar dependencias
```bash
cd burger_website/backend
npm install
```

### 2) Configuracion de Google Calendar (Service Account)
1. Crea un proyecto en Google Cloud.
2. Habilita **Google Calendar API**.
3. Crea una **Service Account** y descarga el JSON de credenciales.
4. En el calendario del restaurante (por ejemplo "Reservas"), comparte el calendario con el email de la service account y otorga permisos de **Hacer cambios en eventos**.

### 3) Variables de entorno
Crea un archivo `.env` basado en `.env.example` y ajusta los valores:

```env
PORT=3000
RESTAURANTS_CONFIG_PATH=./config/restaurants.json
DEFAULT_RESTAURANT_SLUG=burger-house
GOOGLE_APPLICATION_CREDENTIALS=C:\path\to\service-account.json
CACHE_TTL_SECONDS=45
NEXT_AVAILABLE_LOOKAHEAD_DAYS=30
STATIC_DIR=..
```

Tambien puedes usar `GOOGLE_SERVICE_ACCOUNT_JSON` con el contenido del JSON en una sola linea.

### 4) Configurar restaurantes (multi-restaurante)
Edita `backend/config/restaurants.json`:

```json
{
  "restaurants": [
    {
      "slug": "burger-house",
      "name": "Burger House",
      "timezone": "Europe/Madrid",
      "calendarId": "your_calendar_id@group.calendar.google.com",
      "capacityMax": 60,
      "slotIntervalMinutes": 15,
      "reservationDurationMinutes": 90,
      "turnos": [
        { "name": "comida", "start": "13:00", "end": "16:00", "capacityMax": 60 },
        { "name": "cena", "start": "20:00", "end": "23:30", "capacityMax": 60 }
      ]
    }
  ]
}
```

Si prefieres configurar un unico restaurante via variables de entorno:

```env
RESTAURANT_SLUG=burger-house
GOOGLE_CALENDAR_ID=your_calendar_id@group.calendar.google.com
TIMEZONE=Europe/Madrid
TURNOS=[{"name":"comida","start":"13:00","end":"16:00"},{"name":"cena","start":"20:00","end":"23:30"}]
SLOT_INTERVAL_MINUTES=15
RESERVATION_DURATION_MINUTES=90
CAPACITY_MAX=60
```

### 5) Levantar el backend
```bash
npm start
```

Si `STATIC_DIR=..` esta definido, el backend servira el frontend estatico desde `burger_website/`.

## Frontend

La UI de reservas esta en `burger_website/index.html`.
- Ajusta `data-restaurant` para apuntar al slug correcto.
- Ajusta `data-api-base` si el backend esta en otro dominio.

Ejemplo:

```html
<div class="reservation-widget" data-restaurant="burger-house" data-api-base="">
```

## Formato de eventos en Google Calendar
- Reserva: `Reserva - Nombre - PAX=4`
- Bloqueo parcial: `BLOQUEO - PAX=10`
- Cierre total: `CERRADO`

## API

### GET /api/availability
`/api/availability?date=YYYY-MM-DD&party=4&restaurant=burger-house`

Respuesta:
```json
{
  "ok": true,
  "date": "2026-02-05",
  "party": 4,
  "timezone": "Europe/Madrid",
  "turnos": [
    { "turno": "comida", "slots": [{ "time": "13:00", "available": true }] },
    { "turno": "cena", "slots": [{ "time": "20:00", "available": false }] }
  ],
  "next_available": { "date": "2026-02-06", "turno": "comida", "time": "13:15" }
}
```

### POST /api/book

```json
{
  "restaurant": "burger-house",
  "date": "2026-02-05",
  "time": "13:30",
  "party": 4,
  "name": "Maria",
  "phone": "+34 600 123 456",
  "email": "maria@email.com",
  "notes": "Mesa cerca de la ventana"
}
```

Respuesta OK:
```json
{ "ok": true, "eventId": "abc123" }
```

Respuesta sin disponibilidad:
```json
{ "ok": false, "reason": "NO_AVAILABILITY" }
```

## Notas
- El backend recalcula disponibilidad en cada reserva para evitar overbooking.
- La disponibilidad siempre se calcula en tiempo real consultando Google Calendar.
- El cache es opcional y se controla con `CACHE_TTL_SECONDS`.
