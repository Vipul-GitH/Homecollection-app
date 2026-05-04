import {
  getDatabasePanelCatalogByCompanyResponse,
  getDatabasePanelCompaniesResponse,
} from './panelCatalogDatabase';

export const getLocalPanelCompaniesResponse = async () =>
  getDatabasePanelCompaniesResponse();

export const getLocalPanelCatalogByCompanyResponse = async compCatId =>
  getDatabasePanelCatalogByCompanyResponse(compCatId);
