import {
  getDatabasePanelCatalogByCompanyResponse,
  getDatabaseBookingTestPricesResponse,
  getDatabaseMatchedPanelCompaniesForPatientResponse,
  getDatabasePanelCompaniesResponse,
} from './panelCatalogDatabase';

export const getLocalPanelCompaniesResponse = async () =>
  getDatabasePanelCompaniesResponse();

export const getLocalMatchedPanelCompaniesResponse = async patient =>
  getDatabaseMatchedPanelCompaniesForPatientResponse(patient);

export const getLocalPanelCatalogByCompanyResponse = async panelCompany =>
  getDatabasePanelCatalogByCompanyResponse(panelCompany);

export const getLocalBookingTestPricesResponse = async requests =>
  getDatabaseBookingTestPricesResponse(requests);
