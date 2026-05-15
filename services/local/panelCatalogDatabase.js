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

export const getDatabaseBookingTestPricesResponse = async requests => {
  if (
    !isCatalogDatabaseAvailable() ||
    !CatalogDatabaseModule.getBookingTestPrices
  ) {
    return null;
  }

  return parseNativeJson(
    await CatalogDatabaseModule.getBookingTestPrices(
      JSON.stringify(Array.isArray(requests) ? requests : []),
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

export const getDatabaseAddressCitiesResponse = async () => {
  if (!isCatalogDatabaseAvailable() || !CatalogDatabaseModule.getAddressCities) {
    if (__DEV__) {
      console.log('[Address City Lookup Unavailable]', {
        hasCatalogDatabaseModule: Boolean(CatalogDatabaseModule),
        hasGetAddressCities: Boolean(CatalogDatabaseModule?.getAddressCities),
      });
    }
    return null;
  }

  return parseNativeJson(await CatalogDatabaseModule.getAddressCities());
};

export const getDatabaseAddressColoniesByCityResponse = async city => {
  if (
    !isCatalogDatabaseAvailable() ||
    !CatalogDatabaseModule.getAddressColoniesByCity
  ) {
    if (__DEV__) {
      console.log('[Address Colony Lookup Unavailable]', {
        hasCatalogDatabaseModule: Boolean(CatalogDatabaseModule),
        hasGetAddressColoniesByCity: Boolean(
          CatalogDatabaseModule?.getAddressColoniesByCity,
        ),
      });
    }
    return null;
  }

  return parseNativeJson(
    await CatalogDatabaseModule.getAddressColoniesByCity(String(city || '')),
  );
};

export const getDatabaseAddressRoutesByPincodeResponse = async pincode => {
  if (
    !isCatalogDatabaseAvailable() ||
    !CatalogDatabaseModule.getAddressRoutesByPincode
  ) {
    if (__DEV__) {
      console.log('[Address Route Lookup Unavailable]', {
        hasCatalogDatabaseModule: Boolean(CatalogDatabaseModule),
        hasGetAddressRoutesByPincode: Boolean(
          CatalogDatabaseModule?.getAddressRoutesByPincode,
        ),
      });
    }
    return null;
  }

  return parseNativeJson(
    await CatalogDatabaseModule.getAddressRoutesByPincode(String(pincode || '')),
  );
};
