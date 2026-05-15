import {
  getDatabaseAddressCitiesResponse,
  getDatabaseAddressColoniesByCityResponse,
  getDatabaseAddressRoutesByPincodeResponse,
} from './panelCatalogDatabase';

export const getLocalAddressCitiesResponse = async () =>
  getDatabaseAddressCitiesResponse();

export const getLocalAddressColoniesByCityResponse = async city =>
  getDatabaseAddressColoniesByCityResponse(city);

export const getLocalAddressRoutesByPincodeResponse = async pincode =>
  getDatabaseAddressRoutesByPincodeResponse(pincode);
