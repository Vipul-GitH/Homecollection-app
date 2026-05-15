import AsyncStorage from '@react-native-async-storage/async-storage';

const LAST_KNOWN_GEO_CAPTURE_KEY = '@homecollection:lastKnownGeoCapture';

const toStableValue = value =>
  value === null || value === undefined ? '' : String(value).trim();

const toCoordinateNumber = value => {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : null;
};

export const getLastKnownGeoCapture = async () => {
  const serializedValue = await AsyncStorage.getItem(LAST_KNOWN_GEO_CAPTURE_KEY);

  if (!serializedValue) {
    return null;
  }

  try {
    const parsedValue = JSON.parse(serializedValue);
    const latitude = toCoordinateNumber(parsedValue?.latitude);
    const longitude = toCoordinateNumber(parsedValue?.longitude);
    const addressText = toStableValue(parsedValue?.addressText);
    const capturedAt = toStableValue(parsedValue?.capturedAt);

    if (latitude === null || longitude === null) {
      return null;
    }

    return {
      latitude,
      longitude,
      addressText,
      capturedAt,
    };
  } catch {
    return null;
  }
};

export const persistLastKnownGeoCapture = async ({
  latitude,
  longitude,
  addressText = '',
  capturedAt = new Date().toISOString(),
}) => {
  const nextValue = {
    latitude: toCoordinateNumber(latitude),
    longitude: toCoordinateNumber(longitude),
    addressText: toStableValue(addressText),
    capturedAt: toStableValue(capturedAt) || new Date().toISOString(),
  };

  if (nextValue.latitude === null || nextValue.longitude === null) {
    return;
  }

  await AsyncStorage.setItem(
    LAST_KNOWN_GEO_CAPTURE_KEY,
    JSON.stringify(nextValue),
  );
};
