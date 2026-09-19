import {
  CAMP_PATIENTS_API_URL,
  getCampPatientsByCampApiUrl,
} from '../../constants/config/api';
import {secureFetch} from './secureFetch';

const parseResponse = async response => {
  const bodyText = await response.text();
  if (!bodyText) {
    return {bodyText: '', data: null};
  }

  try {
    return {bodyText, data: JSON.parse(bodyText)};
  } catch {
    return {bodyText, data: {detail: bodyText}};
  }
};

const executeCampRequest = async ({url, method, accessToken, payload}) => {
  const response = await secureFetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
      ...(payload ? {'Content-Type': 'application/json'} : {}),
    },
    ...(payload ? {body: JSON.stringify(payload)} : {}),
    timeoutMs: method === 'GET' ? 15000 : 20000,
  });

  const {data} = await parseResponse(response);

  return {response, responseData: data};
};

const getErrorMessage = (response, responseData, fallbackMessage) => {
  if (response.ok) {
    return '';
  }

  return String(
    responseData?.detail ||
      responseData?.message ||
      responseData?.error ||
      `${fallbackMessage} (HTTP ${response.status}).`,
  );
};

export const addCampPatientApi = async ({accessToken, patient}) => {
  if (!accessToken) {
    const missingTokenError = new Error('Login session is required.');
    missingTokenError.status = 401;
    throw missingTokenError;
  }

  const payload = {
    camp_id: String(patient.campId),
    patient_name: String(patient.name),
    age: Number(patient.age),
    dob: String(patient.dob),
    gender: String(patient.gender),
    ...(patient.mobile ? {mobile_no: String(patient.mobile)} : {}),
    sample_type: String(patient.sampleType),
  };
  const {response, responseData} = await executeCampRequest({
    url: CAMP_PATIENTS_API_URL,
    method: 'POST',
    accessToken,
    payload,
  });
  const errorMessage = getErrorMessage(
    response,
    responseData,
    'Unable to add patient',
  );

  if (errorMessage) {
    const apiError = new Error(errorMessage);
    apiError.status = response.status;
    apiError.responseData = responseData;
    throw apiError;
  }

  return responseData;
};

export const fetchCampPatientsApi = async ({accessToken, campId}) => {
  if (!accessToken) {
    const missingTokenError = new Error('Login session is required.');
    missingTokenError.status = 401;
    throw missingTokenError;
  }

  const url = getCampPatientsByCampApiUrl(campId);
  const {response, responseData} = await executeCampRequest({
    url,
    method: 'GET',
    accessToken,
  });
  const errorMessage = getErrorMessage(
    response,
    responseData,
    'Unable to fetch camp patients',
  );

  if (errorMessage) {
    const apiError = new Error(errorMessage);
    apiError.status = response.status;
    apiError.responseData = responseData;
    throw apiError;
  }

  return responseData;
};
