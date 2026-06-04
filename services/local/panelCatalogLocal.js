import {
  getDatabasePanelCatalogByCompanyResponse,
  getDatabasePanelCatalogGroupsByCompanyResponse,
  getDatabasePanelCatalogSubgroupsByCompanyResponse,
  getDatabasePanelCatalogTestsByCompanyResponse,
  searchDatabasePanelCatalogTestsByCompanyResponse,
  getDatabaseBookingTestPricesResponse,
  getDatabaseMatchedPanelCompaniesForPatientResponse,
  getDatabasePanelCompaniesByAtypeResponse,
  getDatabasePatientTagsResponse,
} from './panelCatalogDatabase';
import {
  bookingTestPriceCache,
  bookingTestPriceRequests,
  getBookingTestPriceCacheKey,
} from '../../utils/bookings/sampleTubeMappingCache';

export const getLocalPanelCompaniesResponse = async () =>
  getDatabasePanelCompaniesByAtypeResponse('C');

export const getLocalPanelCompaniesByAtypeResponse = async atype =>
  getDatabasePanelCompaniesByAtypeResponse(atype);

export const getLocalPatientTagsResponse = async () =>
  getDatabasePatientTagsResponse();

export const getLocalMatchedPanelCompaniesResponse = async patient =>
  getDatabaseMatchedPanelCompaniesForPatientResponse(patient);

export const getLocalPanelCatalogByCompanyResponse = async panelCompany =>
  getDatabasePanelCatalogByCompanyResponse(panelCompany);

export const getLocalPanelCatalogGroupsByCompanyResponse = async panelCompany =>
  getDatabasePanelCatalogGroupsByCompanyResponse(panelCompany);

export const getLocalPanelCatalogSubgroupsByCompanyResponse = async params =>
  getDatabasePanelCatalogSubgroupsByCompanyResponse(params);

export const getLocalPanelCatalogTestsByCompanyResponse = async params =>
  getDatabasePanelCatalogTestsByCompanyResponse(params);

export const searchLocalPanelCatalogTestsByCompanyResponse = async params =>
  searchDatabasePanelCatalogTestsByCompanyResponse(params);

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
