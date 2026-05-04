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

export const getDatabasePanelCatalogByCompanyResponse = async compCatId => {
  if (!isCatalogDatabaseAvailable()) {
    return null;
  }

  return parseNativeJson(
    await CatalogDatabaseModule.getPanelCatalogByCompany(
      compCatId === null || compCatId === undefined ? '' : String(compCatId),
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
