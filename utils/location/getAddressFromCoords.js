import {warnDebug} from '../app/logger';

export const getAddressFromCoords = async (latitude, longitude) => {
  const apiKey = 'pk.54f77c8c6ff4060cdbf5bacd5838270b';
  const url = `https://us1.locationiq.com/v1/reverse?key=${apiKey}&lat=${latitude}&lon=${longitude}&format=json`;

  try {
    const response = await fetch(url);
    const data = await response.json();

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

    warnDebug('No address returned from LocationIQ');
    return null;
  } catch (error) {
    warnDebug('Error fetching LocationIQ address:', error);
    return null;
  }
};
