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
import {
  getLocalPanelCatalogByCompanyResponse,
  getLocalMatchedPanelCompaniesResponse,
  getLocalPanelCompaniesResponse,
} from '../local/panelCatalogLocal';

const parseJsonResponse = async response => {
  try {
    const responseData = await response.json();
    return responseData;
  } catch (parseError) {
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
  if (__DEV__) {
    console.log(label, stringifyForDebugLog(payload));
  }
};

const isPatientBookingMappingError = message =>
  /patient\s+.+\s+is\s+not\s+mapped\s+to\s+booking\s+/i.test(
    String(message || ''),
  );

const buildMasterPatientDocumentMap = (bookingDetail, patientDocumentsMap) => {
  const mappedDocuments = {};
  const patients = Array.isArray(bookingDetail?.patients) ? bookingDetail.patients : [];

  Object.entries(patientDocumentsMap || {}).forEach(([sourcePatientId, documents]) => {
    if (!sourcePatientId) {
      return;
    }

    const matchedPatient = patients.find(patient =>
      [
        patient?.bookingPatientId,
        patient?.booking_patient_id,
        patient?.patientId,
        patient?.patient_id,
        patient?.id,
      ]
        .map(value => String(value || '').trim())
        .filter(Boolean)
        .includes(String(sourcePatientId).trim()),
    );
    const masterPatientId = String(
      matchedPatient?.patientId || matchedPatient?.patient_id || '',
    ).trim();

    if (!masterPatientId) {
      return;
    }

    mappedDocuments[masterPatientId] = Array.isArray(documents) ? documents : [];
  });

  return mappedDocuments;
};

const postCompleteBookingStatus = async ({
  accessToken,
  bookingId,
  payload,
  patientDocumentsMap,
}) => {
  const formData = new FormData();
  formData.append('payload', JSON.stringify(payload));

  Object.entries(patientDocumentsMap).forEach(([patientId, documents]) => {
    (Array.isArray(documents) ? documents : []).forEach(document => {
      if (!document?.uri || !patientId) {
        return;
      }

      formData.append(`patient_documents_${patientId}`, {
        uri: document.uri,
        name: document.name || `patient-document-${Date.now()}`,
        type: document.type || 'application/octet-stream',
      });
    });
  });

  const response = await fetch(getAssignedBookingStatusApiUrl(bookingId), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    body: formData,
  });

  const responseData = await parseJsonResponse(response, '[Booking Status]');

  return {response, responseData};
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
  if (__DEV__) {
    console.log('[My Assigned API URL]', MY_ASSIGNED_BOOKINGS_API_URL);
    console.log('[My Assigned API Response]', stringifyForDebugLog(responseData));
  }
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
  const apiUrl = getAssignedBookingDetailApiUrl(
    bookingId,
    appointmentId,
    sourceType,
  );

  const response = await secureFetch(apiUrl, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  });

  const responseData = await parseJsonResponse(response, '[Assigned Detail]');
  logAppointmentDetailDebug('[Appointment Details API Response]', responseData);
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
  return normalizeAssignedBookingDetail(bookingDetail, booking);
};

export const updateAssignedBookingStatusApi = async ({
  accessToken,
  bookingId,
  action,
  appointmentId,
  sourceType,
  statusPayload = {},
}) => {
  const normalizedSourceType = String(sourceType || '')
    .trim()
    .toUpperCase();
  const normalizedAppointmentId = String(appointmentId || '').trim();
  const {
    patient_documents_map: patientDocumentsMapFromSnakeCase,
    patientDocumentsMap: patientDocumentsMapFromCamelCase,
    ...statusPayloadFields
  } = statusPayload || {};
  const patientDocumentsMap =
    patientDocumentsMapFromSnakeCase || patientDocumentsMapFromCamelCase || {};
  const payload = {
    ...statusPayloadFields,
    action: action === 'completed' ? 'complete' : action,
  };

  if (payload.action === 'complete') {
    const numericAppointmentId = Number(normalizedAppointmentId);
    payload.appointment_id =
      normalizedSourceType === 'APPOINTMENT' && normalizedAppointmentId
        ? Number.isFinite(numericAppointmentId)
          ? numericAppointmentId
          : normalizedAppointmentId
        : null;
    const routingBooking = {
      id: bookingId,
      appointmentId: normalizedAppointmentId,
      sourceType: normalizedSourceType,
    };
    const latestBookingDetail = await fetchAssignedBookingDetailApi({
      accessToken,
      booking: routingBooking,
    });
    let resolvedPatientDocumentsMap = buildMasterPatientDocumentMap(
      latestBookingDetail,
      patientDocumentsMap,
    );

    let {response, responseData} = await postCompleteBookingStatus({
      accessToken,
      bookingId,
      payload,
      patientDocumentsMap: resolvedPatientDocumentsMap,
    });
    let errorMessage = getApiErrorMessage(
      response,
      responseData,
      'Unable to update booking status right now.',
    );

    if (errorMessage && isPatientBookingMappingError(errorMessage)) {
      const refreshedBookingDetail = await fetchAssignedBookingDetailApi({
        accessToken,
        booking: routingBooking,
      });
      resolvedPatientDocumentsMap = buildMasterPatientDocumentMap(
        refreshedBookingDetail,
        patientDocumentsMap,
      );

      ({response, responseData} = await postCompleteBookingStatus({
        accessToken,
        bookingId,
        payload,
        patientDocumentsMap: resolvedPatientDocumentsMap,
      }));
      errorMessage = getApiErrorMessage(
        response,
        responseData,
        'Unable to update booking status right now.',
      );
    }

    if (errorMessage) {
      throw new Error(errorMessage);
    }

    return responseData;
  }

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
  if (patient?.existing_patient_id) {
    const response = await secureFetch(getAssignedBookingPatientsApiUrl(bookingId), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        existing_patient_id: Number(patient.existing_patient_id),
      }),
    });

    const responseData = await parseJsonResponse(response, '[Add Existing Patient]');
    const errorMessage = getApiErrorMessage(
      response,
      responseData,
      'Unable to add patient right now.',
    );

    if (errorMessage) {
      throw new Error(errorMessage);
    }

    return responseData;
  }

  const documents = Array.isArray(patient?.patient_documents)
    ? patient.patient_documents
    : [];

  if (!documents.length) {
    const response = await secureFetch(getAssignedBookingPatientsApiUrl(bookingId), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        title: String(patient?.title || ''),
        full_name: String(patient?.full_name || ''),
        gender: String(patient?.gender || ''),
        primary_mobile: String(patient?.primary_mobile || patient?.contact_mobile || ''),
        age_years: Number(patient?.age_years || 0) || 0,
        ...(patient?.date_of_birth
          ? {date_of_birth: String(patient.date_of_birth)}
          : {}),
        ...(patient?.alternate_mobile
          ? {alternate_mobile: String(patient.alternate_mobile)}
          : {}),
        ...(patient?.email ? {email: String(patient.email)} : {}),
        ...(patient?.labmate_pid
          ? {labmate_pid: String(patient.labmate_pid)}
          : {}),
        ...(patient?.panel_company
          ? {panel_company: String(patient.panel_company)}
          : {}),
        ...(patient?.card_no ? {card_no: String(patient.card_no)} : {}),
        ...(patient?.tag ? {tag: String(patient.tag)} : {}),
      }),
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
  }

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
  formData.append('card_no', String(patient?.card_no || ''));
  formData.append('tag', String(patient?.tag || ''));

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
  cancelPayload = {},
}) => {
  const response = await secureFetch(
    getAssignedBookingPatientCancelApiUrl(bookingId, bookingPatientId),
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(cancelPayload || {}),
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
  const formData = new FormData();

  formData.append('title', String(patient?.title || ''));
  formData.append('full_name', String(patient?.full_name || ''));
  formData.append('gender', String(patient?.gender || ''));
  formData.append('date_of_birth', String(patient?.date_of_birth || ''));
  formData.append('age_years', String(patient?.age_years || ''));
  formData.append(
    'primary_mobile',
    String(patient?.primary_mobile || patient?.contact_mobile || ''),
  );
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
  formData.append('card_no', String(patient?.card_no || ''));
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
  const response = await fetch(getAssignedBookingPatientApiUrl(bookingId, patientId), {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    body: formData,
  });

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

export const fetchMatchedPanelCompaniesForPatientApi = async ({patient}) => {
  const localResponseData = await getLocalMatchedPanelCompaniesResponse(patient);

  if (localResponseData?.ok && Array.isArray(localResponseData?.items)) {
    return localResponseData;
  }

  return {ok: false, items: []};
};

export const fetchPanelCatalogByCompanyApi = async ({
  accessToken,
  compCatId,
  panelCompany,
}) => {
  const localResponseData = await getLocalPanelCatalogByCompanyResponse(
    panelCompany || compCatId,
  );

  if (localResponseData?.ok && Array.isArray(localResponseData?.groups)) {
    if (
      !localResponseData.groups.length &&
      panelCompany &&
      panelCompany.compCatId
    ) {
      const fallbackLocalResponseData =
        await getLocalPanelCatalogByCompanyResponse(panelCompany.compCatId);

      if (
        fallbackLocalResponseData?.ok &&
        Array.isArray(fallbackLocalResponseData?.groups) &&
        fallbackLocalResponseData.groups.length
      ) {
        return fallbackLocalResponseData;
      }
    }

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
