import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {useWindowDimensions} from 'react-native';
import {bottomTabs} from '../constants/navigation/tabs';
import {
  getPatientMutationId,
} from '../screens/bookings/appointmentDetails/helpers';
import {
  getLocalBookingTestPricesResponse,
  getLocalMatchedPanelCompaniesResponse,
} from '../services/local/panelCatalogLocal';
import {getSpecimenNameForTestCode} from '../services/local/panelCatalogSpecimenLookup';
import {
  clearAppointmentDetailDraft,
  clearOfflineBookingStorage,
  getPendingOfflineActionCount,
  getCachedAppointmentDetailDrafts,
  persistAppointmentDetailDrafts,
  queuePendingLocalAction,
} from '../services/storage/offlineBookingStorage';
import {useAssignedBookings} from './useAssignedBookings';
import {useLocationGate} from './useLocationGate';
import {useSessionAuth} from './useSessionAuth';

const toStableValue = value =>
  value === null || value === undefined ? '' : String(value).trim();

const toCurrencyNumber = value => {
  const numericValue = Number(String(value || '').replace(/[^0-9.]/g, ''));
  return Number.isFinite(numericValue) ? numericValue : 0;
};

const getTestStandardDiscountPercent = test =>
  toCurrencyNumber(
    test?.percentageonstandard ||
      test?.percentageOnStandard ||
      test?.percentage_on_standard ||
      test?.PercentageOnStandard ||
      test?.percentagestandard ||
      test?.percentageStandard ||
      test?.percentage_standard ||
      test?.PercentageStandard,
  );

const getDiscountedTestPrice = test => {
  const mrp = toCurrencyNumber(test?.mrp || test?.MRP || test?.amount);
  const charge = toCurrencyNumber(test?.charge || test?.Charge);
  const baseMrp = mrp || charge;
  const discountPercent = Math.min(
    100,
    Math.max(0, getTestStandardDiscountPercent(test)),
  );
  if (discountPercent > 0 && baseMrp > 0) {
    return Math.max(0, baseMrp - (baseMrp * discountPercent) / 100);
  }
  return charge || baseMrp;
};

const getAppointmentDetailDraftKey = booking =>
  toStableValue(
    booking?.id ||
      booking?.bookingId ||
      booking?.booking_id ||
      booking?.appointmentId ||
      booking?.appointment_id,
  );

const getTestDedupeKey = test =>
  toStableValue(
    test?.dedupe_key ||
      test?.booked_code ||
      test?.testcode1 ||
      test?.test_code ||
      test?.code,
  ).toUpperCase();

const buildTestSelectionKey = (panelCompany, test, childTest = null) =>
  [
    toStableValue(panelCompany?.compCatId) || 'na',
    childTest ? 'child' : 'test',
    getTestDedupeKey(childTest || test),
    childTest?.catalog_key || test?.catalog_key || '',
    childTest?.booked_code || test?.booked_code || 'na',
    childTest?.description || test?.description || 'na',
  ].join('|');

const parseCatalogKey = catalogKey => {
  const [compCatId = '', gcode = '', scode = '', bookedCode = ''] =
    toStableValue(catalogKey).split('|');
  return {compCatId, gcode, scode, bookedCode};
};

const splitCsvField = value =>
  toStableValue(value)
    .split(',')
    .map(item => item.trim());

const buildApiPanelCompaniesFromPatient = patient => {
  const compCatIds = splitCsvField(
    patient?.selectedCompCatIds || patient?.selected_comp_cat_ids,
  );
  const names = splitCsvField(
    patient?.selectedPanelCompanies || patient?.selected_panel_companies,
  );
  const chargeModes = splitCsvField(
    patient?.selectedChargeModes || patient?.selected_charge_modes,
  );

  return compCatIds
    .map((compCatId, index) => {
      if (!compCatId) {
        return null;
      }

      return {
        id: `api-${compCatId}-${index}`,
        name:
          names[index] ||
          toStableValue(patient?.panelCompany || patient?.panel_company) ||
          `Panel ${compCatId}`,
        compCatId,
        billingChargeMode: chargeModes[index] || '',
        chargeMode: chargeModes[index] || '',
      };
    })
    .filter(Boolean);
};

const findApiPanelCompanyForTest = (patient, test, fallbackPanelCompany = null) => {
  if (fallbackPanelCompany?.compCatId || fallbackPanelCompany?.name) {
    return fallbackPanelCompany;
  }

  const apiPanelCompanies = buildApiPanelCompaniesFromPatient(patient);
  if (!apiPanelCompanies.length) {
    return null;
  }

  const testCompCatId = toStableValue(
    test?.panelCompanyId || test?.compCatId || test?.comp_cat_id,
  );
  const testPanelName = toStableValue(
    test?.panelCompanyName || test?.panel_company || test?.panelCompany,
  ).toLowerCase();

  if (testCompCatId) {
    const compCatMatch = apiPanelCompanies.find(
      company => toStableValue(company?.compCatId) === testCompCatId,
    );

    if (compCatMatch) {
      return compCatMatch;
    }
  }

  if (testPanelName) {
    const nameMatch = apiPanelCompanies.find(
      company => toStableValue(company?.name).toLowerCase() === testPanelName,
    );

    if (nameMatch) {
      return nameMatch;
    }
  }

  return apiPanelCompanies[0] || null;
};

const getPrimaryApiPanelCompany = patient =>
  buildApiPanelCompaniesFromPatient(patient)[0] || null;

const buildSeededPatientTests = (patient, panelCompany = null) =>
  (Array.isArray(patient?.tests) ? patient.tests : []).map(test => {
    const resolvedPanelCompany = findApiPanelCompanyForTest(
      patient,
      test,
      panelCompany,
    );

    return {
      key: `seed|${test?.code || test?.booked_code || 'na'}|${
        test?.name || test?.test_name || 'na'
      }`,
      panelCompanyName:
        test?.panelCompanyName ||
        test?.panel_company ||
        test?.panelCompany ||
        resolvedPanelCompany?.name ||
        patient?.panelCompany ||
        'Current Panel',
      panelCompanySource: resolvedPanelCompany?.chipSource || 'API',
      panelCompanyChipId: resolvedPanelCompany?.chipId || resolvedPanelCompany?.id || '',
      cat_details: test?.cat_details || test?.catDetails || '',
      selected_charge_mode:
        test?.selected_charge_mode ||
        test?.selectedChargeMode ||
        resolvedPanelCompany?.billingChargeMode ||
        resolvedPanelCompany?.chargeMode ||
        '',
      panelCompanyId:
        test?.compCatId ||
        test?.comp_cat_id ||
        resolvedPanelCompany?.compCatId ||
        patient?.compCatId ||
        patient?.comp_cat_id ||
        '',
      centerId:
        resolvedPanelCompany?.centerId || test?.centerId || test?.CenterID || '',
      atype: resolvedPanelCompany?.atype || test?.atype || test?.Atype || '',
      panelCode:
        resolvedPanelCompany?.panelCode || test?.panelCode || patient?.panelCode || '',
      panelAbarid:
        resolvedPanelCompany?.panelAbarid ||
        test?.panelAbarid ||
        patient?.panelAbarid ||
        '',
      booked_code: test?.code || test?.booked_code || 'N/A',
      bookingTestId:
        test?.bookingTestId ||
        test?.booking_test_id ||
        test?.bookingTestID ||
        test?.booking_test ||
        '',
      catalog_key:
        test?.catalog_key ||
        [
          resolvedPanelCompany?.compCatId ||
            test?.compCatId ||
            test?.comp_cat_id ||
            patient?.compCatId ||
            patient?.comp_cat_id ||
            '',
          '',
          '',
          test?.code || test?.booked_code || '',
        ].join('|'),
      gcode: test?.gcode || '',
      scode: test?.scode || '',
      test_code: test?.test_code || test?.code || test?.booked_code || '',
      description: test?.name || test?.test_name || 'Unnamed Test',
      specimenName:
        test?.specimen_name ||
        test?.specimenName ||
        getSpecimenNameForTestCode(test?.code || test?.booked_code) ||
        'N/A',
      mrp: Number(test?.mrp || test?.charge || test?.amount || 0) || 0,
      charge: getDiscountedTestPrice(test),
      percentageonstandard: getTestStandardDiscountPercent(test),
      max_discount: Number(test?.max_discount || test?.maxDiscount || 0) || 0,
      max_allowed_discount:
        Number(test?.max_allowed_discount || test?.maxAllowedDiscount || 0) || 0,
      isChildTest: false,
      isAppAdded: false,
    };
  });

const withPanelContextForTests = (tests, patient, panelCompany = null) =>
  (Array.isArray(tests) ? tests : []).map(test => {
    const panelCompanyId =
      panelCompany?.compCatId ||
      test?.panelCompanyId ||
      test?.compCatId ||
      test?.comp_cat_id ||
      patient?.compCatId ||
      patient?.comp_cat_id ||
      '';
    const centerId =
      panelCompany?.centerId || test?.centerId || test?.CenterID || '';
    const atype = panelCompany?.atype || test?.atype || test?.Atype || '';
    const panelCode =
      panelCompany?.panelCode || test?.panelCode || patient?.panelCode || '';
    const panelAbarid =
      panelCompany?.panelAbarid || test?.panelAbarid || patient?.panelAbarid || '';

    return {
      ...test,
      panelCompanyName:
        test?.panelCompanyName ||
        panelCompany?.name ||
        patient?.panelCompany ||
        'Current Panel',
      panelCompanySource: test?.panelCompanySource || panelCompany?.chipSource || '',
      panelCompanyChipId:
        test?.panelCompanyChipId || panelCompany?.chipId || panelCompany?.id || '',
      cat_details: test?.cat_details || test?.catDetails || '',
      selected_charge_mode:
        test?.selected_charge_mode || test?.selectedChargeMode || '',
      panelCompanyId,
      centerId,
      atype,
      panelCode,
      panelAbarid,
      catalog_key:
        test?.catalog_key ||
        [panelCompanyId, test?.gcode || '', test?.scode || '', test?.booked_code || test?.code || '']
          .join('|'),
      mrp: Number(test?.mrp || test?.charge || test?.amount || 0) || 0,
      charge: getDiscountedTestPrice(test),
      percentageonstandard: getTestStandardDiscountPercent(test),
      max_discount: Number(test?.max_discount || test?.maxDiscount || 0) || 0,
      max_allowed_discount:
        Number(test?.max_allowed_discount || test?.maxAllowedDiscount || 0) || 0,
    };
  });

const resolvePanelCompanyFromPatientName = async patient => {
  const apiPanelCompany = getPrimaryApiPanelCompany(patient);

  if (apiPanelCompany) {
    try {
      const response = await getLocalMatchedPanelCompaniesResponse(patient);
      const matchedCompanies = Array.isArray(response?.items) ? response.items : [];
      const localMatch = matchedCompanies.find(
        item => toStableValue(item?.CompCatID) === apiPanelCompany.compCatId,
      );

      if (localMatch) {
        return {
          id: apiPanelCompany.id,
          syncKey: toStableValue(localMatch?.sync_key || localMatch?.syncKey),
          centerId: toStableValue(localMatch?.CenterID),
          atype: toStableValue(localMatch?.Atype),
          name: apiPanelCompany.name,
          compCatId: apiPanelCompany.compCatId,
          details: toStableValue(localMatch?.CatDetails),
          billingChargeMode: apiPanelCompany.billingChargeMode,
          panelCode: toStableValue(localMatch?.code || localMatch?.Code),
          panelAbarid: toStableValue(localMatch?.ABARID || localMatch?.abarid),
        };
      }
    } catch {
      // API panel identity is enough; local catalog details are a best-effort add-on.
    }

    return apiPanelCompany;
  }

  try {
    const response = await getLocalMatchedPanelCompaniesResponse(patient);
    const matchedCompanies = Array.isArray(response?.items) ? response.items : [];
    if (!matchedCompanies.length) {
      return null;
    }

    const [bestMatch] = matchedCompanies;
    return {
      id: toStableValue(bestMatch?.id),
      syncKey: toStableValue(bestMatch?.sync_key || bestMatch?.syncKey),
      centerId: toStableValue(bestMatch?.CenterID),
      atype: toStableValue(bestMatch?.Atype),
      name: toStableValue(bestMatch?.pname) || 'Unnamed Company',
      compCatId: toStableValue(bestMatch?.CompCatID),
      details: toStableValue(bestMatch?.CatDetails),
      billingChargeMode: toStableValue(bestMatch?.BillingChargeMode),
      panelCode: toStableValue(bestMatch?.code || bestMatch?.Code),
      panelAbarid: toStableValue(bestMatch?.ABARID || bestMatch?.abarid),
    };
  } catch (error) {
    return null;
  }
};

const buildSelectedChildTests = (children, parentContext = {}) =>
  (Array.isArray(children) ? children : []).map(child => {
    const mrp = Number(child?.mrp || child?.charge || 0) || 0;
    const percentageonstandard = getTestStandardDiscountPercent(child);

    return {
      catalog_key: child?.catalog_key || parentContext.catalogKey || '',
      gcode: child?.gcode || parentContext.gcode || '',
      scode: child?.scode || parentContext.scode || '',
      testcode1: child?.testcode1 || child?.booked_code || child?.test_code || '',
      booked_code: child?.booked_code || 'N/A',
      test_code: child?.test_code || child?.booked_code || '',
      description: child?.description || 'Unnamed Test',
      mrp,
      charge: getDiscountedTestPrice({...child, mrp, percentageonstandard}),
      percentageonstandard,
      is_profile: Boolean(child?.is_profile || child?.isProfile),
      has_children: Boolean(
        child?.has_children ||
          child?.hasChildren ||
          (Array.isArray(child?.child_tests) && child.child_tests.length) ||
          (Array.isArray(child?.childTests) && child.childTests.length),
      ),
      specimenName:
        child?.specimen_name ||
        child?.specimenName ||
        getSpecimenNameForTestCode(child?.booked_code || '') ||
        'N/A',
      childTests: buildSelectedChildTests(child?.child_tests || child?.childTests, {
        catalogKey: child?.catalog_key || parentContext.catalogKey || '',
        gcode: child?.gcode || parentContext.gcode || '',
        scode: child?.scode || parentContext.scode || '',
      }),
    };
  });

const buildEmptyAppointmentDetailState = () => ({
  patientApiPanelCompaniesMap: {},
  patientPanelCompaniesMap: {},
  activePatientPanelCompanyMap: {},
  patientSelectedTestsMap: {},
  patientReportCourierMap: {},
  patientReportScheduleMap: {},
  patientSampleCollectionMap: {},
  patientTestBookingStatusMap: {},
  patientCghsEnabledMap: {},
  patientCghsIdMap: {},
  patientCghsDocumentsMap: {},
  patientAdditionalDiscountMap: {},
  completePayments: [],
  isAdditionalDiscountEnabled: false,
  isLinkedAppointmentSelected: false,
  linkedAppointmentDate: '',
  linkedAppointmentTimeSlot: '',
  samplePickCount: '',
  samplePickPatientIds: [],
  sampleCollectionEasyTough: '',
  sampleCollectionEasyToughPatientIds: [],
  pendingPaymentPatientId: '',
  selectedPatientKey: '',
});

const buildAppointmentDetailStateFromBooking = booking => {
  const state = buildEmptyAppointmentDetailState();
  (Array.isArray(booking?.patients) ? booking.patients : []).forEach(patient => {
    const patientId = getPatientMutationId(patient);
    if (!patientId) {
      return;
    }

    state.patientSelectedTestsMap[patientId] = buildSeededPatientTests(patient);
    const patientAdditionalDiscount = toCurrencyNumber(
      patient?.additionalDiscountAmount ||
        patient?.additional_discount_amount ||
        patient?.ad_dis ||
        patient?.Ad_Dis,
    );

    if (patientAdditionalDiscount > 0) {
      state.patientAdditionalDiscountMap[patientId] = String(
        patientAdditionalDiscount,
      );
    }
  });

  return state;
};

const getCollectedTubeNames = (patient, sampleCollection) => {
  const selectedTubes = Array.isArray(sampleCollection?.selectedTubes)
    ? sampleCollection.selectedTubes
    : [];

  if (selectedTubes.length) {
    return selectedTubes;
  }

  const tubeSummaryNames = (
    Array.isArray(sampleCollection?.tubeSelectionSummary)
      ? sampleCollection.tubeSelectionSummary
      : []
  )
    .filter(item => Number(item?.selectedCount || 0) > 0)
    .map(item => toStableValue(item?.tubeName || item?.specimenName))
    .filter(Boolean);

  if (tubeSummaryNames.length) {
    return tubeSummaryNames;
  }

  return (Array.isArray(patient?.tubes) ? patient.tubes : [])
    .map(tube =>
      typeof tube === 'string'
        ? toStableValue(tube)
        : toStableValue(tube?.tubeName || tube?.name || tube?.specimenName),
    )
    .filter(Boolean);
};

const buildCompletedBookingForHandover = (booking, appointmentDetailState) => {
  const patientSampleCollectionMap =
    appointmentDetailState?.patientSampleCollectionMap || {};

  return {
    ...booking,
    status: 'Completed',
    bookingStatusCode: 3,
    patientCount:
      booking?.patientCount || (Array.isArray(booking?.patients) ? booking.patients.length : 0),
    patients: (Array.isArray(booking?.patients) ? booking.patients : []).map(patient => {
      const patientId = getPatientMutationId(patient);
      const sampleCollection = patientId
        ? patientSampleCollectionMap[patientId] || {}
        : {};
      const collectedTubes = getCollectedTubeNames(patient, sampleCollection);

      return {
        ...patient,
        tubes: collectedTubes,
        sampleCollection,
      };
    }),
  };
};

const getTestSelectionIdentity = test =>
  [
    toStableValue(test?.panelCompanyChipId),
    toStableValue(test?.panelCompanyId || test?.compCatId || test?.comp_cat_id),
    getTestDedupeKey(test),
    toStableValue(test?.key || test?.catalog_key),
  ].join('|');

const getPatientSeedTestIdentities = (seedState, patientId) =>
  (seedState?.patientSelectedTestsMap?.[patientId] || []).map(
    getTestSelectionIdentity,
  );

const normalizeDraftState = draftState => {
  if (!draftState || typeof draftState !== 'object') {
    return {};
  }

  return draftState.data && typeof draftState.data === 'object'
    ? {
        ...draftState.data,
        removedSeedTestIdentitiesMap:
          draftState.removedSeedTestIdentitiesMap ||
          draftState.data.removedSeedTestIdentitiesMap ||
          {},
      }
    : draftState;
};

const mergeAppointmentDetailStateWithDraft = (seedState, draftState) => {
  const seed = seedState || buildEmptyAppointmentDetailState();
  const draft = normalizeDraftState(draftState);
  const mergedPatientSelectedTestsMap = {...(seed.patientSelectedTestsMap || {})};
  const draftSelectedTestsMap = draft.patientSelectedTestsMap || {};
  const removedSeedTestIdentitiesMap = draft.removedSeedTestIdentitiesMap || {};

  Array.from(
    new Set([
      ...Object.keys(draftSelectedTestsMap),
      ...Object.keys(removedSeedTestIdentitiesMap),
    ]),
  ).forEach(patientId => {
    const seedTests = seed.patientSelectedTestsMap?.[patientId] || [];
    const removedIdentities = new Set(removedSeedTestIdentitiesMap[patientId] || []);
    const visibleSeedTests = seedTests.filter(
      test => !removedIdentities.has(getTestSelectionIdentity(test)),
    );
    const appAddedTests = (draftSelectedTestsMap[patientId] || []).filter(test =>
      Boolean(test?.isAppAdded),
    );
    const mergedMap = new Map();

    [...visibleSeedTests, ...appAddedTests].forEach(test => {
      mergedMap.set(getTestSelectionIdentity(test), test);
    });

    mergedPatientSelectedTestsMap[patientId] = Array.from(mergedMap.values());
  });

  return {
    ...seed,
    patientApiPanelCompaniesMap: {
      ...(seed.patientApiPanelCompaniesMap || {}),
      ...(draft.patientApiPanelCompaniesMap || {}),
    },
    patientPanelCompaniesMap: {
      ...(seed.patientPanelCompaniesMap || {}),
      ...(draft.patientPanelCompaniesMap || {}),
    },
    activePatientPanelCompanyMap: {
      ...(seed.activePatientPanelCompanyMap || {}),
      ...(draft.activePatientPanelCompanyMap || {}),
    },
    patientSelectedTestsMap: mergedPatientSelectedTestsMap,
    patientReportCourierMap: {
      ...(seed.patientReportCourierMap || {}),
      ...(draft.patientReportCourierMap || {}),
    },
    patientReportScheduleMap: {
      ...(seed.patientReportScheduleMap || {}),
      ...(draft.patientReportScheduleMap || {}),
    },
    patientSampleCollectionMap: {
      ...(seed.patientSampleCollectionMap || {}),
      ...(draft.patientSampleCollectionMap || {}),
    },
    patientTestBookingStatusMap: {
      ...(seed.patientTestBookingStatusMap || {}),
      ...(draft.patientTestBookingStatusMap || {}),
    },
    patientCghsEnabledMap: {
      ...(seed.patientCghsEnabledMap || {}),
      ...(draft.patientCghsEnabledMap || {}),
    },
    patientCghsIdMap: {
      ...(seed.patientCghsIdMap || {}),
      ...(draft.patientCghsIdMap || {}),
    },
    patientCghsDocumentsMap: {
      ...(seed.patientCghsDocumentsMap || {}),
      ...(draft.patientCghsDocumentsMap || {}),
    },
    patientAdditionalDiscountMap: {
      ...(seed.patientAdditionalDiscountMap || {}),
      ...(draft.patientAdditionalDiscountMap || {}),
    },
    completePayments: Array.isArray(draft.completePayments)
      ? draft.completePayments
      : seed.completePayments,
    isAdditionalDiscountEnabled:
      draft.isAdditionalDiscountEnabled === undefined
        ? seed.isAdditionalDiscountEnabled
        : draft.isAdditionalDiscountEnabled,
    isLinkedAppointmentSelected:
      draft.isLinkedAppointmentSelected === undefined
        ? seed.isLinkedAppointmentSelected
        : draft.isLinkedAppointmentSelected,
    linkedAppointmentDate:
      draft.linkedAppointmentDate || seed.linkedAppointmentDate || '',
    linkedAppointmentTimeSlot:
      draft.linkedAppointmentTimeSlot || seed.linkedAppointmentTimeSlot || '',
    samplePickCount: draft.samplePickCount || seed.samplePickCount || '',
    samplePickPatientIds: Array.isArray(draft.samplePickPatientIds)
      ? draft.samplePickPatientIds
      : seed.samplePickPatientIds,
    sampleCollectionEasyTough:
      draft.sampleCollectionEasyTough || seed.sampleCollectionEasyTough || '',
    sampleCollectionEasyToughPatientIds: Array.isArray(
      draft.sampleCollectionEasyToughPatientIds,
    )
      ? draft.sampleCollectionEasyToughPatientIds
      : seed.sampleCollectionEasyToughPatientIds,
    pendingPaymentPatientId:
      draft.pendingPaymentPatientId || seed.pendingPaymentPatientId || '',
    selectedPatientKey: draft.selectedPatientKey || seed.selectedPatientKey,
  };
};

const buildAppointmentDetailDraftForStorage = ({state, selectedBooking}) => {
  const safeState = state || buildEmptyAppointmentDetailState();
  const seedState = buildAppointmentDetailStateFromBooking(selectedBooking);
  const draftSelectedTestsMap = {};
  const removedSeedTestIdentitiesMap = {};

  Object.keys(safeState.patientSelectedTestsMap || {}).forEach(patientId => {
    const currentTests = safeState.patientSelectedTestsMap[patientId] || [];
    const currentIdentities = new Set(currentTests.map(getTestSelectionIdentity));
    const appAddedTests = currentTests.filter(test => Boolean(test?.isAppAdded));
    const removedSeedIdentities = getPatientSeedTestIdentities(
      seedState,
      patientId,
    ).filter(identity => !currentIdentities.has(identity));

    if (appAddedTests.length) {
      draftSelectedTestsMap[patientId] = appAddedTests;
    }
    if (removedSeedIdentities.length) {
      removedSeedTestIdentitiesMap[patientId] = removedSeedIdentities;
    }
  });

  return {
    version: 2,
    updatedAt: new Date().toISOString(),
    removedSeedTestIdentitiesMap,
    data: {
      patientApiPanelCompaniesMap: safeState.patientApiPanelCompaniesMap || {},
      patientPanelCompaniesMap: safeState.patientPanelCompaniesMap || {},
      activePatientPanelCompanyMap: safeState.activePatientPanelCompanyMap || {},
      patientSelectedTestsMap: draftSelectedTestsMap,
      patientReportCourierMap: safeState.patientReportCourierMap || {},
      patientReportScheduleMap: safeState.patientReportScheduleMap || {},
      patientSampleCollectionMap: safeState.patientSampleCollectionMap || {},
      patientTestBookingStatusMap: safeState.patientTestBookingStatusMap || {},
      patientCghsEnabledMap: safeState.patientCghsEnabledMap || {},
      patientCghsIdMap: safeState.patientCghsIdMap || {},
      patientCghsDocumentsMap: safeState.patientCghsDocumentsMap || {},
      patientAdditionalDiscountMap: safeState.patientAdditionalDiscountMap || {},
      completePayments: safeState.completePayments || [],
      isAdditionalDiscountEnabled: safeState.isAdditionalDiscountEnabled,
      isLinkedAppointmentSelected: Boolean(safeState.isLinkedAppointmentSelected),
      linkedAppointmentDate: safeState.linkedAppointmentDate || '',
      linkedAppointmentTimeSlot: safeState.linkedAppointmentTimeSlot || '',
      samplePickCount: safeState.samplePickCount || '',
      samplePickPatientIds: Array.isArray(safeState.samplePickPatientIds)
        ? safeState.samplePickPatientIds
        : [],
      sampleCollectionEasyTough: safeState.sampleCollectionEasyTough || '',
      sampleCollectionEasyToughPatientIds: Array.isArray(
        safeState.sampleCollectionEasyToughPatientIds,
      )
        ? safeState.sampleCollectionEasyToughPatientIds
        : [],
      pendingPaymentPatientId: safeState.pendingPaymentPatientId || '',
      selectedPatientKey: safeState.selectedPatientKey,
    },
  };
};

const buildBookingTestPriceRequests = booking =>
  (Array.isArray(booking?.patients) ? booking.patients : [])
    .map(patient => {
      const patientId = getPatientMutationId(patient);
      const tests = Array.isArray(patient?.tests) ? patient.tests : [];

      return {
        patient_id: patientId,
        panel_company: toStableValue(patient?.panelCompany),
        comp_cat_id: toStableValue(patient?.compCatId || patient?.comp_cat_id),
        center_id: toStableValue(patient?.centerId || patient?.CenterID),
        atype: toStableValue(patient?.atype || patient?.Atype),
        panel_code: toStableValue(patient?.panelCode || patient?.panel_code),
        panel_abarid: toStableValue(patient?.panelAbarid || patient?.panel_abarid),
        tests: tests.map(test => ({
          code: toStableValue(test?.code || test?.booked_code),
          description: toStableValue(
            test?.name || test?.test_name || test?.description,
          ),
          comp_cat_id: toStableValue(
            test?.compCatId ||
              test?.comp_cat_id ||
              test?.panelCompanyId ||
              test?.panel_company_id,
          ),
          center_id: toStableValue(test?.centerId || test?.CenterID),
          atype: toStableValue(test?.atype || test?.Atype),
          panel_code: toStableValue(test?.panelCode || test?.panel_code),
          panel_abarid: toStableValue(test?.panelAbarid || test?.panel_abarid),
        })),
      };
    })
    .filter(request => request.patient_id && request.tests.length);

const mergeBookingTestsWithLocalPrices = (booking, priceResponse) => {
  const patientPriceMap = new Map();
  (Array.isArray(priceResponse?.patients) ? priceResponse.patients : []).forEach(
    patientPrices => {
      const testMap = new Map();
      (Array.isArray(patientPrices?.tests) ? patientPrices.tests : []).forEach(
        testPrice => {
          const code = toStableValue(
            testPrice?.code || testPrice?.booked_code,
          ).toUpperCase();
          if (code) {
            testMap.set(code, testPrice);
          }
        },
      );
      patientPriceMap.set(toStableValue(patientPrices?.patient_id), testMap);
    },
  );

  return {
    ...booking,
    patients: (Array.isArray(booking?.patients) ? booking.patients : []).map(
      patient => {
        const patientId = getPatientMutationId(patient);
        const testPriceMap = patientPriceMap.get(patientId) || new Map();

        return {
          ...patient,
          tests: (Array.isArray(patient?.tests) ? patient.tests : []).map(test => {
            const code = toStableValue(test?.code || test?.booked_code);
            const price = testPriceMap.get(code.toUpperCase()) || {};
            const hasResolvedPrice =
              toStableValue(price?.booked_code || price?.code) &&
              [
                price?.mrp,
                price?.charge,
                price?.max_discount,
                price?.max_allowed_discount,
              ].some(value => Number(value || 0) > 0);
            const resolvedTest = {
              ...test,
              mrp: Number(hasResolvedPrice ? price?.mrp : test?.mrp || 0) || 0,
              percentageonstandard:
                Number(
                  hasResolvedPrice
                    ? price?.percentageonstandard ||
                        price?.percentageOnStandard ||
                        price?.percentage_on_standard ||
                        price?.PercentageOnStandard ||
                        price?.percentagestandard ||
                        price?.percentageStandard ||
                        price?.percentage_standard
                    : test?.percentageonstandard ||
                        test?.percentageOnStandard ||
                        test?.percentage_on_standard ||
                        test?.PercentageOnStandard ||
                        test?.percentagestandard ||
                        test?.percentageStandard ||
                        test?.percentage_standard ||
                        0,
                ) || 0,
            };
            return {
              ...test,
              name: test?.name || test?.test_name || price?.description,
              mrp: resolvedTest.mrp,
              charge: getDiscountedTestPrice(resolvedTest),
              percentageonstandard: resolvedTest.percentageonstandard,
              max_discount:
                Number(hasResolvedPrice ? price?.max_discount : test?.max_discount || 0) ||
                Math.max(0, resolvedTest.mrp - getDiscountedTestPrice(resolvedTest)),
              max_allowed_discount:
                Number(
                  hasResolvedPrice
                    ? price?.max_allowed_discount
                    : test?.max_allowed_discount || 0,
                ) || 0,
            };
          }),
        };
      },
    ),
  };
};

const getTerminalBookingStatus = booking => {
  const statusCode = Number(booking?.bookingStatusCode || 0);
  const statusLabel = toStableValue(booking?.status).toLowerCase();

  if (
    statusCode === 5 ||
    (statusLabel.includes('partial') && statusLabel.includes('complete'))
  ) {
    return {bookingStatusCode: 5, status: 'Partial Complete'};
  }

  if (statusCode === 3 || statusLabel.includes('complete')) {
    return {bookingStatusCode: 3, status: 'Completed'};
  }

  if (statusCode === 4 || statusLabel.includes('cancel')) {
    return {bookingStatusCode: 4, status: 'Cancelled'};
  }

  return null;
};

const getLoadingOverlayCopy = ({
  appointmentsViewMode,
  isLoadingCompletedAppointments,
  loadingAssignedBookingId,
  bookingActionLoading,
  isAddingPatient,
  isUpdatingPatient,
  cancellingPatientId,
  addingTestPatientId,
}) => {
  const title = bookingActionLoading
    ? 'Updating Booking'
    : isAddingPatient
    ? 'Adding Patient'
    : isUpdatingPatient
    ? 'Updating Patient'
    : cancellingPatientId
    ? 'Cancelling Patient'
    : addingTestPatientId
    ? 'Loading Catalog'
    : loadingAssignedBookingId
    ? 'Opening Booking'
    : isLoadingCompletedAppointments
    ? 'Loading Completed'
    : appointmentsViewMode === 'started'
    ? 'Loading Started'
    : 'Loading Appointments';

  const message = bookingActionLoading
    ? 'Updating the booking status...'
    : isAddingPatient
    ? 'Saving patient details...'
    : isUpdatingPatient
    ? 'Updating patient details...'
    : cancellingPatientId
    ? 'Cancelling the selected patient...'
    : addingTestPatientId
    ? 'Fetching local panel catalog...'
    : loadingAssignedBookingId
    ? 'Fetching appointment details and patient tests...'
    : isLoadingCompletedAppointments
    ? 'Fetching your completed appointment history...'
    : appointmentsViewMode === 'started'
    ? 'Fetching your started appointments...'
    : 'Fetching your assigned appointments...';

  return {title, message};
};

export const useAppShellController = () => {
  const [activeTab, setActiveTab] = useState('home');
  const [tabHistory, setTabHistory] = useState([]);
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [selectedBookingScreen, setSelectedBookingScreen] = useState('details');
  const [selectedSamplePatient, setSelectedSamplePatient] = useState(null);
  const [selectedSamplePanelCompany, setSelectedSamplePanelCompany] = useState(null);
  const [localDatabaseLoadingMessage, setLocalDatabaseLoadingMessage] =
    useState('');
  const [appointmentDetailState, setAppointmentDetailState] = useState(
    buildEmptyAppointmentDetailState,
  );
  const [appointmentDetailDrafts, setAppointmentDetailDrafts] = useState({});
  const [appointmentsViewMode, setAppointmentsViewMode] = useState('default');
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [isShowingSplash, setIsShowingSplash] = useState(true);
  const isAppointmentDetailStateHydratedRef = useRef(false);
  const clearedAppointmentDraftKeysRef = useRef(new Set());
  const lastAppointmentsViewModeRef = useRef('assigned');
  const {width, height} = useWindowDimensions();
  const session = useSessionAuth();
  const location = useLocationGate();
  const bookings = useAssignedBookings({
    accessToken: session.accessToken,
    loggedInUser: session.loggedInUser,
  });

  const isTinyPhone = width < 350;
  const isSmallPhone = width < 390;
  const isLargePhone = width >= 430;
  const horizontalPadding = isTinyPhone ? 8 : isSmallPhone ? 12 : isLargePhone ? 22 : 18;
  const contentWidth = Math.min(width - horizontalPadding * 2, 460);
  const homeContentWidth = Math.min(width - horizontalPadding * 2, 520);
  const loginTopSpacing = height < 700 ? 28 : 40;
  const loginBottomSpacing = height < 700 ? 20 : 28;

  const startedAppointments = useMemo(
    () =>
      bookings.assignedAppointments.filter(
        booking =>
          Number(booking.bookingStatusCode) === 2 || booking.status === 'Started',
      ),
    [bookings.assignedAppointments],
  );

  const isHomeOverlayVisible =
    bookings.isLoadingAssignedAppointments ||
    bookings.isLoadingCompletedAppointments ||
    Boolean(bookings.loadingAssignedBookingId) ||
    Boolean(bookings.bookingActionLoading) ||
    bookings.isAddingPatient ||
    bookings.isUpdatingPatient ||
    Boolean(bookings.cancellingPatientId) ||
    Boolean(localDatabaseLoadingMessage);

  const loadingOverlayCopy = localDatabaseLoadingMessage
    ? {
        title: 'Loading Local Data',
        message: localDatabaseLoadingMessage,
      }
    : getLoadingOverlayCopy({
        appointmentsViewMode,
        isLoadingCompletedAppointments: bookings.isLoadingCompletedAppointments,
        loadingAssignedBookingId: bookings.loadingAssignedBookingId,
        bookingActionLoading: bookings.bookingActionLoading,
        isAddingPatient: bookings.isAddingPatient,
        isUpdatingPatient: bookings.isUpdatingPatient,
        cancellingPatientId: bookings.cancellingPatientId,
        addingTestPatientId: bookings.addingTestPatientId,
      });

  useEffect(() => {
    const splashTimer = setTimeout(() => {
      setIsShowingSplash(false);
    }, 2800);

    return () => clearTimeout(splashTimer);
  }, []);

  useEffect(() => {
    let isMounted = true;

    const restoreAppointmentDetailState = async () => {
      try {
        const cachedDrafts = await getCachedAppointmentDetailDrafts();
        if (!isMounted) {
          isAppointmentDetailStateHydratedRef.current = true;
          return;
        }

        if (Object.keys(cachedDrafts).length) {
          setAppointmentDetailDrafts(cachedDrafts);
        }
      } catch (error) {
        // Local cache restore is best-effort; the screen can continue without it.
      } finally {
        isAppointmentDetailStateHydratedRef.current = true;
      }
    };

    restoreAppointmentDetailState();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!isAppointmentDetailStateHydratedRef.current) {
      return;
    }

    const persistTimer = setTimeout(() => {
      persistAppointmentDetailDrafts(appointmentDetailDrafts).catch(() => {});
    }, 350);

    return () => clearTimeout(persistTimer);
  }, [appointmentDetailDrafts]);

  useEffect(() => {
    const draftKey = getAppointmentDetailDraftKey(selectedBooking);

    if (!isAppointmentDetailStateHydratedRef.current || !draftKey) {
      return;
    }

    if (clearedAppointmentDraftKeysRef.current.has(draftKey)) {
      return;
    }

    setAppointmentDetailDrafts(previousDrafts => {
      const nextDraft = buildAppointmentDetailDraftForStorage({
        state: appointmentDetailState,
        selectedBooking,
      });

      if (
        JSON.stringify(previousDrafts[draftKey]?.data || previousDrafts[draftKey]) ===
          JSON.stringify(nextDraft.data) &&
        JSON.stringify(previousDrafts[draftKey]?.removedSeedTestIdentitiesMap || {}) ===
          JSON.stringify(nextDraft.removedSeedTestIdentitiesMap)
      ) {
        return previousDrafts;
      }

      return {
        ...previousDrafts,
        [draftKey]: nextDraft,
      };
    });
  }, [appointmentDetailState, selectedBooking]);

  useEffect(() => {
    if (['assigned', 'started', 'completed'].includes(appointmentsViewMode)) {
      lastAppointmentsViewModeRef.current = appointmentsViewMode;
    }
  }, [appointmentsViewMode]);

  const resetHomeNavigation = useCallback(() => {
    setActiveTab('home');
    setTabHistory([]);
    setSelectedBooking(null);
    setSelectedBookingScreen('details');
    setSelectedSamplePatient(null);
    setSelectedSamplePanelCompany(null);
    setAppointmentDetailState(buildEmptyAppointmentDetailState());
    setAppointmentsViewMode('default');
  }, []);

  const handleLoginSubmit = useCallback(async () => {
    const didLoginSucceed = await session.handleLogin();

    if (didLoginSucceed) {
      resetHomeNavigation();
    }
  }, [resetHomeNavigation, session]);

  const navigateToAppointmentsView = useCallback(
    async ({
      sourceTab,
      viewMode,
      fetcher,
      errorSetter,
      emptyListLength,
      missingTokenMessage,
    }) => {
      setSelectedBooking(null);
      setSelectedBookingScreen('details');
      setSelectedSamplePatient(null);
      setSelectedSamplePanelCompany(null);
      setAppointmentDetailState(buildEmptyAppointmentDetailState());
      setAppointmentsViewMode(viewMode);
      setTabHistory(previousHistory => [...previousHistory, sourceTab]);
      setActiveTab('appointments');

      if (!session.accessToken) {
        errorSetter(emptyListLength ? '' : missingTokenMessage);
        return;
      }

      await fetcher();
    },
    [session.accessToken],
  );

  const handleTabChange = useCallback(
    async nextTab => {
      if (nextTab === activeTab) {
        return;
      }

      setSelectedBooking(null);
      setSelectedBookingScreen('details');
      setSelectedSamplePatient(null);
      setSelectedSamplePanelCompany(null);
      setAppointmentDetailState(buildEmptyAppointmentDetailState());

      if (nextTab === 'appointments') {
        setAppointmentsViewMode('assigned');
        setTabHistory(previousHistory =>
          activeTab === nextTab ? previousHistory : [...previousHistory, activeTab],
        );
        setActiveTab('appointments');

        if (!session.accessToken) {
          bookings.setAssignedAppointmentsError(
            bookings.assignedAppointments.length
              ? ''
              : 'A valid login token is required before opening assigned appointments.',
          );
          return;
        }

        await bookings.fetchAssignedAppointments();
        return;
      }

      if (nextTab === 'saved') {
        setAppointmentsViewMode('default');
        setTabHistory(previousHistory => [...previousHistory, activeTab]);
        setActiveTab(nextTab);

        if (session.accessToken) {
          await bookings.fetchCompletedAppointments();
        }
        return;
      }

      setAppointmentsViewMode('default');
      setTabHistory(previousHistory => [...previousHistory, activeTab]);
      setActiveTab(nextTab);
    },
    [activeTab, bookings, session.accessToken],
  );

  const handleAssignedCardPress = useCallback(
    async () =>
      navigateToAppointmentsView({
        sourceTab: activeTab,
        viewMode: 'assigned',
        fetcher: bookings.fetchAssignedAppointments,
        errorSetter: bookings.setAssignedAppointmentsError,
        emptyListLength: bookings.assignedAppointments.length,
        missingTokenMessage:
          'A valid login token is required before opening assigned appointments.',
      }),
    [activeTab, bookings, navigateToAppointmentsView],
  );

  const handleCompletedCardPress = useCallback(
    async () =>
      navigateToAppointmentsView({
        sourceTab: activeTab,
        viewMode: 'completed',
        fetcher: bookings.fetchCompletedAppointments,
        errorSetter: bookings.setCompletedAppointmentsError,
        emptyListLength: bookings.completedAppointments.length,
        missingTokenMessage:
          'A valid login token is required before opening completed appointments.',
      }),
    [activeTab, bookings, navigateToAppointmentsView],
  );

  const handleStartedCardPress = useCallback(
    async () =>
      navigateToAppointmentsView({
        sourceTab: activeTab,
        viewMode: 'started',
        fetcher: bookings.fetchAssignedAppointments,
        errorSetter: bookings.setAssignedAppointmentsError,
        emptyListLength: startedAppointments.length,
        missingTokenMessage:
          'A valid login token is required before opening started appointments.',
      }),
    [activeTab, bookings, navigateToAppointmentsView, startedAppointments.length],
  );

  const handleAssignedViewDetails = useCallback(
    async booking => {
      const bookingDetail = await bookings.openAssignedBooking(booking);

      if (bookingDetail) {
        const terminalStatusFromList = getTerminalBookingStatus(booking);
        const finalBooking = {
          ...bookingDetail,
          ...(terminalStatusFromList || {}),
          sourceType:
            bookingDetail?.sourceType ||
            booking?.sourceType ||
            booking?.source_type ||
            (bookingDetail?.appointmentId || booking?.appointmentId
              ? 'APPOINTMENT'
              : 'BOOKING'),
          appointmentId:
            bookingDetail?.appointmentId ||
            booking?.appointmentId ||
            booking?.appointment_id ||
            '',
        };
        const draftKey = getAppointmentDetailDraftKey(finalBooking);
        const cachedDraft = draftKey ? appointmentDetailDrafts[draftKey] : null;

        if (draftKey) {
          clearedAppointmentDraftKeysRef.current.delete(draftKey);
        }

        setSelectedBooking({
          ...finalBooking,
        });
        setActiveTab('appointments');
        setAppointmentsViewMode(
          ['assigned', 'started', 'completed'].includes(appointmentsViewMode)
            ? appointmentsViewMode
            : Number(finalBooking?.bookingStatusCode || 0) === 2 ||
              finalBooking?.status === 'Started'
            ? 'started'
            : 'assigned',
        );
        setSelectedBookingScreen('details');
        setSelectedSamplePatient(null);
        setSelectedSamplePanelCompany(null);
        setAppointmentDetailState(
          mergeAppointmentDetailStateWithDraft(
            buildAppointmentDetailStateFromBooking(finalBooking),
            cachedDraft,
          ),
        );

        getLocalBookingTestPricesResponse(
          buildBookingTestPriceRequests(finalBooking),
        )
          .then(priceResponse => {
            if (!priceResponse?.ok) {
              return;
            }

            const pricedBooking = mergeBookingTestsWithLocalPrices(
              finalBooking,
              priceResponse,
            );
            setSelectedBooking(previousBooking =>
              previousBooking?.id === pricedBooking.id
                ? pricedBooking
                : previousBooking,
            );
            setAppointmentDetailState(previousState =>
              mergeAppointmentDetailStateWithDraft(
                buildAppointmentDetailStateFromBooking(pricedBooking),
                buildAppointmentDetailDraftForStorage({
                  state: previousState,
                  selectedBooking: pricedBooking,
                }),
              ),
            );
          })
          .catch(() => {});
      }
    },
    [appointmentDetailDrafts, appointmentsViewMode, bookings],
  );

  const handleOpenSampleCollection = useCallback(
    (patient, panelCompany = null) => {
      if (!selectedBooking || !patient) {
        return;
      }

      const applyResolvedPanelCompany = resolvedPanelCompany => {
        if (!resolvedPanelCompany) {
          return;
        }

        setSelectedSamplePanelCompany(resolvedPanelCompany);
        const patientId = getPatientMutationId(patient);
        if (!patientId) {
          return;
        }

        setAppointmentDetailState(previousState => {
          const patientSelectedTestsMap =
            previousState?.patientSelectedTestsMap || {};

          return {
            ...previousState,
            patientSelectedTestsMap: {
              ...patientSelectedTestsMap,
              [patientId]: withPanelContextForTests(
                patientSelectedTestsMap[patientId] ||
                  buildSeededPatientTests(patient, resolvedPanelCompany),
                patient,
                resolvedPanelCompany,
              ),
            },
          };
        });
      };

      const resolvedPanelCompany = panelCompany || null;
      const patientId = getPatientMutationId(patient);
      if (patientId) {
        setAppointmentDetailState(previousState => {
          const patientSelectedTestsMap =
            previousState?.patientSelectedTestsMap || {};
          const hasSelectedTestsOverride =
            Object.prototype.hasOwnProperty.call(
              patientSelectedTestsMap,
              patientId,
            );

          if (hasSelectedTestsOverride) {
            return {
              ...previousState,
              patientSelectedTestsMap: {
                ...patientSelectedTestsMap,
                [patientId]: withPanelContextForTests(
                  patientSelectedTestsMap[patientId] || [],
                  patient,
                  resolvedPanelCompany,
                ),
              },
            };
          }

          return {
            ...previousState,
            patientSelectedTestsMap: {
                ...patientSelectedTestsMap,
              [patientId]: buildSeededPatientTests(patient, resolvedPanelCompany),
            },
          };
        });
      }

      setSelectedSamplePatient(patient);
      setSelectedSamplePanelCompany(resolvedPanelCompany || null);
      setSelectedBookingScreen('sample-collection');

      if (!resolvedPanelCompany) {
        resolvePanelCompanyFromPatientName(patient)
          .then(applyResolvedPanelCompany)
          .catch(() => {});
      }
    },
    [selectedBooking],
  );

  const handleOpenAddTest = useCallback(
    (patient, panelCompany) => {
      if (!selectedBooking || !patient || !panelCompany) {
        return;
      }

      const patientId = getPatientMutationId(patient);
      if (patientId) {
        setAppointmentDetailState(previousState => {
          const patientSelectedTestsMap =
            previousState?.patientSelectedTestsMap || {};
          const hasSelectedTestsOverride =
            Object.prototype.hasOwnProperty.call(
              patientSelectedTestsMap,
              patientId,
            );

          if (hasSelectedTestsOverride) {
            return previousState;
          }

          return {
            ...previousState,
            patientSelectedTestsMap: {
              ...patientSelectedTestsMap,
              [patientId]: buildSeededPatientTests(patient, panelCompany),
            },
          };
        });
      }

      setSelectedSamplePatient(patient);
      setSelectedSamplePanelCompany(panelCompany);
      setSelectedBookingScreen('add-test');
    },
    [selectedBooking],
  );

  const handleTogglePatientTestSelection = useCallback(
    ({patient, panelCompany, test, childTest = null}) => {
      const patientId = getPatientMutationId(patient);
      if (!patientId) {
        return;
      }

      const key = buildTestSelectionKey(panelCompany, test, childTest);
      const catalogKey = childTest?.catalog_key || test?.catalog_key || '';
      const catalogContext = parseCatalogKey(catalogKey);
      const gcode = childTest?.gcode || test?.gcode || catalogContext.gcode || '';
      const scode = childTest?.scode || test?.scode || catalogContext.scode || '';
      const childContext = {catalogKey, gcode, scode};
      const profileChildTests = !childTest
        ? buildSelectedChildTests(test?.child_tests || test?.childTests, childContext)
        : buildSelectedChildTests(
            childTest?.child_tests || childTest?.childTests,
            childContext,
          );
      const selectedCatalogTest = childTest || test;
      const selectedMrp =
        Number(
          childTest?.mrp || test?.mrp || childTest?.charge || test?.charge || 0,
        ) || 0;
      const selectedStandardDiscount = getTestStandardDiscountPercent(
        selectedCatalogTest,
      );
      const selectedDiscountedPrice = getDiscountedTestPrice({
        ...selectedCatalogTest,
        mrp: selectedMrp,
        percentageonstandard: selectedStandardDiscount,
      });
      const nextEntry = {
        key,
        panelCompanyName: panelCompany?.name || 'Selected Panel',
        panelCompanySource: panelCompany?.chipSource || '',
        panelCompanyChipId: panelCompany?.chipId || panelCompany?.id || '',
        cat_details: panelCompany?.details || panelCompany?.CatDetails || '',
        selected_charge_mode:
          panelCompany?.billingChargeMode ||
          panelCompany?.chargeMode ||
          panelCompany?.BillingChargeMode ||
          '',
        panelCompanyId: panelCompany?.compCatId || '',
        testcode1:
          childTest?.testcode1 ||
          childTest?.booked_code ||
          test?.testcode1 ||
          test?.booked_code ||
          test?.test_code ||
          '',
        catalog_key: catalogKey,
        gcode,
        scode,
        dedupe_key: getTestDedupeKey(childTest || test),
        booked_code: childTest?.booked_code || test?.booked_code || 'N/A',
        test_code: childTest?.test_code || test?.test_code || '',
        description:
          childTest?.description || test?.description || 'Unnamed Test',
        mrp: selectedMrp,
        charge: selectedDiscountedPrice,
        percentageonstandard: selectedStandardDiscount,
        max_discount:
          Number(
            childTest?.max_discount ||
              test?.max_discount ||
              childTest?.maxDiscount ||
              test?.maxDiscount ||
              0,
          ) || Math.max(0, selectedMrp - selectedDiscountedPrice),
        max_allowed_discount:
          Number(
            childTest?.max_allowed_discount ||
              test?.max_allowed_discount ||
              childTest?.maxAllowedDiscount ||
              test?.maxAllowedDiscount ||
              0,
          ) || 0,
        specimenName:
          childTest?.specimen_name ||
          test?.specimen_name ||
          getSpecimenNameForTestCode(
            childTest?.booked_code || test?.booked_code || '',
          ) ||
          'N/A',
        childTests: profileChildTests,
        isChildTest: Boolean(childTest),
        isAppAdded: true,
        parentDescription: childTest ? test?.description || '' : '',
      };

      setAppointmentDetailState(previousState => {
        const previousMap = previousState?.patientSelectedTestsMap || {};
        const previousTests =
          previousMap[patientId] || buildSeededPatientTests(patient);
        const selectedDedupeKey = getTestDedupeKey(childTest || test);
        const selectedPanelCompanyId = toStableValue(panelCompany?.compCatId);
        const alreadySelected = previousTests.some(
          item =>
            item.key === key ||
            (toStableValue(item?.panelCompanyId) === selectedPanelCompanyId &&
              getTestDedupeKey(item) === selectedDedupeKey),
        );

        return {
          ...previousState,
          patientSelectedTestsMap: {
            ...previousMap,
            [patientId]: alreadySelected
              ? previousTests.filter(
                  item =>
                    item.key !== key &&
                    !(
                      toStableValue(item?.panelCompanyId) ===
                        selectedPanelCompanyId &&
                      getTestDedupeKey(item) === selectedDedupeKey
                    ),
                )
              : [...previousTests, nextEntry],
          },
        };
      });

      queuePendingLocalAction({
        type: 'test-selection-toggle',
        bookingId: selectedBooking?.id,
        patientId,
        payload: {
          panelCompany: {
            id: panelCompany?.id || '',
            name: panelCompany?.name || '',
            compCatId: panelCompany?.compCatId || '',
            centerId: panelCompany?.centerId || '',
            atype: panelCompany?.atype || '',
            panelCode: panelCompany?.panelCode || '',
            panelAbarid: panelCompany?.panelAbarid || '',
          },
          test: nextEntry,
          queuedOfflineCapable: true,
        },
      }).catch(() => {});
    },
    [selectedBooking?.id],
  );

  const handleRemovePatientSelectedTest = useCallback(({patient, testKey}) => {
    const patientId = getPatientMutationId(patient);
    if (!patientId || !testKey) {
      return;
    }

    setAppointmentDetailState(previousState => {
      const previousMap = previousState?.patientSelectedTestsMap || {};
      const previousTests =
        previousMap[patientId] || buildSeededPatientTests(patient);

      return {
        ...previousState,
        patientSelectedTestsMap: {
          ...previousMap,
          [patientId]: previousTests.filter(item => item.key !== testKey),
        },
      };
    });

    queuePendingLocalAction({
      type: 'test-selection-remove',
      bookingId: selectedBooking?.id,
      patientId,
      payload: {
        testKey,
        queuedOfflineCapable: true,
      },
    }).catch(() => {});
  }, [selectedBooking?.id]);

  const handleCollectSample = useCallback(({
    patient,
    selectedCount = 0,
    pendingChildTests = [],
    tubeSelectionSummary = [],
    selectedTubes = [],
    selectedSpecimens = {},
    selectedSpecimenTests = {},
    selectedAdditionalTubes = [],
    unselectedTubes = [],
    unselectedTests = [],
  }) => {
    const patientId = getPatientMutationId(patient);
    if (!patientId) {
      return;
    }

    setAppointmentDetailState(previousState => ({
      ...previousState,
      patientSampleCollectionMap: {
        ...(previousState?.patientSampleCollectionMap || {}),
        [patientId]: {
          ...(previousState?.patientSampleCollectionMap?.[patientId] || {}),
          collected: true,
          selectedCount,
          collectedAt: new Date().toISOString(),
          pendingChildTests: Array.isArray(pendingChildTests)
            ? pendingChildTests
            : [],
          tubeSelectionSummary: Array.isArray(tubeSelectionSummary)
            ? tubeSelectionSummary
            : [],
          selectedTubes: Array.isArray(selectedTubes) ? selectedTubes : [],
          selectedSpecimens:
            selectedSpecimens && typeof selectedSpecimens === 'object'
              ? selectedSpecimens
              : {},
          selectedSpecimenTests:
            selectedSpecimenTests && typeof selectedSpecimenTests === 'object'
              ? selectedSpecimenTests
              : {},
          selectedAdditionalTubes: Array.isArray(selectedAdditionalTubes)
            ? selectedAdditionalTubes
            : [],
          unselectedTubes: Array.isArray(unselectedTubes)
            ? unselectedTubes
            : [],
          unselectedTests: Array.isArray(unselectedTests)
            ? unselectedTests
            : [],
        },
      },
    }));
    setSelectedBookingScreen('details');
  }, []);

  const handleBookingAction = useCallback(
    async (action, statusPayload = {}) => {
      if (!selectedBooking) {
        return;
      }

      const didUpdate = await bookings.submitBookingAction({
        booking: selectedBooking,
        action,
        statusPayload,
        localCompletedBooking:
          toStableValue(action).toLowerCase() === 'completed'
            ? buildCompletedBookingForHandover(
                selectedBooking,
                appointmentDetailState,
              )
            : null,
        onLocalBookingUpdate: nextStatusUpdate => {
          setSelectedBooking(previousBooking =>
            previousBooking
              ? {
                  ...previousBooking,
                  status: nextStatusUpdate.status,
                  bookingStatusCode: nextStatusUpdate.bookingStatusCode,
                }
              : previousBooking,
          );
        },
      });

      if (
        didUpdate &&
        ['complete', 'completed', 'cancel', 'cancelled'].includes(
          toStableValue(action).toLowerCase(),
        )
      ) {
        const draftKey = getAppointmentDetailDraftKey(selectedBooking);
        if (draftKey) {
          clearedAppointmentDraftKeysRef.current.add(draftKey);
          setAppointmentDetailDrafts(previousDrafts => {
            if (!Object.prototype.hasOwnProperty.call(previousDrafts, draftKey)) {
              return previousDrafts;
            }

            const nextDrafts = {...previousDrafts};
            delete nextDrafts[draftKey];
            return nextDrafts;
          });
          clearAppointmentDetailDraft(draftKey).catch(() => {});
        }
      }

      return didUpdate;
    },
    [appointmentDetailState, bookings, selectedBooking],
  );

  const handleAddPatient = useCallback(
    async patientPayload => {
      if (!selectedBooking) {
        return false;
      }

      const updatedBookingDetail = await bookings.submitAssignedBookingPatient({
        booking: selectedBooking,
        patient: patientPayload,
      });

      if (updatedBookingDetail) {
        setSelectedBooking(updatedBookingDetail);
        return true;
      }

      return false;
    },
    [bookings, selectedBooking],
  );

  const handleUpdatePatient = useCallback(
    async ({patientId, patient}) => {
      if (!selectedBooking) {
        return false;
      }

      const updatedBookingDetail = await bookings.updateAssignedBookingPatient({
        booking: selectedBooking,
        patientId,
        patient,
      });

      if (updatedBookingDetail) {
        setSelectedBooking(updatedBookingDetail);
        return true;
      }

      return false;
    },
    [bookings, selectedBooking],
  );

  const handleCancelPatient = useCallback(
    async (patient, cancelPayload = {}) => {
      if (!selectedBooking) {
        return false;
      }

      const updatedBookingDetail = await bookings.cancelAssignedBookingPatient({
        booking: selectedBooking,
        patient,
        cancelPayload,
      });

      if (updatedBookingDetail) {
        setSelectedBooking(updatedBookingDetail);
        return true;
      }

      return false;
    },
    [bookings, selectedBooking],
  );

  const handleAddTestForPatient = useCallback(
    async patient => {
      if (!selectedBooking) {
        return false;
      }

      return bookings.addTestForPatient({
        booking: selectedBooking,
        patient,
      });
    },
    [bookings, selectedBooking],
  );

  const handlePanelCompanySelect = useCallback(
    async ({patient, compCatId, panelCompany}) => {
      if (!selectedBooking) {
        return null;
      }

      return bookings.fetchPanelCatalogForCompany({
        booking: selectedBooking,
        patient,
        compCatId,
        panelCompany,
      });
    },
    [bookings, selectedBooking],
  );

  const performLogout = useCallback(async () => {
    setShowLogoutModal(false);
    resetHomeNavigation();
    await Promise.all([session.resetSession(), bookings.clearAssignedState()]);
  }, [bookings, resetHomeNavigation, session]);

  const handleClearAppCache = useCallback(async () => {
    const pendingActionCount = await getPendingOfflineActionCount();
    if (pendingActionCount > 0) {
      throw new Error(
        `${pendingActionCount} pending offline action${
          pendingActionCount > 1 ? 's are' : ' is'
        } still waiting to sync. Please sync them before clearing cache.`,
      );
    }

    await bookings.clearAssignedState();
    setSelectedBooking(null);
    setSelectedBookingScreen('details');
    setSelectedSamplePatient(null);
    setSelectedSamplePanelCompany(null);
    setAppointmentDetailState(buildEmptyAppointmentDetailState());
    setAppointmentDetailDrafts({});
    clearedAppointmentDraftKeysRef.current.clear();
  }, [bookings]);

  const handleClearAllAppData = useCallback(async () => {
    try {
      await clearOfflineBookingStorage();
    } finally {
      await bookings.clearAssignedState();
      resetHomeNavigation();
      setAppointmentDetailDrafts({});
      clearedAppointmentDraftKeysRef.current.clear();
      await session.resetSession();
    }
  }, [bookings, resetHomeNavigation, session]);

  const handleGoBack = useCallback(() => {
    if (selectedBooking && selectedBookingScreen !== 'details') {
      setSelectedSamplePatient(null);
      setSelectedSamplePanelCompany(null);
      setSelectedBookingScreen('details');
      return;
    }

    if (selectedBooking) {
      setSelectedBooking(null);
      setSelectedBookingScreen('details');
      setSelectedSamplePatient(null);
      setSelectedSamplePanelCompany(null);
      return;
    }

    setTabHistory(previousHistory => {
      if (previousHistory.length === 0) {
        setAppointmentsViewMode('default');
        setActiveTab('home');
        return previousHistory;
      }

      const nextHistory = [...previousHistory];
      const previousTab = nextHistory.pop();
      setAppointmentsViewMode(
        previousTab === 'appointments'
          ? lastAppointmentsViewModeRef.current || 'assigned'
          : 'default',
      );
      setActiveTab(previousTab || 'home');
      return nextHistory;
    });
  }, [selectedBooking, selectedBookingScreen]);

  return {
    activeTab,
    bottomTabs,
    contentWidth,
    homeContentWidth,
    horizontalPadding,
    isHomeOverlayVisible,
    isShowingSplash,
    isSmallPhone,
    loadingOverlayMessage: loadingOverlayCopy.message,
    loadingOverlayTitle: loadingOverlayCopy.title,
    location,
    loginBottomSpacing,
    loginTopSpacing,
    appointmentsViewMode,
    appointmentDetailState,
    selectedBooking,
    selectedBookingScreen,
    selectedSamplePatient,
    selectedSamplePanelCompany,
    showLogoutModal,
    startedAppointments,
    tabHistory,
    session,
    bookings,
    actions: {
      handleAddPatient,
      handleAddTestForPatient,
      handleAssignedCardPress,
      handleAssignedViewDetails,
      handleBookingAction,
      handleCancelPatient,
      handleCompletedCardPress,
      handleCollectSample,
      handleClearAllAppData,
      handleClearAppCache,
      handleGoBack,
      handleLoginSubmit,
      handleOpenAddTest,
      handleOpenSampleCollection,
      handlePanelCompanySelect,
      handleRemovePatientSelectedTest,
      handleStartedCardPress,
      handleTabChange,
      handleTogglePatientTestSelection,
      handleUpdatePatient,
      performLogout,
      setShowLogoutModal,
      setAppointmentDetailState,
      setLocalDatabaseLoadingMessage,
      setSelectedBookingScreen,
    },
  };
};
