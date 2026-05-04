import {NativeModules, Platform} from 'react-native';

const LABMATE_HOST = 'https://labmate.bhasinpathlabs.com:2010';

const shouldUseSecureAndroidClient = url =>
  Platform.OS === 'android' &&
  typeof url === 'string' &&
  url.startsWith(LABMATE_HOST) &&
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

export const secureFetch = async (url, options = {}) => {
  const {timeoutMs: customTimeoutMs, ...fetchOptions} = options;

  if (!shouldUseSecureAndroidClient(url)) {
    return fetch(url, fetchOptions);
  }

  const timeoutMs =
    Number.isFinite(customTimeoutMs) && customTimeoutMs > 0
      ? Math.trunc(customTimeoutMs)
      : 20000;

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
