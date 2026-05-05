import {NativeModules, Platform} from 'react-native';

const {CatalogDatabaseModule} = NativeModules;

const parseNativeJson = payload => {
  if (!payload) {
    return null;
  }

  if (typeof payload !== 'string') {
    return payload;
  }

  try {
    return JSON.parse(payload);
  } catch (error) {
    return null;
  }
};

export const isCatalogDatabaseAvailable = () =>
  Platform.OS === 'android' && Boolean(CatalogDatabaseModule);

export const getDatabasePanelCompaniesResponse = async () => {
  if (!isCatalogDatabaseAvailable()) {
    return null;
  }

  return parseNativeJson(await CatalogDatabaseModule.getPanelCompanies());
};

export const getDatabaseMatchedPanelCompaniesForPatientResponse = async patient => {
  if (!isCatalogDatabaseAvailable()) {
    return null;
  }

  return parseNativeJson(
    await CatalogDatabaseModule.getMatchedPanelCompaniesForPatient(
      JSON.stringify(patient || {}),
    ),
  );
};

export const getDatabasePanelCatalogByCompanyResponse = async panelCompany => {
  if (!isCatalogDatabaseAvailable()) {
    return null;
  }

  if (
    panelCompany &&
    typeof panelCompany === 'object' &&
    CatalogDatabaseModule.getPanelCatalogByCompanyIdentity
  ) {
    return parseNativeJson(
      await CatalogDatabaseModule.getPanelCatalogByCompanyIdentity(
        JSON.stringify(panelCompany),
      ),
    );
  }

  const fallbackCompCatId =
    panelCompany && typeof panelCompany === 'object'
      ? panelCompany.compCatId || panelCompany.CompCatID || ''
      : panelCompany;

  return parseNativeJson(
    await CatalogDatabaseModule.getPanelCatalogByCompany(
      fallbackCompCatId === null || fallbackCompCatId === undefined
        ? ''
        : String(fallbackCompCatId),
    ),
  );
};

export const getDatabaseSpecimenNameForTestCode = testCode => {
  if (!isCatalogDatabaseAvailable()) {
    return '';
  }

  const normalizedTestCode = String(testCode || '').trim();
  if (!normalizedTestCode) {
    return '';
  }

  return (
    CatalogDatabaseModule.getSpecimenNameForTestCodeSync?.(normalizedTestCode) ||
    ''
  );
};
