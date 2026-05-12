import {logDebug, warnDebug} from '../app/logger';

export const getAddressFromCoords = async (latitude, longitude) => {
  const apiKey = 'pk.34c15fb687fb4687a184493f2e00382d';
  const url = `https://us1.locationiq.com/v1/reverse?key=${apiKey}&lat=${latitude}&lon=${longitude}&format=json`;

  try {
    logDebug('[LocationIQ] Reverse geocode request', {
      latitude,
      longitude,
      apiKeyPrefix: apiKey.slice(0, 6),
    });

    const response = await fetch(url);
    logDebug('[LocationIQ] Reverse geocode response status', {
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
    });

    const data = await response.json();
    logDebug('[LocationIQ] Reverse geocode response summary', {
      hasAddress: Boolean(data?.address),
      displayName: data?.display_name || '',
      error: data?.error || '',
    });

    if (data && data.address) {
      const {
        city,
        county,
        state_district,
        state,
        postcode,
        country,
      } = data.address;

      const displayName = data.display_name;
      const fullAddress = [
        city,
        county,
        state_district,
        state,
        postcode,
        country,
      ]
        .filter(Boolean)
        .join(', ');

      return {
        fullAddress,
        rawAddress: data.address,
        displayName,
        boundingBox: data.boundingbox,
      };
    }

    warnDebug('[LocationIQ] No address returned', data);
    return null;
  } catch (error) {
    warnDebug('[LocationIQ] Error fetching address:', error);
    return null;
  }
};
