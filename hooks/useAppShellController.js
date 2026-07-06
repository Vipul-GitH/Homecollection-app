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
  getStandardDiscountPercent as getPricingStandardDiscountPercent,
  getTestPricing,
} from '../utils/bookings/pricing';
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

const isTruthyFlag = value => {
  const normalizedValue = toStableValue(value).toLowerCase();
  return value === true || ['1', 'true', 'yes', 'y'].includes(normalizedValue);
};

const getShowMrpValue = (...sources) => {
  for (const source of sources) {
    const value =
      source?.showmrp ??
      source?.showMrp ??
      source?.show_mrp ??
      source?.ShowMRP ??
      source?.showMRP;

    if (value !== null && value !== undefined && toStableValue(value) !== '') {
      return isTruthyFlag(value) ? 1 : 0;
    }
  }

  return 0;
};

const getTestStandardDiscountPercent = test => {
  return getPricingStandardDiscountPercent(test);
};

const getDiscountedTestPrice = test => {
  return getTestPricing(test).charge;
};

const getAppointmentDetailDraftKey = booking =>
  toStableValue(
    booking?.id ||
      booking?.bookingId ||
      booking?.booking_id ||
      booking?.appointmentId ||
      booking?.appointment_id,
  );

const shouldUseBackendAppointmentPrices = booking =>
  toStableValue(booking?.sourceType || booking?.source_type).toUpperCase() ===
    'APPOINTMENT' ||
  Boolean(toStableValue(booking?.appointmentId || booking?.appointment_id));

const getAppointmentDetailDraftKeys = booking => {
  const keys = [
    booking?.id,
    booking?.bookingId,
    booking?.booking_id,
  ]
    .map(toStableValue)
    .filter(Boolean);

  return Array.from(new Set(keys));
};

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
        showmrp: 0,
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
  (Array.isArray(patient?.tests) ? patient.tests : []).map((test, index) => {
    const resolvedPanelCompany = findApiPanelCompanyForTest(
      patient,
      test,
      panelCompany,
    );
    const selectedChargeMode =
      test?.selected_charge_mode ||
      test?.selectedChargeMode ||
      resolvedPanelCompany?.billingChargeMode ||
      resolvedPanelCompany?.chargeMode ||
      '';
    const showmrp = getShowMrpValue(test, resolvedPanelCompany);
    const mrp = Number(test?.mrp || test?.charge || test?.amount || 0) || 0;
    const backendCharge = Number(test?.charge || test?.Charge || 0) || 0;
    const pricedTest = {
      ...test,
      mrp,
      selected_charge_mode: selectedChargeMode,
      showmrp,
    };

    return {
      key: `seed|${
        test?.bookingTestId ||
        test?.booking_test_id ||
        test?.bookingTestID ||
        test?.booking_test ||
        index
      }|${test?.code || test?.booked_code || 'na'}|${
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
      selected_charge_mode: selectedChargeMode,
      showmrp,
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
      mrp,
      charge: backendCharge > 0 ? backendCharge : getDiscountedTestPrice(pricedTest),
      percentageonstandard: getTestStandardDiscountPercent(pricedTest),
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
    const selectedChargeMode =
      test?.selected_charge_mode ||
      test?.selectedChargeMode ||
      panelCompany?.billingChargeMode ||
      panelCompany?.chargeMode ||
      panelCompany?.BillingChargeMode ||
      '';
    const showmrp = getShowMrpValue(test, panelCompany);
    const mrp = Number(test?.mrp || test?.charge || test?.amount || 0) || 0;
    const pricedTest = {
      ...test,
      mrp,
      selected_charge_mode: selectedChargeMode,
      showmrp,
    };

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
      selected_charge_mode: selectedChargeMode,
      showmrp,
      panelCompanyId,
      centerId,
      atype,
      panelCode,
      panelAbarid,
      catalog_key:
        test?.catalog_key ||
        [panelCompanyId, test?.gcode || '', test?.scode || '', test?.booked_code || test?.code || '']
          .join('|'),
      mrp,
      charge: getDiscountedTestPrice(pricedTest),
      percentageonstandard: getTestStandardDiscountPercent(pricedTest),
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
          showmrp: getShowMrpValue(localMatch),
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
      showmrp: getShowMrpValue(bestMatch),
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
  explicitlyRemovedSeedTestIdentitiesMap: {},
  patientReportCourierMap: {},
  patientReportScheduleMap: {},
  patientSampleCollectionMap: {},
  patientTestBookingStatusMap: {},
  patientCghsEnabledMap: {},
  patientCghsIdMap: {},
  patientCghsDocumentsMap: {},
  patientCancellationMap: {},
  patientAdditionalDiscountMap: {},
  patientReferredByOverrideMap: {},
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
  });

  return state;
};

const stripPrecomputedSampleCollectionMap = sampleCollectionMap => {
  if (!sampleCollectionMap || typeof sampleCollectionMap !== 'object') {
    return {};
  }

  return Object.fromEntries(
    Object.entries(sampleCollectionMap).map(([patientId, patientState]) => [
      patientId,
      patientState && typeof patientState === 'object'
        ? Object.fromEntries(
            Object.entries(patientState).filter(
              ([key]) => key !== 'precomputedSampleTubeData',
            ),
          )
        : patientState,
    ]),
  );
};

const getCollectedTubeNames = (patient, sampleCollection) => {
  const getTubeName = tube =>
    typeof tube === 'string'
      ? toStableValue(tube)
      : toStableValue(
          tube?.tubeName ||
            tube?.tube_name ||
            tube?.name ||
            tube?.specimenName ||
            tube?.specimen_name ||
            tube?.label ||
            tube?.value,
        );
  const mergeTubeNames = tubeList => {
    const seenTubeNames = new Set();
    const mergedTubeNames = [];

    tubeList.forEach(tube => {
      const normalizedTubeName = getTubeName(tube);
      const tubeKey = normalizedTubeName.toLowerCase();

      if (!normalizedTubeName || seenTubeNames.has(tubeKey)) {
        return;
      }

      seenTubeNames.add(tubeKey);
      mergedTubeNames.push(normalizedTubeName);
    });

    return mergedTubeNames;
  };
  const appendAdditionalTubeNames = tubeList =>
    [
      ...tubeList,
      ...selectedAdditionalTubes.map(getTubeName).filter(Boolean),
    ];
  const selectedTubes = Array.isArray(sampleCollection?.selectedTubes)
    ? sampleCollection.selectedTubes
    : [];
  const selectedAdditionalTubes = Array.isArray(
    sampleCollection?.selectedAdditionalTubes,
  )
    ? sampleCollection.selectedAdditionalTubes
    : [];

  if (selectedTubes.length) {
    return appendAdditionalTubeNames(mergeTubeNames(selectedTubes));
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
    return appendAdditionalTubeNames(mergeTubeNames(tubeSummaryNames));
  }

  return appendAdditionalTubeNames(
    mergeTubeNames(
      (Array.isArray(patient?.tubes) ? patient.tubes : [])
        .map(getTubeName),
    ),
  );
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

const normalizeDraftState = draftState => {
  if (!draftState || typeof draftState !== 'object') {
    return {};
  }

  return draftState.data && typeof draftState.data === 'object'
    ? {
        ...draftState.data,
        explicitlyRemovedSeedTestIdentitiesMap:
          draftState.explicitlyRemovedSeedTestIdentitiesMap ||
          draftState.data.explicitlyRemovedSeedTestIdentitiesMap ||
          {},
      }
    : draftState;
};

const mergeAppointmentDetailStateWithDraft = (
  seedState,
  draftState,
  {ignoreDraftTests = false} = {},
) => {
  const seed = seedState || buildEmptyAppointmentDetailState();
  const draft = normalizeDraftState(draftState);
  const mergedPatientSelectedTestsMap = {...(seed.patientSelectedTestsMap || {})};
  const draftSelectedTestsMap = ignoreDraftTests
    ? {}
    : draft.patientSelectedTestsMap || {};
  const explicitlyRemovedSeedTestIdentitiesMap = ignoreDraftTests
    ? {}
    : draft.explicitlyRemovedSeedTestIdentitiesMap || {};

  if (!ignoreDraftTests) {
    Array.from(
      new Set([
        ...Object.keys(draftSelectedTestsMap),
        ...Object.keys(explicitlyRemovedSeedTestIdentitiesMap),
      ]),
    ).forEach(patientId => {
      const seedTests = seed.patientSelectedTestsMap?.[patientId] || [];
      const removedIdentities = new Set(
        explicitlyRemovedSeedTestIdentitiesMap[patientId] || [],
      );
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
  }

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
    explicitlyRemovedSeedTestIdentitiesMap,
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
    patientCompletionDocumentsMap: {
      ...(seed.patientCompletionDocumentsMap || {}),
      ...(draft.patientCompletionDocumentsMap || {}),
    },
    patientManualSlipDocumentsMap: {
      ...(seed.patientManualSlipDocumentsMap || {}),
      ...(draft.patientManualSlipDocumentsMap || {}),
    },
    patientCancellationMap: {
      ...(seed.patientCancellationMap || {}),
      ...(draft.patientCancellationMap || {}),
    },
    patientAdditionalDiscountMap: {
      ...(seed.patientAdditionalDiscountMap || {}),
      ...(draft.patientAdditionalDiscountMap || {}),
    },
    patientReferredByOverrideMap: {
      ...(seed.patientReferredByOverrideMap || {}),
      ...(draft.patientReferredByOverrideMap || {}),
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

const mergeAppointmentDetailStateWithFreshBooking = (
  seedState,
  currentState,
  options,
) =>
  mergeAppointmentDetailStateWithDraft(seedState, {
    ...(currentState || {}),
    explicitlyRemovedSeedTestIdentitiesMap:
      currentState?.explicitlyRemovedSeedTestIdentitiesMap || {},
  }, options);

const buildAppointmentDetailDraftForStorage = ({state}) => {
  const safeState = state || buildEmptyAppointmentDetailState();
  const draftSelectedTestsMap = {};
  const explicitlyRemovedSeedTestIdentitiesMap =
    safeState.explicitlyRemovedSeedTestIdentitiesMap || {};

  Object.keys(safeState.patientSelectedTestsMap || {}).forEach(patientId => {
    const currentTests = safeState.patientSelectedTestsMap[patientId] || [];
    const appAddedTests = currentTests.filter(test => Boolean(test?.isAppAdded));

    if (appAddedTests.length) {
      draftSelectedTestsMap[patientId] = appAddedTests;
    }
  });

  return {
    version: 3,
    updatedAt: new Date().toISOString(),
    explicitlyRemovedSeedTestIdentitiesMap,
    data: {
      patientApiPanelCompaniesMap: safeState.patientApiPanelCompaniesMap || {},
      patientPanelCompaniesMap: safeState.patientPanelCompaniesMap || {},
      activePatientPanelCompanyMap: safeState.activePatientPanelCompanyMap || {},
      patientSelectedTestsMap: draftSelectedTestsMap,
      patientReportCourierMap: safeState.patientReportCourierMap || {},
      patientReportScheduleMap: safeState.patientReportScheduleMap || {},
      patientSampleCollectionMap: stripPrecomputedSampleCollectionMap(
        safeState.patientSampleCollectionMap,
      ),
      patientTestBookingStatusMap: safeState.patientTestBookingStatusMap || {},
      patientCghsEnabledMap: safeState.patientCghsEnabledMap || {},
      patientCghsIdMap: safeState.patientCghsIdMap || {},
      patientCghsDocumentsMap: safeState.patientCghsDocumentsMap || {},
      patientCompletionDocumentsMap:
        safeState.patientCompletionDocumentsMap || {},
      patientManualSlipDocumentsMap:
        safeState.patientManualSlipDocumentsMap || {},
      patientCancellationMap: safeState.patientCancellationMap || {},
      patientAdditionalDiscountMap: safeState.patientAdditionalDiscountMap || {},
      patientReferredByOverrideMap: safeState.patientReferredByOverrideMap || {},
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

const serializeAppointmentDetailDraft = draft =>
  JSON.stringify({
    data: draft?.data || {},
    explicitlyRemovedSeedTestIdentitiesMap:
      draft?.explicitlyRemovedSeedTestIdentitiesMap || {},
  });

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
  bookingActionProgressLabel,
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
    ? bookingActionProgressLabel || 'Updating the booking status...'
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
  const [screenTransitionOverlay, setScreenTransitionOverlay] = useState(null);
  const [appointmentDetailState, setAppointmentDetailState] = useState(
    buildEmptyAppointmentDetailState,
  );
  const [appointmentDetailDrafts, setAppointmentDetailDrafts] = useState({});
  const [appointmentsViewMode, setAppointmentsViewMode] = useState('default');
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [isShowingSplash, setIsShowingSplash] = useState(true);
  const isAppointmentDetailStateHydratedRef = useRef(false);
  const clearedAppointmentDraftKeysRef = useRef(new Set());
  const appointmentDraftUpdateTimerRef = useRef(null);
  const screenTransitionTimerRef = useRef(null);
  const latestDraftSignatureByKeyRef = useRef({});
  const lastAppointmentsViewModeRef = useRef('assigned');
  const {width, height} = useWindowDimensions();
  const session = useSessionAuth();
  const location = useLocationGate();
  const bookings = useAssignedBookings({
    accessToken: session.accessToken,
    loggedInUser: session.loggedInUser,
    onSessionExpired: session.resetSession,
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

  const beginScreenTransition = useCallback(
    (title, message, minimumVisibleMs = 320) => {
      const overlayId = `${Date.now()}-${Math.random()}`;
      const startedAt = Date.now();
      const normalizedMessage =
        message === undefined
          ? 'Preparing the next screen for you...'
          : toStableValue(message);

      if (screenTransitionTimerRef.current) {
        clearTimeout(screenTransitionTimerRef.current);
        screenTransitionTimerRef.current = null;
      }

      setScreenTransitionOverlay({
        id: overlayId,
        title: toStableValue(title) || 'Opening Screen',
        message: normalizedMessage,
      });

      return () => {
        const remainingTime = Math.max(
          0,
          minimumVisibleMs - (Date.now() - startedAt),
        );

        if (screenTransitionTimerRef.current) {
          clearTimeout(screenTransitionTimerRef.current);
        }

        screenTransitionTimerRef.current = setTimeout(() => {
          setScreenTransitionOverlay(currentOverlay =>
            currentOverlay?.id === overlayId ? null : currentOverlay,
          );
          screenTransitionTimerRef.current = null;
        }, remainingTime);
      };
    },
    [],
  );

  const isHomeOverlayVisible =
    Boolean(screenTransitionOverlay) ||
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
    : screenTransitionOverlay
    ? {
        title: screenTransitionOverlay.title,
        message: screenTransitionOverlay.message,
      }
    : getLoadingOverlayCopy({
        appointmentsViewMode,
        isLoadingCompletedAppointments: bookings.isLoadingCompletedAppointments,
        loadingAssignedBookingId: bookings.loadingAssignedBookingId,
        bookingActionLoading: bookings.bookingActionLoading,
        bookingActionProgressLabel: bookings.bookingActionProgressLabel,
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

  useEffect(
    () => () => {
      if (screenTransitionTimerRef.current) {
        clearTimeout(screenTransitionTimerRef.current);
      }
    },
    [],
  );

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
          latestDraftSignatureByKeyRef.current = Object.fromEntries(
            Object.entries(cachedDrafts).map(([draftKey, draftValue]) => [
              draftKey,
              serializeAppointmentDetailDraft(draftValue),
            ]),
          );
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

    if (appointmentDraftUpdateTimerRef.current) {
      clearTimeout(appointmentDraftUpdateTimerRef.current);
    }

    appointmentDraftUpdateTimerRef.current = setTimeout(() => {
      const nextDraft = buildAppointmentDetailDraftForStorage({
        state: appointmentDetailState,
        selectedBooking,
      });
      const nextDraftSignature = serializeAppointmentDetailDraft(nextDraft);

      if (
        latestDraftSignatureByKeyRef.current[draftKey] === nextDraftSignature
      ) {
        return;
      }

      latestDraftSignatureByKeyRef.current = {
        ...latestDraftSignatureByKeyRef.current,
        [draftKey]: nextDraftSignature,
      };

      setAppointmentDetailDrafts(previousDrafts => ({
        ...previousDrafts,
        [draftKey]: nextDraft,
      }));
    }, 250);

    return () => {
      if (appointmentDraftUpdateTimerRef.current) {
        clearTimeout(appointmentDraftUpdateTimerRef.current);
        appointmentDraftUpdateTimerRef.current = null;
      }
    };
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
      const finishScreenTransition = beginScreenTransition(
        viewMode === 'completed'
          ? 'Opening Completed Appointments'
          : viewMode === 'started'
          ? 'Opening Started Appointments'
          : 'Opening Assigned Appointments',
        'Getting the latest booking list ready...',
      );

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
        finishScreenTransition();
        return;
      }

      try {
        await fetcher();
      } finally {
        finishScreenTransition();
      }
    },
    [beginScreenTransition, session.accessToken],
  );

  const handleTabChange = useCallback(
    async nextTab => {
      if (nextTab === activeTab) {
        return;
      }

      const finishScreenTransition = beginScreenTransition(
        nextTab === 'saved'
          ? 'Opening Handover'
          : nextTab === 'profile'
          ? 'Opening Profile'
          : nextTab === 'appointments'
          ? 'Opening Appointments'
          : 'Opening Dashboard',
        'Switching screens...',
      );

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
          finishScreenTransition();
          return;
        }

        try {
          await bookings.fetchAssignedAppointments();
        } finally {
          finishScreenTransition();
        }
        return;
      }

      if (nextTab === 'saved') {
        setAppointmentsViewMode('default');
        setTabHistory(previousHistory => [...previousHistory, activeTab]);
        setActiveTab(nextTab);

        if (session.accessToken) {
          try {
            await bookings.fetchCompletedAppointments();
          } finally {
            finishScreenTransition();
          }
          return;
        }

        finishScreenTransition();
        return;
      }

      setAppointmentsViewMode('default');
      setTabHistory(previousHistory => [...previousHistory, activeTab]);
      setActiveTab(nextTab);
      finishScreenTransition();
    },
    [activeTab, beginScreenTransition, bookings, session.accessToken],
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
      const finishScreenTransition = beginScreenTransition(
        'Opening Appointment',
        '',
        420,
      );
      let bookingDetail = null;
      const buildFinalBooking = detail => {
        const terminalStatusFromList = getTerminalBookingStatus(booking);

        return {
          ...detail,
          ...(terminalStatusFromList || {}),
          sourceType:
            detail?.sourceType ||
            detail?.source_type ||
            booking?.sourceType ||
            booking?.source_type ||
            (detail?.appointmentId ||
            detail?.appointment_id ||
            booking?.appointmentId ||
            booking?.appointment_id
              ? 'APPOINTMENT'
              : 'BOOKING'),
          appointmentId:
            detail?.appointmentId ||
            detail?.appointment_id ||
            booking?.appointmentId ||
            booking?.appointment_id ||
            '',
        };
      };
      const applyFreshBookingDetail = freshBookingDetail => {
        if (!freshBookingDetail) {
          return;
        }

        const freshBooking = buildFinalBooking(freshBookingDetail);
        const freshDraftKey = getAppointmentDetailDraftKey(freshBooking);
        const freshCachedDraft = freshDraftKey
          ? appointmentDetailDrafts[freshDraftKey]
          : null;

        setSelectedBooking(previousBooking => {
          if (!previousBooking) {
            return previousBooking;
          }

          const previousKey = getAppointmentDetailDraftKey(previousBooking);
          const freshKey = getAppointmentDetailDraftKey(freshBooking);
          return previousKey && freshKey && previousKey === freshKey
            ? freshBooking
            : previousBooking;
        });
        setAppointmentDetailState(previousState =>
          mergeAppointmentDetailStateWithFreshBooking(
            buildAppointmentDetailStateFromBooking(freshBooking),
            previousState || freshCachedDraft,
            {ignoreDraftTests: true},
          ),
        );

        if (!shouldUseBackendAppointmentPrices(freshBooking)) {
          getLocalBookingTestPricesResponse(
            buildBookingTestPriceRequests(freshBooking),
          )
            .then(priceResponse => {
              if (!priceResponse?.ok) {
                return;
              }

              const pricedBooking = mergeBookingTestsWithLocalPrices(
                freshBooking,
                priceResponse,
              );
              setSelectedBooking(previousBooking => {
                const previousKey = getAppointmentDetailDraftKey(previousBooking);
                const freshKey = getAppointmentDetailDraftKey(pricedBooking);
                return previousKey && freshKey && previousKey === freshKey
                  ? pricedBooking
                  : previousBooking;
              });
              setAppointmentDetailState(previousState =>
                mergeAppointmentDetailStateWithFreshBooking(
                  buildAppointmentDetailStateFromBooking(pricedBooking),
                  previousState,
                  {ignoreDraftTests: true},
                ),
              );
            })
            .catch(() => {});
        }
      };

      try {
        bookingDetail = await bookings.openAssignedBooking(booking, {
          onFreshBookingDetail: applyFreshBookingDetail,
          useHistoryDetail: appointmentsViewMode === 'completed',
        });
      } finally {
        finishScreenTransition();
      }

      if (bookingDetail) {
        const finalBooking = buildFinalBooking(bookingDetail);
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
            {ignoreDraftTests: true},
          ),
        );

        if (!shouldUseBackendAppointmentPrices(finalBooking)) {
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
                  {ignoreDraftTests: true},
                ),
              );
            })
            .catch(() => {});
        }
      }
    },
    [
      appointmentDetailDrafts,
      appointmentsViewMode,
      beginScreenTransition,
      bookings,
    ],
  );

  const handleOpenSampleCollection = useCallback(
    (patient, panelCompany = null) => {
      if (!selectedBooking || !patient) {
        return;
      }

      const finishScreenTransition = beginScreenTransition(
        'Opening Sample Collection',
        'Preparing specimen and tube mapping...',
        420,
      );

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
      finishScreenTransition();

      if (!resolvedPanelCompany) {
        resolvePanelCompanyFromPatientName(patient)
          .then(applyResolvedPanelCompany)
          .catch(() => {});
      }
    },
    [beginScreenTransition, selectedBooking],
  );

  const handleOpenAddTest = useCallback(
    (patient, panelCompany) => {
      if (!selectedBooking || !patient || !panelCompany) {
        return;
      }

      const finishScreenTransition = beginScreenTransition(
        'Opening Add Test',
        'Preparing panel companies and test catalog...',
        360,
      );

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
      finishScreenTransition();

      resolvePanelCompanyFromPatientName(patient)
        .then(resolvedPanelCompany => {
          if (!resolvedPanelCompany) {
            return;
          }

          const selectedPanelCompCatId = toStableValue(panelCompany?.compCatId);
          const resolvedPanelCompCatId = toStableValue(resolvedPanelCompany?.compCatId);
          const selectedPanelName = toStableValue(panelCompany?.name).toLowerCase();
          const resolvedPanelName = toStableValue(resolvedPanelCompany?.name).toLowerCase();
          const isSamePanel =
            (selectedPanelCompCatId &&
              resolvedPanelCompCatId &&
              selectedPanelCompCatId === resolvedPanelCompCatId) ||
            (selectedPanelName &&
              resolvedPanelName &&
              selectedPanelName === resolvedPanelName);

          if (!isSamePanel) {
            return;
          }

          const enrichedPanelCompany = {
            ...panelCompany,
            ...resolvedPanelCompany,
            id: panelCompany?.id || resolvedPanelCompany?.id,
            chipId: panelCompany?.chipId || resolvedPanelCompany?.chipId,
            chipSource: panelCompany?.chipSource || resolvedPanelCompany?.chipSource,
            showmrp: getShowMrpValue(panelCompany, resolvedPanelCompany),
            billingChargeMode:
              panelCompany?.billingChargeMode ||
              resolvedPanelCompany?.billingChargeMode ||
              '',
            chargeMode:
              panelCompany?.chargeMode ||
              resolvedPanelCompany?.chargeMode ||
              resolvedPanelCompany?.billingChargeMode ||
              '',
          };

          setSelectedSamplePanelCompany(previousPanelCompany => {
            const previousCompCatId = toStableValue(previousPanelCompany?.compCatId);
            const previousName = toStableValue(previousPanelCompany?.name).toLowerCase();
            const stillSamePanel =
              (selectedPanelCompCatId &&
                previousCompCatId &&
                selectedPanelCompCatId === previousCompCatId) ||
              (selectedPanelName && previousName && selectedPanelName === previousName);

            return stillSamePanel ? enrichedPanelCompany : previousPanelCompany;
          });
        })
        .catch(() => {});
    },
    [beginScreenTransition, selectedBooking],
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
        {
          ...selectedCatalogTest,
          selected_charge_mode:
            panelCompany?.billingChargeMode ||
            panelCompany?.chargeMode ||
            panelCompany?.BillingChargeMode ||
            '',
          showmrp: getShowMrpValue(selectedCatalogTest, panelCompany),
        },
      );
      const selectedDiscountedPrice = getDiscountedTestPrice({
        ...selectedCatalogTest,
        mrp: selectedMrp,
        percentageonstandard: selectedStandardDiscount,
        selected_charge_mode:
          panelCompany?.billingChargeMode ||
          panelCompany?.chargeMode ||
          panelCompany?.BillingChargeMode ||
          '',
        showmrp: getShowMrpValue(selectedCatalogTest, panelCompany),
      });
      const selectedPricing = getTestPricing({
        ...selectedCatalogTest,
        mrp: selectedMrp,
        selected_charge_mode:
          panelCompany?.billingChargeMode ||
          panelCompany?.chargeMode ||
          panelCompany?.BillingChargeMode ||
          '',
        showmrp: getShowMrpValue(selectedCatalogTest, panelCompany),
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
        showmrp: getShowMrpValue(panelCompany),
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
        max_discount: selectedPricing.maxDiscount,
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
        const selectedExistingTest = previousTests.find(
          item =>
            item.key === key ||
            (toStableValue(item?.panelCompanyId) === selectedPanelCompanyId &&
              getTestDedupeKey(item) === selectedDedupeKey),
        );
        const explicitRemovals = {
          ...(previousState?.explicitlyRemovedSeedTestIdentitiesMap || {}),
        };

        if (alreadySelected && !selectedExistingTest?.isAppAdded) {
          explicitRemovals[patientId] = Array.from(
            new Set([
              ...(explicitRemovals[patientId] || []),
              getTestSelectionIdentity(selectedExistingTest),
            ]),
          );
        } else if (!alreadySelected) {
          const restoredIdentity = getTestSelectionIdentity(nextEntry);
          const remainingRemovals = (explicitRemovals[patientId] || []).filter(
            identity => identity !== restoredIdentity,
          );

          if (remainingRemovals.length) {
            explicitRemovals[patientId] = remainingRemovals;
          } else {
            delete explicitRemovals[patientId];
          }
        }

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
          explicitlyRemovedSeedTestIdentitiesMap: explicitRemovals,
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
      const removeIndex = previousTests.findIndex(item => item.key === testKey);
      const removedTest = removeIndex >= 0 ? previousTests[removeIndex] : null;
      const nextTests =
        removeIndex >= 0
          ? previousTests.filter((item, index) => index !== removeIndex)
          : previousTests;
      const explicitRemovals = {
        ...(previousState?.explicitlyRemovedSeedTestIdentitiesMap || {}),
      };

      if (removedTest && !removedTest.isAppAdded) {
        explicitRemovals[patientId] = Array.from(
          new Set([
            ...(explicitRemovals[patientId] || []),
            getTestSelectionIdentity(removedTest),
          ]),
        );
      }

      return {
        ...previousState,
        patientSelectedTestsMap: {
          ...previousMap,
          [patientId]: nextTests,
        },
        explicitlyRemovedSeedTestIdentitiesMap: explicitRemovals,
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
        const draftKeys = getAppointmentDetailDraftKeys(selectedBooking);
        if (draftKeys.length) {
          draftKeys.forEach(draftKey => {
            clearedAppointmentDraftKeysRef.current.add(draftKey);
          });
          const nextSignatures = {
            ...latestDraftSignatureByKeyRef.current,
          };
          draftKeys.forEach(draftKey => {
            delete nextSignatures[draftKey];
          });
          latestDraftSignatureByKeyRef.current = nextSignatures;
          setAppointmentDetailDrafts(previousDrafts => {
            const nextDrafts = {...previousDrafts};
            let didRemoveDraft = false;

            draftKeys.forEach(draftKey => {
              if (Object.prototype.hasOwnProperty.call(nextDrafts, draftKey)) {
                delete nextDrafts[draftKey];
                didRemoveDraft = true;
              }
            });

            return didRemoveDraft ? nextDrafts : previousDrafts;
          });
          draftKeys.forEach(draftKey => {
            clearAppointmentDetailDraft(draftKey).catch(() => {});
          });
        }
      }

      return didUpdate;
    },
    [appointmentDetailState, bookings, selectedBooking],
  );

  const handleBookingCompletedNavigation = useCallback(async () => {
    const finishScreenTransition = beginScreenTransition(
      'Opening Completed Appointments',
      'Refreshing completed bookings...',
      420,
    );

    setSelectedBooking(null);
    setSelectedBookingScreen('details');
    setSelectedSamplePatient(null);
    setSelectedSamplePanelCompany(null);
    setAppointmentDetailState(buildEmptyAppointmentDetailState());
    setAppointmentsViewMode('completed');
    setActiveTab('appointments');

    if (!session.accessToken) {
      bookings.setCompletedAppointmentsError(
        bookings.completedAppointments.length
          ? ''
          : 'A valid login token is required before opening completed appointments.',
      );
      finishScreenTransition();
      return;
    }

    try {
      await bookings.fetchCompletedAppointments();
    } finally {
      finishScreenTransition();
    }
  }, [beginScreenTransition, bookings, session.accessToken]);

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

  const handleUpdateBookingAddress = useCallback(
    async addressPayload => {
      if (!selectedBooking) {
        return false;
      }

      const updatedBookingDetail = await bookings.updateAssignedBookingAddress({
        booking: selectedBooking,
        addressPayload,
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
    async ({
      patient,
      compCatId,
      panelCompany,
      catalogLevel,
      gcode,
      scode,
      query,
    }) => {
      if (!selectedBooking) {
        return null;
      }

      return bookings.fetchPanelCatalogForCompany({
        booking: selectedBooking,
        patient,
        compCatId,
        panelCompany,
        catalogLevel,
        gcode,
        scode,
        query,
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
    latestDraftSignatureByKeyRef.current = {};
  }, [bookings]);

  const handleClearAllAppData = useCallback(async () => {
    try {
      await clearOfflineBookingStorage();
    } finally {
      await bookings.clearAssignedState();
      resetHomeNavigation();
      setAppointmentDetailDrafts({});
      clearedAppointmentDraftKeysRef.current.clear();
      latestDraftSignatureByKeyRef.current = {};
      await session.resetSession();
    }
  }, [bookings, resetHomeNavigation, session]);

  const handleGoBack = useCallback(() => {
    if (bookings.isBookingActionNavigationLocked) {
      return;
    }

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
  }, [bookings.isBookingActionNavigationLocked, selectedBooking, selectedBookingScreen]);

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
      handleBookingCompletedNavigation,
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
      handleUpdateBookingAddress,
      handleUpdatePatient,
      performLogout,
      setShowLogoutModal,
      setAppointmentDetailState,
      setLocalDatabaseLoadingMessage,
      setSelectedBookingScreen,
    },
  };
};
