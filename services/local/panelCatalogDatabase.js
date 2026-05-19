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

export const getDatabasePanelCatalogGroupsByCompanyResponse = async panelCompany => {
  if (
    !isCatalogDatabaseAvailable() ||
    !CatalogDatabaseModule.getPanelCatalogGroupsByCompanyIdentity
  ) {
    return null;
  }

  return parseNativeJson(
    await CatalogDatabaseModule.getPanelCatalogGroupsByCompanyIdentity(
      JSON.stringify(panelCompany || {}),
    ),
  );
};

export const getDatabasePanelCatalogSubgroupsByCompanyResponse = async ({
  panelCompany,
  gcode,
}) => {
  if (
    !isCatalogDatabaseAvailable() ||
    !CatalogDatabaseModule.getPanelCatalogSubgroupsByCompanyIdentity
  ) {
    return null;
  }

  return parseNativeJson(
    await CatalogDatabaseModule.getPanelCatalogSubgroupsByCompanyIdentity(
      JSON.stringify(panelCompany || {}),
      String(gcode || ''),
    ),
  );
};

export const getDatabasePanelCatalogTestsByCompanyResponse = async ({
  panelCompany,
  gcode,
  scode,
}) => {
  if (
    !isCatalogDatabaseAvailable() ||
    !CatalogDatabaseModule.getPanelCatalogTestsByCompanyIdentity
  ) {
    return null;
  }

  return parseNativeJson(
    await CatalogDatabaseModule.getPanelCatalogTestsByCompanyIdentity(
      JSON.stringify(panelCompany || {}),
      String(gcode || ''),
      String(scode || ''),
    ),
  );
};

export const searchDatabasePanelCatalogTestsByCompanyResponse = async ({
  panelCompany,
  query,
  limit = 80,
}) => {
  if (
    !isCatalogDatabaseAvailable() ||
    !CatalogDatabaseModule.searchPanelCatalogTestsByCompanyIdentity
  ) {
    return null;
  }

  return parseNativeJson(
    await CatalogDatabaseModule.searchPanelCatalogTestsByCompanyIdentity(
      JSON.stringify(panelCompany || {}),
      String(query || ''),
      String(limit || 80),
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
    return null;
  }

  return parseNativeJson(await CatalogDatabaseModule.getAddressCities());
};

export const getDatabaseAddressColoniesByCityResponse = async city => {
  if (
    !isCatalogDatabaseAvailable() ||
    !CatalogDatabaseModule.getAddressColoniesByCity
  ) {
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
    return null;
  }

  return parseNativeJson(
    await CatalogDatabaseModule.getAddressRoutesByPincode(String(pincode || '')),
  );
};

export const getDatabasePatientTagsResponse = async () => {
  if (!isCatalogDatabaseAvailable() || !CatalogDatabaseModule.getPatientTags) {
    return null;
  }

  return parseNativeJson(await CatalogDatabaseModule.getPatientTags());
};

export const getDatabasePendingHandoverRowsResponse = async () => {
  if (
    !isCatalogDatabaseAvailable() ||
    !CatalogDatabaseModule.getPendingHandoverRows
  ) {
    return null;
  }

  return parseNativeJson(await CatalogDatabaseModule.getPendingHandoverRows());
};

export const upsertDatabasePendingHandoverRowsResponse = async rows => {
  if (
    !isCatalogDatabaseAvailable() ||
    !CatalogDatabaseModule.upsertPendingHandoverRows
  ) {
    return null;
  }

  return parseNativeJson(
    await CatalogDatabaseModule.upsertPendingHandoverRows(
      JSON.stringify(Array.isArray(rows) ? rows : []),
    ),
  );
};

export const deleteDatabasePendingHandoverRowsResponse = async rowKeys => {
  if (
    !isCatalogDatabaseAvailable() ||
    !CatalogDatabaseModule.deletePendingHandoverRows
  ) {
    return null;
  }

  return parseNativeJson(
    await CatalogDatabaseModule.deletePendingHandoverRows(
      JSON.stringify(Array.isArray(rowKeys) ? rowKeys : []),
    ),
  );
};
