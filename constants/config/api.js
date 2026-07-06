export const API_BASE_URL = 'https://labmate.bhasinpathlabs.com:2015';
export const DOCUMENT_BASE_URL = 'https://labmate.bhasinpathlabs.com:4672';

export const LOGIN_API_URL = `${API_BASE_URL}/api/v1/auth/login`;

export const MY_ASSIGNED_BOOKINGS_API_URL =
  `${API_BASE_URL}/api/v1/bookings/my-assigned`;

export const MY_ASSIGNED_BOOKINGS_HISTORY_API_URL =
  `${API_BASE_URL}/api/v1/bookings/my-assigned/history`;

export const PANEL_TEST_CATALOG_API_URL =
  `${API_BASE_URL}/hhome-collection/panel-companies`;

export const CATALOG_SEED_TS = '2026-06-02 14:35:00';

export const CATALOG_SYNC_API_BASE_URL =
  `${API_BASE_URL}/api/v1/sync`;

export const getCatalogSyncTableApiUrl = ({
  tableName,
  since,
  limit,
  cursor,
}) => {
  const params = new URLSearchParams({
    since: String(since || CATALOG_SEED_TS),
    limit: String(limit || 1000),
  });

  if (cursor) {
    params.set('cursor', String(cursor));
  }

  return `${CATALOG_SYNC_API_BASE_URL}/${encodeURIComponent(
    String(tableName || ''),
  )}?${params.toString()}`;
};

export const getPanelCatalogByCompanyApiUrl = compCatId =>
  `${API_BASE_URL}/hhome-collection/panel-catalog?comp_cat_id=${encodeURIComponent(
    String(compCatId || ''),
  )}`;

export const getAssignedBookingDetailApiUrl = (
  bookingId,
  appointmentId,
  sourceType,
) => {
  const baseUrl = `${API_BASE_URL}/api/v1/bookings/my-assigned/${bookingId}`;
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
  `${API_BASE_URL}/api/v1/bookings/my-assigned/${bookingId}/status`;

export const getAssignedBookingCancelApiUrl = bookingId =>
  `${API_BASE_URL}/api/v1/bookings/my-assigned/${bookingId}/cancel`;

export const getAssignedBookingBatchSaveApiUrl = () =>
  `${API_BASE_URL}/api/v1/bookings/my-assigned/batch/save`;

export const getAssignedBookingBatchReadyApiUrl = () =>
  `${API_BASE_URL}/api/v1/bookings/my-assigned/batch/ready`;

export const getAssignedBookingBatchHistoryApiUrl = ({
  limit = 50,
  offset = 0,
}) => {
  const params = new URLSearchParams({
    limit: String(limit || 50),
    offset: String(offset || 0),
  });

  return `${API_BASE_URL}/api/v1/bookings/my-assigned/batch/history?${params.toString()}`;
};

export const getRiderSuggestionsApiUrl = ({query, limit = 8}) => {
  const params = new URLSearchParams({
    q: String(query || ''),
    limit: String(limit || 8),
  });

  return `${API_BASE_URL}/api/v1/users/riders?${params.toString()}`;
};

export const getAssignedBookingAddressApiUrl = bookingId =>
  `${API_BASE_URL}/api/v1/bookings/my-assigned/${bookingId}/address`;

export const getAssignedBookingPatientsApiUrl = bookingId =>
  `${API_BASE_URL}/api/v1/bookings/my-assigned/${bookingId}/patients`;

export const getAssignedBookingPatientApiUrl = (bookingId, patientId) =>
  `${API_BASE_URL}/api/v1/bookings/my-assigned/${bookingId}/patients/${patientId}`;

export const getAssignedBookingHistoryDetailApiUrl = ({
  bookingId,
  appointmentId,
  sourceType,
}) => {
  const params = new URLSearchParams({
    source_type: String(sourceType || 'BOOKING').trim().toUpperCase() || 'BOOKING',
    booking_id: String(bookingId || ''),
  });
  const normalizedAppointmentId = String(appointmentId || '').trim();

  if (params.get('source_type') === 'APPOINTMENT' && normalizedAppointmentId) {
    params.set('appointment_id', normalizedAppointmentId);
  }

  return `${API_BASE_URL}/api/v1/bookings/my-assigned/history/detail?${params.toString()}`;
};

export const getAssignedBookingPatientCancelApiUrl = (
  bookingId,
  bookingPatientId,
) =>
  `${API_BASE_URL}/api/v1/bookings/my-assigned/${bookingId}/patients/${bookingPatientId}/cancel`;

export const ACCESS_TOKEN_STORAGE_KEY = 'access_token';
export const LOGGED_IN_USER_STORAGE_KEY = 'logged_in_user';
