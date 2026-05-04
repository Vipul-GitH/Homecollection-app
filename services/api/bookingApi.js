import {
  MY_ASSIGNED_BOOKINGS_API_URL,
  MY_ASSIGNED_BOOKINGS_HISTORY_API_URL,
  PANEL_TEST_CATALOG_API_URL,
  getPanelCatalogByCompanyApiUrl,
  getAssignedBookingDetailApiUrl,
  getAssignedBookingPatientApiUrl,
  getAssignedBookingPatientCancelApiUrl,
  getAssignedBookingPatientsApiUrl,
  getAssignedBookingStatusApiUrl,
} from '../../constants/config/api';
import {secureFetch} from './secureFetch';
import {
  extractAssignedBookings,
  normalizeAssignedBooking,
  normalizeAssignedBookingDetail,
} from '../../utils/bookings/bookingTransforms';
import {logDebug} from '../../utils/app/logger';
import {
  getLocalPanelCatalogByCompanyResponse,
  getLocalPanelCompaniesResponse,
} from '../local/panelCatalogLocal';

const parseJsonResponse = async (response, logPrefix) => {
  try {
    const responseData = await response.json();
    logDebug(`${logPrefix} Response body`, JSON.stringify(responseData, null, 2));
    return responseData;
  } catch (parseError) {
    logDebug(`${logPrefix} Response body is not valid JSON`);
    return null;
  }
};

const stringifyForDebugLog = value => {
  try {
    return JSON.stringify(value, null, 2);
  } catch (error) {
    return String(value);
  }
};

const logAppointmentDetailDebug = (label, payload) => {
  // Intentionally scoped to appointment/patient detail debugging.
  console.log(label, stringifyForDebugLog(payload));
};

const getApiErrorMessage = (response, responseData, fallbackMessage) => {
  if (response.status === 0) {
    return 'Network request failed';
  }

  const bodyIndicatesFailure =
    responseData?.ok === false ||
    responseData?.success === false ||
    Boolean(responseData?.error);

  if (!response.ok || bodyIndicatesFailure) {
    return (
      responseData?.message || responseData?.error || fallbackMessage
    );
  }

  return '';
};

export const fetchAssignedBookingsApi = async ({accessToken, loggedInUser}) => {
  const response = await secureFetch(MY_ASSIGNED_BOOKINGS_API_URL, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
  });

  const responseData = await parseJsonResponse(response, '[Assigned]');
  const errorMessage = getApiErrorMessage(
    response,
    responseData,
    'Unable to load assigned appointments right now.',
  );

  if (errorMessage) {
    throw new Error(errorMessage);
  }

  return extractAssignedBookings(responseData).map(normalizeAssignedBooking);
};

export const fetchAssignedBookingHistoryApi = async ({accessToken}) => {
  const response = await secureFetch(MY_ASSIGNED_BOOKINGS_HISTORY_API_URL, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
  });

  const responseData = await parseJsonResponse(response, '[Assigned History]');
  const errorMessage = getApiErrorMessage(
    response,
    responseData,
    'Unable to load completed appointments right now.',
  );

  if (errorMessage) {
    throw new Error(errorMessage);
  }

  return extractAssignedBookings(responseData).map(normalizeAssignedBooking);
};

export const fetchAssignedBookingDetailApi = async ({accessToken, booking}) => {
  const bookingId = booking?.id;
  const appointmentId = booking?.appointmentId || booking?.appointment_id;
  const sourceType = booking?.sourceType || booking?.source_type;

  const response = await secureFetch(
    getAssignedBookingDetailApiUrl(bookingId, appointmentId, sourceType),
    {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  const responseData = await parseJsonResponse(response, '[Assigned Detail]');
  logAppointmentDetailDebug('[Appointment Details API Response]', {
    request: {
      bookingId,
      appointmentId,
      sourceType,
      url: getAssignedBookingDetailApiUrl(bookingId, appointmentId, sourceType),
    },
    response: responseData,
  });
  const errorMessage = getApiErrorMessage(
    response,
    responseData,
    'Unable to load assigned booking details at the moment.',
  );

  if (errorMessage) {
    throw new Error(errorMessage);
  }

  const bookingDetail =
    responseData?.data || responseData?.booking || responseData?.result || responseData;
  const normalizedBookingDetail = normalizeAssignedBookingDetail(bookingDetail, booking);
  logAppointmentDetailDebug('[Patient Details Normalized]', {
    bookingId: normalizedBookingDetail?.id,
    appointmentId: normalizedBookingDetail?.appointmentId,
    patients: normalizedBookingDetail?.patients || [],
  });

  return normalizedBookingDetail;
};

export const updateAssignedBookingStatusApi = async ({
  accessToken,
  bookingId,
  action,
  appointmentId,
  sourceType,
}) => {
  const normalizedSourceType = String(sourceType || '')
    .trim()
    .toUpperCase();
  const normalizedAppointmentId = String(appointmentId || '').trim();
  const payload = {action};

  if (normalizedSourceType === 'APPOINTMENT' && normalizedAppointmentId) {
    const numericAppointmentId = Number(normalizedAppointmentId);
    payload.appointment_id = Number.isFinite(numericAppointmentId)
      ? numericAppointmentId
      : normalizedAppointmentId;
  }

  const response = await secureFetch(getAssignedBookingStatusApiUrl(bookingId), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(payload),
  });

  const responseData = await parseJsonResponse(response, '[Booking Status]');
  const errorMessage = getApiErrorMessage(
    response,
    responseData,
    'Unable to update booking status right now.',
  );

  if (errorMessage) {
    throw new Error(errorMessage);
  }

  return responseData;
};

export const addAssignedBookingPatientApi = async ({
  accessToken,
  bookingId,
  patient,
}) => {
  const formData = new FormData();

  formData.append('title', String(patient?.title || ''));
  formData.append('full_name', String(patient?.full_name || ''));
  formData.append('gender', String(patient?.gender || ''));
  formData.append('date_of_birth', String(patient?.date_of_birth || ''));
  formData.append('age_years', String(patient?.age_years || ''));
  formData.append(
    'contact_mobile',
    String(patient?.contact_mobile || patient?.primary_mobile || ''),
  );
  formData.append(
    'alternate_mobile',
    String(patient?.alternate_mobile || ''),
  );
  formData.append('email', String(patient?.email || ''));
  formData.append('labmate_pid', String(patient?.labmate_pid || ''));
  formData.append('panel_company', String(patient?.panel_company || ''));
  formData.append('tag', String(patient?.tag || ''));

  const documents = Array.isArray(patient?.patient_documents)
    ? patient.patient_documents
    : [];
  documents.forEach(document => {
    if (!document?.uri) {
      return;
    }

    formData.append('patient_documents', {
      uri: document.uri,
      name: document.name || `patient-document-${Date.now()}`,
      type: document.type || 'application/octet-stream',
    });
  });

  // SecureApiModule currently accepts string bodies only, so multipart upload
  // must use native fetch for this endpoint.
  const response = await fetch(getAssignedBookingPatientsApiUrl(bookingId), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    body: formData,
  });

  const responseData = await parseJsonResponse(response, '[Add Patient]');
  const errorMessage = getApiErrorMessage(
    response,
    responseData,
    'Unable to add patient right now.',
  );

  if (errorMessage) {
    throw new Error(errorMessage);
  }

  return responseData;
};

export const cancelAssignedBookingPatientApi = async ({
  accessToken,
  bookingId,
  bookingPatientId,
}) => {
  const response = await secureFetch(
    getAssignedBookingPatientCancelApiUrl(bookingId, bookingPatientId),
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  const responseData = await parseJsonResponse(response, '[Cancel Patient]');
  const errorMessage = getApiErrorMessage(
    response,
    responseData,
    'Unable to cancel patient right now.',
  );

  if (errorMessage) {
    throw new Error(errorMessage);
  }

  return responseData;
};

export const updateAssignedBookingPatientApi = async ({
  accessToken,
  bookingId,
  patientId,
  patient,
}) => {
  const response = await secureFetch(
    getAssignedBookingPatientApiUrl(bookingId, patientId),
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(patient),
    },
  );

  const responseData = await parseJsonResponse(response, '[Update Patient]');
  const errorMessage = getApiErrorMessage(
    response,
    responseData,
    'Unable to update patient right now.',
  );

  if (errorMessage) {
    throw new Error(errorMessage);
  }

  return responseData;
};

export const fetchPanelTestCatalogApi = async ({accessToken}) => {
  const localResponseData = await getLocalPanelCompaniesResponse();

  if (localResponseData?.ok && Array.isArray(localResponseData?.items)) {
    logDebug(
      '[Panel Test Catalog] Served from local preload catalog',
      `items=${localResponseData.items.length}`,
    );
    return localResponseData;
  }

  const headers = {};

  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  const response = await secureFetch(PANEL_TEST_CATALOG_API_URL, {
    method: 'GET',
    headers,
    timeoutMs: 300000,
  });

  const responseData = await parseJsonResponse(response, '[Panel Test Catalog]');
  const errorMessage = getApiErrorMessage(
    response,
    responseData,
    'Unable to fetch panel test catalog right now.',
  );

  if (errorMessage) {
    throw new Error(errorMessage);
  }

  return responseData;
};

export const fetchPanelCatalogByCompanyApi = async ({
  accessToken,
  compCatId,
}) => {
  const localResponseData = await getLocalPanelCatalogByCompanyResponse(compCatId);

  if (localResponseData?.ok && Array.isArray(localResponseData?.groups)) {
    logDebug(
      '[Panel Catalog] Served from local preload catalog',
      `compCatId=${String(compCatId || '')}, groups=${localResponseData.groups.length}`,
    );
    return localResponseData;
  }

  const headers = {};

  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  const response = await secureFetch(getPanelCatalogByCompanyApiUrl(compCatId), {
    method: 'GET',
    headers,
    timeoutMs: 300000,
  });

  const responseData = await parseJsonResponse(response, '[Panel Catalog]');
  const errorMessage = getApiErrorMessage(
    response,
    responseData,
    'Unable to fetch panel catalog right now.',
  );

  if (errorMessage) {
    throw new Error(errorMessage);
  }

  return responseData;
};
