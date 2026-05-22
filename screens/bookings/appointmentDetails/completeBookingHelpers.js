import {getMimeTypeFromFileName, normalizeFormText} from './helpers';

export const DEFAULT_TEST_BOOKING_STATUS = 'none';
export const MANUAL_HC_SLIP_STATUS = 'manual_hc_slip';
export const EMPTY_UPLOAD_DOCUMENTS = [];

export const normalizeUploadDocument = (
  file,
  fileNamePrefix,
  index = 0,
  documentName = '',
) => {
  if (!file?.uri) {
    return null;
  }

  return {
    uri: file.uri,
    name: normalizeFormText(documentName) || file.name || `${fileNamePrefix}-${Date.now()}-${index}`,
    type: file.type || getMimeTypeFromFileName(file.name),
  };
};

export const normalizeUploadDocuments = (pickedFiles, fileNamePrefix, documentName = '') =>
  (Array.isArray(pickedFiles) ? pickedFiles : [])
    .map((file, index) =>
      normalizeUploadDocument(file, fileNamePrefix, index, documentName),
    )
    .filter(Boolean);

export const normalizeStoredUploadDocuments = (documents, fileNamePrefix) => {
  const normalizedDocuments = normalizeUploadDocuments(documents, fileNamePrefix);
  return normalizedDocuments.length ? normalizedDocuments : EMPTY_UPLOAD_DOCUMENTS;
};

export const isPatientTerminalForCompletion = patient => {
  const statusCode = Number(patient?.bookingPatientStatusCode || 0);
  return statusCode === 3 || statusCode === 4 || statusCode === 5;
};

export const isManualHcSlipSelected = value =>
  normalizeFormText(value) === MANUAL_HC_SLIP_STATUS;

export const getApiTestBookingStatusValue = value => {
  const normalizedValue = normalizeFormText(value);

  if (normalizedValue === MANUAL_HC_SLIP_STATUS) {
    return 'manual hcb slip';
  }

  return normalizedValue;
};

export const isTestBookingStatusMissing = value => {
  const normalizedValue = normalizeFormText(value).toLowerCase();

  return (
    !normalizedValue ||
    normalizedValue === DEFAULT_TEST_BOOKING_STATUS ||
    normalizedValue === 'n/a'
  );
};
