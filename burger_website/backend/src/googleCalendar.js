import { google } from 'googleapis';

const SCOPES = ['https://www.googleapis.com/auth/calendar'];
let calendarClient = null;

function buildAuthOptions() {
  const rawJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  const keyFile = process.env.GOOGLE_APPLICATION_CREDENTIALS;

  if (rawJson) {
    const trimmed = rawJson.trim();
    if (trimmed.startsWith('{')) {
      return { credentials: JSON.parse(trimmed), scopes: SCOPES };
    }
    return { keyFile: trimmed, scopes: SCOPES };
  }

  if (keyFile) {
    return { keyFile, scopes: SCOPES };
  }

  throw new Error('Missing Google service account credentials');
}

export async function getCalendarClient() {
  if (calendarClient) return calendarClient;

  const auth = new google.auth.GoogleAuth(buildAuthOptions());
  const authClient = await auth.getClient();
  calendarClient = google.calendar({ version: 'v3', auth: authClient });
  return calendarClient;
}
