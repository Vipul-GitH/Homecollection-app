import {LOGIN_API_URL} from '../../constants/config/api';
import {secureFetch} from './secureFetch';
import {extractAccessToken} from '../../utils/bookings/bookingTransforms';
import {logDebug} from '../../utils/app/logger';

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
    const response = await secureFetch(url, {method});

    const probeResult = {
      label,
      url,
      method,
      reachable: true,
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
    };

    logDebug('[Login Diagnostic] Probe result', probeResult);
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

    logDebug('[Login Diagnostic] Probe failure', probeResult);
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

  logDebug(
    '[Login Diagnostic] Summary',
    JSON.stringify(diagnosticResults, null, 2),
  );

  return diagnosticResults;
};

const parseLoginResponse = async response => {
  try {
    const responseData = await response.json();
    logDebug('[Login] Response body', JSON.stringify(responseData, null, 2));
    return responseData;
  } catch (parseError) {
    logDebug('[Login] Response body is not valid JSON');
    return null;
  }
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
      }),
    });

    logDebug('[Login] Response status', {
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      url: response.url,
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
    logDebug('[Login] Request failure details', {
      name: error?.name,
      message: error?.message,
      status: error?.status,
      statusText: error?.statusText,
      responseBody: error?.responseBody || null,
      causeMessage: error?.cause?.message || null,
    });
    throw error;
  }
};
