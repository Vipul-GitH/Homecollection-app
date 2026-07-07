import {
  MY_ASSIGNED_BOOKINGS_API_URL,
  MY_ASSIGNED_BOOKINGS_HISTORY_API_URL,
  PANEL_TEST_CATALOG_API_URL,
  getAssignedBookingBatchHistoryApiUrl,
  getAssignedBookingBatchReadyApiUrl,
  getPanelCatalogByCompanyApiUrl,
  getAssignedBookingBatchSaveApiUrl,
  getAssignedBookingCancelApiUrl,
  getAssignedBookingDetailApiUrl,
  getAssignedBookingHistoryDetailApiUrl,
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
const COMPLETE_UPLOAD_MAX_FILES_PER_PATIENT = 6;
const COMPLETE_UPLOAD_MAX_FILE_SIZE_BYTES = 8 * 1024 * 1024;

const toStableApiValue = value =>
  value === null || value === undefined ? '' : String(value).trim();

const normalizeHistoryDetailTests = (tests, statusLabel) =>
  (Array.isArray(tests) ? tests : [])
    .map((test, index) => {
      const name = toStableApiValue(
        test?.test_name || test?.testName || test?.name || test?.label || test,
      );

      if (!name) {
        return null;
      }

      return {
        id: `${statusLabel || 'test'}-${index}`,
        name,
        test_name: name,
        testBookingStatus: statusLabel,
        test_booking_status: statusLabel,
      };
    })
    .filter(Boolean);

const getHistoryBookingStatusLabel = statusCode => {
  const normalizedStatusCode = Number(statusCode);

  if (normalizedStatusCode === 4) {
    return 'Cancelled';
  }
  if (normalizedStatusCode === 5) {
    return 'Partial Complete';
  }
  if (normalizedStatusCode === 3) {
    return 'Completed';
  }
  return 'Completed';
};

const buildCompletedHistoryDetailForNormalizer = (detail, fallbackBooking) => {
  const patients = (Array.isArray(detail?.patients) ? detail.patients : []).map(
    (patient, index) => {
      const completedTests = normalizeHistoryDetailTests(
        patient?.completed_tests || patient?.completedTests,
        'completed',
      );
      const cancelledTests = normalizeHistoryDetailTests(
        patient?.cancelled_tests || patient?.cancelledTests,
        'cancelled',
      );
      const patientName = toStableApiValue(
        patient?.patient_name || patient?.patientName || patient?.name,
      );

      return {
        id:
          toStableApiValue(
            patient?.booking_patient_id ||
              patient?.bookingPatientId ||
              patient?.patient_id ||
              patient?.patientId,
          ) || `completed-patient-${index}`,
        full_name: patientName,
        name: patientName,
        booking_patient_status:
          patient?.booking_patient_status ?? patient?.bookingPatientStatus,
        status_code:
          patient?.booking_patient_status ?? patient?.bookingPatientStatus,
        apk_tbs: patient?.apk_tbs,
        ref_by: patient?.ref_by || patient?.refBy || patient?.referred_by,
        referred_by: patient?.ref_by || patient?.referred_by || patient?.referredBy,
        report_delivery: patient?.report_delivery || patient?.reportDelivery,
        report_schedule: patient?.report_schedule || patient?.reportSchedule,
        booking_payment_mode:
          patient?.payment_mode || patient?.paymentMode || patient?.booking_payment_mode,
        payment_mode: patient?.payment_mode || patient?.paymentMode,
        booking_due_amount: patient?.payment_amount ?? patient?.paymentAmount,
        payment_amount: patient?.payment_amount ?? patient?.paymentAmount,
        booking_extra_amount: 0,
        tests: [...completedTests, ...cancelledTests],
        completedTests,
        completed_tests: completedTests,
        cancelledTests,
        cancelled_tests: cancelledTests,
      };
    },
  );
  const totalPaymentAmount = patients.reduce(
    (total, patient) => total + Number(patient.booking_due_amount || 0),
    0,
  );
  const firstPaymentMode =
    patients.map(patient => toStableApiValue(patient.payment_mode)).find(Boolean) ||
    '';
  const sourceType = toStableApiValue(
    detail?.source_type || detail?.sourceType || fallbackBooking?.sourceType,
  ).toUpperCase();
  const appointmentId = toStableApiValue(
    detail?.appointment_id ||
      detail?.appointmentId ||
      fallbackBooking?.appointmentId ||
      fallbackBooking?.appointment_id,
  );
  const bookingId =
    toStableApiValue(detail?.booking_id || detail?.bookingId) ||
    toStableApiValue(fallbackBooking?.id);
  const bookingStatus = detail?.booking_status ?? detail?.bookingStatus ?? 3;

  return {
    ...fallbackBooking,
    id: bookingId,
    booking_id: bookingId,
    source_type: sourceType || 'BOOKING',
    appointment_id: appointmentId,
    booking_status: bookingStatus,
    status: getHistoryBookingStatusLabel(bookingStatus),
    is_completed_history_detail: true,
    completed_history_fields: {
      source_type: detail?.source_type || detail?.sourceType || sourceType || 'BOOKING',
      booking_id: detail?.booking_id || detail?.bookingId || bookingId,
      appointment_id: detail?.appointment_id ?? detail?.appointmentId ?? appointmentId ?? null,
      booking_status: bookingStatus,
    },
    patient_count: patients.length || fallbackBooking?.patientCount || 0,
    patients,
    billing_summary: {
      amount_received: totalPaymentAmount,
      payment_mode: firstPaymentMode,
      total_amount: totalPaymentAmount,
    },
  };
};

const parseJsonResponse = async response => {
  try {
    const responseData = await response.json();
    return responseData;
  } catch (parseError) {
    return null;
  }
};

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

const validateCompleteBookingAttachments = fileParts => {
  const patientFileCountMap = fileParts.reduce((countMap, filePart) => {
    const patientId =
      toStableApiValue(filePart?.patientId) ||
      toStableApiValue(filePart?.fieldName).replace(
        /^(patient_documents_|payment_shot_)/,
        '',
      ) ||
      'booking';

    countMap[patientId] = (countMap[patientId] || 0) + 1;
    return countMap;
  }, {});
  const overLimitPatientEntry = Object.entries(patientFileCountMap).find(
    ([, fileCount]) => fileCount > COMPLETE_UPLOAD_MAX_FILES_PER_PATIENT,
  );

  if (overLimitPatientEntry) {
    const [patientId, fileCount] = overLimitPatientEntry;
    throw new Error(
      `You can upload up to ${COMPLETE_UPLOAD_MAX_FILES_PER_PATIENT} files per patient while completing a booking. Patient ${patientId} has ${fileCount} files.`,
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

const buildUploadDocumentPart = (fieldName, document, patientId = '') => {
  if (!isUploadableDocument(document)) {
    return null;
  }

  const uploadPart = {
    fieldName,
    uri: document.uri,
    name: document.name || `${fieldName}-${Date.now()}`,
    type: document.type || 'application/octet-stream',
    sizeBytes: Number(
      document?.fileSize ?? document?.size ?? document?.sizeBytes ?? 0,
    ),
    patientId,
  };

  if (document?.geoStampText) {
    uploadPart.geoStampText = document.geoStampText;
  }

  if (document?.isGeoTaggedPatientPhoto) {
    uploadPart.isGeoTaggedPatientPhoto = true;
  }

  return uploadPart;
};

const buildDocumentPartList = (fieldName, documents, patientId = '') =>
  (Array.isArray(documents) ? documents : [])
    .map(document => buildUploadDocumentPart(fieldName, document, patientId))
    .filter(Boolean);

const buildPatientDocumentParts = ({
  patientDocumentsMap,
  manualSlipDocumentsMap,
  patientCghsDocumentsMap,
}) => {
  const fileParts = [];

  Object.entries(manualSlipDocumentsMap || {}).forEach(([patientId, documents]) => {
    fileParts.push(
      ...buildDocumentPartList(
        `patient_documents_${patientId}`,
        documents,
        patientId,
      ),
    );
  });

  Object.entries(patientCghsDocumentsMap || {}).forEach(([patientId, sections]) => {
    fileParts.push(
      ...buildDocumentPartList(
        `patient_documents_${patientId}`,
        sections?.cghsCard,
        patientId,
      ),
    );
    fileParts.push(
      ...buildDocumentPartList(
        `patient_documents_${patientId}`,
        sections?.patientPhotos,
        patientId,
      ),
    );
  });

  Object.entries(patientDocumentsMap || {}).forEach(([patientId, documents]) => {
    fileParts.push(
      ...buildDocumentPartList(
        `patient_documents_${patientId}`,
        documents,
        patientId,
      ),
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
        patientId,
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
  const apiUrl = getAssignedBookingStatusApiUrl(bookingId);
  const hasUploadableAttachments = hasCompleteBookingAttachments({
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

    const responseData = await parseJsonResponse(response, '[Booking Status]');
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
  const responseData = await parseJsonResponse(response, '[Booking Status]');
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

const createApiError = (response, message, responseData = null) => {
  const error = new Error(message);
  error.status = response?.status;
  error.responseStatus = response?.status;
  error.responseData = responseData;
  return error;
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

export const fetchAssignedBookingHistoryDetailApi = async ({accessToken, booking}) => {
  const bookingId = booking?.id || booking?.bookingId || booking?.booking_id;
  const appointmentId = booking?.appointmentId || booking?.appointment_id;
  const sourceType = booking?.sourceType || booking?.source_type || 'BOOKING';
  const apiUrl = getAssignedBookingHistoryDetailApiUrl({
    bookingId,
    appointmentId,
    sourceType,
  });

  const response = await secureFetch(apiUrl, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
    timeoutMs: DETAIL_GET_REQUEST_TIMEOUT_MS,
  });

  const responseData = await parseJsonResponse(response, '[Completed Booking Detail]');
  const errorMessage = getApiErrorMessage(
    response,
    responseData,
    'Unable to load completed booking details at the moment.',
  );

  if (errorMessage) {
    throw new Error(errorMessage);
  }

  const completedDetail =
    responseData?.data || responseData?.booking || responseData?.result || responseData;
  return normalizeAssignedBookingDetail(
    buildCompletedHistoryDetailForNormalizer(completedDetail, booking),
    booking,
  );
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
      throw error;
    }
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
      errorMessage = getApiErrorMessage(
        response,
        responseData,
        'Unable to update booking status right now.',
      );
    }

    if (errorMessage) {
      throw createApiError(response, errorMessage, responseData);
    }
    return responseData;
  }

  if (payload.action === 'cancel' || payload.action === 'cancelled') {
    let cancelRouteId = bookingId;

    if (normalizedSourceType === 'APPOINTMENT' && normalizedAppointmentId) {
      const numericAppointmentId = Number(normalizedAppointmentId);
      payload.appointment_id = Number.isFinite(numericAppointmentId)
        ? numericAppointmentId
        : normalizedAppointmentId;
    }
    const cancelPayload = buildAssignedBookingCancelPayload(payload);
    const cancelApiUrl = getAssignedBookingCancelApiUrl(cancelRouteId);

    let response;
    let responseData;
    let errorMessage = '';

    try {
      response = await secureFetch(cancelApiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(cancelPayload),
        timeoutMs: NORMAL_WRITE_REQUEST_TIMEOUT_MS,
      });

      responseData = await parseJsonResponse(response, '[Cancel Booking]');
      errorMessage = getApiErrorMessage(
        response,
        responseData,
        'Unable to cancel booking right now.',
      );
    } catch (error) {
      throw error;
    }

    if (errorMessage) {
      throw createApiError(response, errorMessage, responseData);
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
    throw createApiError(response, errorMessage, responseData);
  }

  return responseData;
};

export const saveAssignedBookingHandoverBatchApi = async ({
  accessToken,
  payload,
}) => {
  const url = getAssignedBookingBatchSaveApiUrl();

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

const extractHandoverReadyItems = responseData => {
  const sourceItems =
    responseData?.items ||
    responseData?.data?.items ||
    responseData?.data?.bookings ||
    responseData?.data?.ready ||
    responseData?.data?.pending ||
    responseData?.data?.ready_items ||
    responseData?.data?.readyItems ||
    responseData?.data ||
    responseData?.results ||
    responseData?.bookings ||
    responseData?.ready ||
    responseData?.pending ||
    responseData?.ready_items ||
    responseData?.readyItems ||
    responseData;

  return Array.isArray(sourceItems) ? sourceItems : [];
};

export const fetchAssignedBookingHandoverReadyApi = async ({accessToken}) => {
  const url = getAssignedBookingBatchReadyApiUrl();

  const response = await secureFetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
    timeoutMs: HANDOVER_HISTORY_REQUEST_TIMEOUT_MS,
  });

  const responseData = await parseJsonResponse(response, '[Handover Batch Ready]');
  const errorMessage = getApiErrorMessage(
    response,
    responseData,
    'Unable to load pending handover right now.',
  );

  if (errorMessage) {
    throw new Error(errorMessage);
  }

  const readyItems = extractHandoverReadyItems(responseData);
  return readyItems;
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
  const errorMessage = getApiErrorMessage(
    response,
    responseData,
    'Unable to load handover history right now.',
  );

  if (errorMessage) {
    throw new Error(errorMessage);
  }

  const historyItems = normalizeHandoverHistoryItems(responseData);
  return historyItems;
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
        ...(patient?.referred_by
          ? {referred_by: String(patient.referred_by)}
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

  const fields = {
    title: String(patient?.title || ''),
    full_name: String(patient?.full_name || ''),
    gender: String(patient?.gender || ''),
    date_of_birth: String(patient?.date_of_birth || ''),
    age_years: String(patient?.age_years || ''),
    contact_mobile: String(
      patient?.contact_mobile || patient?.primary_mobile || '',
    ),
    alternate_mobile: String(patient?.alternate_mobile || ''),
    email: String(patient?.email || ''),
    labmate_pid: String(patient?.labmate_pid || ''),
    panel_company: String(patient?.panel_company || ''),
    referred_by: String(patient?.referred_by || ''),
    card_no: String(patient?.card_no || ''),
    tag: String(patient?.tag || ''),
  };
  const files = documents
    .filter(document => Boolean(document?.uri))
    .map(document => ({
      fieldName: 'patient_documents',
      uri: document.uri,
      name: document.name || `patient-document-${Date.now()}`,
      type: document.type || 'application/octet-stream',
    }));

  const response = await secureMultipartFetch({
    url: getAssignedBookingPatientsApiUrl(bookingId),
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    fields,
    files,
    timeoutMs: UPLOAD_REQUEST_TIMEOUT_MS,
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
  appointmentId,
  sourceType,
  addressPayload,
}) => {
  const normalizedSourceType = String(sourceType || '')
    .trim()
    .toUpperCase();
  const normalizedAppointmentId = String(appointmentId || '').trim();
  const addressRouteId =
    normalizedSourceType === 'APPOINTMENT' && normalizedAppointmentId
      ? normalizedAppointmentId
      : bookingId;
  const addressUrl = getAssignedBookingAddressApiUrl(addressRouteId);
  const payload = addressPayload || {};

  const response = await secureFetch(addressUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(payload),
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
  const url = getAssignedBookingPatientCancelApiUrl(bookingId, bookingPatientId);

  let response;
  let responseData;
  let errorMessage = '';

  try {
    response = await secureFetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(cancelPayload || {}),
      timeoutMs: NORMAL_WRITE_REQUEST_TIMEOUT_MS,
    });

    responseData = await parseJsonResponse(response, '[Cancel Patient]');
    errorMessage = getApiErrorMessage(
      response,
      responseData,
      'Unable to cancel patient right now.',
    );
  } catch (error) {
    throw error;
  }

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
  const fields = {
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
    referred_by: String(patient?.referred_by || ''),
    card_no: String(patient?.card_no || ''),
    tag: String(patient?.tag || ''),
  };

  const documents = Array.isArray(patient?.patient_documents)
    ? patient.patient_documents
    : [];

  if (!documents.length) {
    const response = await secureFetch(url, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(fields),
      timeoutMs: NORMAL_WRITE_REQUEST_TIMEOUT_MS,
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
  }

  const files = documents
    .filter(document => Boolean(document?.uri))
    .map(document => ({
      fieldName: 'patient_documents',
      uri: document.uri,
      name: document.name || `patient-document-${Date.now()}`,
      type: document.type || 'application/octet-stream',
    }));

  try {
    const response = await secureMultipartFetch({
      url,
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      fields,
      files,
      timeoutMs: UPLOAD_REQUEST_TIMEOUT_MS,
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
  } catch (error) {
    throw error;
  }
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
