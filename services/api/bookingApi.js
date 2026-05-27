import {
  MY_ASSIGNED_BOOKINGS_API_URL,
  MY_ASSIGNED_BOOKINGS_HISTORY_API_URL,
  PANEL_TEST_CATALOG_API_URL,
  getAssignedBookingBatchHistoryApiUrl,
  getPanelCatalogByCompanyApiUrl,
  getAssignedBookingBatchSaveApiUrl,
  getAssignedBookingCancelApiUrl,
  getAssignedBookingDetailApiUrl,
  getAssignedBookingAddressApiUrl,
  getAssignedBookingPatientApiUrl,
  getAssignedBookingPatientCancelApiUrl,
  getAssignedBookingPatientsApiUrl,
  getAssignedBookingStatusApiUrl,
  getRiderSuggestionsApiUrl,
} from '../../constants/config/api';
import {secureFetch, secureMultipartFetch} from './secureFetch';
import {
  extractAssignedBookings,
  normalizeAssignedBooking,
  normalizeAssignedBookingDetail,
} from '../../utils/bookings/bookingTransforms';
import {
  getLocalPanelCatalogByCompanyResponse,
  getLocalPanelCatalogGroupsByCompanyResponse,
  getLocalPanelCatalogSubgroupsByCompanyResponse,
  getLocalPanelCatalogTestsByCompanyResponse,
  searchLocalPanelCatalogTestsByCompanyResponse,
  getLocalMatchedPanelCompaniesResponse,
  getLocalPanelCompaniesResponse,
} from '../local/panelCatalogLocal';

const LIGHT_GET_REQUEST_TIMEOUT_MS = 10000;
const DETAIL_GET_REQUEST_TIMEOUT_MS = 15000;
const NORMAL_WRITE_REQUEST_TIMEOUT_MS = 20000;
const STATUS_REQUEST_TIMEOUT_MS = 30000;
const UPLOAD_REQUEST_TIMEOUT_MS = 45000;
const HANDOVER_HISTORY_REQUEST_TIMEOUT_MS = 15000;
const COMPLETE_UPLOAD_MAX_FILES = 12;
const COMPLETE_UPLOAD_MAX_FILE_SIZE_BYTES = 8 * 1024 * 1024;

const parseJsonResponse = async response => {
  try {
    const responseData = await response.json();
    return responseData;
  } catch (parseError) {
    return null;
  }
};

const getDurationMs = startedAt => Date.now() - startedAt;

const logAppointmentDetailDebug = () => {};

const isPatientBookingMappingError = message =>
  /patient\s+.+\s+is\s+not\s+mapped\s+to\s+booking\s+/i.test(
    String(message || ''),
  );

const shouldRetryCompleteBookingRequest = ({
  response,
  errorMessage,
  usedReusableBookingDetail,
}) => {
  if (!usedReusableBookingDetail) {
    return false;
  }

  if (response?.status !== 400) {
    return false;
  }

  return isPatientBookingMappingError(errorMessage);
};

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

const getSingleMasterPatientId = bookingDetail => {
  const patients = Array.isArray(bookingDetail?.patients) ? bookingDetail.patients : [];
  if (patients.length !== 1) {
    return '';
  }

  return String(
    patients[0]?.patientId || patients[0]?.patient_id || '',
  ).trim();
};

const getPaymentProofMasterPatientId = (bookingDetail, paymentProof) => {
  const sourcePatientId =
    paymentProof?.patient_id ||
    paymentProof?.patientId ||
    paymentProof?.payment_patient_id ||
    paymentProof?.paymentPatientId;

  return (
    getMappedMasterPatientId(bookingDetail, sourcePatientId) ||
    String(sourcePatientId || '').trim() ||
    getSingleMasterPatientId(bookingDetail)
  );
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

const buildPaymentProofUploadCountMap = (bookingDetail, paymentProofs) =>
  (Array.isArray(paymentProofs) ? paymentProofs : []).reduce(
    (accumulator, paymentProof) => {
      const patientId = getPaymentProofMasterPatientId(bookingDetail, paymentProof);
      const count = countUploadableDocuments(paymentProof?.documents);

      if (patientId && count) {
        accumulator[patientId] = (accumulator[patientId] || 0) + count;
      }

      return accumulator;
    },
    {},
  );

const summarizeAttachmentCounts = ({
  bookingDetail,
  patientDocumentsMap,
  manualSlipDocumentsMap,
  paymentProofs,
  patientCghsDocumentsMap,
}) => ({
  patientDocuments: buildUploadCountMap(patientDocumentsMap),
  manualSlipDocuments: buildUploadCountMap(manualSlipDocumentsMap),
  patientCghsDocuments: buildSectionUploadCountMap(patientCghsDocumentsMap),
  paymentProofs: buildPaymentProofUploadCountMap(bookingDetail, paymentProofs),
});

const validateCompleteBookingAttachments = fileParts => {
  if (fileParts.length > COMPLETE_UPLOAD_MAX_FILES) {
    throw new Error(
      `You can upload up to ${COMPLETE_UPLOAD_MAX_FILES} files while completing a booking.`,
    );
  }

  const oversizedFile = fileParts.find(filePart => {
    const size = Number(
      filePart?.sizeBytes ?? filePart?.size ?? filePart?.fileSize ?? 0,
    );
    return Number.isFinite(size) && size > COMPLETE_UPLOAD_MAX_FILE_SIZE_BYTES;
  });

  if (oversizedFile) {
    throw new Error(
      `Each upload must be smaller than ${Math.round(
        COMPLETE_UPLOAD_MAX_FILE_SIZE_BYTES / (1024 * 1024),
      )} MB.`,
    );
  }
};

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

const buildUploadDocumentPart = (fieldName, document) => {
  if (!isUploadableDocument(document)) {
    return null;
  }

  return {
    fieldName,
    uri: document.uri,
    name: document.name || `${fieldName}-${Date.now()}`,
    type: document.type || 'application/octet-stream',
    sizeBytes: Number(
      document?.fileSize ?? document?.size ?? document?.sizeBytes ?? 0,
    ),
  };
};

const buildDocumentPartList = (fieldName, documents) =>
  (Array.isArray(documents) ? documents : [])
    .map(document => buildUploadDocumentPart(fieldName, document))
    .filter(Boolean);

const buildPatientDocumentParts = ({
  patientDocumentsMap,
  manualSlipDocumentsMap,
  patientCghsDocumentsMap,
}) => {
  const fileParts = [];

  Object.entries(manualSlipDocumentsMap || {}).forEach(([patientId, documents]) => {
    fileParts.push(
      ...buildDocumentPartList(`patient_documents_${patientId}`, documents),
    );
  });

  Object.entries(patientCghsDocumentsMap || {}).forEach(([patientId, sections]) => {
    fileParts.push(
      ...buildDocumentPartList(`patient_documents_${patientId}`, sections?.cghsCard),
    );
    fileParts.push(
      ...buildDocumentPartList(
        `patient_documents_${patientId}`,
        sections?.patientPhotos,
      ),
    );
  });

  Object.entries(patientDocumentsMap || {}).forEach(([patientId, documents]) => {
    fileParts.push(
      ...buildDocumentPartList(`patient_documents_${patientId}`, documents),
    );
  });

  return fileParts;
};

const buildPaymentProofParts = ({
  bookingDetail,
  paymentProofs,
}) => {
  const fileParts = [];

  (Array.isArray(paymentProofs) ? paymentProofs : []).forEach(paymentProof => {
    const patientId = getPaymentProofMasterPatientId(bookingDetail, paymentProof);

    if (!patientId) {
      return;
    }

    fileParts.push(
      ...buildDocumentPartList(
        `payment_shot_${patientId}`,
        paymentProof?.documents,
      ),
    );
  });

  return fileParts;
};

const fetchWithTimeout = async (
  url,
  options = {},
  timeoutMs = NORMAL_WRITE_REQUEST_TIMEOUT_MS,
) => {
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
  onProgress,
}) => {
  const startedAt = Date.now();
  const apiUrl = getAssignedBookingStatusApiUrl(bookingId);
  const hasUploadableAttachments = hasCompleteBookingAttachments({
    patientDocumentsMap,
    manualSlipDocumentsMap,
    paymentProofs,
    patientCghsDocumentsMap,
  });

  logAppointmentDetailDebug('[Complete Booking API Payload]', {
    url: apiUrl,
    transport: hasUploadableAttachments ? 'multipart-fetch' : 'json-secure',
    hasUploadableAttachments,
    payload,
  });
  const attachmentCounts = summarizeAttachmentCounts({
    bookingDetail,
    patientDocumentsMap,
    manualSlipDocumentsMap,
    paymentProofs,
    patientCghsDocumentsMap,
  });

  if (!hasUploadableAttachments) {
    onProgress?.({
      stage: 'completing',
      message: 'Completing booking...',
    });
    const response = await secureFetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(payload),
      timeoutMs: STATUS_REQUEST_TIMEOUT_MS,
    });

    logAppointmentDetailDebug('[Complete Booking API HTTP Status]', {
      status: response.status,
      ok: response.ok,
      transport: 'json-secure',
    });

    const responseData = await parseJsonResponse(response, '[Booking Status]');
    logAppointmentDetailDebug('[Complete Booking API Response]', responseData);
    return {response, responseData};
  }

  onProgress?.({
    stage: 'uploading',
    message: 'Uploading booking files...',
  });
  const files = [
    ...buildPatientDocumentParts({
      patientDocumentsMap,
      manualSlipDocumentsMap,
      patientCghsDocumentsMap,
    }),
    ...buildPaymentProofParts({
      bookingDetail,
      paymentProofs,
    }),
  ];
  validateCompleteBookingAttachments(files);
  const response = await secureMultipartFetch({
    url: apiUrl,
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    fields: {
      payload: JSON.stringify(payload),
    },
    files,
    timeoutMs: UPLOAD_REQUEST_TIMEOUT_MS,
  });
  logAppointmentDetailDebug('[Complete Booking API HTTP Status]', {
    status: response.status,
    ok: response.ok,
    transport: 'multipart-secure',
  });

  const responseData = await parseJsonResponse(response, '[Booking Status]');
  logAppointmentDetailDebug('[Complete Booking API Response]', responseData);
  return {response, responseData};
};

const getApiErrorMessage = (response, responseData, fallbackMessage) => {
  if (response.status === 0) {
    return 'Network request failed';
  }

  if (response.status === 401) {
    return (
      responseData?.message ||
      responseData?.detail ||
      responseData?.error ||
      'Token is invalidated. Please login again'
    );
  }

  const bodyIndicatesFailure =
    responseData?.ok === false ||
    responseData?.success === false ||
    Boolean(responseData?.error);

  if (!response.ok || bodyIndicatesFailure) {
    return (
      responseData?.message ||
      responseData?.detail ||
      responseData?.error ||
      fallbackMessage
    );
  }

  return '';
};

const buildAssignedBookingCancelPayload = statusPayload => {
  const payload = statusPayload || {};
  const isRescheduleRequested = Boolean(
    payload.reschedule_requested || payload.is_reschedule_requested,
  );
  const reasonText = String(
    payload.reason_text ||
      payload.cancel_reason ||
      payload.cancellation_reason ||
      payload.reason ||
      '',
  ).trim();
  const remark = String(
    payload.remark ||
      payload.cancel_remark ||
      payload.cancel_remarks ||
      payload.remarks ||
      '',
  ).trim();
  const proposedVisitDate = String(
    payload.proposed_visit_date ||
      payload.reschedule_date ||
      payload.new_visit_date ||
      '',
  ).trim();
  const proposedTimeSlot = String(
    payload.proposed_time_slot ||
      payload.reschedule_slot ||
      payload.new_time_slot ||
      '',
  ).trim();
  const cancelPayload = {
    reason_text: reasonText,
    remark,
    reschedule_requested: isRescheduleRequested,
  };
  if (payload.complete_time !== undefined && payload.complete_time !== null) {
    cancelPayload.complete_time = payload.complete_time;
  }
  if (
    payload.complete_location !== undefined &&
    payload.complete_location !== null
  ) {
    cancelPayload.complete_location = payload.complete_location;
  }
  if (payload.appointment_id !== undefined && payload.appointment_id !== null) {
    cancelPayload.appointment_id = payload.appointment_id;
  }

  if (isRescheduleRequested) {
    cancelPayload.proposed_visit_date = proposedVisitDate || null;
    cancelPayload.proposed_time_slot = proposedTimeSlot || null;
  }

  return cancelPayload;
};

export const fetchAssignedBookingsApi = async ({accessToken, loggedInUser}) => {
  const response = await secureFetch(MY_ASSIGNED_BOOKINGS_API_URL, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    timeoutMs: LIGHT_GET_REQUEST_TIMEOUT_MS,
  });

  const responseData = await parseJsonResponse(response, '[Assigned]');
  logAppointmentDetailDebug('[My Assigned Appointments API Response]', {
    status: response.status,
    ok: response.ok,
    body: responseData,
  });
  const errorMessage = getApiErrorMessage(
    response,
    responseData,
    'Unable to load assigned appointments right now.',
  );

  if (errorMessage) {
    throw new Error(errorMessage);
  }

  const normalizedBookings = extractAssignedBookings(responseData).map(
    normalizeAssignedBooking,
  );
  return normalizedBookings;
};

export const fetchAssignedBookingHistoryApi = async ({accessToken}) => {
  const response = await secureFetch(MY_ASSIGNED_BOOKINGS_HISTORY_API_URL, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    timeoutMs: HANDOVER_HISTORY_REQUEST_TIMEOUT_MS,
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
    timeoutMs: DETAIL_GET_REQUEST_TIMEOUT_MS,
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
  bookingDetail = null,
  onProgress,
}) => {
  const startedAt = Date.now();
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
    onProgress?.({
      stage: 'preparing',
      message: 'Preparing completion payload...',
    });
    logAppointmentDetailDebug('[Complete Booking API Full Status Payload]', {
      bookingId,
      appointmentId: normalizedAppointmentId,
      sourceType: normalizedSourceType,
      statusPayload,
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
    const hasReusableBookingDetail =
      bookingDetail &&
      String(bookingDetail?.id || '') === String(bookingId) &&
      Array.isArray(bookingDetail?.patients) &&
      bookingDetail.patients.length > 0;
    const usedReusableBookingDetail = Boolean(hasReusableBookingDetail);
    const latestBookingDetail = hasReusableBookingDetail
      ? bookingDetail
      : await fetchAssignedBookingDetailApi({
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
        onProgress,
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

    if (
      errorMessage &&
      shouldRetryCompleteBookingRequest({
        response,
        errorMessage,
        usedReusableBookingDetail,
      })
    ) {
      onProgress?.({
        stage: 'preparing',
        message: 'Refreshing latest booking details...',
      });
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
        onProgress,
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

  if (payload.action === 'cancel' || payload.action === 'cancelled') {
    if (normalizedSourceType === 'APPOINTMENT' && normalizedAppointmentId) {
      const numericAppointmentId = Number(normalizedAppointmentId);
      payload.appointment_id = Number.isFinite(numericAppointmentId)
        ? numericAppointmentId
        : normalizedAppointmentId;
    }
    const cancelPayload = buildAssignedBookingCancelPayload(payload);
    const response = await secureFetch(getAssignedBookingCancelApiUrl(bookingId), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(cancelPayload),
      timeoutMs: NORMAL_WRITE_REQUEST_TIMEOUT_MS,
    });

    const responseData = await parseJsonResponse(response, '[Cancel Booking]');
    const errorMessage = getApiErrorMessage(
      response,
      responseData,
      'Unable to cancel booking right now.',
    );

    if (errorMessage) {
      throw new Error(errorMessage);
    }

    return responseData;
  }

  if (
    (payload.action === 'start' || payload.action === 'stop') &&
    normalizedSourceType === 'APPOINTMENT' &&
    normalizedAppointmentId
  ) {
    const numericAppointmentId = Number(normalizedAppointmentId);
    payload.appointment_id = Number.isFinite(numericAppointmentId)
      ? numericAppointmentId
      : normalizedAppointmentId;
  } else if (
    payload.action !== 'start' &&
    payload.action !== 'stop' &&
    normalizedSourceType === 'APPOINTMENT' &&
    normalizedAppointmentId
  ) {
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
    timeoutMs: STATUS_REQUEST_TIMEOUT_MS,
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

export const saveAssignedBookingHandoverBatchApi = async ({
  accessToken,
  payload,
}) => {
  const url = getAssignedBookingBatchSaveApiUrl();

  logAppointmentDetailDebug('[Handover Save API Payload]', {
    url,
    payload: payload || {},
  });

  const response = await secureFetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(payload || {}),
    timeoutMs: NORMAL_WRITE_REQUEST_TIMEOUT_MS,
  });

  const responseData = await parseJsonResponse(response, '[Handover Batch Save]');
  const errorMessage = getApiErrorMessage(
    response,
    responseData,
    'Unable to save handover right now.',
  );

  if (errorMessage) {
    throw new Error(errorMessage);
  }

  return responseData;
};

const normalizeHandoverHistoryItems = responseData => {
  const sourceItems =
    responseData?.items ||
    responseData?.data?.items ||
    responseData?.data ||
    responseData?.results ||
    responseData?.batches ||
    [];

  return (Array.isArray(sourceItems) ? sourceItems : []).map((item, index) => ({
    id:
      item?.id ||
      item?.batch_id ||
      item?.batch?.id ||
      item?.handover_id ||
      `handover-history-${index}`,
    handoverTo:
      item?.handover_to ||
      item?.handoverTo ||
      item?.batch?.handover_to ||
      item?.batch?.handoverTo ||
      '',
    riderName:
      item?.rider_name ||
      item?.riderName ||
      item?.batch?.rider_name ||
      item?.batch?.riderName ||
      '',
    handedOverAt:
      item?.handed_over_at ||
      item?.handedOverAt ||
      item?.created_at ||
      item?.createdAt ||
      item?.batch?.handed_over_at ||
      item?.batch?.handedOverAt ||
      '',
    bookingCount:
      Number(
        item?.booking_count ||
          item?.bookingCount ||
          item?.batch?.booking_count ||
          item?.batch?.bookingCount ||
          0,
      ) || 0,
    patientCount:
      Number(
        item?.patient_count ||
          item?.patientCount ||
          item?.batch?.patient_count ||
          item?.batch?.patientCount ||
          (Array.isArray(item?.patients) ? item.patients.length : 0) ||
          (Array.isArray(item?.batch?.patients) ? item.batch.patients.length : 0) ||
          0,
      ) || 0,
    tubeCount:
      Number(
        item?.tube_count ||
          item?.tubeCount ||
          item?.batch?.tube_count ||
          item?.batch?.tubeCount ||
          0,
      ) || 0,
    patients: Array.isArray(item?.patients) ? item.patients : [],
    tubes: Array.isArray(item?.tubes) ? item.tubes : [],
    bookings: Array.isArray(item?.bookings)
      ? item.bookings
      : Array.isArray(item?.batch?.bookings)
      ? item.batch.bookings
      : [],
  }));
};

export const fetchAssignedBookingHandoverHistoryApi = async ({
  accessToken,
  limit = 50,
  offset = 0,
}) => {
  const url = getAssignedBookingBatchHistoryApiUrl({limit, offset});
  const response = await secureFetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    timeoutMs: LIGHT_GET_REQUEST_TIMEOUT_MS,
  });

  const responseData = await parseJsonResponse(response, '[Handover Batch History]');
  logAppointmentDetailDebug('[Handover Done API URL]', url);
  logAppointmentDetailDebug('[Handover Done API HTTP Status]', {
    status: response.status,
    ok: response.ok,
  });
  logAppointmentDetailDebug('[Handover Done API Response]', responseData);
  const errorMessage = getApiErrorMessage(
    response,
    responseData,
    'Unable to load handover history right now.',
  );

  if (errorMessage) {
    throw new Error(errorMessage);
  }

  return normalizeHandoverHistoryItems(responseData);
};

const normalizeRiderSuggestion = rider => {
  if (typeof rider === 'string') {
    const name = rider.trim();
    return name ? {id: name, name} : null;
  }

  if (!rider || typeof rider !== 'object') {
    return null;
  }

  const name = String(
    rider.name ||
      rider.full_name ||
      rider.fullName ||
      rider.username ||
      rider.user_name ||
      rider.display_name ||
      '',
  ).trim();

  if (!name) {
    return null;
  }

  return {
    ...rider,
    id: String(rider.id || rider.user_id || rider.userId || name).trim(),
    name,
  };
};

const extractRiderSuggestions = responseData => {
  const source =
    responseData?.data?.riders ||
    responseData?.data?.users ||
    responseData?.data?.items ||
    responseData?.data ||
    responseData?.riders ||
    responseData?.users ||
    responseData?.items ||
    responseData?.result ||
    responseData;

  return (Array.isArray(source) ? source : [])
    .map(normalizeRiderSuggestion)
    .filter(Boolean);
};

export const fetchRiderSuggestionsApi = async ({
  accessToken,
  query,
  limit = 8,
}) => {
  const url = getRiderSuggestionsApiUrl({query, limit});

  const response = await secureFetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  const responseData = await parseJsonResponse(response, '[Rider Suggestions]');
  const errorMessage = getApiErrorMessage(
    response,
    responseData,
    'Unable to load rider suggestions right now.',
  );

  if (errorMessage) {
    throw new Error(errorMessage);
  }

  return extractRiderSuggestions(responseData);
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
      timeoutMs: NORMAL_WRITE_REQUEST_TIMEOUT_MS,
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
      timeoutMs: NORMAL_WRITE_REQUEST_TIMEOUT_MS,
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
  const response = await fetchWithTimeout(
    getAssignedBookingPatientsApiUrl(bookingId),
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      body: formData,
    },
    UPLOAD_REQUEST_TIMEOUT_MS,
  );

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
    timeoutMs: DETAIL_GET_REQUEST_TIMEOUT_MS,
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
      timeoutMs: NORMAL_WRITE_REQUEST_TIMEOUT_MS,
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
  const url = getAssignedBookingPatientApiUrl(bookingId, patientId);
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

  logAppointmentDetailDebug('[Edit Patient API Request]', {
    url,
    method: 'PUT',
    transport: 'multipart',
    bookingId,
    patientId,
    payload: {
      title: String(patient?.title || ''),
      full_name: String(patient?.full_name || ''),
      gender: String(patient?.gender || ''),
      date_of_birth: String(patient?.date_of_birth || ''),
      age_years: String(patient?.age_years || ''),
      primary_mobile: String(patient?.primary_mobile || patient?.contact_mobile || ''),
      contact_mobile: String(patient?.contact_mobile || patient?.primary_mobile || ''),
      alternate_mobile: String(patient?.alternate_mobile || ''),
      email: String(patient?.email || ''),
      labmate_pid: String(patient?.labmate_pid || ''),
      panel_company: String(patient?.panel_company || ''),
      card_no: String(patient?.card_no || ''),
      tag: String(patient?.tag || ''),
    },
    patientDocumentCount: documents.filter(document => Boolean(document?.uri)).length,
  });

  // SecureApiModule currently accepts string bodies only, so multipart upload
  // must use native fetch for this endpoint.
  const response = await fetchWithTimeout(
    url,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      body: formData,
    },
    UPLOAD_REQUEST_TIMEOUT_MS,
  );

  const responseData = await parseJsonResponse(response, '[Update Patient]');
  logAppointmentDetailDebug('[Edit Patient API HTTP Status]', {
    status: response.status,
    ok: response.ok,
  });
  logAppointmentDetailDebug('[Edit Patient API Response]', responseData);
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
  catalogLevel = 'full',
  gcode = '',
  scode = '',
  query = '',
  patientGender = '',
}) => {
  if (catalogLevel === 'groups') {
    const localResponseData =
      await getLocalPanelCatalogGroupsByCompanyResponse(panelCompany || {compCatId});

    if (localResponseData?.ok && Array.isArray(localResponseData?.groups)) {
      return localResponseData;
    }
  }

  if (catalogLevel === 'subgroups') {
    const localResponseData =
      await getLocalPanelCatalogSubgroupsByCompanyResponse({
        panelCompany: panelCompany || {compCatId},
        gcode,
      });

    if (localResponseData?.ok && Array.isArray(localResponseData?.subgroups)) {
      return localResponseData;
    }
  }

  if (catalogLevel === 'tests') {
    const localResponseData =
      await getLocalPanelCatalogTestsByCompanyResponse({
        panelCompany: panelCompany || {compCatId},
        gcode,
        scode,
        patientGender,
      });

    if (localResponseData?.ok && Array.isArray(localResponseData?.tests)) {
      return localResponseData;
    }
  }

  if (catalogLevel === 'search') {
    const localResponseData =
      await searchLocalPanelCatalogTestsByCompanyResponse({
        panelCompany: panelCompany || {compCatId},
        query,
        limit: 80,
        patientGender,
      });

    if (localResponseData?.ok && Array.isArray(localResponseData?.tests)) {
      return localResponseData;
    }

    return {ok: false, tests: []};
  }

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
