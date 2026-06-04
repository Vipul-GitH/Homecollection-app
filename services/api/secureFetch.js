import {NativeModules, Platform} from 'react-native';
import {API_BASE_URL} from '../../constants/config/api';

const shouldUseSecureAndroidClient = url =>
  Platform.OS === 'android' &&
  typeof url === 'string' &&
  url.startsWith(API_BASE_URL) &&
  Boolean(NativeModules.SecureApiModule);

const buildSecureResponse = nativeResult => ({
  ok: nativeResult.status >= 200 && nativeResult.status < 300,
  status: nativeResult.status,
  statusText: nativeResult.statusText || '',
  url: nativeResult.url,
  text: async () => nativeResult.bodyText || '',
  json: async () => {
    const bodyText = nativeResult.bodyText || '';

    if (!bodyText) {
      return null;
    }

    return JSON.parse(bodyText);
  },
});

const resolveSecureTimeout = customTimeoutMs =>
  Number.isFinite(customTimeoutMs) && customTimeoutMs > 0
    ? Math.trunc(customTimeoutMs)
    : 30000;

export const secureFetch = async (url, options = {}) => {
  const {timeoutMs: customTimeoutMs, ...fetchOptions} = options;

  if (!shouldUseSecureAndroidClient(url)) {
    return fetch(url, fetchOptions);
  }

  const timeoutMs = resolveSecureTimeout(customTimeoutMs);

  let nativeResult;

  try {
    nativeResult = await NativeModules.SecureApiModule.request(
      url,
      fetchOptions.method || 'GET',
      JSON.stringify(fetchOptions.headers || {}),
      fetchOptions.body || null,
      timeoutMs,
    );
  } catch (error) {
    const errorMessage =
      typeof error?.message === 'string' ? error.message : '';
    const expectsFourArgs =
      errorMessage.includes('expected argument count: 4') ||
      errorMessage.includes('called with 5 arguments');

    if (!expectsFourArgs) {
      throw error;
    }

    nativeResult = await NativeModules.SecureApiModule.request(
      url,
      fetchOptions.method || 'GET',
      JSON.stringify(fetchOptions.headers || {}),
      fetchOptions.body || null,
    );
  }

  return buildSecureResponse(nativeResult);
};

export const secureMultipartFetch = async ({
  url,
  method = 'POST',
  headers = {},
  fields = {},
  files = [],
  timeoutMs: customTimeoutMs,
}) => {
  if (
    !shouldUseSecureAndroidClient(url) ||
    !NativeModules.SecureApiModule?.multipartRequest
  ) {
    const formData = new FormData();
    Object.entries(fields || {}).forEach(([key, value]) => {
      formData.append(key, value);
    });
    (Array.isArray(files) ? files : []).forEach(file => {
      if (!file?.fieldName || !file?.uri) {
        return;
      }
      formData.append(file.fieldName, {
        uri: file.uri,
        name: file.name || `${file.fieldName}-${Date.now()}`,
        type: file.type || 'application/octet-stream',
      });
    });

    return fetch(url, {
      method,
      headers,
      body: formData,
    });
  }

  const nativeResult = await NativeModules.SecureApiModule.multipartRequest(
    url,
    method,
    JSON.stringify(headers || {}),
    JSON.stringify(fields || {}),
    JSON.stringify(Array.isArray(files) ? files : []),
    resolveSecureTimeout(customTimeoutMs),
  );

  return buildSecureResponse(nativeResult);
};
