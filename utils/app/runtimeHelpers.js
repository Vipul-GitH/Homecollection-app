import {Platform} from 'react-native';

const EMULATOR_SIGNATURES = [
  'generic',
  'sdk',
  'emulator',
  'android sdk built for x86',
];

export const getStatusFromAction = action => {
  if (action === 'start') {
    return 'Started';
  }

  if (action === 'cancel') {
    return 'Cancelled';
  }

  if (action === 'stop') {
    return 'Assigned';
  }

  if (action === 'completed') {
    return 'Completed';
  }

  return 'Assigned';
};

export const getStatusCodeFromAction = action => {
  if (action === 'start') {
    return 2;
  }

  if (action === 'cancel') {
    return 4;
  }

  if (action === 'stop') {
    return 1;
  }

  if (action === 'completed') {
    return 3;
  }

  return 1;
};

export const isLikelyOfflineError = error => {
  const message = String(error?.message || '').toLowerCase();

  return (
    error?.name === 'TypeError' ||
    message.includes('network') ||
    message.includes('fetch') ||
    message.includes('internet') ||
    message.includes('offline') ||
    message.includes('timeout') ||
    message.includes('timed out') ||
    message.includes('unable to reach') ||
    message.includes('could not connect') ||
    message.includes('connectexception') ||
    message.includes('socketexception') ||
    message.includes('sockettimeoutexception') ||
    message.includes('network is unreachable') ||
    message.includes('not connected') ||
    message.includes('unable to resolve host') ||
    message.includes('no address associated with hostname') ||
    message.includes('failed to connect to') ||
    message.includes('software caused connection abort') ||
    message.includes('connection was aborted') ||
    message.includes('unknownhostexception') ||
    message.includes('dns')
  );
};

export const isAndroidEmulator = () => {
  if (Platform.OS !== 'android') {
    return false;
  }

  const platformConstants = Platform.constants || {};
  const deviceMarkers = [
    platformConstants.Fingerprint,
    platformConstants.Model,
    platformConstants.Brand,
    platformConstants.Manufacturer,
    platformConstants.Device,
    platformConstants.Product,
  ]
    .filter(Boolean)
    .map(value => String(value).toLowerCase());

  return deviceMarkers.some(marker =>
    EMULATOR_SIGNATURES.some(signature => marker.includes(signature)),
  );
};
