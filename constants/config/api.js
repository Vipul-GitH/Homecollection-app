export const LOGIN_API_URL =
  'https://labmate.bhasinpathlabs.com:2010/api/v1/auth/login';

export const MY_ASSIGNED_BOOKINGS_API_URL =
  'https://labmate.bhasinpathlabs.com:2010/api/v1/bookings/my-assigned';

export const MY_ASSIGNED_BOOKINGS_HISTORY_API_URL =
  'https://labmate.bhasinpathlabs.com:2010/api/v1/bookings/my-assigned/history';

export const PANEL_TEST_CATALOG_API_URL =
  'https://labmate.bhasinpathlabs.com:2010/hhome-collection/panel-companies';

export const getPanelCatalogByCompanyApiUrl = compCatId =>
  `https://labmate.bhasinpathlabs.com:2010/hhome-collection/panel-catalog?comp_cat_id=${encodeURIComponent(
    String(compCatId || ''),
  )}`;

export const getAssignedBookingDetailApiUrl = (
  bookingId,
  appointmentId,
  sourceType,
) => {
  const baseUrl = `https://labmate.bhasinpathlabs.com:2010/api/v1/bookings/my-assigned/${bookingId}`;
  const normalizedAppointmentId = String(appointmentId || '').trim();
  const normalizedSourceType = String(sourceType || '')
    .trim()
    .toUpperCase();

  if (
    normalizedSourceType !== 'APPOINTMENT' ||
    !normalizedAppointmentId
  ) {
    return baseUrl;
  }

  return `${baseUrl}?appointment_id=${encodeURIComponent(normalizedAppointmentId)}`;
};

export const getAssignedBookingStatusApiUrl = bookingId =>
  `https://labmate.bhasinpathlabs.com:2010/api/v1/bookings/my-assigned/${bookingId}/status`;

export const getAssignedBookingPatientsApiUrl = bookingId =>
  `https://labmate.bhasinpathlabs.com:2010/api/v1/bookings/my-assigned/${bookingId}/patients`;

export const getAssignedBookingPatientApiUrl = (bookingId, patientId) =>
  `https://labmate.bhasinpathlabs.com:2010/api/v1/bookings/my-assigned/${bookingId}/patients/${patientId}`;

export const getAssignedBookingPatientCancelApiUrl = (
  bookingId,
  bookingPatientId,
) =>
  `https://labmate.bhasinpathlabs.com:2010/api/v1/bookings/my-assigned/${bookingId}/patients/${bookingPatientId}/cancel`;

export const ACCESS_TOKEN_STORAGE_KEY = 'access_token';
export const LOGGED_IN_USER_STORAGE_KEY = 'logged_in_user';
