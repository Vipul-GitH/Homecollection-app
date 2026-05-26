import {LOGIN_API_URL} from '../../constants/config/api';
import {secureFetch} from './secureFetch';
import {extractAccessToken} from '../../utils/bookings/bookingTransforms';
import {
  APP_VERSION_CODE,
  APP_VERSION_NAME,
} from '../../constants/config/appVersion';

const logAuthDebug = () => {};
const LOGIN_REQUEST_TIMEOUT_MS = 15000;

const buildDiagnosticTargetUrls = () => {
  try {
    const loginUrl = new URL(LOGIN_API_URL);

    return {
      originUrl: `${loginUrl.protocol}//${loginUrl.host}`,
      loginUrl: LOGIN_API_URL,
    };
  } catch (error) {
    return {
      originUrl: '',
      loginUrl: LOGIN_API_URL,
    };
  }
};

const runConnectivityProbe = async ({label, url, method = 'GET'}) => {
  if (!url) {
    return null;
  }

  try {
    const response = await secureFetch(url, {
      method,
      timeoutMs: LOGIN_REQUEST_TIMEOUT_MS,
    });

    const probeResult = {
      label,
      url,
      method,
      reachable: true,
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
    };

    return probeResult;
  } catch (error) {
    const probeResult = {
      label,
      url,
      method,
      reachable: false,
      name: error?.name,
      message: error?.message,
      causeMessage: error?.cause?.message || null,
    };

    return probeResult;
  }
};

export const diagnoseLoginConnectivity = async () => {
  const {originUrl, loginUrl} = buildDiagnosticTargetUrls();
  const diagnosticResults = [];

  const originProbe = await runConnectivityProbe({
    label: 'origin',
    url: originUrl,
    method: 'GET',
  });

  if (originProbe) {
    diagnosticResults.push(originProbe);
  }

  const loginHeadProbe = await runConnectivityProbe({
    label: 'login-endpoint-head',
    url: loginUrl,
    method: 'HEAD',
  });

  if (loginHeadProbe) {
    diagnosticResults.push(loginHeadProbe);
  }

  const loginGetProbe = await runConnectivityProbe({
    label: 'login-endpoint-get',
    url: loginUrl,
    method: 'GET',
  });

  if (loginGetProbe) {
    diagnosticResults.push(loginGetProbe);
  }

  return diagnosticResults;
};

const parseLoginResponse = async response => {
  try {
    const responseData = await response.json();
    logAuthDebug(
      '[Login] API response',
      JSON.stringify(maskLoginResponseSecrets(responseData), null, 2),
    );
    return responseData;
  } catch (parseError) {
    logAuthDebug('[Login] API response is not valid JSON');
    return null;
  }
};

const maskTokenValue = value => {
  if (typeof value !== 'string' || !value.trim()) {
    return value;
  }

  const trimmedValue = value.trim();

  if (trimmedValue.length <= 12) {
    return '***';
  }

  return `${trimmedValue.slice(0, 6)}...${trimmedValue.slice(-4)}`;
};

const maskLoginResponseSecrets = value => {
  if (Array.isArray(value)) {
    return value.map(maskLoginResponseSecrets);
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, entryValue]) => {
      const normalizedKey = key.toLowerCase();
      const shouldMask =
        normalizedKey.includes('token') ||
        normalizedKey.includes('jwt') ||
        normalizedKey.includes('secret');

      return [
        key,
        shouldMask
          ? maskTokenValue(entryValue)
          : maskLoginResponseSecrets(entryValue),
      ];
    }),
  );
};

export const loginUserApi = async ({username, password}) => {
  try {
    const response = await secureFetch(LOGIN_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        username,
        password,
        app_version_code: APP_VERSION_CODE,
        app_version_name: APP_VERSION_NAME,
        platform: 'android',
      }),
      timeoutMs: LOGIN_REQUEST_TIMEOUT_MS,
    });

    const responseData = await parseLoginResponse(response);
    const bodyIndicatesFailure =
      responseData?.ok === false ||
      responseData?.success === false ||
      Boolean(responseData?.error);

    if (!response.ok || bodyIndicatesFailure) {
      const loginError = new Error(
        responseData?.message ||
          responseData?.error ||
          `Login failed with status ${response.status}.`,
      );

      loginError.name = 'LoginApiError';
      loginError.status = response.status;
      loginError.statusText = response.statusText;
      loginError.responseBody = responseData;
      throw loginError;
    }

    const displayName =
      responseData?.data?.user?.username ||
      responseData?.data?.user?.name ||
      responseData?.data?.username ||
      responseData?.data?.name ||
      responseData?.user?.username ||
      responseData?.user?.name ||
      responseData?.username ||
      username;
    const accessToken = extractAccessToken(responseData);

    return {
      displayName,
      accessToken,
    };
  } catch (error) {
    throw error;
  }
};
