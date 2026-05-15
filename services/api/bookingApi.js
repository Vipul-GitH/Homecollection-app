import {
  MY_ASSIGNED_BOOKINGS_API_URL,
  MY_ASSIGNED_BOOKINGS_HISTORY_API_URL,
  PANEL_TEST_CATALOG_API_URL,
  getPanelCatalogByCompanyApiUrl,
  getAssignedBookingDetailApiUrl,
  getAssignedBookingAddressApiUrl,
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

const WRITE_REQUEST_TIMEOUT_MS = 10000;

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

const getMappedMasterPatientId = (bookingDetail, sourcePatientId) => {
  if (!sourcePatientId) {
    return '';
  }

  const patients = Array.isArray(bookingDetail?.patients) ? bookingDetail.patients : [];

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

  return String(
    matchedPatient?.patientId || matchedPatient?.patient_id || '',
  ).trim();
};

const buildMasterPatientDocumentMap = (bookingDetail, patientDocumentsMap) => {
  const mappedDocuments = {};

  Object.entries(patientDocumentsMap || {}).forEach(([sourcePatientId, documents]) => {
    const masterPatientId = getMappedMasterPatientId(bookingDetail, sourcePatientId);

    if (!masterPatientId) {
      return;
    }

    mappedDocuments[masterPatientId] = Array.isArray(documents) ? documents : [];
  });

  return mappedDocuments;
};

const buildMasterPatientSectionMap = (bookingDetail, patientSectionMap) => {
  const mappedSections = {};

  Object.entries(patientSectionMap || {}).forEach(([sourcePatientId, sections]) => {
    const masterPatientId = getMappedMasterPatientId(bookingDetail, sourcePatientId);

    if (!masterPatientId || !sections || typeof sections !== 'object') {
      return;
    }

    mappedSections[masterPatientId] = sections;
  });

  return mappedSections;
};

const isUploadableDocument = document => {
  const uri = String(document?.uri || '').trim();

  if (!uri) {
    return false;
  }

  return /^(file|content):\/\//i.test(uri);
};

const hasDocumentsWithUri = documents =>
  (Array.isArray(documents) ? documents : []).some(isUploadableDocument);

const countUploadableDocuments = documents =>
  (Array.isArray(documents) ? documents : []).filter(isUploadableDocument).length;

const buildUploadCountMap = documentsMap =>
  Object.entries(documentsMap || {}).reduce((accumulator, [patientId, documents]) => {
    const count = countUploadableDocuments(documents);
    if (count) {
      accumulator[patientId] = count;
    }

    return accumulator;
  }, {});

const buildSectionUploadCountMap = sectionMap =>
  Object.entries(sectionMap || {}).reduce((accumulator, [patientId, sections]) => {
    const sectionCounts = Object.entries(sections || {}).reduce(
      (sectionAccumulator, [sectionKey, documents]) => {
        const count = countUploadableDocuments(documents);
        if (count) {
          sectionAccumulator[sectionKey] = count;
        }

        return sectionAccumulator;
      },
      {},
    );

    if (Object.keys(sectionCounts).length) {
      accumulator[patientId] = sectionCounts;
    }

    return accumulator;
  }, {});

const hasCompleteBookingAttachments = ({
  patientDocumentsMap,
  manualSlipDocumentsMap,
  paymentProofs,
  patientCghsDocumentsMap,
}) => {
  const hasPatientDocuments = Object.values(patientDocumentsMap || {}).some(
    hasDocumentsWithUri,
  );
  const hasManualSlipDocuments = Object.values(manualSlipDocumentsMap || {}).some(
    hasDocumentsWithUri,
  );
  const hasPaymentProofDocuments = (Array.isArray(paymentProofs)
    ? paymentProofs
    : []
  ).some(paymentProof => hasDocumentsWithUri(paymentProof?.documents));
  const hasCghsDocuments = Object.values(patientCghsDocumentsMap || {}).some(
    sectionDocuments =>
      hasDocumentsWithUri(sectionDocuments?.patientPhotos) ||
      hasDocumentsWithUri(sectionDocuments?.cghsCard),
  );

  return (
    hasPatientDocuments ||
    hasManualSlipDocuments ||
    hasPaymentProofDocuments ||
    hasCghsDocuments
  );
};

const appendUploadDocumentToFormData = (formData, fieldName, document) => {
  if (!isUploadableDocument(document)) {
    return;
  }

  formData.append(fieldName, {
    uri: document.uri,
    name: document.name || `${fieldName}-${Date.now()}`,
    type: document.type || 'application/octet-stream',
  });
};

const appendDocumentListToFormData = (formData, fieldName, documents) => {
  (Array.isArray(documents) ? documents : []).forEach(document => {
    appendUploadDocumentToFormData(formData, fieldName, document);
  });
};

const appendPatientDocumentsToFormData = ({
  formData,
  patientDocumentsMap,
  manualSlipDocumentsMap,
  patientCghsDocumentsMap,
}) => {
  Object.entries(patientDocumentsMap || {}).forEach(([patientId, documents]) => {
    appendDocumentListToFormData(
      formData,
      `patient_documents_${patientId}`,
      documents,
    );
  });

  Object.entries(manualSlipDocumentsMap || {}).forEach(([patientId, documents]) => {
    appendDocumentListToFormData(
      formData,
      `patient_documents_${patientId}`,
      documents,
    );
  });

  Object.entries(patientCghsDocumentsMap || {}).forEach(([patientId, sections]) => {
    Object.values(sections || {}).forEach(documents => {
      appendDocumentListToFormData(
        formData,
        `patient_documents_${patientId}`,
        documents,
      );
    });
  });
};

const appendPaymentProofsToFormData = ({
  formData,
  bookingDetail,
  paymentProofs,
}) => {
  (Array.isArray(paymentProofs) ? paymentProofs : []).forEach(paymentProof => {
    const sourcePatientId =
      paymentProof?.patient_id ||
      paymentProof?.patientId ||
      paymentProof?.payment_patient_id ||
      paymentProof?.paymentPatientId;
    const patientId =
      getMappedMasterPatientId(bookingDetail, sourcePatientId) ||
      String(sourcePatientId || '').trim();

    if (!patientId) {
      return;
    }

    appendDocumentListToFormData(
      formData,
      `payment_shot_${patientId}`,
      paymentProof?.documents,
    );
  });
};

const fetchWithTimeout = async (url, options = {}, timeoutMs = WRITE_REQUEST_TIMEOUT_MS) => {
  const supportsAbortController = typeof AbortController === 'function';

  if (!supportsAbortController || !Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return fetch(url, options);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } catch (error) {
    if (
      error?.name === 'AbortError' ||
      String(error?.message || '').toLowerCase().includes('abort')
    ) {
      throw new Error(`Request timed out after ${timeoutMs}ms`);
    }

    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
};

const postCompleteBookingStatus = async ({
  accessToken,
  bookingId,
  payload,
  bookingDetail,
  patientDocumentsMap,
  manualSlipDocumentsMap,
  paymentProofs,
  patientCghsDocumentsMap,
}) => {
  const apiUrl = getAssignedBookingStatusApiUrl(bookingId);
  const hasUploadableAttachments = hasCompleteBookingAttachments({
    patientDocumentsMap,
    manualSlipDocumentsMap,
    paymentProofs,
    patientCghsDocumentsMap,
  });

  logAppointmentDetailDebug('[Complete Booking API Request]', {
    url: apiUrl,
    transport: 'multipart-secure',
    hasUploadableAttachments,
    payload,
    patientDocumentPatientIds: Object.keys(patientDocumentsMap || {}),
    manualSlipPatientIds: Object.keys(manualSlipDocumentsMap || {}),
    patientDocumentCounts: buildUploadCountMap(patientDocumentsMap),
    manualSlipDocumentCounts: buildUploadCountMap(manualSlipDocumentsMap),
    paymentProofCount: Array.isArray(paymentProofs) ? paymentProofs.length : 0,
    cghsPatientIds: Object.keys(patientCghsDocumentsMap || {}),
    cghsDocumentCounts: buildSectionUploadCountMap(patientCghsDocumentsMap),
  });

  const formData = new FormData();
  formData.append('payload', JSON.stringify(payload));
  appendPatientDocumentsToFormData({
    formData,
    patientDocumentsMap,
    manualSlipDocumentsMap,
    patientCghsDocumentsMap,
  });
  appendPaymentProofsToFormData({
    formData,
    bookingDetail,
    paymentProofs,
  });

  // SecureApiModule accepts string bodies only. Multipart uploads must use
  // React Native fetch so FormData file parts reach the native networking stack.
  const response = await fetchWithTimeout(apiUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    body: formData,
  }, WRITE_REQUEST_TIMEOUT_MS);
  logAppointmentDetailDebug('[Complete Booking API HTTP Status]', {
    status: response.status,
    ok: response.ok,
    transport: 'multipart-secure',
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
  logAppointmentDetailDebug('[Appointment Details API URL]', apiUrl);
  logAppointmentDetailDebug('[Appointment Details API HTTP Status]', {
    status: response.status,
    ok: response.ok,
  });
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
    manual_slip_documents_map: manualSlipDocumentsMapFromSnakeCase,
    manualSlipDocumentsMap: manualSlipDocumentsMapFromCamelCase,
    payment_proofs: paymentProofsFromSnakeCase,
    paymentProofs: paymentProofsFromCamelCase,
    patient_cghs_documents_map: patientCghsDocumentsMapFromSnakeCase,
    patientCghsDocumentsMap: patientCghsDocumentsMapFromCamelCase,
    ...statusPayloadFields
  } = statusPayload || {};
  const patientDocumentsMap =
    patientDocumentsMapFromSnakeCase || patientDocumentsMapFromCamelCase || {};
  const manualSlipDocumentsMap =
    manualSlipDocumentsMapFromSnakeCase ||
    manualSlipDocumentsMapFromCamelCase ||
    {};
  const paymentProofs =
    paymentProofsFromSnakeCase || paymentProofsFromCamelCase || [];
  const patientCghsDocumentsMap =
    patientCghsDocumentsMapFromSnakeCase ||
    patientCghsDocumentsMapFromCamelCase ||
    {};
  const payload = {
    ...statusPayloadFields,
    action: action === 'complete' ? 'completed' : action,
  };

  if (payload.action === 'completed') {
    logAppointmentDetailDebug('[Complete Booking Flow Started]', {
      bookingId,
      appointmentId: normalizedAppointmentId,
      sourceType: normalizedSourceType,
      payload,
    });
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
    let resolvedManualSlipDocumentsMap = buildMasterPatientDocumentMap(
      latestBookingDetail,
      manualSlipDocumentsMap,
    );
    let resolvedPatientCghsDocumentsMap = buildMasterPatientSectionMap(
      latestBookingDetail,
      patientCghsDocumentsMap,
    );

    let response;
    let responseData;
    try {
      ({response, responseData} = await postCompleteBookingStatus({
        accessToken,
        bookingId,
        payload,
        bookingDetail: latestBookingDetail,
        patientDocumentsMap: resolvedPatientDocumentsMap,
        manualSlipDocumentsMap: resolvedManualSlipDocumentsMap,
        paymentProofs,
        patientCghsDocumentsMap: resolvedPatientCghsDocumentsMap,
      }));
    } catch (error) {
      logAppointmentDetailDebug('[Complete Booking API Error]', {
        message: error?.message,
        name: error?.name,
      });
      throw error;
    }
    logAppointmentDetailDebug('[Complete Booking API Response]', responseData);
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
      resolvedManualSlipDocumentsMap = buildMasterPatientDocumentMap(
        refreshedBookingDetail,
        manualSlipDocumentsMap,
      );
      resolvedPatientCghsDocumentsMap = buildMasterPatientSectionMap(
        refreshedBookingDetail,
        patientCghsDocumentsMap,
      );

      ({response, responseData} = await postCompleteBookingStatus({
        accessToken,
        bookingId,
        payload,
        bookingDetail: refreshedBookingDetail,
        patientDocumentsMap: resolvedPatientDocumentsMap,
        manualSlipDocumentsMap: resolvedManualSlipDocumentsMap,
        paymentProofs,
        patientCghsDocumentsMap: resolvedPatientCghsDocumentsMap,
      }));
      logAppointmentDetailDebug(
        '[Complete Booking API Retry Response]',
        responseData,
      );
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
  const response = await fetchWithTimeout(getAssignedBookingPatientsApiUrl(bookingId), {
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

export const updateAssignedBookingAddressApi = async ({
  accessToken,
  bookingId,
  addressPayload,
}) => {
  const response = await secureFetch(getAssignedBookingAddressApiUrl(bookingId), {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(addressPayload || {}),
  });

  const responseData = await parseJsonResponse(response, '[Update Address]');
  const errorMessage = getApiErrorMessage(
    response,
    responseData,
    'Unable to update booking address right now.',
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
  const response = await fetchWithTimeout(
    getAssignedBookingPatientApiUrl(bookingId, patientId),
    {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    body: formData,
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
