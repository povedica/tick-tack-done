import { expect, it } from 'vitest';
import { googleServiceAccess } from './google-access.js';
const calendar = [
  'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
  'https://www.googleapis.com/auth/calendar.events',
];
const drive = 'https://www.googleapis.com/auth/drive.file';
it('shows actual granted permissions independently from local activation', () => {
  const row = {
    googleRefreshToken: 'synthetic',
    googleStatus: 'connected',
    googleGrantedScopes: calendar,
    googleCalendarEnabled: true,
    googleDriveEnabled: true,
  };
  expect(googleServiceAccess(row, 'calendar')).toMatchObject({
    authorized: true,
    enabled: true,
    status: 'connected',
  });
  expect(googleServiceAccess(row, 'drive')).toMatchObject({
    authorized: false,
    status: 'permission_required',
  });
  expect(
    googleServiceAccess(
      { ...row, googleGrantedScopes: [...calendar, drive], googleDriveEnabled: false },
      'drive',
    ),
  ).toMatchObject({ authorized: true, enabled: false, status: 'disabled' });
  expect(googleServiceAccess({ ...row, googleGrantedScopes: [] }, 'calendar').status).toBe(
    'permissions_unknown',
  );
  expect(googleServiceAccess({ ...row, googleStatus: 'reauth_required' }, 'calendar').status).toBe(
    'reauth_required',
  );
});

it('recognizes a full Calendar grant and never calls a known revoked token authorized', () => {
  const row = {
    googleRefreshToken: 'synthetic',
    googleStatus: 'connected',
    googleGrantedScopes: ['https://www.googleapis.com/auth/calendar'],
    googleCalendarEnabled: true,
    googleDriveEnabled: true,
  };
  expect(googleServiceAccess(row, 'calendar').authorized).toBe(true);
  expect(
    googleServiceAccess({ ...row, googleStatus: 'reauth_required' }, 'calendar').authorized,
  ).toBe(false);
});
