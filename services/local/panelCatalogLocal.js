import {
  getDatabasePanelCatalogByCompanyResponse,
  getDatabaseBookingTestPricesResponse,
  getDatabaseMatchedPanelCompaniesForPatientResponse,
  getDatabasePanelCompaniesResponse,
} from './panelCatalogDatabase';
import {
  bookingTestPriceCache,
  bookingTestPriceRequests,
  getBookingTestPriceCacheKey,
} from '../../utils/bookings/sampleTubeMappingCache';

export const getLocalPanelCompaniesResponse = async () =>
  getDatabasePanelCompaniesResponse();

export const getLocalMatchedPanelCompaniesResponse = async patient =>
  getDatabaseMatchedPanelCompaniesForPatientResponse(patient);

export const getLocalPanelCatalogByCompanyResponse = async panelCompany =>
  getDatabasePanelCatalogByCompanyResponse(panelCompany);

export const getLocalBookingTestPricesResponse = async requests => {
  const normalizedRequests = Array.isArray(requests) ? requests : [];
  const cacheKey = getBookingTestPriceCacheKey(normalizedRequests);

  if (!cacheKey || cacheKey === '[]') {
    return getDatabaseBookingTestPricesResponse(normalizedRequests);
  }

  const cachedResponse = bookingTestPriceCache.get(cacheKey);
  if (cachedResponse) {
    return cachedResponse;
  }

  const existingRequest = bookingTestPriceRequests.get(cacheKey);
  if (existingRequest) {
    return existingRequest;
  }

  const nextRequest = getDatabaseBookingTestPricesResponse(normalizedRequests)
    .then(response => {
      if (response?.ok) {
        bookingTestPriceCache.set(cacheKey, response);
      }
      bookingTestPriceRequests.delete(cacheKey);
      return response;
    })
    .catch(error => {
      bookingTestPriceRequests.delete(cacheKey);
      throw error;
    });

  bookingTestPriceRequests.set(cacheKey, nextRequest);
  return nextRequest;
};
