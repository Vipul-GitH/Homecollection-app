import React, {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  InteractionManager,
  Linking,
  NativeModules,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import AppAlertModal from '../../components/common/AppAlertModal';
import AddressEditScreen from '../../components/bookings/appointmentDetails/AddressEditScreen';
import AddPatientModal from '../../components/bookings/appointmentDetails/AddPatientModal';
import BookingDetailOverview from '../../components/bookings/appointmentDetails/BookingDetailOverview';
import CancelBookingModal from '../../components/bookings/appointmentDetails/CancelBookingModal';
import CompleteBookingScreen from '../../components/bookings/appointmentDetails/CompleteBookingScreen';
import OptionSelectModal from '../../components/bookings/appointmentDetails/OptionSelectModal';
import PanelCompanyFlowScreen from '../../components/bookings/appointmentDetails/PanelCompanyFlowScreen';
import PatientSelectorSection from '../../components/bookings/appointmentDetails/PatientSelectorSection';
import ReportDeliverySection, {
  normalizeReportDeliveryValues,
} from '../../components/bookings/appointmentDetails/ReportDeliverySection';
import {
  CATALOG_ITEM_PAGE_SIZE,
  EDITABLE_GENDER_TITLES,
  INITIAL_PATIENT_FORM,
  PANEL_COMPANY_DEFAULT_VISIBLE,
  PANEL_COMPANY_SEARCH_VISIBLE_LIMIT,
  TITLE_OPTIONS,
} from './appointmentDetails/constants';
import CalendarPickerModal from './appointmentDetails/CalendarPickerModal';
import {
  sortCatalogGroupsById,
  sortCatalogTestsByCode,
} from './appointmentDetails/catalogHelpers';
import {
  calculateAgeFromDob,
  buildApiPanelCompaniesFromPatient,
  getCalendarDays,
  getGenderFromTitle,
  getPatientMutationId,
  getUpdatePatientId,
  getUploadFileName,
  normalizeFormText,
  normalizeMobileValue,
  normalizeOptionValue,
  normalizePanelCompanyItems,
  toDateInputValue,
} from './appointmentDetails/helpers';
import {
  COMPLETE_PAYMENT_MODE_OPTIONS,
  createCompletePaymentEntry,
  normalizeCompletePaymentDrafts,
} from './appointmentDetails/paymentDrafts';
import {
  buildLocalBillingSummary,
  getCompleteBillingAmounts,
  getPatientSeedAdditionalDiscountTotal,
  getPreloadedAdditionalDiscount,
  hasBackendPatientLevelAdditionalDiscounts,
} from './appointmentDetails/billingSummaryHelpers';
import {getAppointmentDetailsBillingValidationError} from './appointmentDetails/billingValidationHelpers';
import {
  DEFAULT_TEST_BOOKING_STATUS,
  EMPTY_UPLOAD_DOCUMENTS,
  getApiTestBookingStatusValue,
  isManualHcSlipSelected,
  isPatientTerminalForCompletion,
  normalizeStoredUploadDocuments,
  normalizeUploadDocuments,
} from './appointmentDetails/completeBookingHelpers';
import SelectedPatientAppointmentSection from './appointmentDetails/SelectedPatientAppointmentSection';
import {
  areSampleTubeListsEqual,
  buildSampleTubeRootTests,
  getSampleTubeMappingCacheKey,
  mergeSampleTubeMaps,
  normalizeTestsForSampleTubeMapping,
} from './appointmentDetails/sampleTubeHelpers';
import {warnDebug} from '../../utils/app/logger';
import {
  getLocalPanelCompaniesByAtypeResponse,
  getLocalPanelCompaniesResponse,
  getLocalPatientTagsResponse,
} from '../../services/local/panelCatalogLocal';
import {
  getLocalAddressCitiesResponse,
  getLocalAddressColoniesByCityResponse,
  getLocalAddressRoutesByPincodeResponse,
} from '../../services/local/addressLookupLocal';
import {
  buildSampleTubeMapsFromTests,
  collectUniqueTubesForSelectedTests,
} from '../../utils/bookings/sampleTubeMapping';
import {
  sampleTubeMappingCache,
  sampleTubeMappingRequests,
} from '../../utils/bookings/sampleTubeMappingCache';
const {CatalogDatabaseModule, LocalDocumentPickerModule, LocalGeoCameraModule} =
  NativeModules;
const SAMPLE_TUBE_PRECOMPUTE_TIMEOUT_MS = 7000;

const withSampleTubePrecomputeTimeout = (promise, timeoutMs) =>
  new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      const timeoutError = new Error('SAMPLE_TUBE_PRECOMPUTE_TIMEOUT');
      timeoutError.code = 'SAMPLE_TUBE_PRECOMPUTE_TIMEOUT';
      reject(timeoutError);
    }, timeoutMs);

    promise
      .then(result => {
        clearTimeout(timeoutId);
        resolve(result);
      })
      .catch(error => {
        clearTimeout(timeoutId);
        reject(error);
      });
  });

const normalizePatientTagValues = value => {
  if (Array.isArray(value)) {
    return Array.from(
      new Set(value.map(item => normalizeFormText(item)).filter(Boolean)),
    );
  }

  return Array.from(
    new Set(
      normalizeFormText(value)
        .split(',')
        .map(item => normalizeFormText(item))
        .filter(Boolean),
    ),
  );
};

const serializePatientTags = tags =>
  normalizePatientTagValues(tags).join(', ');

const normalizeAppAlertArgs = (
  titleOrMessage,
  messageOrButtons,
  buttonsOrOptions,
  options,
) => {
  const hasMessage = typeof messageOrButtons === 'string';
  const title = String(titleOrMessage || '');
  const message = hasMessage ? messageOrButtons : '';
  const actions = Array.isArray(hasMessage ? buttonsOrOptions : messageOrButtons)
    ? hasMessage
      ? buttonsOrOptions
      : messageOrButtons
    : [{text: 'OK'}];
  const alertOptions =
    (hasMessage ? options : buttonsOrOptions) &&
    !Array.isArray(hasMessage ? options : buttonsOrOptions)
      ? hasMessage
        ? options
        : buttonsOrOptions
      : {};

  return {
    title: hasMessage ? title : '',
    message: hasMessage ? message : title,
    actions,
    cancelable: Boolean(alertOptions?.cancelable),
    onDismiss: alertOptions?.onDismiss,
  };
};

const CANCELLATION_REASON_OPTIONS = [
  'Patient requested cancellation',
  'Duplicate / wrong booking created',
  'Operational inability to service',
  'Address not serviceable',
  'Doctor / company cancelled request',
  'Billing / approval issue',
  'Test no longer required',
  'Phlebotomist delay',
  'phlebo not able to collect sample',
  'High charges / booked at another lab',
];
const CANCEL_TIME_SLOT_OPTIONS = [
  '07:30 AM to 08:00 AM',
  '08:00 AM to 08:30 AM',
  '08:30 AM to 09:00 AM',
  '09:00 AM to 09:30 AM',
  '09:30 AM to 10:00 AM',
  '10:00 AM to 10:30 AM',
  '10:30 AM to 11:00 AM',
  '11:00 AM to 11:30 AM',
  '11:30 AM to 12:00 PM',
  '12:00 PM to 12:30 PM',
  '12:30 PM to 01:00 PM',
  '01:00 PM to 01:30 PM',
  '01:30 PM to 02:00 PM',
  '02:00 PM to 02:30 PM',
  '02:30 PM to 03:00 PM',
  '03:00 PM to 03:30 PM',
  '03:30 PM to 04:00 PM',
];
const toCurrencyNumber = value => {
  const normalizedValue = Number(String(value || '').replace(/[^0-9.]/g, ''));
  return Number.isFinite(normalizedValue) ? normalizedValue : 0;
};
const hasCurrencyValue = value =>
  value !== null && value !== undefined && String(value).trim() !== '';
const getRawCurrencyValue = (...values) =>
  values.find(value => hasCurrencyValue(value));
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
  const standardDiscount = Math.min(
    100,
    Math.max(0, getTestStandardDiscountPercent(test)),
  );
  if (standardDiscount > 0 && baseMrp > 0) {
    return Math.max(0, baseMrp - (baseMrp * standardDiscount) / 100);
  }
  return charge || baseMrp;
};

const getBackendPriceTestCode = test =>
  normalizeFormText(
    test?.booked_code || test?.code || test?.testcode1 || test?.test_code,
  ).toUpperCase();

const getBackendPriceTestForCode = (patient, test) => {
  const testCode = getBackendPriceTestCode(test);

  if (!testCode) {
    return null;
  }

  return (Array.isArray(patient?.tests) ? patient.tests : []).find(
    patientTest => getBackendPriceTestCode(patientTest) === testCode,
  );
};

const getAppointmentBackendPricedTest = (patient, test, useBackendPrice) => {
  if (!useBackendPrice) {
    return test;
  }

  const backendTest = getBackendPriceTestForCode(patient, test);

  if (!backendTest) {
    return test;
  }

  return {
    ...test,
    mrp: getRawCurrencyValue(backendTest?.mrp, backendTest?.MRP, test?.mrp),
    charge: getRawCurrencyValue(
      backendTest?.charge,
      backendTest?.Charge,
      test?.charge,
    ),
    amount: getRawCurrencyValue(backendTest?.amount, test?.amount),
    max_discount: getRawCurrencyValue(
      backendTest?.max_discount,
      backendTest?.maxDiscount,
      test?.max_discount,
      test?.maxDiscount,
    ),
    maxDiscount: getRawCurrencyValue(
      backendTest?.maxDiscount,
      backendTest?.max_discount,
      test?.maxDiscount,
      test?.max_discount,
    ),
    panelCompanyName:
      backendTest?.panelCompanyName ||
      backendTest?.panel_company ||
      test?.panelCompanyName,
    panelCompanyId:
      backendTest?.compCatId ||
      backendTest?.comp_cat_id ||
      test?.panelCompanyId,
  };
};

const getActualTestPrice = (test, useBackendPrice = false) => {
  if (useBackendPrice && hasCurrencyValue(test?.charge)) {
    return toCurrencyNumber(test.charge);
  }

  if (useBackendPrice && hasCurrencyValue(test?.Charge)) {
    return toCurrencyNumber(test.Charge);
  }

  return getDiscountedTestPrice(test);
};

const getBillingChargeMode = company =>
  normalizeFormText(
    company?.billingChargeMode ||
      company?.BillingChargeMode ||
      company?.billing_charge_mode ||
      company?.chargeMode ||
      company?.charge_mode ||
      company?.selectedChargeMode ||
      company?.selected_charge_mode ||
      company?.selectedChargeModes ||
      company?.selected_charge_modes,
  ).toUpperCase();

const getPanelCompanyChipIdentity = company =>
  [
    normalizeFormText(company?.compCatId || company?.id),
    normalizeFormText(company?.centerId),
    normalizeFormText(company?.name || company?.panelCompany).toLowerCase(),
  ].join('|');

const withPanelCompanyChipMeta = (company, source) => {
  const normalizedSource = normalizeFormText(source || company?.chipSource).toUpperCase();
  const rawId =
    normalizeFormText(company?.id || company?.compCatId) ||
    getPanelCompanyChipIdentity(company);
  const prefix = normalizedSource === 'API' ? 'api' : 'app';
  const chipId = normalizeFormText(company?.chipId) || `${prefix}-${rawId}`;

  return {
    ...company,
    chipId,
    chipSource: normalizedSource || source,
  };
};

const getPanelCompanySearchRank = (item, searchText, searchTokens) => {
  const name = normalizeFormText(item?.name).toLowerCase();
  const details = normalizeFormText(item?.details).toLowerCase();
  const searchKey = normalizeFormText(item?.searchKey).toLowerCase();

  if (name === searchText) {
    return 0;
  }

  if (name.startsWith(searchText)) {
    return 1;
  }

  if (searchTokens.every(token => name.split(/\s+/).includes(token))) {
    return 2;
  }

  if (searchTokens.every(token => name.includes(token))) {
    return 3;
  }

  if (details.includes(searchText)) {
    return 4;
  }

  if (searchKey.includes(searchText)) {
    return 5;
  }

  return 6;
};

const getPanelCompanyListIdentity = company =>
  [
    normalizeFormText(company?.syncKey || company?.sync_key),
    normalizeFormText(company?.id),
    normalizeFormText(company?.centerId),
    normalizeFormText(company?.name).toLowerCase(),
    normalizeFormText(company?.details).toLowerCase(),
  ].join('|');

const isSamePanelCompanyListItem = (leftCompany, rightCompany) => {
  const leftIdentity = getPanelCompanyListIdentity(leftCompany);
  const rightIdentity = getPanelCompanyListIdentity(rightCompany);

  return (
    leftIdentity.replace(/\|/g, '') &&
    rightIdentity.replace(/\|/g, '') &&
    leftIdentity === rightIdentity
  );
};

const dedupePanelCompanyChips = companies => {
  const chipMap = new Map();
  const canonicalMap = new Map();

  (Array.isArray(companies) ? companies : []).forEach(company => {
    const companyWithMeta = company?.chipSource
      ? company
      : withPanelCompanyChipMeta(company, 'APP');
    const key = normalizeFormText(companyWithMeta?.chipId) || getPanelCompanyChipIdentity(companyWithMeta);
    const canonicalKey = getPanelCompanyChipIdentity(companyWithMeta);

    if (!canonicalKey.replace(/\|/g, '')) {
      return;
    }

    if (canonicalMap.has(canonicalKey)) {
      const existingKey = canonicalMap.get(canonicalKey);
      const existingCompany = chipMap.get(existingKey);
      const existingSource = normalizeFormText(existingCompany?.chipSource).toUpperCase();
      const nextSource = normalizeFormText(companyWithMeta?.chipSource).toUpperCase();

      if (existingSource !== 'API' && nextSource === 'API') {
        chipMap.delete(existingKey);
        chipMap.set(key, companyWithMeta);
        canonicalMap.set(canonicalKey, key);
      }
      return;
    }

    if (!chipMap.has(key)) {
      chipMap.set(key, companyWithMeta);
      canonicalMap.set(canonicalKey, key);
    }
  });

  return Array.from(chipMap.values());
};

const getPaymentLabelFromBillingMode = mode => {
  const normalizedMode = getBillingChargeMode({billingChargeMode: mode});

  if (!normalizedMode) {
    return 'N/A';
  }

  const labels = [];
  if (normalizedMode.includes('F')) {
    labels.push('Free');
  }
  if (normalizedMode.includes('P')) {
    labels.push('Paying');
  }
  if (normalizedMode.includes('C')) {
    labels.push('Credit');
  }

  return labels.length ? labels.join(' / ') : normalizedMode;
};

const hasCreditAndPayingModes = company => {
  const normalizedMode = getBillingChargeMode(company);
  return normalizedMode.includes('C') && normalizedMode.includes('P');
};

const withSelectedBillingChargeMode = (company, selectedMode) => {
  const normalizedMode = normalizeCompleteChargeMode(selectedMode);

  if (!normalizedMode) {
    return company;
  }

  return {
    ...company,
    billingChargeMode: normalizedMode,
    chargeMode: normalizedMode,
    selectedChargeMode: normalizedMode,
    paymentLabel: getPaymentLabelFromBillingMode(normalizedMode),
  };
};

const doesSelectedTestBelongToPanelCompany = (test, panelCompany) => {
  if (!test || !panelCompany) {
    return false;
  }

  const testChipId = normalizeFormText(test?.panelCompanyChipId);
  const panelChipId = normalizeFormText(panelCompany?.chipId || panelCompany?.id);
  const testSource = normalizeFormText(test?.panelCompanySource).toUpperCase();
  const panelSource = normalizeFormText(panelCompany?.chipSource).toUpperCase();

  if (testChipId && panelChipId) {
    return testChipId === panelChipId;
  }

  if (panelSource === 'APP') {
    return (
      testSource === 'APP' &&
      normalizeFormText(test?.panelCompanyId || test?.compCatId) ===
        normalizeFormText(panelCompany?.compCatId) &&
      normalizeFormText(test?.panelCompanyName || test?.panel_company_name).toLowerCase() ===
        normalizeFormText(panelCompany?.name || panelCompany?.panelCompany).toLowerCase()
    );
  }

  if (testSource === 'APP') {
    return false;
  }

  const testPanelCode = normalizeFormText(test?.panelCode || test?.panel_code);
  const companyPanelCode = normalizeFormText(panelCompany?.panelCode || panelCompany?.code);
  const testPanelAbarid = normalizeFormText(
    test?.panelAbarid || test?.panel_abarid,
  ).toUpperCase();
  const companyPanelAbarid = normalizeFormText(
    panelCompany?.panelAbarid || panelCompany?.ABARID,
  ).toUpperCase();

  if (
    testPanelCode &&
    companyPanelCode &&
    testPanelAbarid &&
    companyPanelAbarid &&
    testPanelCode === companyPanelCode &&
    testPanelAbarid === companyPanelAbarid
  ) {
    return true;
  }

  const testPanelCompanyName = normalizeFormText(
    test?.panelCompanyName || test?.panel_company_name,
  ).toLowerCase();
  const companyName = normalizeFormText(
    panelCompany?.name || panelCompany?.panelCompany,
  ).toLowerCase();

  if (testPanelCompanyName && companyName && testPanelCompanyName === companyName) {
    return true;
  }

  const testPanelCompanyDetails = normalizeFormText(
    test?.panelCompanyDetails || test?.panel_company_details,
  ).toLowerCase();
  const companyDetails = normalizeFormText(
    panelCompany?.details || panelCompany?.CatDetails,
  ).toLowerCase();

  if (
    testPanelCompanyDetails &&
    companyDetails &&
    testPanelCompanyDetails === companyDetails
  ) {
    return true;
  }

  return (
    normalizeFormText(test?.panelCompanyId || test?.compCatId) ===
      normalizeFormText(panelCompany?.compCatId) &&
    (!normalizeFormText(test?.centerId || test?.CenterID) ||
      normalizeFormText(test?.centerId || test?.CenterID) ===
        normalizeFormText(panelCompany?.centerId || panelCompany?.CenterID)) &&
    (!normalizeFormText(test?.atype || test?.Atype) ||
      normalizeFormText(test?.atype || test?.Atype).toUpperCase() ===
        normalizeFormText(panelCompany?.atype || panelCompany?.Atype).toUpperCase())
  );
};

const getMergedPatientSelectedTests = (patient, selectedTests, panelCompany = null) => {
  const mergedMap = new Map();
  const basePanelCompanyName = normalizeFormText(panelCompany?.name);
  const basePanelCompanyId = normalizeFormText(panelCompany?.compCatId);
  const baseCenterId = normalizeFormText(
    panelCompany?.centerId || patient?.centerId || patient?.CenterID,
  );
  const baseAtype = normalizeFormText(
    panelCompany?.atype || patient?.atype || patient?.Atype,
  );
  const basePanelCode = normalizeFormText(
    panelCompany?.panelCode || panelCompany?.code || patient?.panelCode || patient?.panel_code,
  );
  const basePanelAbarid = normalizeFormText(
    panelCompany?.panelAbarid ||
      panelCompany?.ABARID ||
      patient?.panelAbarid ||
      patient?.panel_abarid,
  );
  const baseBillingChargeMode = getBillingChargeMode(panelCompany);

  (Array.isArray(patient?.tests) ? patient.tests : []).forEach((test, index) => {
    const testCode = normalizeFormText(test?.code || test?.booked_code);
    const testCompCatId = normalizeFormText(test?.compCatId || test?.comp_cat_id);
    const dedupeKey = [
      test?.bookingTestId ||
        test?.booking_test_id ||
        test?.bookingTestID ||
        test?.booking_test ||
        index,
      testCompCatId || basePanelCompanyId,
      testCode,
    ]
      .map(value => normalizeFormText(value).toUpperCase())
      .join('|');
    if (!dedupeKey) {
      return;
    }

    mergedMap.set(dedupeKey, {
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
        normalizeFormText(
          test?.panelCompanyName || test?.panel_company || test?.panel,
        ) ||
        basePanelCompanyName ||
        'Current Panel',
      panelCompanySource: panelCompany?.chipSource || 'API',
      panelCompanyChipId: panelCompany?.chipId || panelCompany?.id || '',
      panelCompanyId:
        testCompCatId || basePanelCompanyId,
      centerId: baseCenterId,
      atype: baseAtype,
      panelCode: basePanelCode,
      panelAbarid: basePanelAbarid,
      booked_code: test?.code || test?.booked_code || 'N/A',
      catalog_key: [
        basePanelCompanyId,
        '',
        '',
        test?.code || test?.booked_code || '',
      ].join('|'),
      gcode: test?.gcode || '',
      scode: test?.scode || '',
      test_code: test?.test_code || test?.code || test?.booked_code || '',
      description: test?.name || test?.test_name || 'Unnamed Test',
      specimenName: test?.specimen_name || test?.specimenName || 'N/A',
      mrp: toCurrencyNumber(
        getRawCurrencyValue(test?.mrp, test?.MRP, test?.amount, test?.charge),
      ),
      charge: toCurrencyNumber(
        getRawCurrencyValue(test?.charge, test?.Charge, test?.mrp, test?.MRP),
      ),
      percentageonstandard: getTestStandardDiscountPercent(test),
      billingChargeMode: getBillingChargeMode(test) || baseBillingChargeMode,
      chargeMode: getBillingChargeMode(test) || baseBillingChargeMode,
      selectedChargeMode: getBillingChargeMode(test) || baseBillingChargeMode,
      selected_charge_mode: getBillingChargeMode(test) || baseBillingChargeMode,
      isChildTest: false,
      parentDescription: '',
      dedupe_key: dedupeKey,
    });
  });

  (Array.isArray(selectedTests) ? selectedTests : []).forEach(test => {
    const dedupeKey = normalizeFormText(
      test?.dedupe_key || test?.booked_code || test?.testcode1 || test?.test_code,
    ).toUpperCase();
    mergedMap.set(dedupeKey || test?.key || `${mergedMap.size}`, test);
  });

  return Array.from(mergedMap.values());
};

const getBookingStatusCodeFromLabel = status => {
  const normalizedStatus = normalizeFormText(status).toLowerCase();

  if (normalizedStatus.includes('complete')) {
    return normalizedStatus.includes('partial') ? 5 : 3;
  }

  if (normalizedStatus.includes('cancel')) {
    return 4;
  }

  if (normalizedStatus.includes('start')) {
    return 2;
  }

  if (normalizedStatus.includes('assign')) {
    return 1;
  }

  return 0;
};

const getCompletePayloadPatientId = patient => {
  const rawPatientId =
    patient?.patientId ||
    patient?.patient_id ||
    patient?.labmatePid ||
    patient?.labmate_pid ||
    patient?.id;
  const normalizedPatientId = normalizeFormText(rawPatientId);
  const numericPatientId = Number(normalizedPatientId);

  return Number.isFinite(numericPatientId) && normalizedPatientId
    ? numericPatientId
    : normalizedPatientId;
};

const normalizeCompleteChargeMode = value => {
  const normalizedMode = normalizeFormText(value).toUpperCase();

  if (normalizedMode.includes('C')) {
    return 'C';
  }

  if (normalizedMode.includes('P')) {
    return 'P';
  }

  if (normalizedMode.includes('F')) {
    return 'F';
  }

  return normalizedMode;
};

const getBillingModeForCalculation = value =>
  normalizeCompleteChargeMode(value) || 'P';

const getBillingBucketFromChargeMode = value => {
  const normalizedMode = getBillingModeForCalculation(value);

  if (normalizedMode.includes('F')) {
    return 'free';
  }

  if (normalizedMode.includes('C')) {
    return 'credit';
  }

  return 'paying';
};

const hasPatientPrescriptionUrls = patient => {
  const rawUrls =
    patient?.prescriptionUrls ||
    patient?.prescription_urls ||
    patient?.prescriptionUrl ||
    patient?.prescription_url;

  if (Array.isArray(rawUrls)) {
    return rawUrls.some(url => Boolean(normalizeFormText(url)));
  }

  const normalizedUrls = normalizeFormText(rawUrls);

  if (!normalizedUrls) {
    return false;
  }

  try {
    const parsedUrls = JSON.parse(normalizedUrls);
    if (Array.isArray(parsedUrls)) {
      return parsedUrls.some(url => Boolean(normalizeFormText(url)));
    }
  } catch (error) {
    // Fall back to text/separator parsing below.
  }

  return normalizedUrls
    .split(/[,\n|]+/)
    .some(url => Boolean(normalizeFormText(url)));
};

const hasSpecialIdentityPanel = value => {
  const normalizedValue = normalizeFormText(value).toUpperCase();
  return normalizedValue.includes('CAPF') || normalizedValue.includes('NHA');
};

const getCompleteBookingPatientOptionId = (patient, index) =>
  String(
    getCompletePayloadPatientId(patient) ||
      getPatientMutationId(patient) ||
      patient?.id ||
      patient?.patientId ||
      `patient-${index}`,
  );

const normalizePaymentModeForPayload = mode =>
  normalizeFormText(mode).toLowerCase();

const getPatientBookingStatusForCompletePayload = patient => {
  const statusCode = Number(
    patient?.bookingPatientStatusCode ||
      patient?.booking_patient_status ||
      patient?.bookingPatientStatus ||
      patient?.statusCode ||
      patient?.status_code,
  );

  return statusCode === 4 ? 4 : 3;
};

const sanitizePayloadValue = value => {
  if (typeof value === 'string') {
    return value.trim() === '' ? null : value;
  }

  if (Array.isArray(value)) {
    return value.map(sanitizePayloadValue);
  }

  if (value && typeof value === 'object') {
    return Object.entries(value).reduce((accumulator, [key, entryValue]) => {
      if (entryValue === undefined) {
        return accumulator;
      }

      accumulator[key] = sanitizePayloadValue(entryValue);
      return accumulator;
    }, {});
  }

  return value;
};

const normalizeAddressField = value => {
  const normalizedValue = normalizeFormText(value);
  return normalizedValue === 'N/A' ? '' : normalizedValue;
};

const firstAddressValue = (...values) =>
  values.find(value => normalizeAddressField(value)) || '';

const getCompletedTubeNamesForPayload = sampleCollection => {
  const sourceTubes = Array.isArray(sampleCollection?.selectedTubes)
    ? sampleCollection.selectedTubes
    : [];
  const fallbackTubes = Array.isArray(sampleCollection?.tubeSelectionSummary)
    ? sampleCollection.tubeSelectionSummary.filter(
        tube => Number(tube?.selectedCount || 0) > 0,
      )
    : [];
  const tubeNames = (sourceTubes.length ? sourceTubes : fallbackTubes)
    .map(tube =>
      normalizeFormText(
        typeof tube === 'string'
          ? tube
          : tube?.tubeName || tube?.specimenName || tube?.name,
      ),
    )
    .filter(Boolean);

  return Array.from(new Set(tubeNames));
};

const buildAddressFormFromBooking = booking => ({
  address_id: firstAddressValue(
    booking?.address?.addressId,
    booking?.address?.address_id,
    booking?.addressId,
    booking?.address_id,
  ),
  address_type: normalizeAddressField(booking?.address?.addressType) || 'Home',
  house_flat_no: normalizeAddressField(booking?.address?.houseNumber),
  floor: normalizeAddressField(booking?.address?.floor),
  floor_special: normalizeAddressField(
    booking?.address?.floorSpecial || booking?.address?.floor_special,
  ),
  block_tower_no: normalizeAddressField(
    booking?.address?.blockTowerNo ||
      booking?.address?.block_tower_no ||
      booking?.address?.blockNo ||
      booking?.address?.towerNo,
  ),
  street_sector: normalizeAddressField(booking?.address?.streetLine),
  landmark: normalizeAddressField(booking?.address?.landmark),
  city: normalizeAddressField(booking?.address?.city),
  colony: normalizeAddressField(booking?.address?.colonyName),
  pincode: normalizeAddressField(booking?.address?.pincode),
  route: normalizeAddressField(
    firstAddressValue(
      booking?.address?.routeNumber,
      booking?.address?.routeNo,
      booking?.address?.route_no,
      booking?.address?.route_no_snapshot,
      booking?.address?.route_number,
      booking?.address?.routeNumberSnapshot,
      booking?.routeNumber,
      booking?.routeNo,
      booking?.route_no,
      booking?.route_no_snapshot,
    ),
  ),
  is_manual_pincode: false,
  google_location: normalizeAddressField(booking?.address?.locationUrl),
  access_notes: normalizeAddressField(booking?.address?.accessNotes),
});

const buildAddressPayloadFromForm = form =>
  sanitizePayloadValue({
    address_id: form.address_id,
    address_type: form.address_type,
    house_flat_no: form.house_flat_no,
    floor: form.floor,
    block_tower_no: form.block_tower_no,
    street_line: form.street_sector,
    landmark: form.landmark,
    colony_name: form.colony,
    pincode: form.pincode,
    route_no: form.route,
    city: form.city,
    google_location: form.google_location,
    access_notes: form.access_notes,
  });

function AppointmentDetailsScreen({
  selectedBooking,
  styles,
  isSmallPhone,
  onBookingAction,
  bookingActionLoading,
  isAddingPatient,
  isUpdatingPatient,
  cancellingPatientId,
  addingTestPatientId,
  onAddPatient,
  onUpdatePatient,
  onCancelPatient,
  onUpdateBookingAddress,
  onAddTestPatient,
  onPanelCompanySelect,
  onOpenAddTest,
  onOpenSampleCollection,
  onRemovePatientSelectedTest,
  appointmentDetailState,
  onAppointmentDetailStateChange,
  onLocalDatabaseLoadingChange,
  selectedBookingScreen = 'details',
  onBookingScreenChange,
  onBookingCompleted,
}) {
  const {width} = useWindowDimensions();
  const isNarrowScreen = width < 390;
  const [isAddPatientModalVisible, setIsAddPatientModalVisible] =
    useState(false);
  const [addPatientModalStep, setAddPatientModalStep] = useState('linked-list');
  const [selectedLinkedPatientId, setSelectedLinkedPatientId] = useState('');
  const [isDobCalendarVisible, setIsDobCalendarVisible] = useState(false);
  const [isCancelBookingModalVisible, setIsCancelBookingModalVisible] =
    useState(false);
  const [cancelTargetPatient, setCancelTargetPatient] = useState(null);
  const [isCancelCalendarVisible, setIsCancelCalendarVisible] = useState(false);
  const [isCompleteBookingScreenVisible, setIsCompleteBookingScreenVisible] =
    useState(false);
  const [addressForm, setAddressForm] = useState(() =>
    buildAddressFormFromBooking(selectedBooking),
  );
  const [addressCityOptions, setAddressCityOptions] = useState([]);
  const [addressColonyOptions, setAddressColonyOptions] = useState([]);
  const [isAddressCityLoading, setIsAddressCityLoading] = useState(false);
  const [isAddressColonyLoading, setIsAddressColonyLoading] = useState(false);
  const [isAddressCitySelectVisible, setIsAddressCitySelectVisible] =
    useState(false);
  const [isAddressColonySelectVisible, setIsAddressColonySelectVisible] =
    useState(false);
  const [isAddressFloorSpecialSelectVisible, setIsAddressFloorSpecialSelectVisible] =
    useState(false);
  const [isAddressUpdating, setIsAddressUpdating] = useState(false);
  const [
    isLinkedAppointmentCalendarVisible,
    setIsLinkedAppointmentCalendarVisible,
  ] = useState(false);
  const [
    isLinkedAppointmentTimeSlotSelectVisible,
    setIsLinkedAppointmentTimeSlotSelectVisible,
  ] = useState(false);
  const [isCancellationReasonSelectVisible, setIsCancellationReasonSelectVisible] =
    useState(false);
  const [isCancelTimeSlotSelectVisible, setIsCancelTimeSlotSelectVisible] =
    useState(false);
  const [cancellationReason, setCancellationReason] = useState(
    CANCELLATION_REASON_OPTIONS[0],
  );
  const [cancelRemarks, setCancelRemarks] = useState('');
  const [isCancelRescheduleRequested, setIsCancelRescheduleRequested] =
    useState(true);
  const [isCancelKnownSlot, setIsCancelKnownSlot] = useState(true);
  const [cancelNewVisitDate, setCancelNewVisitDate] = useState('');
  const [cancelNewTimeSlot, setCancelNewTimeSlot] = useState(
    CANCEL_TIME_SLOT_OPTIONS[0],
  );
  const [linkedAppointmentDate, setLinkedAppointmentDate] = useState('');
  const [linkedAppointmentTimeSlot, setLinkedAppointmentTimeSlot] =
    useState('');
  const [isLinkedAppointmentSelected, setIsLinkedAppointmentSelected] =
    useState(() => Boolean(appointmentDetailState?.isLinkedAppointmentSelected));
  const [samplePickCount, setSamplePickCount] = useState(
    () => appointmentDetailState?.samplePickCount || '',
  );
  const [samplePickPatientIds, setSamplePickPatientIds] = useState(
    () =>
      Array.isArray(appointmentDetailState?.samplePickPatientIds)
        ? appointmentDetailState.samplePickPatientIds
        : [],
  );
  const [sampleCollectionEasyTough, setSampleCollectionEasyTough] =
    useState(() => appointmentDetailState?.sampleCollectionEasyTough || '');
  const [
    sampleCollectionEasyToughPatientIds,
    setSampleCollectionEasyToughPatientIds,
  ] = useState(
    () =>
      Array.isArray(appointmentDetailState?.sampleCollectionEasyToughPatientIds)
        ? appointmentDetailState.sampleCollectionEasyToughPatientIds
        : [],
  );
  const [cancelCalendarMonth, setCancelCalendarMonth] = useState(
    () => new Date(),
  );
  const [linkedAppointmentCalendarMonth, setLinkedAppointmentCalendarMonth] =
    useState(() => new Date());
  const [isAdditionalDiscountEnabled, setIsAdditionalDiscountEnabled] =
    useState(() => Boolean(appointmentDetailState?.isAdditionalDiscountEnabled));
  const [completePayments, setCompletePayments] = useState(() =>
    normalizeCompletePaymentDrafts(appointmentDetailState?.completePayments),
  );
  const [patientAdditionalDiscountDraftMap, setPatientAdditionalDiscountDraftMap] =
    useState({});
  const [pendingPaymentPatientId, setPendingPaymentPatientId] = useState(
    () => appointmentDetailState?.pendingPaymentPatientId || '',
  );
  const additionalDiscountLimitAlertKeyRef = useRef('');
  const previousCompleteNetAmountRef = useRef(null);
  const [dobCalendarMonth, setDobCalendarMonth] = useState(() => new Date());
  const [patientForm, setPatientForm] = useState(INITIAL_PATIENT_FORM);
  const [patientCompletionDocumentsMap, setPatientCompletionDocumentsMap] =
    useState(() => appointmentDetailState?.patientCompletionDocumentsMap || {});
  const [patientManualSlipDocumentsMap, setPatientManualSlipDocumentsMap] =
    useState(() => appointmentDetailState?.patientManualSlipDocumentsMap || {});
  const [patientFormPanelCompanyItems, setPatientFormPanelCompanyItems] =
    useState([]);
  const [patientFormReferredByItems, setPatientFormReferredByItems] = useState([]);
  const [patientTagOptions, setPatientTagOptions] = useState([]);
  const [isPatientFormPanelCompanyFocused, setIsPatientFormPanelCompanyFocused] =
    useState(false);
  const [patientReferredByOverrideMap, setPatientReferredByOverrideMap] = useState(
    () => appointmentDetailState?.patientReferredByOverrideMap || {},
  );
  const [editingPatient, setEditingPatient] = useState(null);
  const [isPanelCompanyModalVisible, setIsPanelCompanyModalVisible] =
    useState(false);
  const [panelFlowMode, setPanelFlowMode] = useState('test');
  const [panelCompanySearch, setPanelCompanySearch] = useState('');
  const [panelCompanyItems, setPanelCompanyItems] = useState([]);
  const [selectedPanelPatient, setSelectedPanelPatient] = useState(null);
  const [selectedPanelCompanyId, setSelectedPanelCompanyId] = useState('');
  const [selectedPanelCompanyName, setSelectedPanelCompanyName] = useState('');
  const [selectedPanelCompany, setSelectedPanelCompany] = useState(null);
  const [selectedPatientKey, setSelectedPatientKey] = useState(
    () => appointmentDetailState?.selectedPatientKey || '',
  );
  const [patientSearchText, setPatientSearchText] = useState('');
  const deferredPatientSearchText = useDeferredValue(patientSearchText);
  const [appAlert, setAppAlert] = useState(null);
  const appointmentDetailStateRef = useRef(appointmentDetailState);
  const [patientPrecomputedSampleTubesMap, setPatientPrecomputedSampleTubesMap] =
    useState({});
  const [isPanelCatalogVisible, setIsPanelCatalogVisible] = useState(false);
  const patientApiPanelCompaniesMap = useMemo(
    () => appointmentDetailState?.patientApiPanelCompaniesMap || {},
    [appointmentDetailState?.patientApiPanelCompaniesMap],
  );
  const patientPanelCompaniesMap = useMemo(
    () => appointmentDetailState?.patientPanelCompaniesMap || {},
    [appointmentDetailState?.patientPanelCompaniesMap],
  );
  const activePatientPanelCompanyMap = useMemo(
    () => appointmentDetailState?.activePatientPanelCompanyMap || {},
    [appointmentDetailState?.activePatientPanelCompanyMap],
  );
  const patientSelectedTestsMap = useMemo(
    () => appointmentDetailState?.patientSelectedTestsMap || {},
    [appointmentDetailState?.patientSelectedTestsMap],
  );
  const patientReportCourierMap = useMemo(
    () => appointmentDetailState?.patientReportCourierMap || {},
    [appointmentDetailState?.patientReportCourierMap],
  );
  const patientReportScheduleMap = useMemo(
    () => appointmentDetailState?.patientReportScheduleMap || {},
    [appointmentDetailState?.patientReportScheduleMap],
  );
  const patientAdditionalDiscountMap = useMemo(
    () => appointmentDetailState?.patientAdditionalDiscountMap || {},
    [appointmentDetailState?.patientAdditionalDiscountMap],
  );
  const patientSampleCollectionMap = useMemo(
    () => appointmentDetailState?.patientSampleCollectionMap || {},
    [appointmentDetailState?.patientSampleCollectionMap],
  );
  const hasPendingSampleTubes = useMemo(() => {
    const sampleCollections = Object.values(patientSampleCollectionMap || {});

    if (!sampleCollections.length) {
      return false;
    }

    return sampleCollections.some(sampleCollection => {
      if (
        Array.isArray(sampleCollection?.tubeSelectionSummary) &&
        sampleCollection.tubeSelectionSummary.length
      ) {
        return sampleCollection.tubeSelectionSummary.some(
          tube => Number(tube?.pendingCount || 0) > 0,
        );
      }

      return Array.isArray(sampleCollection?.pendingChildTests)
        ? sampleCollection.pendingChildTests.some(
            pendingGroup =>
              Array.isArray(pendingGroup?.pending) && pendingGroup.pending.length > 0,
          )
        : false;
    });
  }, [patientSampleCollectionMap]);
  const patientTestBookingStatusMap = useMemo(
    () => appointmentDetailState?.patientTestBookingStatusMap || {},
    [appointmentDetailState?.patientTestBookingStatusMap],
  );
  const patientCghsEnabledMap = useMemo(
    () => appointmentDetailState?.patientCghsEnabledMap || {},
    [appointmentDetailState?.patientCghsEnabledMap],
  );
  const patientCghsIdMap = useMemo(
    () => appointmentDetailState?.patientCghsIdMap || {},
    [appointmentDetailState?.patientCghsIdMap],
  );
  const patientCghsDocumentsMap = useMemo(
    () => appointmentDetailState?.patientCghsDocumentsMap || {},
    [appointmentDetailState?.patientCghsDocumentsMap],
  );
  const patientCancellationMap = useMemo(
    () => appointmentDetailState?.patientCancellationMap || {},
    [appointmentDetailState?.patientCancellationMap],
  );
  useEffect(() => {
    setPatientReferredByOverrideMap(
      appointmentDetailState?.patientReferredByOverrideMap || {},
    );
  }, [appointmentDetailState?.patientReferredByOverrideMap]);
  useEffect(() => {
    setPatientCompletionDocumentsMap(
      appointmentDetailState?.patientCompletionDocumentsMap || {},
    );
  }, [appointmentDetailState?.patientCompletionDocumentsMap]);
  useEffect(() => {
    setPatientManualSlipDocumentsMap(
      appointmentDetailState?.patientManualSlipDocumentsMap || {},
    );
  }, [appointmentDetailState?.patientManualSlipDocumentsMap]);
  useEffect(() => {
    setPatientAdditionalDiscountDraftMap(previousDraftMap => {
      const nextDraftMap = {};

      Object.entries(patientAdditionalDiscountMap || {}).forEach(([patientId, value]) => {
        const normalizedPatientId = normalizeFormText(patientId);
        if (!normalizedPatientId) {
          return;
        }

        nextDraftMap[normalizedPatientId] =
          previousDraftMap[normalizedPatientId] !== undefined
            ? previousDraftMap[normalizedPatientId]
            : String(value || '');
      });

      Object.entries(previousDraftMap || {}).forEach(([patientId, value]) => {
        if (!Object.prototype.hasOwnProperty.call(nextDraftMap, patientId)) {
          nextDraftMap[patientId] = value;
        }
      });

      return nextDraftMap;
    });
  }, [patientAdditionalDiscountMap]);
  useEffect(() => {
    appointmentDetailStateRef.current = appointmentDetailState;
  }, [appointmentDetailState]);
  useEffect(() => {
    const currentDraft = appointmentDetailStateRef.current || {};
    const backendAmountReceived = toCurrencyNumber(
      selectedBooking?.amountFields?.amountReceived,
    );
    const backendPaymentMode = normalizeFormText(
      selectedBooking?.amountFields?.paymentMode || selectedBooking?.payment?.mode,
    );
    const resolvedBackendPaymentMode =
      COMPLETE_PAYMENT_MODE_OPTIONS.find(
        mode => mode.toLowerCase() === backendPaymentMode.toLowerCase(),
      ) || COMPLETE_PAYMENT_MODE_OPTIONS[0];
    const hasDraftPayments =
      Array.isArray(currentDraft?.completePayments) &&
      currentDraft.completePayments.some(payment =>
        normalizeFormText(payment?.amount),
      );
    setCompletePayments(
      hasDraftPayments || backendAmountReceived <= 0
        ? normalizeCompletePaymentDrafts(currentDraft?.completePayments)
        : normalizeCompletePaymentDrafts([
            {
              mode: resolvedBackendPaymentMode,
              amount: backendAmountReceived,
            },
          ]),
    );
    setIsLinkedAppointmentSelected(
      Boolean(currentDraft?.isLinkedAppointmentSelected),
    );
    setLinkedAppointmentDate(currentDraft?.linkedAppointmentDate || '');
    setLinkedAppointmentTimeSlot(currentDraft?.linkedAppointmentTimeSlot || '');
    setSamplePickCount(currentDraft?.samplePickCount || '');
    setSamplePickPatientIds(
      Array.isArray(currentDraft?.samplePickPatientIds)
        ? currentDraft.samplePickPatientIds
        : [],
    );
    setSampleCollectionEasyTough(currentDraft?.sampleCollectionEasyTough || '');
    setSampleCollectionEasyToughPatientIds(
      Array.isArray(currentDraft?.sampleCollectionEasyToughPatientIds)
        ? currentDraft.sampleCollectionEasyToughPatientIds
        : [],
    );
    setSelectedPatientKey(currentDraft?.selectedPatientKey || '');
    setPendingPaymentPatientId(currentDraft?.pendingPaymentPatientId || '');
    setIsAdditionalDiscountEnabled(
      Boolean(currentDraft?.isAdditionalDiscountEnabled),
    );
  }, [
    selectedBooking?.amountFields?.additionalDiscount,
    selectedBooking?.amountFields?.amountReceived,
    selectedBooking?.amountFields?.paymentMode,
    selectedBooking?.id,
    selectedBooking?.payment?.mode,
  ]);
  useEffect(() => {
    if (!selectedBooking?.id) {
      return;
    }

    onAppointmentDetailStateChange?.(previousState => ({
      ...previousState,
      completePayments,
      isAdditionalDiscountEnabled,
      isLinkedAppointmentSelected,
      linkedAppointmentDate,
      linkedAppointmentTimeSlot,
      samplePickCount,
      samplePickPatientIds,
      sampleCollectionEasyTough,
      sampleCollectionEasyToughPatientIds,
      selectedPatientKey,
      pendingPaymentPatientId,
    }));
  }, [
    completePayments,
    isAdditionalDiscountEnabled,
    isLinkedAppointmentSelected,
    linkedAppointmentDate,
    linkedAppointmentTimeSlot,
    onAppointmentDetailStateChange,
    pendingPaymentPatientId,
    sampleCollectionEasyTough,
    sampleCollectionEasyToughPatientIds,
    samplePickCount,
    samplePickPatientIds,
    selectedBooking?.id,
    selectedPatientKey,
  ]);
  useEffect(() => {
    if (hasPendingSampleTubes || !isLinkedAppointmentSelected) {
      return;
    }

    setIsLinkedAppointmentSelected(false);
    setLinkedAppointmentDate('');
    setLinkedAppointmentTimeSlot('');
    setIsLinkedAppointmentCalendarVisible(false);
    setIsLinkedAppointmentTimeSlotSelectVisible(false);
  }, [hasPendingSampleTubes, isLinkedAppointmentSelected]);
  useEffect(() => {
    setAddressForm(buildAddressFormFromBooking(selectedBooking));
  }, [selectedBooking]);
  const setPatientApiPanelCompaniesMap = useCallback(
    updater =>
      onAppointmentDetailStateChange?.(previousState => ({
        ...previousState,
        patientApiPanelCompaniesMap:
          typeof updater === 'function'
            ? updater(previousState?.patientApiPanelCompaniesMap || {})
            : updater,
      })),
    [onAppointmentDetailStateChange],
  );
  const setPatientPanelCompaniesMap = useCallback(
    updater =>
      onAppointmentDetailStateChange?.(previousState => ({
        ...previousState,
        patientPanelCompaniesMap:
          typeof updater === 'function'
            ? updater(previousState?.patientPanelCompaniesMap || {})
            : updater,
      })),
    [onAppointmentDetailStateChange],
  );
  const setActivePatientPanelCompanyMap = useCallback(
    updater =>
      onAppointmentDetailStateChange?.(previousState => ({
        ...previousState,
        activePatientPanelCompanyMap:
          typeof updater === 'function'
            ? updater(previousState?.activePatientPanelCompanyMap || {})
            : updater,
      })),
    [onAppointmentDetailStateChange],
  );
  const setPatientReportCourierMap = useCallback(
    updater =>
      onAppointmentDetailStateChange?.(previousState => ({
        ...previousState,
        patientReportCourierMap:
          typeof updater === 'function'
            ? updater(previousState?.patientReportCourierMap || {})
            : updater,
      })),
    [onAppointmentDetailStateChange],
  );
  const setPatientReportScheduleMap = useCallback(
    updater =>
      onAppointmentDetailStateChange?.(previousState => ({
        ...previousState,
        patientReportScheduleMap:
          typeof updater === 'function'
            ? updater(previousState?.patientReportScheduleMap || {})
            : updater,
      })),
    [onAppointmentDetailStateChange],
  );
  const setPatientAdditionalDiscountMap = useCallback(
    updater =>
      onAppointmentDetailStateChange?.(previousState => ({
        ...previousState,
        patientAdditionalDiscountMap:
          typeof updater === 'function'
            ? updater(previousState?.patientAdditionalDiscountMap || {})
            : updater,
      })),
    [onAppointmentDetailStateChange],
  );
  const setPatientSelectedTestsMap = useCallback(
    updater =>
      onAppointmentDetailStateChange?.(previousState => ({
        ...previousState,
        patientSelectedTestsMap:
          typeof updater === 'function'
            ? updater(previousState?.patientSelectedTestsMap || {})
            : updater,
      })),
    [onAppointmentDetailStateChange],
  );
  const setPatientTestBookingStatusMap = useCallback(
    updater =>
      onAppointmentDetailStateChange?.(previousState => ({
        ...previousState,
        patientTestBookingStatusMap:
          typeof updater === 'function'
            ? updater(previousState?.patientTestBookingStatusMap || {})
            : updater,
      })),
    [onAppointmentDetailStateChange],
  );
  const setPatientCghsEnabledMap = useCallback(
    updater =>
      onAppointmentDetailStateChange?.(previousState => ({
        ...previousState,
        patientCghsEnabledMap:
          typeof updater === 'function'
            ? updater(previousState?.patientCghsEnabledMap || {})
            : updater,
      })),
    [onAppointmentDetailStateChange],
  );
  const setPatientCancellationMap = useCallback(
    updater =>
      onAppointmentDetailStateChange?.(previousState => ({
        ...previousState,
        patientCancellationMap:
          typeof updater === 'function'
            ? updater(previousState?.patientCancellationMap || {})
            : updater,
      })),
    [onAppointmentDetailStateChange],
  );
  const setPatientCghsIdMap = useCallback(
    updater =>
      onAppointmentDetailStateChange?.(previousState => ({
        ...previousState,
        patientCghsIdMap:
          typeof updater === 'function'
            ? updater(previousState?.patientCghsIdMap || {})
            : updater,
      })),
    [onAppointmentDetailStateChange],
  );
  const setPatientCghsDocumentsMap = useCallback(
    updater =>
      onAppointmentDetailStateChange?.(previousState => ({
        ...previousState,
        patientCghsDocumentsMap:
          typeof updater === 'function'
            ? updater(previousState?.patientCghsDocumentsMap || {})
            : updater,
      })),
    [onAppointmentDetailStateChange],
  );
  const showAppAlert = useCallback(
    (titleOrMessage, messageOrButtons, buttonsOrOptions, options) => {
      setAppAlert(
        normalizeAppAlertArgs(
          titleOrMessage,
          messageOrButtons,
          buttonsOrOptions,
          options,
        ),
      );
    },
    [],
  );
  const resetPatientSampleCollectionDraft = useCallback(
    patientId => {
      if (!patientId) {
        return;
      }

      onAppointmentDetailStateChange?.(previousState => {
        const nextMap = {...(previousState?.patientSampleCollectionMap || {})};
        delete nextMap[patientId];

        return {
          ...previousState,
          patientSampleCollectionMap: nextMap,
        };
      });
    },
    [onAppointmentDetailStateChange],
  );
  const confirmSampleCollectionReset = useCallback(
    (patient, onConfirm) => {
      const patientId = getPatientMutationId(patient);
      const isSampleCollected = Boolean(
        patientId && patientSampleCollectionMap[patientId]?.collected,
      );

      if (!isSampleCollected) {
        onConfirm?.();
        return;
      }

      showAppAlert(
        'Reset Sample Collection?',
        "This patient's sample has already been collected. Changing tests or panel companies will reset sample collection, and tubes must be selected again.",
        [
          {text: 'Cancel', style: 'cancel'},
          {
            text: 'Reset & Continue',
            style: 'destructive',
            onPress: () => {
              resetPatientSampleCollectionDraft(patientId);
              onConfirm?.();
            },
          },
        ],
        {cancelable: true},
      );
    },
    [
      patientSampleCollectionMap,
      resetPatientSampleCollectionDraft,
      showAppAlert,
    ],
  );
  const handleBookingControlAction = useCallback(
    action => {
      if (action !== 'stop') {
        onBookingAction(action);
        return;
      }

      const collectedPatientIds = Object.entries(patientSampleCollectionMap || {})
        .filter(([, sampleCollection]) => Boolean(sampleCollection?.collected))
        .map(([patientId]) => patientId);

      if (!collectedPatientIds.length) {
        onBookingAction('stop');
        return;
      }

      showAppAlert(
        'Reset Sample Collection?',
        'Stopping this booking will reset sample collection for this booking. Tubes must be selected again after starting.',
        [
          {text: 'Cancel', style: 'cancel'},
          {
            text: 'Reset & Stop',
            style: 'destructive',
            onPress: () => {
              onAppointmentDetailStateChange?.(previousState => {
                const nextMap = {...(previousState?.patientSampleCollectionMap || {})};

                collectedPatientIds.forEach(patientId => {
                  delete nextMap[patientId];
                });

                return {
                  ...previousState,
                  patientSampleCollectionMap: nextMap,
                };
              });
              onBookingAction('stop');
            },
          },
        ],
        {cancelable: true},
      );
    },
    [
      onAppointmentDetailStateChange,
      onBookingAction,
      patientSampleCollectionMap,
      showAppAlert,
    ],
  );
  const confirmRemoveSelectedTest = useCallback(
    ({patient, testName, onConfirm}) => {
      const displayName = normalizeFormText(testName);

      showAppAlert(
        'Remove Test?',
        displayName
          ? `Are you sure you want to remove "${displayName}"?`
          : 'Are you sure you want to remove this test?',
        [
          {text: 'Cancel', style: 'cancel'},
          {
            text: 'Remove',
            style: 'destructive',
            onPress: () => {
              confirmSampleCollectionReset(patient, onConfirm);
            },
          },
        ],
        {cancelable: true},
      );
    },
    [confirmSampleCollectionReset, showAppAlert],
  );
  const confirmRemovePanelCompany = useCallback(
    ({patient, panelCompany, onConfirm}) => {
      const companyName = normalizeFormText(
        panelCompany?.name || panelCompany?.panelCompany,
      );

      showAppAlert(
        'Remove Panel Company?',
        companyName
          ? `Are you sure you want to remove "${companyName}" and its tests?`
          : 'Are you sure you want to remove this panel company and its tests?',
        [
          {text: 'Cancel', style: 'cancel'},
          {
            text: 'Remove',
            style: 'destructive',
            onPress: () => {
              confirmSampleCollectionReset(patient, onConfirm);
            },
          },
        ],
        {cancelable: true},
      );
    },
    [confirmSampleCollectionReset, showAppAlert],
  );
  const closeAppAlert = useCallback(
    shouldDismiss => {
      const onDismiss = appAlert?.onDismiss;
      setAppAlert(null);
      if (shouldDismiss) {
        onDismiss?.();
      }
    },
    [appAlert],
  );
  const [panelCatalogGroups, setPanelCatalogGroups] = useState([]);
  const [selectedCatalogGroup, setSelectedCatalogGroup] = useState(null);
  const [selectedCatalogSubgroup, setSelectedCatalogSubgroup] = useState(null);
  const [testSearch, setTestSearch] = useState('');
  const [expandedCatalogTests, setExpandedCatalogTests] = useState({});
  const [catalogVisibleCount, setCatalogVisibleCount] = useState(
    CATALOG_ITEM_PAGE_SIZE,
  );
  const patients = useMemo(
    () =>
      (Array.isArray(selectedBooking?.patients)
        ? selectedBooking.patients
        : []
      ).map(patient => {
        const patientId = getPatientMutationId(patient);
        const cancellationPayload = patientId
          ? patientCancellationMap[patientId]
          : null;

        const referredByOverride =
          patientId &&
          Object.prototype.hasOwnProperty.call(
            patientReferredByOverrideMap,
            patientId,
          )
            ? normalizeFormText(patientReferredByOverrideMap[patientId])
            : null;
        const nextPatient =
          referredByOverride !== null
            ? {
                ...patient,
                referredBy: referredByOverride,
                referred_by: referredByOverride,
              }
            : patient;

        if (!cancellationPayload) {
          return nextPatient;
        }

        return {
          ...patient,
          ...nextPatient,
          bookingPatientStatusCode: 4,
          bookingPatientStatus: 'Cancelled',
          booking_patient_status: 4,
          appointmentPatientStatus: 4,
          appointment_patient_status: 4,
          cancellationPayload,
        };
      }),
    [patientCancellationMap, patientReferredByOverrideMap, selectedBooking?.patients],
  );
  const isAppointmentSourceBooking = useMemo(
    () =>
      normalizeFormText(
        selectedBooking?.sourceType || selectedBooking?.source_type,
      ).toUpperCase() === 'APPOINTMENT' ||
      Boolean(
        normalizeFormText(
          selectedBooking?.appointmentId || selectedBooking?.appointment_id,
        ),
      ),
    [
      selectedBooking?.appointmentId,
      selectedBooking?.appointment_id,
      selectedBooking?.sourceType,
      selectedBooking?.source_type,
    ],
  );
  const isAppointmentPatientStatusContext = useMemo(
    () =>
      normalizeFormText(
        selectedBooking?.sourceType || selectedBooking?.source_type,
      ).toUpperCase() === 'APPOINTMENT' &&
      Boolean(
        normalizeFormText(
          selectedBooking?.appointmentId || selectedBooking?.appointment_id,
        ),
      ),
    [
      selectedBooking?.appointmentId,
      selectedBooking?.appointment_id,
      selectedBooking?.sourceType,
      selectedBooking?.source_type,
    ],
  );
  const completeBookingPatientOptions = useMemo(
    () =>
      patients.reduce((options, patient, index) => {
        if (isPatientTerminalForCompletion(patient)) {
          return options;
        }

        options.push({
          id: getCompleteBookingPatientOptionId(patient, index),
          patientId: getCompletePayloadPatientId(patient),
          sourcePatientId: getPatientMutationId(patient),
          name: normalizeFormText(patient?.name) || `Patient ${index + 1}`,
        });

        return options;
      }, []),
    [patients],
  );
  const nonManualCompleteBookingPatientOptions = useMemo(
    () =>
      patients.reduce((options, patient, index) => {
        if (isPatientTerminalForCompletion(patient)) {
          return options;
        }

        const patientId = getPatientMutationId(patient);
        const testBookingStatus =
          patientTestBookingStatusMap?.[patientId] || DEFAULT_TEST_BOOKING_STATUS;
        if (isManualHcSlipSelected(testBookingStatus)) {
          return options;
        }

        options.push({
          id: getCompleteBookingPatientOptionId(patient, index),
          patientId: getCompletePayloadPatientId(patient),
          sourcePatientId: getPatientMutationId(patient),
          name: normalizeFormText(patient?.name) || `Patient ${index + 1}`,
        });

        return options;
      }, []),
    [patientTestBookingStatusMap, patients],
  );
  const reportDeliveryPatients = useMemo(
    () =>
      patients.reduce((options, patient, index) => {
        if (isPatientTerminalForCompletion(patient)) {
          return options;
        }

        const patientId = getPatientMutationId(patient);
        if (!patientId) {
          return options;
        }
        const testBookingStatus =
          patientTestBookingStatusMap?.[patientId] || DEFAULT_TEST_BOOKING_STATUS;
        if (isManualHcSlipSelected(testBookingStatus)) {
          return options;
        }

        options.push({
          id: patientId,
          name: normalizeFormText(patient?.name) || `Patient ${index + 1}`,
        });

        return options;
      }, []),
    [patientTestBookingStatusMap, patients],
  );
  const patientSelectorItems = useMemo(
    () =>
      patients.map((patient, index) => {
        const patientId =
          getPatientMutationId(patient) ||
          patient?.id ||
          patient?.patientId ||
          `patient-${index}`;
        const statusCode = Number(patient?.bookingPatientStatusCode || 0);
        const sampleCollected =
          Boolean(
            patientId && patientSampleCollectionMap[patientId]?.collected,
          ) || statusCode === 3;
        const statusLabel =
          statusCode === 4
            ? 'Cancelled'
            : statusCode === 5
            ? 'Partial'
            : sampleCollected
            ? 'Collected'
            : 'Pending';

        return {
          patient,
          index,
          key: String(patientId),
          name: normalizeFormText(patient?.name) || `Patient ${index + 1}`,
          meta: [
            normalizeFormText(patient?.labmatePid || patient?.labmate_pid),
            normalizeFormText(patient?.mobileNumber || patient?.mobile_number),
          ]
            .filter(Boolean)
            .join(' | '),
          statusCode,
          statusLabel,
        };
      }),
    [patientSampleCollectionMap, patients],
  );
  const filteredPatientSelectorItems = useMemo(() => {
    const searchText = deferredPatientSearchText.trim().toLowerCase();

    if (!searchText) {
      return patientSelectorItems;
    }

    return patientSelectorItems.filter(item =>
      `${item.name} ${item.meta}`.toLowerCase().includes(searchText),
    );
  }, [deferredPatientSearchText, patientSelectorItems]);
  const selectedPatientItem = useMemo(
    () =>
      patientSelectorItems.find(item => item.key === selectedPatientKey) ||
      patientSelectorItems[0] ||
      null,
    [patientSelectorItems, selectedPatientKey],
  );
  useEffect(() => {
    let isMounted = true;
    let backgroundTimer = null;
    let interactionHandle = null;
    const bookingPatients = Array.isArray(patients) ? patients : [];
    const selectedPatientKeyForPrecompute = normalizeFormText(
      selectedPatientItem?.key || selectedPatientKey,
    );

    if (!bookingPatients.length) {
      setPatientPrecomputedSampleTubesMap({});
      return () => {
        isMounted = false;
        if (backgroundTimer) {
          clearTimeout(backgroundTimer);
        }
        if (interactionHandle?.cancel) {
          interactionHandle.cancel();
        }
      };
    }

    const applyPatientTubes = (patientId, tubes) => {
      if (!isMounted) {
        return;
      }

      setPatientPrecomputedSampleTubesMap(previousMap => {
        const previousTubes = previousMap[patientId] || [];
        if (areSampleTubeListsEqual(previousTubes, tubes)) {
          return previousMap;
        }

        return {
          ...previousMap,
          [patientId]: tubes,
        };
      });
    };

    const applyPatientPrecomputedMapping = (
      patientId,
      cacheKey,
      maps,
      derivedData,
      source = 'fallback',
    ) => {
      if (!isMounted || !patientId || !maps || typeof maps !== 'object') {
        return;
      }

      onAppointmentDetailStateChange?.(previousState => {
        const previousPatientState =
          previousState?.patientSampleCollectionMap?.[patientId] || {};
        const previousPrecomputedMapping =
          previousPatientState?.precomputedSampleTubeData || null;

        if (
          previousPrecomputedMapping?.cacheKey === cacheKey &&
          previousPrecomputedMapping?.source === source
        ) {
          return previousState;
        }

        return {
          ...previousState,
          patientSampleCollectionMap: {
            ...(previousState?.patientSampleCollectionMap || {}),
            [patientId]: {
              ...previousPatientState,
              precomputedSampleTubeData: {
                cacheKey,
                source,
                maps,
                derivedData: derivedData || null,
              },
            },
          },
        };
      });
    };

    const precomputePatientSampleTubes = patient => {
      const patientId = getPatientMutationId(patient);
      if (!patientId) {
        return Promise.resolve();
      }

      const hasSelectedTestsOverride = Object.prototype.hasOwnProperty.call(
        patientSelectedTestsMap,
        patientId,
      );
      const sourceTests = hasSelectedTestsOverride
        ? patientSelectedTestsMap[patientId] || []
        : getMergedPatientSelectedTests(patient, [], null);
      const normalizedTests = normalizeTestsForSampleTubeMapping(sourceTests);

      if (!normalizedTests.length) {
        applyPatientTubes(patientId, []);
        onAppointmentDetailStateChange?.(previousState => {
          const previousPatientState =
            previousState?.patientSampleCollectionMap?.[patientId];

          if (!previousPatientState?.precomputedSampleTubeData) {
            return previousState;
          }

          return {
            ...previousState,
            patientSampleCollectionMap: {
              ...(previousState?.patientSampleCollectionMap || {}),
              [patientId]: {
                ...previousPatientState,
                precomputedSampleTubeData: null,
              },
            },
          };
        });
        return Promise.resolve();
      }

      const fallbackMaps = buildSampleTubeMapsFromTests(normalizedTests);
      const fallbackTubes = collectUniqueTubesForSelectedTests(
        normalizedTests,
        fallbackMaps.testsMap,
        fallbackMaps.childrenMap,
      );
      applyPatientTubes(patientId, fallbackTubes);
      const rootTests = buildSampleTubeRootTests(normalizedTests);
      const cacheKey = getSampleTubeMappingCacheKey(rootTests);
      applyPatientPrecomputedMapping(
        patientId,
        cacheKey,
        fallbackMaps,
        null,
        'fallback',
      );

      if (
        !rootTests.length ||
        !CatalogDatabaseModule?.getSampleTubeMappingForTestCodes
      ) {
        return Promise.resolve();
      }

      const cachedMaps = sampleTubeMappingCache.get(cacheKey);
      const applyNativeMaps = nativeMaps => {
        const mergedMaps = mergeSampleTubeMaps(fallbackMaps, nativeMaps);
        const nativeTubes = collectUniqueTubesForSelectedTests(
          normalizedTests,
          mergedMaps.testsMap,
          mergedMaps.childrenMap,
        );
        applyPatientTubes(patientId, nativeTubes);
        applyPatientPrecomputedMapping(
          patientId,
          cacheKey,
          mergedMaps,
          null,
          'native',
        );
      };

      if (cachedMaps) {
        applyNativeMaps(cachedMaps);
        return Promise.resolve();
      }

      const mappingRequest =
        sampleTubeMappingRequests.get(cacheKey) ||
        withSampleTubePrecomputeTimeout(
          CatalogDatabaseModule.getSampleTubeMappingForTestCodes(
            JSON.stringify(rootTests),
          ),
          SAMPLE_TUBE_PRECOMPUTE_TIMEOUT_MS,
        )
          .then(response => {
            const parsedResponse =
              typeof response === 'string' ? JSON.parse(response) : response;
            sampleTubeMappingCache.set(cacheKey, parsedResponse);
            sampleTubeMappingRequests.delete(cacheKey);
            return parsedResponse;
          })
          .catch(error => {
            sampleTubeMappingRequests.delete(cacheKey);
            throw error;
          });

      sampleTubeMappingRequests.set(cacheKey, mappingRequest);
      return mappingRequest
        .then(applyNativeMaps)
        .catch(error => {
          warnDebug('Unable to precompute patient sample tubes:', error);
          applyPatientTubes(patientId, fallbackTubes);
        });
    };

    const selectedPatient = selectedPatientKeyForPrecompute
      ? bookingPatients.find(
          (patient, index) =>
            normalizeFormText(
              getPatientMutationId(patient) ||
                patient?.id ||
                patient?.patientId ||
                `patient-${index}`,
            ) === selectedPatientKeyForPrecompute,
        )
      : bookingPatients[0];

    const backgroundPatients = bookingPatients.filter(
      patient =>
        !selectedPatient ||
        getPatientMutationId(patient) !== getPatientMutationId(selectedPatient),
    );

    const processNextBackgroundPatient = index => {
      if (!isMounted || index >= backgroundPatients.length) {
        return;
      }

      backgroundTimer = setTimeout(() => {
        Promise.resolve(precomputePatientSampleTubes(backgroundPatients[index]))
          .catch(error => {
            warnDebug('Unable to lazily precompute patient sample tubes:', error);
          })
          .finally(() => processNextBackgroundPatient(index + 1));
      }, 600);
    };

    interactionHandle = InteractionManager.runAfterInteractions(() => {
      if (!isMounted) {
        return;
      }

      Promise.resolve(
        selectedPatient ? precomputePatientSampleTubes(selectedPatient) : null,
      )
        .catch(error => {
          warnDebug('Unable to precompute selected patient sample tubes:', error);
        })
        .finally(() => {
          if (!isMounted) {
            return;
          }

          backgroundTimer = setTimeout(() => {
            processNextBackgroundPatient(0);
          }, 1200);
        });
    });

    return () => {
      isMounted = false;
      if (backgroundTimer) {
        clearTimeout(backgroundTimer);
      }
      if (interactionHandle?.cancel) {
        interactionHandle.cancel();
      }
    };
  }, [
    onAppointmentDetailStateChange,
    patientSelectedTestsMap,
    patients,
    selectedPatientItem?.key,
    selectedPatientKey,
  ]);
  const linkedPatients = useMemo(
    () =>
      Array.isArray(selectedBooking?.linkedPatients)
        ? selectedBooking.linkedPatients
        : [],
    [selectedBooking?.linkedPatients],
  );

  useEffect(() => {
    if (!patientSelectorItems.length) {
      setSelectedPatientKey('');
      setPatientSearchText('');
      return;
    }

    if (!patientSelectorItems.some(item => item.key === selectedPatientKey)) {
      setSelectedPatientKey(patientSelectorItems[0].key);
    }
  }, [patientSelectorItems, selectedPatientKey]);
  useEffect(() => {
    setSamplePickCount('');
    setSamplePickPatientIds([]);
    setSampleCollectionEasyTough('');
    setSampleCollectionEasyToughPatientIds([]);
    setIsLinkedAppointmentSelected(false);
    setLinkedAppointmentDate('');
    setLinkedAppointmentTimeSlot('');
  }, [selectedBooking?.id]);

  useEffect(() => {
    let isMounted = true;

    const loadPatientTags = async () => {
      try {
        const responseData = await getLocalPatientTagsResponse();
        const items = Array.isArray(responseData?.items)
          ? Array.from(
              new Set(
                responseData.items
                  .map(item => normalizeFormText(item))
                  .filter(Boolean),
              ),
            )
          : [];

        if (isMounted) {
          setPatientTagOptions(items);
        }
      } catch (error) {
        if (isMounted) {
          setPatientTagOptions([]);
        }
        warnDebug('Unable to load patient tags:', error);
      }
    };

    loadPatientTags();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    let isMounted = true;
    const shouldLoadPatientFormPanelCompanies =
      (!patientFormPanelCompanyItems.length || !patientFormReferredByItems.length);

    if (!shouldLoadPatientFormPanelCompanies) {
      return () => {
        isMounted = false;
      };
    }

    const loadPatientFormPanelCompanies = async () => {
      try {
        const [panelResponseData, referredByResponseData] = await Promise.all([
          getLocalPanelCompaniesByAtypeResponse('C'),
          getLocalPanelCompaniesByAtypeResponse('D'),
        ]);
        const panelItems = normalizePanelCompanyItems(panelResponseData, {
          allowedAtype: 'C',
        });
        const referredByItems = normalizePanelCompanyItems(referredByResponseData, {
          allowedAtype: 'D',
        });

        if (isMounted) {
          setPatientFormPanelCompanyItems(panelItems);
          setPatientFormReferredByItems(referredByItems);
        }
      } catch (error) {
        warnDebug('Unable to load patient form panel companies:', error);
      }
    };

    loadPatientFormPanelCompanies();

    return () => {
      isMounted = false;
    };
  }, [
    addPatientModalStep,
    editingPatient,
    isAddPatientModalVisible,
    patientFormPanelCompanyItems.length,
    patientFormReferredByItems.length,
  ]);

  useEffect(() => {
    const bookingId = normalizeFormText(selectedBooking?.id);
    const bookingPatients = Array.isArray(selectedBooking?.patients)
      ? selectedBooking.patients
      : [];

    if (!bookingId || !bookingPatients.length) {
      return;
    }

    const hasMissingPanelCompanies = bookingPatients.some(patient => {
      const patientId = getPatientMutationId(patient);
      return (
        patientId &&
        !Object.prototype.hasOwnProperty.call(
          patientApiPanelCompaniesMap,
          patientId,
        )
      );
    });

    if (!hasMissingPanelCompanies) {
      return;
    }

    const nextEntries = [];

    bookingPatients.forEach(patient => {
      const patientId = getPatientMutationId(patient);
      if (
        !patientId ||
        Object.prototype.hasOwnProperty.call(
          patientApiPanelCompaniesMap,
          patientId,
        )
      ) {
        return;
      }

      const apiCompanies = buildApiPanelCompaniesFromPatient(patient);
      if (apiCompanies.length) {
        nextEntries.push([patientId, apiCompanies]);
      }
    });

    if (!nextEntries.length) {
      return;
    }

    setPatientApiPanelCompaniesMap(previousMap => {
      const nextMap = {...previousMap};
      let didChange = false;

      nextEntries.forEach(([patientId, apiCompanies]) => {
        if (!Object.prototype.hasOwnProperty.call(nextMap, patientId)) {
          nextMap[patientId] = apiCompanies;
          didChange = true;
        }
      });

      return didChange ? nextMap : previousMap;
    });
  }, [
    selectedBooking?.id,
    selectedBooking?.patients,
    patientApiPanelCompaniesMap,
    setPatientApiPanelCompaniesMap,
  ]);
  const [patientDocuments, setPatientDocuments] = useState([]);
  const selectedLinkedPatient = linkedPatients.find(
    patient => patient.id === selectedLinkedPatientId,
  );
  const getPatientPanelCompanies = useCallback(
    patient => {
      const patientId = getPatientMutationId(patient);
      const apiCompanies = patientId
        ? patientApiPanelCompaniesMap[patientId] || []
        : [];
      const selectedCompanies = patientId
        ? patientPanelCompaniesMap[patientId] || []
        : [];

      return dedupePanelCompanyChips([
        ...apiCompanies.map(company => withPanelCompanyChipMeta(company, 'API')),
        ...selectedCompanies.map(company => withPanelCompanyChipMeta(company, 'APP')),
      ]);
    },
    [patientApiPanelCompaniesMap, patientPanelCompaniesMap],
  );
  const doesPatientNeedPaymentProof = useCallback(
    patient => {
      if (hasPatientPrescriptionUrls(patient)) {
        return false;
      }

      const patientId = getPatientMutationId(patient);
      const panelCompanies = getPatientPanelCompanies(patient);
      const selectedTests = patientId
        ? patientSelectedTestsMap[patientId] || []
        : [];
      const hasCreditPanel = panelCompanies.length
        ? panelCompanies.some(company => getBillingChargeMode(company).includes('C'))
        : getBillingChargeMode(patient).includes('C');
      const hasCreditSelectedTest = selectedTests.some(test =>
        getBillingChargeMode({
          billingChargeMode:
            test?.selectedChargeMode ||
            test?.selected_charge_mode ||
            test?.billingChargeMode ||
            test?.chargeMode,
        }).includes('C'),
      );

      return hasCreditPanel || hasCreditSelectedTest;
    },
    [getPatientPanelCompanies, patientSelectedTestsMap],
  );
  const doesPatientRequireIdentityDocuments = useCallback(
    patient => {
      const panelCompanies = getPatientPanelCompanies(patient);

      return panelCompanies.some(
        company =>
          hasSpecialIdentityPanel(company?.name) ||
          hasSpecialIdentityPanel(company?.details),
      );
    },
    [getPatientPanelCompanies],
  );
  const completeBillingTests = useMemo(
    () =>
      patients.flatMap(patient => {
        if (isPatientTerminalForCompletion(patient)) {
          return [];
        }

        const patientId = getPatientMutationId(patient);
        const hasSelectedTestsOverride =
          patientId &&
          Object.prototype.hasOwnProperty.call(
            patientSelectedTestsMap,
            patientId,
          );
        const sourceTests = hasSelectedTestsOverride
          ? patientSelectedTestsMap[patientId] || []
          : Array.isArray(patient?.tests)
          ? patient.tests
          : [];

        return sourceTests.map(test => {
          const effectiveTest = getAppointmentBackendPricedTest(
            patient,
            test,
            isAppointmentSourceBooking,
          );
          const selectedChargeMode = getBillingModeForCalculation(
            effectiveTest?.selected_charge_mode ||
              effectiveTest?.selectedChargeMode ||
              effectiveTest?.billingChargeMode ||
              effectiveTest?.chargeMode ||
              patient?.billingChargeMode ||
              patient?.chargeMode,
          );
          const testMrp = toCurrencyNumber(
            getRawCurrencyValue(
              effectiveTest?.mrp,
              effectiveTest?.MRP,
              effectiveTest?.amount,
              effectiveTest?.charge,
              effectiveTest?.Charge,
            ),
          );
          const discountedTestPrice = getActualTestPrice(
            effectiveTest,
            isAppointmentSourceBooking,
          );
          const standardDiscountAmount = Math.max(
            0,
            testMrp - discountedTestPrice,
          );

          return {
            key:
              normalizeFormText(effectiveTest?.key) ||
              `${normalizeFormText(
                effectiveTest?.booked_code || effectiveTest?.code,
              )}-${patientId}`,
            patientId,
            patientName: normalizeFormText(patient?.name),
            code: normalizeFormText(
              effectiveTest?.booked_code || effectiveTest?.code,
            ),
            description:
              normalizeFormText(effectiveTest?.description || effectiveTest?.name) ||
              'Unnamed Test',
            selectedChargeMode,
            billingBucket: getBillingBucketFromChargeMode(selectedChargeMode),
            mrp: testMrp,
            charge: discountedTestPrice,
            percentageonstandard: getTestStandardDiscountPercent(effectiveTest),
            standard_discount_amount: standardDiscountAmount,
            max_discount:
              toCurrencyNumber(
                getRawCurrencyValue(
                  effectiveTest?.max_discount,
                  effectiveTest?.maxDiscount,
                ),
              ) ||
              standardDiscountAmount,
            max_allowed_discount: toCurrencyNumber(
              getRawCurrencyValue(
                effectiveTest?.max_allowed_discount,
                effectiveTest?.maxAllowedDiscount,
              ),
            ),
          };
        });
      }),
    [isAppointmentSourceBooking, patients, patientSelectedTestsMap],
  );
  const bookingAmountFields = useMemo(
    () => selectedBooking?.amountFields || {},
    [selectedBooking?.amountFields],
  );
  const localBillingSummary = useMemo(
    () =>
      buildLocalBillingSummary(
        completeBillingTests,
        patientAdditionalDiscountMap,
        selectedBooking?.patients,
      ),
    [completeBillingTests, patientAdditionalDiscountMap, selectedBooking?.patients],
  );
  const patientSeedAdditionalDiscountTotal = useMemo(
    () => getPatientSeedAdditionalDiscountTotal(selectedBooking?.patients),
    [selectedBooking?.patients],
  );
  const hasBackendPatientLevelAdditionalDiscount = useMemo(
    () => hasBackendPatientLevelAdditionalDiscounts(selectedBooking?.patients),
    [selectedBooking?.patients],
  );
  const preloadedAdditionalDiscount = useMemo(
    () =>
      getPreloadedAdditionalDiscount({
        bookingAmountFields,
        selectedBooking,
        patientSeedAdditionalDiscountTotal,
      }),
    [
      bookingAmountFields,
      patientSeedAdditionalDiscountTotal,
      selectedBooking,
    ],
  );
  const hasPatientAdditionalDiscountEntry = useMemo(
    () =>
      localBillingSummary.patientAdditionalDiscountRows.some(
      patient => patient.requestedAdditional > 0,
      ),
    [localBillingSummary.patientAdditionalDiscountRows],
  );
  const completePaymentPatientOptions = useMemo(() => {
    const payingPatientIds = new Set(
      (localBillingSummary.patientBillingRows || [])
        .filter(
          row =>
            toCurrencyNumber(row?.payingTestCount) > 0 &&
            toCurrencyNumber(row?.finalPayingAmount) > 0.009,
        )
        .map(row => normalizeFormText(row?.patientId))
        .filter(Boolean),
    );

    return patients.reduce((options, patient, index) => {
      const patientId = getPatientMutationId(patient);

      if (
        isPatientTerminalForCompletion(patient) ||
        !payingPatientIds.has(normalizeFormText(patientId))
      ) {
        return options;
      }

      options.push({
        id: getCompleteBookingPatientOptionId(patient, index),
        patientId: getCompletePayloadPatientId(patient),
        sourcePatientId: patientId,
        name: normalizeFormText(patient?.name) || `Patient ${index + 1}`,
      });

      return options;
    }, []);
  }, [localBillingSummary.patientBillingRows, patients]);
  const patientAdditionalDiscountUiRows = useMemo(
    () =>
      localBillingSummary.patientAdditionalDiscountRows.map(patient => ({
        ...patient,
        enteredAdditional:
          patientAdditionalDiscountDraftMap[patient.patientId] !== undefined
            ? patientAdditionalDiscountDraftMap[patient.patientId]
            : patient.enteredAdditional,
      })),
    [
      localBillingSummary.patientAdditionalDiscountRows,
      patientAdditionalDiscountDraftMap,
    ],
  );
  const {
    completeBillingTotal,
    completeAdditionalDiscountAmount,
    completeBaseDiscountAmount,
    completeCreditAmount,
    completeNetAmount,
  } = useMemo(
    () =>
      getCompleteBillingAmounts({
        localBillingSummary,
        preloadedAdditionalDiscount,
        hasBackendPatientLevelAdditionalDiscount,
        hasPatientAdditionalDiscountEntry,
      }),
    [
      hasBackendPatientLevelAdditionalDiscount,
      hasPatientAdditionalDiscountEntry,
      localBillingSummary,
      preloadedAdditionalDiscount,
    ],
  );
  const completeAmountReceived = useMemo(
    () =>
      completePayments.reduce(
        (total, payment) => total + toCurrencyNumber(payment?.amount),
        0,
      ),
    [completePayments],
  );
  const completePaymentMode = useMemo(
    () =>
      completePayments.find(payment => normalizeFormText(payment?.mode))?.mode ||
      COMPLETE_PAYMENT_MODE_OPTIONS[0],
    [completePayments],
  );
  const {pendingPaymentAmount, extraPaymentAmount} = useMemo(
    () => ({
      pendingPaymentAmount: Math.max(
        0,
        completeNetAmount - completeAmountReceived,
      ),
      extraPaymentAmount: Math.max(
        0,
        completeAmountReceived - completeNetAmount,
      ),
    }),
    [completeAmountReceived, completeNetAmount],
  );
  const hasEnteredCompletePaymentAmount = useMemo(
    () =>
      completePayments.some(payment =>
        Boolean(normalizeFormText(payment?.amount)),
      ),
    [completePayments],
  );
  const areAllPatientPaymentAmountsZero = useMemo(() => {
    if (!completePaymentPatientOptions.length) {
      return false;
    }

    return completePaymentPatientOptions.every(patient => {
      const payment = completePayments.find(paymentEntry => {
        const paymentOptionId = normalizeFormText(
          paymentEntry?.patientOptionId,
        );
        const paymentPatientId = normalizeFormText(paymentEntry?.patientId);

        return (
          paymentOptionId === normalizeFormText(patient?.id) ||
          paymentPatientId === normalizeFormText(patient?.patientId) ||
          paymentPatientId === normalizeFormText(patient?.sourcePatientId)
        );
      });

      return (
        Boolean(normalizeFormText(payment?.amount)) &&
        toCurrencyNumber(payment?.amount) === 0
      );
    });
  }, [completePaymentPatientOptions, completePayments]);
  const shouldCollectPendingPaymentPatient = useMemo(
    () =>
      hasEnteredCompletePaymentAmount &&
      !areAllPatientPaymentAmountsZero &&
      completePaymentPatientOptions.length > 0 &&
      (pendingPaymentAmount > 0.009 || extraPaymentAmount > 0.009),
    [
      areAllPatientPaymentAmountsZero,
      completePaymentPatientOptions.length,
      extraPaymentAmount,
      hasEnteredCompletePaymentAmount,
      pendingPaymentAmount,
    ],
  );
  useEffect(() => {
    if (!shouldCollectPendingPaymentPatient) {
      if (pendingPaymentPatientId) {
        setPendingPaymentPatientId('');
      }
      return;
    }

    const hasValidSelection = completePaymentPatientOptions.some(
      patient => patient.id === pendingPaymentPatientId,
    );
    if (hasValidSelection) {
      return;
    }

    if (completePaymentPatientOptions.length === 1) {
      setPendingPaymentPatientId(completePaymentPatientOptions[0].id);
      return;
    }

    if (pendingPaymentPatientId) {
      setPendingPaymentPatientId('');
    }
  }, [
    completePaymentPatientOptions,
    pendingPaymentPatientId,
    shouldCollectPendingPaymentPatient,
  ]);
  useEffect(() => {
    setCompletePayments(previousPayments => {
      if (!completePaymentPatientOptions.length) {
        return previousPayments.length ? [] : previousPayments;
      }

      const findExistingPayment = patient =>
        previousPayments.find(payment => {
          const paymentOptionId = normalizeFormText(payment?.patientOptionId);
          const paymentPatientId = normalizeFormText(payment?.patientId);
          const patientOptionId = normalizeFormText(patient?.id);
          const payloadPatientId = normalizeFormText(patient?.patientId);
          const sourcePatientId = normalizeFormText(patient?.sourcePatientId);

          return (
            paymentOptionId === patientOptionId ||
            paymentPatientId === payloadPatientId ||
            paymentPatientId === sourcePatientId
          );
        });

      const nextPayments = completePaymentPatientOptions.map(patient => {
        const existingPayment = findExistingPayment(patient);

        return createCompletePaymentEntry({
          ...(existingPayment || {}),
          id:
            existingPayment?.id ||
            `payment-patient-${normalizeFormText(patient.id)}`,
          patientOptionId: patient.id,
          patientId: patient.patientId,
          patientName: patient.name,
        });
      });

      const serializeComparablePayments = payments =>
        JSON.stringify(
          payments.map(payment => ({
            id: payment.id,
            patientOptionId: normalizeFormText(payment.patientOptionId),
            patientId: normalizeFormText(payment.patientId),
            patientName: normalizeFormText(payment.patientName),
            mode: normalizeFormText(payment.mode),
            amount: normalizeFormText(payment.amount),
            proofDocuments: Array.isArray(payment.proofDocuments)
              ? payment.proofDocuments
              : [],
          })),
        );

      return serializeComparablePayments(previousPayments) ===
        serializeComparablePayments(nextPayments)
        ? previousPayments
        : nextPayments;
    });
  }, [completePaymentPatientOptions]);

  useEffect(() => {
    const previousNetAmount = previousCompleteNetAmountRef.current;
    previousCompleteNetAmountRef.current = completeNetAmount;

    if (
      !isCompleteBookingScreenVisible ||
      completePaymentPatientOptions.length !== 1
    ) {
      return;
    }

    setCompletePayments(previousPayments => {
      if (previousPayments.length !== 1) {
        return previousPayments;
      }

      const payment = previousPayments[0];
      const currentAmount = toCurrencyNumber(payment?.amount);
      const hasAmount = Boolean(normalizeFormText(payment?.amount));
      const shouldSyncAmount =
        !hasAmount ||
        (previousNetAmount !== null &&
          Math.abs(currentAmount - previousNetAmount) < 0.01);

      if (!shouldSyncAmount) {
        return previousPayments;
      }

      const nextAmount = completeNetAmount > 0 ? String(completeNetAmount) : '';
      if (normalizeFormText(payment?.amount) === nextAmount) {
        return previousPayments;
      }

      return [
        {
          ...payment,
          amount: nextAmount,
        },
      ];
    });
  }, [
    completeNetAmount,
    completePaymentPatientOptions.length,
    isCompleteBookingScreenVisible,
  ]);

  const buildCompleteBookingPayload = useCallback(() => {
    const patientAdditionalDiscountMapForPayload =
      localBillingSummary.patientAdditionalDiscountRows.reduce(
        (accumulator, patientDiscount) => {
          accumulator[patientDiscount.patientId] = patientDiscount;
          return accumulator;
        },
        {},
      );
    const testsPayload = patients
      .map(patient => {
        const patientId = getPatientMutationId(patient);
        const payloadPatientId = getCompletePayloadPatientId(patient);
        const hasSelectedTestsOverride =
          patientId &&
          Object.prototype.hasOwnProperty.call(
            patientSelectedTestsMap,
            patientId,
          );
        const sourceTests = hasSelectedTestsOverride
          ? patientSelectedTestsMap[patientId] || []
          : Array.isArray(patient?.tests)
          ? patient.tests
          : [];
        const patientPanelCompanies = getPatientPanelCompanies(patient);
        const panelMap = new Map();

        sourceTests.forEach(test => {
          const effectiveTest = getAppointmentBackendPricedTest(
            patient,
            test,
            isAppointmentSourceBooking,
          );
          const actualTestPrice = getActualTestPrice(
            effectiveTest,
            isAppointmentSourceBooking,
          );
          const actualTestMrp = toCurrencyNumber(
            getRawCurrencyValue(
              effectiveTest?.mrp,
              effectiveTest?.MRP,
              effectiveTest?.amount,
              effectiveTest?.charge,
              effectiveTest?.Charge,
            ),
          );
          const actualStandardDiscount = Math.max(
            0,
            actualTestMrp - actualTestPrice,
          );
          const panelCompany =
            normalizeFormText(
              effectiveTest?.panelCompanyName ||
                effectiveTest?.panel_company ||
                '',
          ) || 'Current Panel';
          const panelCompanyKey = panelCompany.toLowerCase();
          const testPanelChipId = normalizeFormText(
            effectiveTest?.panelCompanyChipId,
          );
          const directTestCompCatId = normalizeFormText(
            effectiveTest?.panelCompanyId ||
              effectiveTest?.compCatId ||
              effectiveTest?.comp_cat_id ||
              '',
          );
          const matchedPanelCompany = patientPanelCompanies.find(company => {
            const companyCompCatId = normalizeFormText(company?.compCatId);
            if (directTestCompCatId && companyCompCatId === directTestCompCatId) {
              return true;
            }

            const companyName =
              normalizeFormText(
                company?.name || company?.panelCompany || company?.pname,
              ).toLowerCase();
            if (companyName && companyName === panelCompanyKey) {
              return true;
            }

            if (!directTestCompCatId) {
              const companyChipId = normalizeFormText(
                company?.chipId || company?.id,
              );
              if (testPanelChipId && companyChipId === testPanelChipId) {
                return true;
              }
            }

            return false;
          });
          const compCatId = normalizeFormText(
            directTestCompCatId || matchedPanelCompany?.compCatId || '',
          );
          const catDetails = normalizeFormText(
            effectiveTest?.cat_details ||
              effectiveTest?.catDetails ||
              effectiveTest?.panelCompanyDetails ||
              effectiveTest?.panel_company_details ||
              effectiveTest?.details,
          );
          const selectedChargeMode =
            normalizeCompleteChargeMode(
              effectiveTest?.selected_charge_mode ||
                effectiveTest?.selectedChargeMode ||
                effectiveTest?.billingChargeMode ||
                effectiveTest?.chargeMode ||
                patient?.billingChargeMode ||
                patient?.chargeMode,
            ) || 'C';
          const panelKey = [
            panelCompany.toLowerCase(),
            compCatId,
            catDetails.toLowerCase(),
            selectedChargeMode,
          ].join('|');

          if (!panelMap.has(panelKey)) {
            panelMap.set(panelKey, {
              panel_company: panelCompany,
              comp_cat_id: compCatId,
              cat_details: catDetails,
              selected_charge_mode: selectedChargeMode,
              selected_tests: [],
            });
          }

          panelMap.get(panelKey).selected_tests.push({
            booked_code: normalizeFormText(
              effectiveTest?.booked_code ||
                effectiveTest?.code ||
                effectiveTest?.testcode1 ||
                effectiveTest?.test_code,
            ),
            description:
              normalizeFormText(effectiveTest?.description || effectiveTest?.name) ||
              'Unnamed Test',
            mrp: actualTestMrp,
            charge: actualTestPrice,
            percentageonstandard: getTestStandardDiscountPercent(effectiveTest),
            standard_discount_amount: actualStandardDiscount,
            max_discount:
              toCurrencyNumber(
                getRawCurrencyValue(
                  effectiveTest?.max_discount,
                  effectiveTest?.maxDiscount,
                ),
              ) || actualStandardDiscount,
            max_allowed_discount: toCurrencyNumber(
              getRawCurrencyValue(
                effectiveTest?.max_allowed_discount,
                effectiveTest?.maxAllowedDiscount,
              ),
            ),
          });
        });

        const testBookingStatus =
          patientTestBookingStatusMap[patientId] ||
          DEFAULT_TEST_BOOKING_STATUS;
        const patientAdditionalDiscount =
          patientAdditionalDiscountMapForPayload[patientId] || null;

        return {
          patient_id: payloadPatientId,
          test_booking_status: getApiTestBookingStatusValue(testBookingStatus),
          additional_discount_mode:
            patientAdditionalDiscount?.effectiveAdditional > 0 ? 'amount' : '',
          additional_discount_value:
            patientAdditionalDiscount?.effectiveAdditional || 0,
          requested_additional_discount_value:
            patientAdditionalDiscount?.requestedAdditional || 0,
          report_delivery: normalizeReportDeliveryValues(
            patientReportCourierMap[patientId],
          ).join(','),
          report_delivery_options: normalizeReportDeliveryValues(
            patientReportCourierMap[patientId],
          ),
          referred_by: normalizeFormText(patient?.referredBy || patient?.referred_by),
          report_schedule: normalizeFormText(
            patientReportScheduleMap[patientId],
          ) || 'routine',
          panels: Array.from(panelMap.values()).filter(
            panel => panel.selected_tests.length,
          ),
        };
      })
      .filter(
        patientPayload =>
          patientPayload.patient_id &&
          (patientPayload.panels.length ||
            isManualHcSlipSelected(patientPayload.test_booking_status)),
      );
    const pendingChildTestsPayload = Object.values(patientSampleCollectionMap)
      .flatMap(sampleCollection =>
        Array.isArray(sampleCollection?.pendingChildTests)
          ? sampleCollection.pendingChildTests
          : [],
      )
      .filter(
        pendingGroup =>
          pendingGroup?.patient_id &&
          pendingGroup?.root_booked_code &&
          Array.isArray(pendingGroup?.pending) &&
          pendingGroup.pending.length,
      )
      .map(pendingGroup => {
        const pendingTests = (Array.isArray(pendingGroup?.pending)
          ? pendingGroup.pending
          : []
        ).map(pendingTest => ({
          ...pendingTest,
          description:
            normalizeFormText(pendingTest?.description) ||
            normalizeFormText(pendingTest?.name),
        }));

        return {
          ...pendingGroup,
          pending: pendingTests,
          pending_child_tests: pendingTests,
        };
      });
    const paymentCollectionsPayload = completePayments
      .filter(payment => toCurrencyNumber(payment?.amount) > 0)
      .map(payment => ({
        payment_id: payment.id,
        mode: normalizeFormText(payment?.mode) || COMPLETE_PAYMENT_MODE_OPTIONS[0],
        amount: toCurrencyNumber(payment?.amount),
      }));
    const pendingPaymentPatient = completePaymentPatientOptions.find(
      patient => patient.id === pendingPaymentPatientId,
    );
    const patientBillingRowMap = new Map(
      (localBillingSummary.patientBillingRows || []).map(row => [
        normalizeFormText(row?.patientId),
        row,
      ]),
    );
    const activePaymentPatientOptions = completePaymentPatientOptions.filter(
      patient => patient?.id,
    );
    const getPatientPayments = (patient, index) => {
      const payloadPatientId = normalizeFormText(getCompletePayloadPatientId(patient));
      const optionId = getCompleteBookingPatientOptionId(patient, index);

      return completePayments.filter(payment => {
        if (
          !normalizeFormText(payment?.amount) ||
          toCurrencyNumber(payment?.amount) < 0
        ) {
          return false;
        }

        const paymentOptionId = normalizeFormText(payment?.patientOptionId);
        const paymentPatientId = normalizeFormText(payment?.patientId);
        if (paymentOptionId) {
          return paymentOptionId === optionId;
        }
        if (paymentPatientId) {
          return paymentPatientId === payloadPatientId;
        }

        return (
          activePaymentPatientOptions.length === 1 &&
          (normalizeFormText(activePaymentPatientOptions[0]?.id) === optionId ||
            normalizeFormText(activePaymentPatientOptions[0]?.patientId) ===
              payloadPatientId)
        );
      });
    };
    const patientUpdatesPayload = patients
      .map((patient, index) => {
        const patientId = getPatientMutationId(patient);
        const payloadPatientId = getCompletePayloadPatientId(patient);
        if (!payloadPatientId) {
          return null;
        }

        const patientPayments = getPatientPayments(patient, index);
        const patientCollectedAmount = patientPayments.reduce(
          (total, payment) => total + toCurrencyNumber(payment?.amount),
          0,
        );
        const billingRow = patientBillingRowMap.get(normalizeFormText(patientId));
        const patientPayableTotal = toCurrencyNumber(
          billingRow?.finalPayingAmount,
        );
        const optionId = getCompleteBookingPatientOptionId(patient, index);
        const cancellationPayload = patientCancellationMap[patientId] || {};
        const hasPatientCancellationPayload =
          Object.keys(cancellationPayload).length > 0;
        const requestedRescheduleDate = normalizeFormText(
          cancellationPayload.reschedule_date ||
            cancellationPayload.new_visit_date,
        );
        const requestedRescheduleSlot = normalizeFormText(
          cancellationPayload.reschedule_slot ||
            cancellationPayload.new_time_slot,
        );
        const hasValidRescheduleDetails = Boolean(
          requestedRescheduleDate && requestedRescheduleSlot,
        );
        const shouldMarkCancelled =
          hasPatientCancellationPayload ||
          getPatientBookingStatusForCompletePayload(patient) === 4;
        const bookingPatientStatus = shouldMarkCancelled ? 4 : 3;
        const isPatientPickedForPricks = samplePickPatientIds.includes(optionId);
        const isPatientMarkedTough =
          sampleCollectionEasyTough === 'tough' &&
          sampleCollectionEasyToughPatientIds.includes(optionId);
        const patientSampleCollection =
          patientSampleCollectionMap[patientId] || {};
        const completedTubeNames =
          getCompletedTubeNamesForPayload(patientSampleCollection);
        const additionalSample = (Array.isArray(
          patientSampleCollection?.selectedAdditionalTubes,
        )
          ? patientSampleCollection.selectedAdditionalTubes
          : []
        )
          .map(tubeName => normalizeFormText(tubeName))
          .filter(Boolean)
          .join(',');
        const patientDocumentFileField = `patient_documents_${payloadPatientId}`;
        const patientDocumentMeta = [];
        const appendPatientDocumentMeta = (documents, type) => {
          (Array.isArray(documents) ? documents : []).forEach(() => {
            patientDocumentMeta.push({
              type,
              file_field: patientDocumentFileField,
            });
          });
        };
        (Array.isArray(patientManualSlipDocumentsMap[patientId])
          ? patientManualSlipDocumentsMap[patientId]
          : []
        ).forEach(() => {
          patientDocumentMeta.push({
            type: 'manual_slip',
            file_field: patientDocumentFileField,
          });
        });
        const cghsDocuments = patientCghsDocumentsMap[patientId] || {};
        appendPatientDocumentMeta(cghsDocuments.cghsCard, 'cghs_card');
        appendPatientDocumentMeta(cghsDocuments.patientPhotos, 'patient_photo');
        appendPatientDocumentMeta(
          patientCompletionDocumentsMap[patientId],
          'prescription',
        );
        const patientUpdate = {
          patient_id: payloadPatientId,
          apk_tbs: getApiTestBookingStatusValue(
            patientTestBookingStatusMap[patientId] ||
              DEFAULT_TEST_BOOKING_STATUS,
          ),
          referred_by: normalizeFormText(patient?.referredBy || patient?.referred_by),
          report_schedule:
            normalizeFormText(patientReportScheduleMap[patientId]) || 'routine',
          report_delivery: normalizeReportDeliveryValues(
            patientReportCourierMap[patientId],
          ),
          payment_mode: patientPayments
            .map(payment => normalizePaymentModeForPayload(payment?.mode))
            .filter(Boolean),
          payment_amount: patientPayments.map(payment =>
            toCurrencyNumber(payment?.amount),
          ),
          due_amount: Math.max(0, patientPayableTotal - patientCollectedAmount),
          extra_amount: Math.max(0, patientCollectedAmount - patientPayableTotal),
          no_of_pricks:
            samplePickCount === '1'
              ? '1'
              : isPatientPickedForPricks
              ? normalizeFormText(samplePickCount)
              : '1',
          sample_collection_is: isPatientMarkedTough ? 'tough' : 'easy',
          cmplt_tube: completedTubeNames,
          additional_sample: additionalSample,
          additional_discount_amount: toCurrencyNumber(
            billingRow?.effectiveAdditional,
          ),
          ...(isAppointmentPatientStatusContext
            ? {appointment_patient_status: bookingPatientStatus}
            : {booking_patient_status: bookingPatientStatus}),
          documents: patientDocumentMeta,
        };

        if (bookingPatientStatus === 4) {
          return {
            ...patientUpdate,
            cancel_reason:
              cancellationPayload.cancel_reason ||
              cancellationPayload.cancellation_reason ||
              cancellationPayload.reason ||
              '',
            cancel_remark:
              cancellationPayload.cancel_remarks ||
              cancellationPayload.remarks ||
              '',
            reschedule_requested: hasValidRescheduleDetails
              ? Boolean(
                  cancellationPayload.reschedule_requested ||
                    cancellationPayload.is_reschedule_requested,
                )
              : false,
            reschedule_date: hasValidRescheduleDetails
              ? requestedRescheduleDate
              : null,
            reschedule_slot: hasValidRescheduleDetails
              ? requestedRescheduleSlot
              : null,
          };
        }

        return patientUpdate;
      })
      .filter(Boolean);

    const shouldSendLinkedAppointment =
      hasPendingSampleTubes && Boolean(isLinkedAppointmentSelected);

    return sanitizePayloadValue({
      additional_discount_mode:
        completeAdditionalDiscountAmount > 0 ? 'amount' : '',
      additional_discount_value: completeAdditionalDiscountAmount,
      amount_received: completeAmountReceived,
      pending_amount: pendingPaymentAmount,
      pending_payment_patient_option_id: pendingPaymentPatient?.id || '',
      pending_payment_patient_id: pendingPaymentPatient?.patientId || '',
      pending_payment_patient_name: pendingPaymentPatient?.name || '',
      extra_amount: extraPaymentAmount,
      extra_payment_patient_option_id: pendingPaymentPatient?.id || '',
      extra_payment_patient_id: pendingPaymentPatient?.patientId || '',
      extra_payment_patient_name: pendingPaymentPatient?.name || '',
      linked_appointment: shouldSendLinkedAppointment ? 'yes' : 'no',
      linked_appointment_date: shouldSendLinkedAppointment
        ? linkedAppointmentDate
        : null,
      linked_appointment_time_slot: shouldSendLinkedAppointment
        ? linkedAppointmentTimeSlot
        : null,
      followup_required: shouldSendLinkedAppointment,
      followup_date: shouldSendLinkedAppointment ? linkedAppointmentDate : null,
      followup_time_slot: shouldSendLinkedAppointment
        ? linkedAppointmentTimeSlot
        : null,
      sample_collection_pick_count: samplePickCount,
      sample_collection_pick_patients: completeBookingPatientOptions.filter(
        option => samplePickPatientIds.includes(option.id),
      ),
      sample_collection_easy_tough:
        sampleCollectionEasyTough === 'tough'
          ? null
          : sampleCollectionEasyTough,
      sample_collection_easy_tough_patients:
        sampleCollectionEasyTough === 'tough'
          ? completeBookingPatientOptions.filter(option =>
              sampleCollectionEasyToughPatientIds.includes(option.id),
            )
          : [],
      payment_mode: completePaymentMode,
      payments_collected: paymentCollectionsPayload,
      payment_proofs: completePayments
        .filter(payment => Array.isArray(payment?.proofDocuments))
        .map(payment => ({
          payment_id: payment.id,
          patient_option_id: payment.patientOptionId || '',
          patient_id: payment.patientId || '',
          patient_name: payment.patientName || '',
          mode: payment.mode,
          amount: toCurrencyNumber(payment.amount),
          documents: normalizeStoredUploadDocuments(
            payment.proofDocuments,
            'upi-payment-proof',
          ),
        }))
        .filter(payment => payment.documents.length),
      tests_payload: testsPayload,
      pending_child_tests: pendingChildTestsPayload,
      patient_updates: patientUpdatesPayload,
      patient_additional_discounts: localBillingSummary.patientAdditionalDiscountRows
        .filter(item => item.requestedAdditional > 0 || item.effectiveAdditional > 0)
        .map(item => ({
          patient_id: item.patientId,
          patient_name: item.patientName,
          additional_discount_mode: 'amount',
          requested_additional_discount_value: item.requestedAdditional,
          additional_discount_value: item.effectiveAdditional,
          max_additional_discount_allowed: item.maxAdditionalAllowed,
        })),
      patient_documents_map: Object.entries(patientCompletionDocumentsMap || {}).reduce(
        (accumulator, [patientId, documents]) => {
          const normalizedDocuments = normalizeStoredUploadDocuments(
            documents,
            'prescription',
          );

          if (normalizedDocuments.length) {
            accumulator[patientId] = normalizedDocuments;
          }

          return accumulator;
        },
        {},
      ),
      manual_slip_documents_map: Object.entries(
        patientManualSlipDocumentsMap || {},
      ).reduce((accumulator, [patientId, documents]) => {
        const normalizedDocuments = normalizeStoredUploadDocuments(
          documents,
          'manual-hc-slip',
        );

        if (normalizedDocuments.length) {
          accumulator[patientId] = normalizedDocuments;
        }

        return accumulator;
      }, {}),
      patient_cghs_documents_map: Object.entries(
        patientCghsDocumentsMap || {},
      ).reduce((accumulator, [patientId, sections]) => {
        const normalizedSections = Object.entries(sections || {}).reduce(
          (sectionAccumulator, [sectionKey, documents]) => {
            const normalizedDocuments = normalizeStoredUploadDocuments(
              documents,
              `cghs-document-${sectionKey}`,
            );

            if (normalizedDocuments.length) {
              sectionAccumulator[sectionKey] = normalizedDocuments;
            }

            return sectionAccumulator;
          },
          {},
        );

        if (Object.keys(normalizedSections).length) {
          accumulator[patientId] = normalizedSections;
        }

        return accumulator;
      }, {}),
    });
  }, [
    completeBookingPatientOptions,
    completePaymentPatientOptions,
    completeAdditionalDiscountAmount,
    completeAmountReceived,
    completePaymentMode,
    completePayments,
    getPatientPanelCompanies,
    hasPendingSampleTubes,
    isAppointmentPatientStatusContext,
    isAppointmentSourceBooking,
    isLinkedAppointmentSelected,
    linkedAppointmentDate,
    linkedAppointmentTimeSlot,
    patientCompletionDocumentsMap,
    patientCghsDocumentsMap,
    patientManualSlipDocumentsMap,
    patientCancellationMap,
    patientReportCourierMap,
    patientReportScheduleMap,
    patientSampleCollectionMap,
    patientSelectedTestsMap,
    patientTestBookingStatusMap,
    extraPaymentAmount,
    pendingPaymentAmount,
    pendingPaymentPatientId,
    patients,
    sampleCollectionEasyTough,
    sampleCollectionEasyToughPatientIds,
    samplePickCount,
    samplePickPatientIds,
    localBillingSummary.patientBillingRows,
    localBillingSummary.patientAdditionalDiscountRows,
  ]);

  const rawBookingStatusCode = Number(selectedBooking.bookingStatusCode || 0);
  const labelBookingStatusCode = getBookingStatusCodeFromLabel(
    selectedBooking.status,
  );
  const bookingStatusCode =
    labelBookingStatusCode === 3 || labelBookingStatusCode === 4
      ? labelBookingStatusCode
      : labelBookingStatusCode || rawBookingStatusCode;
  const shouldShowStartOnly = bookingStatusCode === 1;
  const shouldShowProgressActions = bookingStatusCode === 2;
  const canUseActiveBookingControls = bookingStatusCode === 1 || bookingStatusCode === 2;
  const canUsePatientActions = bookingStatusCode === 2;
  const canCancelPatientForBooking = bookingStatusCode === 2;
  const isCompletedBooking = bookingStatusCode === 3;
  const isCancelledBooking = bookingStatusCode === 4;
  const isPartialCompleteBooking = bookingStatusCode === 5;
  const isTerminalBooking =
    isCancelledBooking || isCompletedBooking || isPartialCompleteBooking;
  const terminalBookingMessage = isCancelledBooking
    ? 'This booking has been cancelled. No further action is available.'
    : isPartialCompleteBooking
    ? 'This booking is partially completed. No further action is available.'
    : 'This booking has already been completed. No further action is available.';
  const showBookingStartRequiredAlert = useCallback(() => {
    showAppAlert(
      'Start Booking First',
      'Please start the booking before using this action.',
    );
  }, [showAppAlert]);
  const deferredPanelCompanySearch = useDeferredValue(panelCompanySearch);
  const deferredPatientFormPanelCompanySearch = useDeferredValue(
    patientForm.panelCompany,
  );
  const deferredTestSearch = useDeferredValue(testSearch);
  const hasPanelCompanySearch = deferredPanelCompanySearch.trim().length > 0;
  const hasPatientFormPanelCompanySearch =
    deferredPatientFormPanelCompanySearch.trim().length > 0;
  const hasTestSearch = deferredTestSearch.trim().length > 0;
  const filteredPanelCompanyItems = useMemo(() => {
    const searchText = deferredPanelCompanySearch.trim().toLowerCase();

    if (!searchText) {
      return panelCompanyItems;
    }

    const searchTokens = searchText.split(/\s+/).filter(Boolean);

    return panelCompanyItems
      .filter(item => searchTokens.every(token => item.searchKey.includes(token)))
      .sort((leftItem, rightItem) => {
        const leftRank = getPanelCompanySearchRank(
          leftItem,
          searchText,
          searchTokens,
        );
        const rightRank = getPanelCompanySearchRank(
          rightItem,
          searchText,
          searchTokens,
        );

        if (leftRank !== rightRank) {
          return leftRank - rightRank;
        }

        return normalizeFormText(leftItem?.name).localeCompare(
          normalizeFormText(rightItem?.name),
          undefined,
          {numeric: true, sensitivity: 'base'},
        );
      });
  }, [panelCompanyItems, deferredPanelCompanySearch]);
  const visiblePanelCompanyItems = useMemo(
    () =>
      hasPanelCompanySearch
        ? filteredPanelCompanyItems.slice(0, PANEL_COMPANY_SEARCH_VISIBLE_LIMIT)
        : filteredPanelCompanyItems.slice(0, PANEL_COMPANY_DEFAULT_VISIBLE),
    [filteredPanelCompanyItems, hasPanelCompanySearch],
  );
  const filteredPatientFormPanelCompanyItems = useMemo(() => {
    const searchText =
      deferredPatientFormPanelCompanySearch.trim().toLowerCase();

    if (!searchText) {
      return [];
    }

    const searchTokens = searchText.split(/\s+/).filter(Boolean);

    return patientFormPanelCompanyItems
      .filter(item => searchTokens.every(token => item.searchKey.includes(token)))
      .sort((leftItem, rightItem) => {
        const leftRank = getPanelCompanySearchRank(
          leftItem,
          searchText,
          searchTokens,
        );
        const rightRank = getPanelCompanySearchRank(
          rightItem,
          searchText,
          searchTokens,
        );

        if (leftRank !== rightRank) {
          return leftRank - rightRank;
        }

        return normalizeFormText(leftItem?.name).localeCompare(
          normalizeFormText(rightItem?.name),
          undefined,
          {numeric: true, sensitivity: 'base'},
        );
      })
      .slice(0, PANEL_COMPANY_SEARCH_VISIBLE_LIMIT);
  }, [deferredPatientFormPanelCompanySearch, patientFormPanelCompanyItems]);
  const shouldShowPatientFormPanelCompanySuggestions =
    isPatientFormPanelCompanyFocused && hasPatientFormPanelCompanySearch;
  const activeCatalogItems = useMemo(() => {
    if (!selectedCatalogSubgroup) {
      return selectedCatalogGroup?.subgroups || panelCatalogGroups;
    }

    const tests = Array.isArray(selectedCatalogSubgroup.tests)
      ? selectedCatalogSubgroup.tests
      : [];
    const searchText = deferredTestSearch.trim().toLowerCase();

    if (!searchText) {
      return sortCatalogTestsByCode(tests);
    }

    return sortCatalogTestsByCode(tests.filter(test => {
      const testSearchKey = `${normalizeFormText(test?.description)} ${normalizeFormText(
        test?.booked_code,
      )} ${normalizeFormText(test?.panel_company_name)}`.toLowerCase();
      const childTests = Array.isArray(test?.child_tests) ? test.child_tests : [];
      const childSearchKey = childTests
        .map(
          childTest =>
            `${normalizeFormText(childTest?.description)} ${normalizeFormText(
              childTest?.booked_code,
            )}`.toLowerCase(),
        )
        .join(' ');

      return (
        testSearchKey.includes(searchText) ||
        childSearchKey.includes(searchText)
      );
    }));
  }, [
    deferredTestSearch,
    panelCatalogGroups,
    selectedCatalogGroup,
    selectedCatalogSubgroup,
  ]);
  const visibleCatalogItems = useMemo(
    () =>
      selectedCatalogSubgroup
        ? activeCatalogItems.slice(0, catalogVisibleCount)
        : activeCatalogItems.slice(0, catalogVisibleCount),
    [
      activeCatalogItems,
      catalogVisibleCount,
      selectedCatalogSubgroup,
    ],
  );
  const hasMoreCatalogItems = activeCatalogItems.length > visibleCatalogItems.length;
  const loadMoreCatalogItems = useCallback(() => {
    setCatalogVisibleCount(previousCount =>
      previousCount >= activeCatalogItems.length
        ? previousCount
        : Math.min(
            previousCount + CATALOG_ITEM_PAGE_SIZE,
            activeCatalogItems.length,
          ),
    );
  }, [activeCatalogItems.length]);

  const loadAddressCities = useCallback(async () => {
    setIsAddressCityLoading(true);
    try {
      const response = await getLocalAddressCitiesResponse();
      const cities = Array.isArray(response?.items) ? response.items : [];
      setAddressCityOptions(cities);
      return cities;
    } catch (error) {
      warnDebug('Address city lookup failed:', error);
      setAddressCityOptions([]);
      return [];
    } finally {
      setIsAddressCityLoading(false);
    }
  }, []);
  const loadAddressColonies = useCallback(async city => {
    const normalizedCity = normalizeFormText(city);
    if (!normalizedCity) {
      setAddressColonyOptions([]);
      return [];
    }

    setIsAddressColonyLoading(true);
    try {
      const response = await getLocalAddressColoniesByCityResponse(normalizedCity);
      const colonies = Array.isArray(response?.items)
        ? response.items.filter(colony => normalizeFormText(colony?.colony_name))
        : [];
      setAddressColonyOptions(colonies);
      return colonies;
    } catch (error) {
      warnDebug('Address colony lookup failed:', error);
      setAddressColonyOptions([]);
      return [];
    } finally {
      setIsAddressColonyLoading(false);
    }
  }, []);
  const resolveRouteForPincode = useCallback(async (pincode, currentForm = {}) => {
    const normalizedPincode = normalizeFormText(pincode);
    if (!normalizedPincode || normalizeFormText(currentForm.route)) {
      return;
    }

    try {
      const response = await getLocalAddressRoutesByPincodeResponse(
        normalizedPincode,
      );
      const routes = Array.isArray(response?.items) ? response.items : [];
      const uniqueRoutes = Array.from(
        new Set(routes.map(item => normalizeFormText(item?.route_no)).filter(Boolean)),
      );

      if (uniqueRoutes.length === 1) {
        setAddressForm(previousForm =>
          normalizeFormText(previousForm.route)
            ? previousForm
            : {...previousForm, route: uniqueRoutes[0]},
        );
      }
    } catch (error) {
      warnDebug('Address pincode route lookup failed:', error);
    }
  }, []);
  const handleAddressFormChange = useCallback(
    (field, value) => {
      setAddressForm(previousForm => {
        const nextValue =
          field === 'floor'
            ? String(value || '')
                .replace(/[^0-9]/g, '')
                .slice(0, 2)
            : field === 'pincode'
            ? String(value || '')
                .replace(/[^0-9]/g, '')
                .slice(0, 6)
            : value;
        const nextForm = {
          ...previousForm,
          [field]: nextValue,
        };

        if (field === 'floor') {
          const numericFloor = Number(nextValue);
          nextForm.floor =
            nextValue && numericFloor > 99
              ? '99'
              : nextValue && numericFloor < 1
              ? ''
              : nextValue;
        }

        if (field === 'floor_special' && nextValue === 'None') {
          nextForm.floor = '';
        }

        if (field === 'city') {
          nextForm.colony = '';
          nextForm.pincode = '';
          nextForm.route = '';
          nextForm.is_manual_pincode = false;
          loadAddressColonies(value);
        }

        if (field === 'colony') {
          if (!previousForm.is_manual_pincode) {
            const selectedColony = addressColonyOptions.find(
              colony =>
                normalizeFormText(colony?.colony_name) === normalizeFormText(value),
            );
            if (selectedColony) {
              nextForm.pincode = normalizeFormText(selectedColony.pincode);
              nextForm.route = normalizeFormText(selectedColony.route_no);
            }
          }
        }

        if (field === 'pincode') {
          nextForm.route = '';
          resolveRouteForPincode(value, nextForm);
        }

        if (field === 'is_manual_pincode') {
          nextForm.is_manual_pincode = Boolean(value);
          if (nextForm.is_manual_pincode) {
            nextForm.route = '';
            if (nextForm.pincode) {
              resolveRouteForPincode(nextForm.pincode, nextForm);
            }
          } else {
            nextForm.colony = '';
            nextForm.pincode = '';
            nextForm.route = '';
          }
        }

        return nextForm;
      });
    },
    [addressColonyOptions, loadAddressColonies, resolveRouteForPincode],
  );
  const handleUpdateAddress = useCallback(async () => {
    const requiredFields = [
      ['house_flat_no', 'House/Flat No'],
      ...(addressForm.floor_special === 'None' ? [] : [['floor', 'Floor']]),
      ['city', 'City'],
      ['colony', 'Colony'],
      ['pincode', 'Pincode'],
      ['route', 'Route'],
    ];
    const missingField = requiredFields.find(
      ([field]) => !normalizeFormText(addressForm[field]),
    );

    if (missingField) {
      showAppAlert('Address Required', `Please enter ${missingField[1]}.`);
      return;
    }

    const didUpdate = await (async () => {
      try {
        setIsAddressUpdating(true);
        return await onUpdateBookingAddress?.(
          buildAddressPayloadFromForm(addressForm),
        );
      } finally {
        setIsAddressUpdating(false);
      }
    })();

    if (didUpdate) {
      onBookingScreenChange?.('details');
    }
  }, [addressForm, onBookingScreenChange, onUpdateBookingAddress, showAppAlert]);
  const openEditAddressScreen = useCallback(() => {
    if (isAppointmentSourceBooking) {
      return;
    }

    onBookingScreenChange?.('edit-address');
    loadAddressCities();
    loadAddressColonies(addressForm.city);
  }, [
    addressForm.city,
    isAppointmentSourceBooking,
    loadAddressCities,
    loadAddressColonies,
    onBookingScreenChange,
  ]);
  const resolvedFloorAddressPart = useMemo(() => {
    const floorSpecial = normalizeFormText(addressForm.floor_special);
    const floorValue = normalizeFormText(addressForm.floor);

    if (floorSpecial && floorSpecial !== 'None') {
      return floorSpecial;
    }

    if (!floorValue || floorValue === 'N/A') {
      return '';
    }

    return /^\d+$/.test(floorValue)
      ? `Floor-${floorValue}`
      : floorValue.replace(/_/g, ' ');
  }, [addressForm.floor, addressForm.floor_special]);
  const mergedSelectedBookingAddress = [
    addressForm.house_flat_no
      ? `House/Flat No - ${addressForm.house_flat_no}`
      : '',
    resolvedFloorAddressPart,
    addressForm.block_tower_no
      ? `Block/Tower No - ${addressForm.block_tower_no}`
      : '',
    addressForm.street_sector,
    addressForm.landmark,
    addressForm.colony,
    addressForm.city,
    addressForm.pincode,
  ]
    .filter(value => value && value !== 'N/A')
    .join(', ');
  const resolvedAddress =
    selectedBooking.address.fullAddress &&
        selectedBooking.address.fullAddress !== 'Address not available'
      ? selectedBooking.address.fullAddress
      : mergedSelectedBookingAddress;
  const locationSearchAddress = mergedSelectedBookingAddress || resolvedAddress;
  const resolvedLandmark = normalizeFormText(
    addressForm.landmark || selectedBooking.address.landmark,
  );
  const latitude =
    selectedBooking.address.latitude && selectedBooking.address.latitude !== 'N/A'
      ? selectedBooking.address.latitude
      : '';
  const longitude =
    selectedBooking.address.longitude &&
    selectedBooking.address.longitude !== 'N/A'
      ? selectedBooking.address.longitude
      : '';
  const locationUrl = normalizeFormText(
    addressForm.google_location || selectedBooking.address.locationUrl,
  );
  const patientCount = patientSelectorItems.length || selectedBooking.patients.length;

  const handleOpenLocation = async () => {
    if (!locationUrl && !locationSearchAddress && (!latitude || !longitude)) {
      return;
    }

    const mapsQuery =
      latitude && longitude
        ? `${latitude},${longitude}`
        : encodeURIComponent(locationSearchAddress);
    const mapsUrl =
      locationUrl ||
      `https://www.google.com/maps/search/?api=1&query=${mapsQuery}`;

    try {
      await Linking.openURL(mapsUrl);
    } catch (error) {
      warnDebug('Open location error:', error);
    }
  };

  const handleCallBookingPhone = async () => {
    const phoneNumber = normalizeFormText(selectedBooking.phoneNumber).replace(
      /\D/g,
      '',
    );

    if (!phoneNumber) {
      return;
    }

    const openPhoneCall = async () => {
      try {
        await Linking.openURL(`tel:${phoneNumber}`);
      } catch (error) {
        warnDebug('Open booking phone error:', error);
        showAppAlert('Call Failed', 'Unable to open the phone dialer right now.');
      }
    };
    const openWhatsApp = async () => {
      try {
        await Linking.openURL(`https://wa.me/${phoneNumber}`);
      } catch (error) {
        warnDebug('Open booking WhatsApp error:', error);
        showAppAlert('WhatsApp Failed', 'Unable to open WhatsApp right now.');
      }
    };

    showAppAlert(
      'Contact Patient',
      `Choose how you want to contact ${selectedBooking.patientName || 'this patient'}.`,
      [
        {text: 'Phone Call', onPress: openPhoneCall},
        {text: 'WhatsApp', onPress: openWhatsApp},
        {text: 'Cancel', style: 'cancel'},
      ],
      {cancelable: true},
    );
  };

  const updatePatientFormField = (field, value) => {
    setPatientForm(previousForm => ({
      ...previousForm,
      [field]: value,
    }));
  };

  const handlePatientFormPanelCompanyChange = value => {
    updatePatientFormField('panelCompany', value);
    setIsPatientFormPanelCompanyFocused(true);
  };

  const handleSelectPatientFormPanelCompany = company => {
    updatePatientFormField(
      'panelCompany',
      normalizeFormText(company?.name || company?.panelCompany),
    );
    setIsPatientFormPanelCompanyFocused(false);
  };

  const handleTitleChange = title => {
    setPatientForm(previousForm => ({
      ...previousForm,
      title,
      gender: getGenderFromTitle(title),
    }));
  };

  const handleDobChange = value => {
    setPatientForm(previousForm => ({
      ...previousForm,
      dateOfBirth: value,
      ageYears: calculateAgeFromDob(value),
    }));
  };

  const handleDobDateSelect = date => {
    handleDobChange(toDateInputValue(date));
    setDobCalendarMonth(new Date(date.getFullYear(), date.getMonth(), 1));
    setIsDobCalendarVisible(false);
  };

  const moveDobCalendarMonth = direction => {
    setDobCalendarMonth(previousMonth => {
      const nextMonth = new Date(
        previousMonth.getFullYear(),
        previousMonth.getMonth() + direction,
        1,
      );
      return nextMonth;
    });
  };

  const resetAddPatientForm = () => {
    setPatientForm(INITIAL_PATIENT_FORM);
    setEditingPatient(null);
    setIsPatientFormPanelCompanyFocused(false);
    setSelectedLinkedPatientId('');
    setAddPatientModalStep('linked-list');
    setPatientDocuments([]);
    setDobCalendarMonth(new Date());
    setIsDobCalendarVisible(false);
  };

  const closeAddPatientModal = () => {
    if (isAddingPatient || isUpdatingPatient) {
      return;
    }

    setIsDobCalendarVisible(false);
    setSelectedLinkedPatientId('');
    setAddPatientModalStep('linked-list');
    setIsPatientFormPanelCompanyFocused(false);
    setIsAddPatientModalVisible(false);
  };

  const handleAddPatientPress = () => {
    if (!canUsePatientActions) {
      showBookingStartRequiredAlert();
      return;
    }

    resetAddPatientForm();
    setIsAddPatientModalVisible(true);
  };

  const handleEditPatientPress = patient => {
    if (isAppointmentSourceBooking) {
      return;
    }

    if (!canUsePatientActions) {
      showBookingStartRequiredAlert();
      return;
    }

    const patientIdentityValues = [
      patient?.bookingPatientId,
      patient?.booking_patient_id,
      patient?.patientId,
      patient?.patient_id,
      patient?.id,
    ]
      .map(normalizeFormText)
      .filter(Boolean);
    const latestPatient =
      patients.find(currentPatient =>
        [
          currentPatient?.bookingPatientId,
          currentPatient?.booking_patient_id,
          currentPatient?.patientId,
          currentPatient?.patient_id,
          currentPatient?.id,
        ]
          .map(normalizeFormText)
          .filter(Boolean)
          .some(value => patientIdentityValues.includes(value)),
      ) || patient;

    const title = normalizeOptionValue(
      latestPatient.title,
      TITLE_OPTIONS,
      INITIAL_PATIENT_FORM.title,
    );
    const dateOfBirth = normalizeFormText(latestPatient.dob);
    const ageYears =
      calculateAgeFromDob(dateOfBirth) || normalizeFormText(latestPatient.age);

    setEditingPatient(latestPatient);
    setPatientForm({
      title,
      fullName: normalizeFormText(latestPatient.name),
      gender: normalizeFormText(latestPatient.gender) || getGenderFromTitle(title),
      dateOfBirth,
      ageYears,
      primaryMobile: normalizeMobileValue(latestPatient.mobileNumber),
      alternateMobile: normalizeMobileValue(latestPatient.alternateMobileNumber),
      email: normalizeFormText(latestPatient.email),
      labmatePid: normalizeFormText(latestPatient.labmatePid),
      panelCompany:
        normalizeFormText(latestPatient.panelCompany) ||
        INITIAL_PATIENT_FORM.panelCompany,
      cghsCardNo: normalizeFormText(
        latestPatient.cardNo ||
          latestPatient.card_no ||
          latestPatient.cghsCardNo ||
          latestPatient.cghs_card_no,
      ),
      tag: serializePatientTags(normalizePatientTagValues(latestPatient.tag)),
      tags: normalizePatientTagValues(latestPatient.tag),
    });
    setPatientDocuments([]);

    if (/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth)) {
      const [year, month] = dateOfBirth.split('-').map(Number);
      setDobCalendarMonth(new Date(year, month - 1, 1));
    } else {
      setDobCalendarMonth(new Date());
    }

    setIsDobCalendarVisible(false);
    setIsPatientFormPanelCompanyFocused(false);
    setAddPatientModalStep('form');
    setIsAddPatientModalVisible(true);
  };

  const handleOpenAddPatientForm = () => {
    setIsPatientFormPanelCompanyFocused(false);
    setSelectedLinkedPatientId('');
    setAddPatientModalStep('form');
  };

  const handleUseLinkedPatient = async () => {
    if (!canUsePatientActions) {
      showBookingStartRequiredAlert();
      return;
    }

    if (!selectedLinkedPatient) {
      showAppAlert(
        'Select Linked Patient',
        'Please select a linked patient first.',
      );
      return;
    }

    const didSavePatient = await onAddPatient({
      existing_patient_id: selectedLinkedPatient.id,
      linked_patient: selectedLinkedPatient,
    });

    if (didSavePatient) {
      setIsAddPatientModalVisible(false);
      resetAddPatientForm();
    }
  };

  const resetCancelForm = useCallback(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);

    setCancellationReason(CANCELLATION_REASON_OPTIONS[0]);
    setIsCancellationReasonSelectVisible(false);
    setIsCancelTimeSlotSelectVisible(false);
    setIsCancelRescheduleRequested(true);
    setIsCancelKnownSlot(true);
    setCancelRemarks('');
    setCancelNewVisitDate(toDateInputValue(tomorrow));
    setCancelCalendarMonth(new Date(tomorrow.getFullYear(), tomorrow.getMonth(), 1));
    setCancelNewTimeSlot(CANCEL_TIME_SLOT_OPTIONS[0]);
  }, []);

  const handlePatientCancelBooking = patient => {
    if (!canUsePatientActions) {
      showBookingStartRequiredAlert();
      return;
    }

    resetCancelForm();
    setCancelTargetPatient(patient);
    setIsCancelBookingModalVisible(true);
  };

  const handleReportCourierChange = useCallback((patient, nextValue) => {
    if (!canUsePatientActions) {
      showBookingStartRequiredAlert();
      return;
    }

    const patientId = patient?.id || getPatientMutationId(patient);

    if (!patientId) {
      return;
    }

    setPatientReportCourierMap(previousMap => {
      const selectedValues = normalizeReportDeliveryValues(
        previousMap[patientId],
      );
      const normalizedNextValue = normalizeFormText(nextValue);
      const nextValues = selectedValues.includes(normalizedNextValue)
        ? selectedValues.filter(value => value !== normalizedNextValue)
        : [...selectedValues, normalizedNextValue];

      return {
        ...previousMap,
        [patientId]: nextValues,
      };
    });
  }, [
    canUsePatientActions,
    setPatientReportCourierMap,
    showBookingStartRequiredAlert,
  ]);

  const handleReportScheduleChange = useCallback((patient, nextValue) => {
    if (!canUsePatientActions) {
      showBookingStartRequiredAlert();
      return;
    }

    const patientId = patient?.id || getPatientMutationId(patient);

    if (!patientId) {
      return;
    }

    const normalizedNextValue = normalizeFormText(nextValue) || 'routine';

    setPatientReportScheduleMap(previousMap => ({
      ...previousMap,
      [patientId]: normalizedNextValue,
    }));
  }, [
    canUsePatientActions,
    setPatientReportScheduleMap,
    showBookingStartRequiredAlert,
  ]);

  const handleTestBookingStatusChange = (patient, nextValue) => {
    if (!canUsePatientActions) {
      showBookingStartRequiredAlert();
      return;
    }

    const patientId = getPatientMutationId(patient);

    if (!patientId) {
      return;
    }

    setPatientTestBookingStatusMap(previousMap => ({
      ...previousMap,
      [patientId]: nextValue,
    }));
  };

  const handlePatientCghsEnabledChange = (patient, isEnabled) => {
    if (!canUsePatientActions) {
      showBookingStartRequiredAlert();
      return;
    }

    const patientId = getPatientMutationId(patient);

    if (!patientId) {
      return;
    }

    setPatientCghsEnabledMap(previousMap => ({
      ...previousMap,
      [patientId]: Boolean(isEnabled),
    }));
  };

  const handlePatientCghsIdChange = (patient, nextValue) => {
    if (!canUsePatientActions) {
      showBookingStartRequiredAlert();
      return;
    }

    const patientId = getPatientMutationId(patient);

    if (!patientId) {
      return;
    }

    setPatientCghsIdMap(previousMap => ({
      ...previousMap,
      [patientId]: nextValue,
    }));
  };

  const handlePatientCghsDocumentsChange = (patient, sectionKey, documents) => {
    if (!canUsePatientActions) {
      showBookingStartRequiredAlert();
      return;
    }

    const patientId = getPatientMutationId(patient);

    if (!patientId || !sectionKey) {
      return;
    }

    setPatientCghsDocumentsMap(previousMap => ({
      ...previousMap,
      [patientId]: {
        ...(previousMap[patientId] || {}),
        [sectionKey]: normalizeStoredUploadDocuments(
          documents,
          `cghs-document-${sectionKey}`,
        ),
      },
    }));
  };

  const handlePatientPaymentProofDocumentsChange = useCallback((patient, documents) => {
    if (!canUsePatientActions) {
      showBookingStartRequiredAlert();
      return;
    }

    const patientId = getPatientMutationId(patient);

    if (!patientId) {
      return;
    }

    const nextDocuments = normalizeStoredUploadDocuments(
      documents,
      'prescription',
    );

    setPatientCompletionDocumentsMap(previousMap => {
      const previousDocuments = previousMap[patientId] || EMPTY_UPLOAD_DOCUMENTS;

      if (previousDocuments === nextDocuments) {
        return previousMap;
      }

      return {
        ...previousMap,
        [patientId]: nextDocuments,
      };
    });

    onAppointmentDetailStateChange?.(previousState => ({
      ...previousState,
      patientCompletionDocumentsMap: {
        ...(previousState?.patientCompletionDocumentsMap || {}),
        [patientId]: nextDocuments,
      },
    }));
  }, [
    canUsePatientActions,
    onAppointmentDetailStateChange,
    showBookingStartRequiredAlert,
  ]);

  const handlePatientManualSlipDocumentsChange = useCallback((patient, documents) => {
    if (!canUsePatientActions) {
      showBookingStartRequiredAlert();
      return;
    }

    const patientId = getPatientMutationId(patient);

    if (!patientId) {
      return;
    }

    const nextDocuments = normalizeStoredUploadDocuments(
      documents,
      'manual-hc-slip',
    );

    setPatientManualSlipDocumentsMap(previousMap => ({
      ...previousMap,
      [patientId]: nextDocuments,
    }));

    onAppointmentDetailStateChange?.(previousState => ({
      ...previousState,
      patientManualSlipDocumentsMap: {
        ...(previousState?.patientManualSlipDocumentsMap || {}),
        [patientId]: nextDocuments,
      },
    }));
  }, [
    canUsePatientActions,
    onAppointmentDetailStateChange,
    showBookingStartRequiredAlert,
  ]);

  const openCancelBookingModal = () => {
    resetCancelForm();
    setCancelTargetPatient(null);
    setIsCancelBookingModalVisible(true);
  };

  const closeCancelBookingModal = () => {
    if (
      bookingActionLoading === 'cancel' ||
      (cancelTargetPatient &&
        String(cancellingPatientId) ===
          String(getPatientMutationId(cancelTargetPatient)))
    ) {
      return;
    }

    setIsCancelBookingModalVisible(false);
    setCancelTargetPatient(null);
    setIsCancelCalendarVisible(false);
    setIsCancellationReasonSelectVisible(false);
    setIsCancelTimeSlotSelectVisible(false);
  };

  const validateAppointmentDetailsBeforeBilling = useCallback(() => {
    const validationError = getAppointmentDetailsBillingValidationError({
      patients,
      patientTestBookingStatusMap,
      patientCghsDocumentsMap,
      patientManualSlipDocumentsMap,
      patientSampleCollectionMap,
      patientCompletionDocumentsMap,
      patientReportCourierMap,
      doesPatientRequireIdentityDocuments,
      doesPatientNeedPaymentProof,
      normalizeReportDeliveryValues,
      skipPatientDocumentRequirements: isAppointmentSourceBooking,
    });

    if (!validationError) {
      return true;
    }

    showAppAlert(validationError.title, validationError.message);
    return false;
  }, [
    doesPatientNeedPaymentProof,
    doesPatientRequireIdentityDocuments,
    isAppointmentSourceBooking,
    patientCghsDocumentsMap,
    patientCompletionDocumentsMap,
    patientManualSlipDocumentsMap,
    patientReportCourierMap,
    patientSampleCollectionMap,
    patientTestBookingStatusMap,
    patients,
    showAppAlert,
  ]);

  const openCompleteBookingScreen = () => {
    if (!shouldShowProgressActions) {
      showBookingStartRequiredAlert();
      return;
    }

    if (!validateAppointmentDetailsBeforeBilling()) {
      return;
    }

    setIsCompleteBookingScreenVisible(true);
    onBookingScreenChange?.('billing-summary');
    setIsLinkedAppointmentCalendarVisible(false);
    setIsLinkedAppointmentTimeSlotSelectVisible(false);

    if (!isLinkedAppointmentSelected) {
      setLinkedAppointmentDate('');
      setLinkedAppointmentTimeSlot('');
    }
  };

  const closeCompleteBookingScreen = () => {
    if (bookingActionLoading === 'completed') {
      return;
    }

    setIsCompleteBookingScreenVisible(false);
    onBookingScreenChange?.('details');
    setIsLinkedAppointmentCalendarVisible(false);
    setIsLinkedAppointmentTimeSlotSelectVisible(false);
  };

  useEffect(() => {
    if (
      selectedBookingScreen === 'billing-summary' ||
      !isCompleteBookingScreenVisible
    ) {
      return;
    }

    setIsCompleteBookingScreenVisible(false);
    setIsLinkedAppointmentCalendarVisible(false);
    setIsLinkedAppointmentTimeSlotSelectVisible(false);
  }, [isCompleteBookingScreenVisible, selectedBookingScreen]);

  const handleLinkedAppointmentChange = useCallback(isSelected => {
    setIsLinkedAppointmentSelected(isSelected);

    if (!isSelected) {
      setLinkedAppointmentDate('');
      setLinkedAppointmentTimeSlot('');
      setIsLinkedAppointmentCalendarVisible(false);
      setIsLinkedAppointmentTimeSlotSelectVisible(false);
    }
  }, []);

  const handleSamplePickCountChange = useCallback(
    value => {
      setSamplePickCount(value);
      if (value === '1') {
        setSamplePickPatientIds([]);
        return;
      }

      if (completeBookingPatientOptions.length === 1) {
        setSamplePickPatientIds([completeBookingPatientOptions[0].id]);
      }
    },
    [completeBookingPatientOptions],
  );

  const handleSamplePickPatientToggle = useCallback(patientId => {
    setSamplePickPatientIds(previousIds =>
      previousIds.includes(patientId)
        ? previousIds.filter(id => id !== patientId)
        : [...previousIds, patientId],
    );
  }, []);

  const handleSampleCollectionEasyToughChange = useCallback(
    value => {
      setSampleCollectionEasyTough(value);

      if (value !== 'tough') {
        setSampleCollectionEasyToughPatientIds([]);
        return;
      }

      if (completeBookingPatientOptions.length === 1) {
        setSampleCollectionEasyToughPatientIds([
          completeBookingPatientOptions[0].id,
        ]);
      }
    },
    [completeBookingPatientOptions],
  );

  const handleSampleCollectionEasyToughPatientToggle = useCallback(patientId => {
    setSampleCollectionEasyToughPatientIds(previousIds =>
      previousIds.includes(patientId)
        ? previousIds.filter(id => id !== patientId)
        : [...previousIds, patientId],
    );
  }, []);

  const buildCancelPayload = useCallback(
    () =>
      sanitizePayloadValue({
        cancellation_reason: cancellationReason,
        cancel_reason: cancellationReason,
        reason: cancellationReason,
        remarks: cancelRemarks,
        cancel_remarks: cancelRemarks,
        reschedule_requested: Boolean(isCancelRescheduleRequested),
        is_reschedule_requested: Boolean(isCancelRescheduleRequested),
        is_new_slot_known: Boolean(
          isCancelRescheduleRequested && isCancelKnownSlot,
        ),
        new_visit_date:
          isCancelRescheduleRequested && isCancelKnownSlot
            ? cancelNewVisitDate
            : null,
        new_time_slot:
          isCancelRescheduleRequested && isCancelKnownSlot
            ? cancelNewTimeSlot
            : null,
      }),
    [
      cancelNewTimeSlot,
      cancelNewVisitDate,
      cancelRemarks,
      cancellationReason,
      isCancelKnownSlot,
      isCancelRescheduleRequested,
    ],
  );

  const confirmCancelBooking = async () => {
    const cancelPayload = buildCancelPayload();
    const didCancel = cancelTargetPatient
      ? true
      : await onBookingAction('cancel', cancelPayload);

    if (didCancel) {
      if (cancelTargetPatient) {
        const cancelledPatientId = getPatientMutationId(cancelTargetPatient);
        if (cancelledPatientId) {
          setPatientCancellationMap(previousMap => ({
            ...previousMap,
            [cancelledPatientId]: cancelPayload,
          }));
        }
      }
      setIsCancelBookingModalVisible(false);
      setCancelTargetPatient(null);
    }
  };

  const validatePatientAdditionalDiscounts = useCallback(() => {
    const invalidDiscount = localBillingSummary.patientAdditionalDiscountRows.find(
      item =>
        item.requestedAdditional > 0 &&
        item.requestedAdditional > item.maxAdditionalAllowed,
    );

    if (!invalidDiscount) {
      additionalDiscountLimitAlertKeyRef.current = '';
      return true;
    }

    const message = `Maximum additional discount allowed for ${invalidDiscount.patientName} is Rs. ${invalidDiscount.maxAdditionalAllowed.toFixed(
      2,
    )}.`;
    if (additionalDiscountLimitAlertKeyRef.current !== message) {
      additionalDiscountLimitAlertKeyRef.current = message;
      showAppAlert('Additional Discount Limit', message);
    }
    return false;
  }, [localBillingSummary.patientAdditionalDiscountRows, showAppAlert]);

  const handlePatientAdditionalDiscountChange = useCallback(
    (patientId, nextValue) => {
      const normalizedPatientId = normalizeFormText(patientId);
      if (!normalizedPatientId) {
        return;
      }

      const sanitizedValue = String(nextValue || '').replace(/[^0-9.]/g, '');
      setPatientAdditionalDiscountDraftMap(previousMap => ({
        ...previousMap,
        [normalizedPatientId]: sanitizedValue,
      }));
    },
    [],
  );
  const handleAdditionalDiscountToggle = useCallback(() => {
    setIsAdditionalDiscountEnabled(previousValue => {
      const nextValue = !previousValue;

      if (!nextValue) {
        additionalDiscountLimitAlertKeyRef.current = '';
        setPatientAdditionalDiscountDraftMap({});
        setPatientAdditionalDiscountMap({});
      }

      return nextValue;
    });
  }, [setPatientAdditionalDiscountMap]);

  const handleApplyPatientAdditionalDiscount = useCallback(
    patientId => {
      const normalizedPatientId = normalizeFormText(patientId);
      if (!normalizedPatientId) {
        return;
      }

      const patientDiscount = patientAdditionalDiscountUiRows.find(
        item => item.patientId === normalizedPatientId,
      );
      if (!patientDiscount) {
        return;
      }

      const requestedAdditional = toCurrencyNumber(
        patientAdditionalDiscountDraftMap[normalizedPatientId],
      );

      if (requestedAdditional > patientDiscount.maxAdditionalAllowed) {
        const message = `Maximum additional discount allowed for ${patientDiscount.patientName} is Rs. ${patientDiscount.maxAdditionalAllowed.toFixed(
          2,
        )}.`;
        additionalDiscountLimitAlertKeyRef.current = message;
        showAppAlert('Additional Discount Limit', message);
        return;
      }

      additionalDiscountLimitAlertKeyRef.current = '';
      setPatientAdditionalDiscountDraftMap(previousMap => ({
        ...previousMap,
        [normalizedPatientId]:
          requestedAdditional > 0
            ? String(patientAdditionalDiscountDraftMap[normalizedPatientId] || '')
            : '',
      }));
      setPatientAdditionalDiscountMap(previousMap => ({
        ...previousMap,
        ...(requestedAdditional > 0
          ? {
              [normalizedPatientId]: String(
                patientAdditionalDiscountDraftMap[normalizedPatientId] || '',
              ),
            }
          : {}),
        ...(requestedAdditional > 0 ? {} : {[normalizedPatientId]: '0'}),
      }));
      showAppAlert(
        requestedAdditional > 0
          ? 'Additional Discount Applied'
          : 'Additional Discount Removed',
        requestedAdditional > 0
          ? `Rs. ${requestedAdditional.toFixed(2)} additional discount applied for ${patientDiscount.patientName}.`
          : `Additional discount removed for ${patientDiscount.patientName}.`,
      );
    },
    [
      patientAdditionalDiscountDraftMap,
      patientAdditionalDiscountUiRows,
      setPatientAdditionalDiscountMap,
      showAppAlert,
    ],
  );

  const confirmCompleteBooking = async () => {
    const hasSampleCollectionPatients = completeBookingPatientOptions.length > 0;
    const hasNonManualPatients = nonManualCompleteBookingPatientOptions.length > 0;
    const shouldSendLinkedAppointment =
      hasPendingSampleTubes && Boolean(isLinkedAppointmentSelected);

    if (hasSampleCollectionPatients && !samplePickCount) {
      showAppAlert(
        'No. of Pricks Required',
        'Please select no. of pricks in sample collection.',
      );
      return;
    }

    if (
      hasSampleCollectionPatients &&
      samplePickCount !== '1' &&
      completeBookingPatientOptions.length &&
      !samplePickPatientIds.length
    ) {
      showAppAlert(
        'Patient Required',
        'Please select patient name for no. of pricks in sample collection.',
      );
      return;
    }

    if (hasSampleCollectionPatients && !sampleCollectionEasyTough) {
      showAppAlert(
        'Sample Collection Required',
        'Please select whether sample collection was easy/tough.',
      );
      return;
    }

    if (
      hasSampleCollectionPatients &&
      sampleCollectionEasyTough === 'tough' &&
      completeBookingPatientOptions.length &&
      !sampleCollectionEasyToughPatientIds.length
    ) {
      showAppAlert(
        'Patient Required',
        'Please select patient name for sample collection easy/tough.',
      );
      return;
    }

    if (
      shouldSendLinkedAppointment &&
      (!linkedAppointmentDate || !linkedAppointmentTimeSlot)
    ) {
      showAppAlert(
        'Linked Appointment Required',
        'Please select linked appointment date and time slot.',
      );
      return;
    }

    if (!validateAppointmentDetailsBeforeBilling()) {
      return;
    }

    if (
      hasNonManualPatients &&
      localBillingSummary.payingTestCount > 0 &&
      !completePaymentPatientOptions.length &&
      completeNetAmount > 0.009 &&
      completeAmountReceived <= 0
    ) {
      showAppAlert(
        'Payment Required',
        'Please enter payment collected amount before completing booking.',
      );
      return;
    }

    const patientPaymentsMissingAmount = completePaymentPatientOptions.filter(
      patient => {
        const payment = completePayments.find(paymentEntry => {
          const paymentOptionId = normalizeFormText(
            paymentEntry?.patientOptionId,
          );
          const paymentPatientId = normalizeFormText(paymentEntry?.patientId);

          return (
            paymentOptionId === normalizeFormText(patient?.id) ||
            paymentPatientId === normalizeFormText(patient?.patientId) ||
            paymentPatientId === normalizeFormText(patient?.sourcePatientId)
          );
        });

        return !payment || !normalizeFormText(payment?.amount);
      },
    );

    if (patientPaymentsMissingAmount.length) {
      showAppAlert(
        'Patient-wise Payment Required',
        `Please enter payment amount for: ${patientPaymentsMissingAmount
          .map(patient => patient.name)
          .join(', ')}.`,
      );
      return;
    }

    const paymentsMissingPatient = completePayments.filter(
      payment =>
        toCurrencyNumber(payment?.amount) > 0 &&
        completePaymentPatientOptions.length > 1 &&
        !normalizeFormText(payment?.patientOptionId) &&
        !normalizeFormText(payment?.patientId),
    );

    if (paymentsMissingPatient.length) {
      showAppAlert(
        'Payment Patient Required',
        'Please select patient for every entered payment amount.',
      );
      return;
    }

    if (
      shouldCollectPendingPaymentPatient &&
      !normalizeFormText(pendingPaymentPatientId)
    ) {
      showAppAlert(
        'Pending Amount Patient Required',
        extraPaymentAmount > 0.009
          ? 'Please select which patient has the extra payment amount.'
          : 'Please select which patient has the pending payment amount.',
      );
      return;
    }

    const pendingUpiProofPayments = completePayments.filter(payment => {
      if (normalizeFormText(payment?.mode).toUpperCase() !== 'UPI') {
        return false;
      }

      if (toCurrencyNumber(payment?.amount) <= 0) {
        return false;
      }

      return !(
        Array.isArray(payment?.proofDocuments) &&
        payment.proofDocuments.length
      );
    });

    if (pendingUpiProofPayments.length) {
      showAppAlert(
        'UPI Screenshot Required',
        'Please upload payment screenshot or image for every UPI payment.',
      );
      return;
    }

    if (!validatePatientAdditionalDiscounts()) {
      return;
    }

    const completePayload = buildCompleteBookingPayload();
    const didComplete = await onBookingAction('completed', completePayload);

    if (!didComplete) {
      return;
    }

    setIsCompleteBookingScreenVisible(false);
    setIsLinkedAppointmentCalendarVisible(false);
    setIsLinkedAppointmentTimeSlotSelectVisible(false);

    if (onBookingCompleted) {
      await onBookingCompleted();
      return;
    }

    showAppAlert(
      'Booking Completed',
      [
        'Appointment completed successfully.',
        `Final amount: Rs. ${completeNetAmount.toFixed(2)}`,
        `Amount received: Rs. ${toCurrencyNumber(completeAmountReceived).toFixed(2)}`,
        `Pending amount: Rs. ${pendingPaymentAmount.toFixed(2)}`,
        `Extra amount: Rs. ${extraPaymentAmount.toFixed(2)}`,
        `Additional discount total: Rs. ${completeAdditionalDiscountAmount.toFixed(2)}`,
      ].join('\n'),
    );
  };
  const handleCompletePaymentChange = useCallback((paymentId, updates) => {
    setCompletePayments(previousPayments =>
      previousPayments.map(payment =>
        payment.id === paymentId
          ? {
              ...payment,
              ...updates,
              ...(Object.prototype.hasOwnProperty.call(updates || {}, 'mode') &&
              updates?.mode !== 'UPI'
                ? {proofDocuments: []}
                : {}),
              ...(Object.prototype.hasOwnProperty.call(
                updates || {},
                'proofDocuments',
              )
                ? {
                    proofDocuments: normalizeStoredUploadDocuments(
                      updates?.proofDocuments,
                      'upi-payment-proof',
                    ),
                  }
                : {}),
            }
          : payment,
      ),
    );
  }, []);
  const handlePendingPaymentPatientSelect = useCallback(patient => {
    setPendingPaymentPatientId(patient?.id || '');
  }, []);
  const handleAddCompletePayment = useCallback(() => {
    setCompletePayments(previousPayments => [
      ...previousPayments,
      createCompletePaymentEntry(),
    ]);
  }, []);
  const handleRemoveCompletePayment = useCallback(
    paymentId => {
      const replacementPayment = createCompletePaymentEntry();

      setCompletePayments(previousPayments => {
        if (previousPayments.length <= 1) {
          return [replacementPayment];
        }

        return previousPayments.filter(payment => payment.id !== paymentId);
      });
    },
    [],
  );
  const appendCompletePaymentProofDocuments = useCallback(
    (paymentId, nextDocuments) => {
      if (!nextDocuments.length) {
        return;
      }

      setCompletePayments(previousPayments =>
        previousPayments.map(payment => {
          if (payment.id !== paymentId) {
            return payment;
          }

          const nextPayment = {
            ...payment,
            proofDocuments: normalizeStoredUploadDocuments(
              [
                ...(Array.isArray(payment.proofDocuments)
                  ? payment.proofDocuments
                  : []),
                ...nextDocuments,
              ],
              'upi-payment-proof',
            ),
          };

          return nextPayment;
        }),
      );
    },
    [],
  );
  const pickUploadDocumentsFromDevice = useCallback(
    async ({fileNamePrefix, documentName, onDocumentsPicked, failureMessage}) => {
      if (!LocalDocumentPickerModule?.pickDocuments) {
        showAppAlert(
          'Upload Not Available',
          'Document picker module is not available in this build.',
        );
        return;
      }

      try {
        const pickedFiles = await LocalDocumentPickerModule.pickDocuments();
        const normalizedDocuments = normalizeUploadDocuments(
          pickedFiles,
          fileNamePrefix,
          documentName,
        );

        if (!normalizedDocuments.length) {
          return;
        }

        onDocumentsPicked(normalizedDocuments);
      } catch (error) {
        if (
          error?.code === 'DOCUMENT_PICKER_CANCELLED' ||
          String(error?.message || '').toLowerCase().includes('cancel')
        ) {
          return;
        }

        warnDebug('Upload picker error:', error);
        showAppAlert(
          'Upload Failed',
          failureMessage || 'Unable to select files right now. Please try again.',
        );
      }
    },
    [showAppAlert],
  );
  const captureUploadPhoto = useCallback(
    async ({fileNamePrefix, documentLabel, documentName, onDocumentsPicked}) => {
      if (!LocalGeoCameraModule?.captureStampedPhoto) {
        showAppAlert(
          'Camera Not Available',
          'Geo camera module is not available in this build.',
        );
        return;
      }

      try {
        const capturedPhoto = await LocalGeoCameraModule.captureStampedPhoto('');

        if (!capturedPhoto?.uri) {
          return;
        }

        onDocumentsPicked([
          {
            uri: capturedPhoto.uri,
            name: getUploadFileName({
              preferredName: documentName || documentLabel,
              originalName: capturedPhoto.name,
              mimeType: capturedPhoto.type || 'image/jpeg',
              fallbackPrefix: fileNamePrefix,
            }),
            type: capturedPhoto.type || 'image/jpeg',
          },
        ]);
      } catch (error) {
        if (
          error?.code === 'CAMERA_CANCELLED' ||
          String(error?.message || '').toLowerCase().includes('cancel')
        ) {
          return;
        }

        warnDebug('Upload camera error:', error);
        showAppAlert(
          'Camera Failed',
          'Unable to capture a photo right now. Please try again.',
        );
      }
    },
    [showAppAlert],
  );
  const openUploadSourceChooser = useCallback(
    ({title, onCameraPress, onGalleryPress}) => {
      showAppAlert(title, 'Choose how to add this file.', [
        {text: 'Camera', onPress: onCameraPress},
        {text: 'Gallery', onPress: onGalleryPress},
        {text: 'Cancel', style: 'cancel'},
      ]);
    },
    [showAppAlert],
  );
  const handlePickCompletePaymentProof = useCallback(
    async paymentId => {
      openUploadSourceChooser({
        title: 'UPI Payment Proof',
        onCameraPress: () =>
          captureUploadPhoto({
            fileNamePrefix: 'upi-payment-proof',
            documentLabel: 'UPI Payment Proof',
            documentName: 'UPI Payment Proof',
            onDocumentsPicked: documents =>
              appendCompletePaymentProofDocuments(paymentId, documents),
          }),
        onGalleryPress: () =>
          pickUploadDocumentsFromDevice({
            fileNamePrefix: 'upi-payment-proof',
            documentName: 'UPI Payment Proof',
            onDocumentsPicked: documents =>
              appendCompletePaymentProofDocuments(paymentId, documents),
            failureMessage:
              'Unable to select payment screenshot right now. Please try again.',
          }),
      });
    },
    [
      appendCompletePaymentProofDocuments,
      captureUploadPhoto,
      openUploadSourceChooser,
      pickUploadDocumentsFromDevice,
    ],
  );
  const handleRemoveCompletePaymentProof = useCallback(
    (paymentId, documentIndex) => {
      setCompletePayments(previousPayments =>
        previousPayments.map(payment => {
          if (payment.id !== paymentId) {
            return payment;
          }

          return {
            ...payment,
            proofDocuments: (Array.isArray(payment.proofDocuments)
              ? payment.proofDocuments
              : []
            ).filter((_, index) => index !== documentIndex),
          };
        }),
      );
    },
    [],
  );

  const moveCancelCalendarMonth = direction => {
    setCancelCalendarMonth(previousMonth => {
      const nextMonth = new Date(
        previousMonth.getFullYear(),
        previousMonth.getMonth() + direction,
        1,
      );
      return nextMonth;
    });
  };
  const moveLinkedAppointmentCalendarMonth = direction => {
    setLinkedAppointmentCalendarMonth(previousMonth => {
      const nextMonth = new Date(
        previousMonth.getFullYear(),
        previousMonth.getMonth() + direction,
        1,
      );
      return nextMonth;
    });
  };

  const handleCancelDateSelect = date => {
    setCancelNewVisitDate(toDateInputValue(date));
    setCancelCalendarMonth(new Date(date.getFullYear(), date.getMonth(), 1));
    setIsCancelCalendarVisible(false);
  };
  const handleLinkedAppointmentDateSelect = date => {
    setLinkedAppointmentDate(toDateInputValue(date));
    setLinkedAppointmentCalendarMonth(
      new Date(date.getFullYear(), date.getMonth(), 1),
    );
    setIsLinkedAppointmentCalendarVisible(false);
  };

  const handlePickPatientDocuments = async () => {
    openUploadSourceChooser({
      title: 'Patient Document',
        onCameraPress: () =>
          captureUploadPhoto({
            fileNamePrefix: 'patient-document',
            documentLabel: 'Patient Document',
            onDocumentsPicked: documents =>
              setPatientDocuments(previousDocuments => [
                ...previousDocuments,
                ...documents,
              ]),
          }),
      onGalleryPress: () =>
        pickUploadDocumentsFromDevice({
          fileNamePrefix: 'patient-document',
          onDocumentsPicked: documents =>
            setPatientDocuments(previousDocuments => [
              ...previousDocuments,
              ...documents,
            ]),
          failureMessage:
            'Unable to select documents right now. Please try again.',
        }),
    });
  };

  const handleRemovePatientDocument = indexToRemove => {
    setPatientDocuments(previousDocuments =>
      previousDocuments.filter((_, index) => index !== indexToRemove),
    );
  };

  const resolvePanelCompanyChargeMode = useCallback(
    panelCompany =>
      new Promise(resolve => {
        if (!hasCreditAndPayingModes(panelCompany)) {
          resolve(panelCompany);
          return;
        }

        showAppAlert(
          'Select Billing Type',
          `${panelCompany?.name || 'This panel company'} supports both Credit and Paying. Choose how to use it for this selection.`,
          [
            {
              text: 'Credit',
              onPress: () =>
                resolve(withSelectedBillingChargeMode(panelCompany, 'C')),
            },
            {
              text: 'Paying',
              onPress: () =>
                resolve(withSelectedBillingChargeMode(panelCompany, 'P')),
            },
            {
              text: 'Cancel',
              style: 'cancel',
              onPress: () => resolve(null),
            },
          ],
          {cancelable: true, onDismiss: () => resolve(null)},
        );
      }),
    [showAppAlert],
  );

  const closePanelCompanyModal = useCallback(() => {
    setIsPanelCompanyModalVisible(false);
    setIsPanelCatalogVisible(false);
    onBookingScreenChange?.('details');
    setPanelCatalogGroups([]);
    setSelectedCatalogGroup(null);
    setSelectedCatalogSubgroup(null);
    setTestSearch('');
    setExpandedCatalogTests({});
    setSelectedPanelCompanyName('');
    setSelectedPanelCompany(null);
    setPanelCompanySearch('');
    setCatalogVisibleCount(CATALOG_ITEM_PAGE_SIZE);
  }, [onBookingScreenChange]);

  useEffect(() => {
    if (
      selectedBookingScreen === 'panel-company' ||
      (!isPanelCompanyModalVisible && !isPanelCatalogVisible)
    ) {
      return;
    }

    closePanelCompanyModal();
  }, [
    isPanelCatalogVisible,
    isPanelCompanyModalVisible,
    closePanelCompanyModal,
    selectedBookingScreen,
  ]);

  const openPanelCompanyCatalog = useCallback(
    async ({patient, panelCompany}) => {
      const catalogResponse = await onPanelCompanySelect({
        patient,
        compCatId: panelCompany?.compCatId,
        panelCompany,
      });

      if (!catalogResponse) {
        return false;
      }

      const groups = sortCatalogGroupsById(catalogResponse?.groups);

      if (!groups.length) {
        showAppAlert(
          'No Groups Found',
          'No groups were returned for the selected panel company.',
        );
        return false;
      }

      setSelectedPanelCompanyName(panelCompany?.name || '');
      setSelectedPanelCompany(panelCompany);
      setPanelCatalogGroups(groups);
      setSelectedCatalogGroup(null);
      setSelectedCatalogSubgroup(null);
      setTestSearch('');
      setExpandedCatalogTests({});
      setCatalogVisibleCount(CATALOG_ITEM_PAGE_SIZE);
      setIsPanelCompanyModalVisible(false);
      setIsPanelCatalogVisible(true);
      onBookingScreenChange?.('panel-company');
      return true;
    },
    [onBookingScreenChange, onPanelCompanySelect, showAppAlert],
  );

  const handleSelectPanelCompany = async panelCompany => {
    const resolvedPanelCompany =
      await resolvePanelCompanyChargeMode(panelCompany);

    if (!resolvedPanelCompany) {
      return;
    }

    setSelectedPanelCompanyId(resolvedPanelCompany.id);
    if (panelFlowMode === 'panel-only') {
      const selectedPatientId = getPatientMutationId(selectedPanelPatient);
      const appPanelCompany = withPanelCompanyChipMeta(resolvedPanelCompany, 'APP');
      if (selectedPatientId) {
        setPatientPanelCompaniesMap(previousMap => {
          const previousCompanies = previousMap[selectedPatientId] || [];
          const hasCompany = previousCompanies.some(
            existingCompany =>
              getPanelCompanyChipIdentity(existingCompany) ===
                getPanelCompanyChipIdentity(appPanelCompany),
          );

          return {
            ...previousMap,
            [selectedPatientId]: hasCompany
              ? previousCompanies.map(existingCompany =>
                  getPanelCompanyChipIdentity(existingCompany) ===
                  getPanelCompanyChipIdentity(appPanelCompany)
                    ? appPanelCompany
                    : existingCompany,
                )
              : [...previousCompanies, appPanelCompany],
          };
        });
        setActivePatientPanelCompanyMap(previousMap => ({
          ...previousMap,
          [selectedPatientId]: appPanelCompany.chipId,
        }));
      }
      setSelectedPanelCompanyName(appPanelCompany.name);
      setSelectedPanelCompany(appPanelCompany);
      setIsPanelCompanyModalVisible(false);
      setIsPanelCatalogVisible(false);

      if (onOpenAddTest) {
        onOpenAddTest(selectedPanelPatient, appPanelCompany);
        return;
      }

      await openPanelCompanyCatalog({
        patient: selectedPanelPatient,
        panelCompany: appPanelCompany,
      });
      return;
    }

    await openPanelCompanyCatalog({
      patient: selectedPanelPatient,
      panelCompany: resolvedPanelCompany,
    });
  };

  const openPanelCompanyTests = async ({patient, panelCompany}) => {
    if (!canUsePatientActions) {
      showBookingStartRequiredAlert();
      return;
    }

    confirmSampleCollectionReset(patient, async () => {
    const resolvedPanelCompany =
      await resolvePanelCompanyChargeMode(panelCompany);

    if (!resolvedPanelCompany) {
      return;
    }

    const selectedPatientId = getPatientMutationId(patient);
    if (selectedPatientId) {
      setActivePatientPanelCompanyMap(previousMap => ({
        ...previousMap,
        [selectedPatientId]:
          resolvedPanelCompany.chipId || resolvedPanelCompany.id,
      }));
    }

    if (!onOpenAddTest) {
      return;
    }

    onOpenAddTest?.(patient, resolvedPanelCompany);
    });
  };

  const handlePatientAddPanelCompany = async patient => {
    if (!canUsePatientActions) {
      showBookingStartRequiredAlert();
      return;
    }

    confirmSampleCollectionReset(patient, async () => {
    setPanelFlowMode('panel-only');
    setSelectedPanelPatient(patient);
    const selectedPatientId = getPatientMutationId(patient);

    let matchedResponseData = null;
    let fullListResponseData = null;

    try {
      onLocalDatabaseLoadingChange?.(
        'Loading panel companies from local database...',
      );
      [matchedResponseData, fullListResponseData] = await Promise.all([
        onAddTestPatient(patient),
        getLocalPanelCompaniesResponse(),
      ]);
    } catch (error) {
      warnDebug('Open panel companies error:', error);
      return;
    } finally {
      onLocalDatabaseLoadingChange?.('');
    }

    const apiMatchedCompanies = normalizePanelCompanyItems(matchedResponseData);
    const allPanelCompanies = normalizePanelCompanyItems(fullListResponseData);
    const mergedPanelCompanies = [
      ...apiMatchedCompanies,
      ...allPanelCompanies.filter(
        company =>
          !apiMatchedCompanies.some(matchedCompany =>
            isSamePanelCompanyListItem(matchedCompany, company),
          ),
      ),
    ];

    if (!mergedPanelCompanies.length) {
      showAppAlert(
        'No Panel Companies',
        'Panel company data is empty in the local database.',
      );
      return;
    }

    if (selectedPatientId) {
      setPatientApiPanelCompaniesMap(previousMap =>
        Object.prototype.hasOwnProperty.call(previousMap, selectedPatientId)
          ? previousMap
          : {
              ...previousMap,
              [selectedPatientId]: apiMatchedCompanies,
            },
      );
    }

    setPanelCompanyItems(mergedPanelCompanies);
    setPanelCompanySearch('');
    setSelectedPanelCompanyId('');
    setSelectedPanelCompanyName('');
    setSelectedPanelCompany(null);
    setPanelCatalogGroups([]);
    setSelectedCatalogGroup(null);
    setSelectedCatalogSubgroup(null);
    setTestSearch('');
    setExpandedCatalogTests({});
    setCatalogVisibleCount(CATALOG_ITEM_PAGE_SIZE);
    setIsPanelCatalogVisible(false);
    setIsPanelCompanyModalVisible(true);
    onBookingScreenChange?.('panel-company');
    });
  };

  const ensureApiPanelCompanyMatch = async patient => {
    const selectedPatientId = getPatientMutationId(patient);
    const hasApiCompanyOverride =
      selectedPatientId &&
      Object.prototype.hasOwnProperty.call(
        patientApiPanelCompaniesMap,
        selectedPatientId,
      );
    const existingMatches = selectedPatientId
      ? patientApiPanelCompaniesMap[selectedPatientId] || []
      : [];

    if (hasApiCompanyOverride) {
      return existingMatches;
    }

    let responseData = null;

    try {
      responseData = await onAddTestPatient(patient);
    } catch (error) {
      return [];
    }

    const apiMatchedCompanies = normalizePanelCompanyItems(responseData);

    if (selectedPatientId) {
      setPatientApiPanelCompaniesMap(previousMap => ({
        ...previousMap,
        [selectedPatientId]: apiMatchedCompanies,
      }));
    }

    return apiMatchedCompanies;
  };

  const handlePrimaryPanelCompanyPress = async patient => {
    if (!canUsePatientActions) {
      showBookingStartRequiredAlert();
      return;
    }

    const apiMatchedCompanies = await ensureApiPanelCompanyMatch(patient);

    if (!apiMatchedCompanies.length) {
      showAppAlert(
        'No Panel Company Found',
        'No matching API panel company was found for this patient.',
      );
      return;
    }

    const resolvedPanelCompany = await resolvePanelCompanyChargeMode({
      ...apiMatchedCompanies[0],
      chipId: `api-${apiMatchedCompanies[0].id}`,
      chipSource: 'API',
    });

    if (!resolvedPanelCompany) {
      return;
    }

    onOpenAddTest?.(patient, resolvedPanelCompany);
  };

  const handleRemovePatientPanelCompany = (patient, panelCompanyToRemove) => {
    if (!canUsePatientActions) {
      showBookingStartRequiredAlert();
      return;
    }

    confirmRemovePanelCompany({
      patient,
      panelCompany: panelCompanyToRemove,
      onConfirm: () => {
    const selectedPatientId = getPatientMutationId(patient);
    if (!selectedPatientId) {
      return;
    }
    const normalizedPanelToRemove = withPanelCompanyChipMeta(
      panelCompanyToRemove,
      panelCompanyToRemove?.chipSource || 'APP',
    );
    const removeSource = normalizeFormText(normalizedPanelToRemove?.chipSource).toUpperCase();
    const removeChipId = normalizeFormText(normalizedPanelToRemove?.chipId);
    const removeCanonicalId = getPanelCompanyChipIdentity(normalizedPanelToRemove);

    if (removeSource !== 'APP') {
      setPatientApiPanelCompaniesMap(previousMap => ({
        ...previousMap,
        [selectedPatientId]: (previousMap[selectedPatientId] || []).filter(
          company => {
            const normalizedCompany = withPanelCompanyChipMeta(company, 'API');
            return (
              normalizeFormText(normalizedCompany?.chipId) !== removeChipId &&
              getPanelCompanyChipIdentity(normalizedCompany) !== removeCanonicalId
            );
          },
        ),
      }));
    }

    if (removeSource !== 'API') {
      setPatientPanelCompaniesMap(previousMap => {
        const nextMap = {...previousMap};
        const nextCompanies = (nextMap[selectedPatientId] || []).filter(company => {
          const normalizedCompany = withPanelCompanyChipMeta(company, 'APP');
          return (
            normalizeFormText(normalizedCompany?.chipId) !== removeChipId &&
            getPanelCompanyChipIdentity(normalizedCompany) !== removeCanonicalId
          );
        });

        if (nextCompanies.length) {
          nextMap[selectedPatientId] = nextCompanies;
        } else {
          delete nextMap[selectedPatientId];
        }
        return nextMap;
      });
    }

    setActivePatientPanelCompanyMap(previousMap => {
      const nextMap = {...previousMap};
      const currentActiveId = nextMap[selectedPatientId];

      if (
        (removeChipId && String(currentActiveId) === removeChipId) ||
        String(currentActiveId) === String(`api-${panelCompanyToRemove?.id}`) ||
        String(currentActiveId) === String(`app-${panelCompanyToRemove?.id}`) ||
        String(currentActiveId) === String(panelCompanyToRemove?.id)
      ) {
        delete nextMap[selectedPatientId];
      }

      return nextMap;
    });

    setPatientSelectedTestsMap(previousTestsMap => {
      const hasSelectedTestsOverride = Object.prototype.hasOwnProperty.call(
        previousTestsMap,
        selectedPatientId,
      );
      const previousTests = hasSelectedTestsOverride
        ? previousTestsMap[selectedPatientId] || []
        : getMergedPatientSelectedTests(patient, [], panelCompanyToRemove);
      const remainingTests = previousTests.filter(
        test => !doesSelectedTestBelongToPanelCompany(test, normalizedPanelToRemove),
      );

      if (remainingTests.length === previousTests.length) {
        return hasSelectedTestsOverride
          ? previousTestsMap
          : {
              ...previousTestsMap,
              [selectedPatientId]: remainingTests,
            };
      }

      const nextTestsMap = {...previousTestsMap};
      nextTestsMap[selectedPatientId] = remainingTests;

      return nextTestsMap;
    });

    if (
      getPanelCompanyChipIdentity(selectedPanelCompany) === removeCanonicalId ||
      normalizeFormText(selectedPanelCompany?.chipId) === removeChipId
    ) {
      closePanelCompanyModal();
    }
      },
    });
  };

  const handleRemoveSelectedTestWithSampleReset = useCallback(
    payload => {
      if (!canUsePatientActions) {
        showBookingStartRequiredAlert();
        return;
      }

      const patientId = getPatientMutationId(payload?.patient);
      const patientTests = patientId ? patientSelectedTestsMap[patientId] || [] : [];
      const selectedTest = patientTests.find(test => test?.key === payload?.testKey);

      confirmRemoveSelectedTest({
        patient: payload?.patient,
        testName:
          selectedTest?.description ||
          selectedTest?.name ||
          selectedTest?.booked_code ||
          selectedTest?.code,
        onConfirm: () => {
          onRemovePatientSelectedTest?.(payload);
        },
      });
    },
    [
      canUsePatientActions,
      confirmRemoveSelectedTest,
      onRemovePatientSelectedTest,
      patientSelectedTestsMap,
      showBookingStartRequiredAlert,
    ],
  );

  const handleUpdatePatientReferredBy = useCallback(
    async ({patient, referredBy}) => {
      const patientId = normalizeFormText(getPatientMutationId(patient));
      if (!patientId) {
        showAppAlert('Unable to Update', 'Patient id is missing.');
        return false;
      }

      const nextReferredBy = normalizeFormText(referredBy);
      setPatientReferredByOverrideMap(previousMap => ({
        ...previousMap,
        [patientId]: nextReferredBy,
      }));
      onAppointmentDetailStateChange?.(previousState => ({
        ...(previousState || {}),
        patientReferredByOverrideMap: {
          ...((previousState || {}).patientReferredByOverrideMap || {}),
          [patientId]: nextReferredBy,
        },
      }));
      return true;
    },
    [
      onAppointmentDetailStateChange,
      showAppAlert,
    ],
  );

  const calendarDays = getCalendarDays(dobCalendarMonth);
  const cancelCalendarDays = getCalendarDays(cancelCalendarMonth);
  const linkedAppointmentCalendarDays = getCalendarDays(
    linkedAppointmentCalendarMonth,
  );
  const isGenderEditable = EDITABLE_GENDER_TITLES.includes(patientForm.title);

  const handleAddTestFlowBack = () => {
    if (panelFlowMode === 'test-direct' && isPanelCatalogVisible) {
      closePanelCompanyModal();
      return;
    }

    if (isPanelCatalogVisible && selectedCatalogSubgroup) {
      setSelectedCatalogSubgroup(null);
      setTestSearch('');
      setExpandedCatalogTests({});
      setCatalogVisibleCount(CATALOG_ITEM_PAGE_SIZE);
      return;
    }

    if (isPanelCatalogVisible && selectedCatalogGroup) {
      setSelectedCatalogGroup(null);
      setSelectedCatalogSubgroup(null);
      setTestSearch('');
      setExpandedCatalogTests({});
      setCatalogVisibleCount(CATALOG_ITEM_PAGE_SIZE);
      return;
    }

    if (isPanelCatalogVisible) {
      if (panelFlowMode === 'test-chip') {
        closePanelCompanyModal();
      } else {
        setIsPanelCatalogVisible(false);
        setIsPanelCompanyModalVisible(true);
      }
      return;
    }

    closePanelCompanyModal();
  };

  if (isPanelCompanyModalVisible || isPanelCatalogVisible) {
    return (
      <PanelCompanyFlowScreen
        styles={styles}
        isNarrowScreen={isNarrowScreen}
        isSmallPhone={isSmallPhone}
        isPanelCatalogVisible={isPanelCatalogVisible}
        isPanelCompanyModalVisible={isPanelCompanyModalVisible}
        selectedPanelPatient={selectedPanelPatient}
        selectedPanelCompanyName={selectedPanelCompanyName}
        selectedPanelCompany={selectedPanelCompany}
        selectedPanelCompanyId={selectedPanelCompanyId}
        panelCompanySearch={panelCompanySearch}
        setPanelCompanySearch={setPanelCompanySearch}
        hasPanelCompanySearch={hasPanelCompanySearch}
        filteredPanelCompanyItems={filteredPanelCompanyItems}
        visiblePanelCompanyItems={visiblePanelCompanyItems}
        handleSelectPanelCompany={handleSelectPanelCompany}
        selectedCatalogGroup={selectedCatalogGroup}
        selectedCatalogSubgroup={selectedCatalogSubgroup}
        activeCatalogItems={activeCatalogItems}
        visibleCatalogItems={visibleCatalogItems}
        expandedCatalogTests={expandedCatalogTests}
        testSearch={testSearch}
        setTestSearch={setTestSearch}
        hasTestSearch={hasTestSearch}
        hasMoreCatalogItems={hasMoreCatalogItems}
        loadMoreCatalogItems={loadMoreCatalogItems}
        handleAddTestFlowBack={handleAddTestFlowBack}
        setSelectedCatalogGroup={setSelectedCatalogGroup}
        setSelectedCatalogSubgroup={setSelectedCatalogSubgroup}
        setExpandedCatalogTests={setExpandedCatalogTests}
        setCatalogVisibleCount={setCatalogVisibleCount}
        getPaymentLabelFromBillingMode={getPaymentLabelFromBillingMode}
        appAlert={appAlert}
        closeAppAlert={closeAppAlert}
      />
    );
  }
  if (selectedBookingScreen === 'edit-address') {
    return (
      <AddressEditScreen
        styles={styles}
        isNarrowScreen={isNarrowScreen}
        addressForm={addressForm}
        addressCityOptions={addressCityOptions}
        addressColonyOptions={addressColonyOptions}
        isAddressCityLoading={isAddressCityLoading}
        isAddressColonyLoading={isAddressColonyLoading}
        isAddressUpdating={isAddressUpdating}
        isAddressCitySelectVisible={isAddressCitySelectVisible}
        isAddressColonySelectVisible={isAddressColonySelectVisible}
        isAddressFloorSpecialSelectVisible={isAddressFloorSpecialSelectVisible}
        appAlert={appAlert}
        loadAddressCities={loadAddressCities}
        loadAddressColonies={loadAddressColonies}
        handleAddressFormChange={handleAddressFormChange}
        handleUpdateAddress={handleUpdateAddress}
        setIsAddressCitySelectVisible={setIsAddressCitySelectVisible}
        setIsAddressColonySelectVisible={setIsAddressColonySelectVisible}
        setIsAddressFloorSpecialSelectVisible={setIsAddressFloorSpecialSelectVisible}
        closeAppAlert={closeAppAlert}
      />
    );
  }
  const handleSubmitAddPatient = async () => {
    if (!canUsePatientActions) {
      showBookingStartRequiredAlert();
      return;
    }

    const fullName = patientForm.fullName.trim();
    const primaryMobile = patientForm.primaryMobile.trim();
    const alternateMobile = patientForm.alternateMobile.trim();
    const email = patientForm.email.trim();
    const labmatePid = patientForm.labmatePid.trim();
    const panelCompany = patientForm.panelCompany.trim();
    const cghsCardNo = patientForm.cghsCardNo.trim();
    const ageYears = Number(patientForm.ageYears);
    const selectedPatientTags = normalizePatientTagValues(
      patientForm.tags?.length ? patientForm.tags : patientForm.tag,
    );
    const patientTag = serializePatientTags(selectedPatientTags);

    if (!fullName) {
      showAppAlert('Missing Name', 'Please enter the patient full name.');
      return;
    }

    if (!/^\d{10}$/.test(primaryMobile)) {
      showAppAlert(
        'Invalid Mobile',
        'Please enter a valid 10 digit primary mobile number.',
      );
      return;
    }

    if (alternateMobile && !/^\d{10}$/.test(alternateMobile)) {
      showAppAlert(
        'Invalid Alternate Mobile',
        'Please enter a valid 10 digit alternate mobile number.',
      );
      return;
    }

    if (!ageYears || ageYears <= 0) {
      showAppAlert(
        'Invalid Age',
        'Please enter a valid patient age.',
      );
      return;
    }

    if (!patientForm.dateOfBirth) {
      showAppAlert(
        'Missing Date of Birth',
        'Please select the patient date of birth.',
      );
      return;
    }

    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      showAppAlert('Invalid Email', 'Please enter a valid email address.');
      return;
    }

    const patientPayload = {
      title: patientForm.title,
      full_name: fullName,
      gender: patientForm.gender,
      age_years: ageYears,
      primary_mobile: primaryMobile,
      ...(patientForm.dateOfBirth ? {date_of_birth: patientForm.dateOfBirth} : {}),
      ...(alternateMobile ? {alternate_mobile: alternateMobile} : {}),
      ...(email ? {email} : {}),
      ...(labmatePid ? {labmate_pid: labmatePid} : {}),
      ...(panelCompany ? {panel_company: panelCompany} : {}),
      ...(cghsCardNo ? {card_no: cghsCardNo} : {}),
      ...(patientTag ? {tag: patientTag} : {}),
      patient_documents: patientDocuments,
    };
    const editingPatientId = editingPatient
      ? getUpdatePatientId(editingPatient)
      : '';

    const didSavePatient = editingPatient
      ? await onUpdatePatient({
          patientId: editingPatientId,
          patient: patientPayload,
        })
      : await onAddPatient(patientPayload);

    if (didSavePatient) {
      setIsAddPatientModalVisible(false);
      resetAddPatientForm();
    }
  };

  const isCompletedHistoryDetail = Boolean(selectedBooking?.isCompletedHistoryDetail);
  const completedHistoryFields = selectedBooking?.completedHistoryFields || {};
  const completedHistoryPatients = Array.isArray(selectedBooking?.patients)
    ? selectedBooking.patients
    : [];
  const renderCompletedHistoryValue = (label, value, iconName = 'information-circle-outline') => (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 10,
        marginBottom: 14,
      }}>
      <View
        style={{
          width: 34,
          height: 34,
          borderRadius: 17,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#E7F5F8',
        }}>
        <Ionicons name={iconName} size={18} color="#0D4F5F" />
      </View>
      <View style={{flex: 1}}>
        <Text style={{fontSize: 13, fontWeight: '800', color: '#64748B', marginBottom: 4}}>
        {label}
        </Text>
        <Text style={{fontSize: 17, fontWeight: '900', color: '#0F172A', lineHeight: 22}}>
          {value === null || value === undefined || value === '' ? '-' : String(value)}
        </Text>
      </View>
    </View>
  );
  const renderCompletedHistoryList = value => {
    const list = Array.isArray(value) ? value : [];
    return list.length ? list.join(', ') : '-';
  };

  if (isCompletedHistoryDetail) {
    return (
      <View style={styles.detailScreenContainer}>
        <View
          style={[
            styles.sectionCard,
            {borderColor: '#B7E4EA', backgroundColor: '#F8FEFF'},
          ]}>
          <View style={{flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16}}>
            <View
              style={{
                width: 42,
                height: 42,
                borderRadius: 21,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: '#0D4F5F',
              }}>
              <Ionicons name="checkmark-done-outline" size={22} color="#FFFFFF" />
            </View>
            <Text style={{fontSize: 22, fontWeight: '900', color: '#0D4F5F', flex: 1}}>
            Completed Booking Detail
            </Text>
          </View>
          {renderCompletedHistoryValue(
            'Booking ID',
            completedHistoryFields.booking_id || selectedBooking.id,
            'receipt-outline',
          )}
          {renderCompletedHistoryValue(
            'Appointment ID',
            completedHistoryFields.appointment_id || selectedBooking.appointmentId,
            'calendar-outline',
          )}
        </View>

        {completedHistoryPatients.map((patient, index) => (
          <View
            key={`completed-history-patient-${patient.id || index}`}
            style={[
              styles.sectionCard,
              {borderColor: '#D8E7FF', backgroundColor: '#FBFCFF'},
            ]}>
            <View style={{flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16}}>
              <View
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 21,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: '#2563EB',
                }}>
                <Ionicons name="person-outline" size={22} color="#FFFFFF" />
              </View>
              <Text
                style={{
                  fontSize: 21,
                  fontWeight: '900',
                  color: '#1D4ED8',
                  flex: 1,
                }}>
                Patient {index + 1}
              </Text>
            </View>
            {renderCompletedHistoryValue('Patient Name', patient.name, 'person-circle-outline')}
            {renderCompletedHistoryValue('APK TBS', patient.apkTbs, 'shield-checkmark-outline')}
            {renderCompletedHistoryValue('Ref By', patient.refBy, 'medkit-outline')}
            {renderCompletedHistoryValue('Report Delivery', patient.reportDelivery, 'document-text-outline')}
            {renderCompletedHistoryValue('Report Schedule', patient.reportSchedule, 'time-outline')}
            {renderCompletedHistoryValue('Payment Mode', patient.paymentMode, 'card-outline')}
            {renderCompletedHistoryValue('Payment Amount', patient.paymentAmount, 'cash-outline')}
            {renderCompletedHistoryValue(
              'Completed Tests',
              renderCompletedHistoryList(patient.completedTests),
              'checkmark-circle-outline',
            )}
            {renderCompletedHistoryValue(
              'Cancelled Tests',
              renderCompletedHistoryList(patient.cancelledTests),
              'close-circle-outline',
            )}
          </View>
        ))}
      </View>
    );
  }

  return (
    <>
      <CancelBookingModal
        styles={styles}
        visible={isCancelBookingModalVisible}
        isNarrowScreen={isNarrowScreen}
        selectedBooking={selectedBooking}
        patientCount={patientCount}
        cancelTargetPatient={cancelTargetPatient}
        bookingActionLoading={
          cancelTargetPatient &&
          String(cancellingPatientId) ===
            String(getPatientMutationId(cancelTargetPatient))
            ? 'cancel'
            : bookingActionLoading
        }
        cancellationReasonOptions={CANCELLATION_REASON_OPTIONS}
        cancellationReason={cancellationReason}
        setCancellationReason={setCancellationReason}
        cancelRemarks={cancelRemarks}
        setCancelRemarks={setCancelRemarks}
        isCancelRescheduleRequested={isCancelRescheduleRequested}
        setIsCancelRescheduleRequested={setIsCancelRescheduleRequested}
        isCancelKnownSlot={isCancelKnownSlot}
        setIsCancelKnownSlot={setIsCancelKnownSlot}
        cancelNewVisitDate={cancelNewVisitDate}
        setIsCancelCalendarVisible={setIsCancelCalendarVisible}
        cancelNewTimeSlot={cancelNewTimeSlot}
        isCancelTimeSlotSelectVisible={isCancelTimeSlotSelectVisible}
        setIsCancelTimeSlotSelectVisible={setIsCancelTimeSlotSelectVisible}
        closeCancelBookingModal={closeCancelBookingModal}
        confirmCancelBooking={confirmCancelBooking}
      />

      {isCompleteBookingScreenVisible ? (
        <CompleteBookingScreen
          styles={styles}
          isNarrowScreen={isNarrowScreen}
          selectedBooking={selectedBooking}
          patientCount={patientCount}
          bookingActionLoading={bookingActionLoading}
          patientOptions={completeBookingPatientOptions}
          isLinkedAppointmentSelected={isLinkedAppointmentSelected}
          shouldShowLinkedAppointmentSection={hasPendingSampleTubes}
          onLinkedAppointmentChange={handleLinkedAppointmentChange}
          linkedAppointmentDate={linkedAppointmentDate}
          setIsLinkedAppointmentCalendarVisible={
            setIsLinkedAppointmentCalendarVisible
          }
          linkedAppointmentTimeSlot={linkedAppointmentTimeSlot}
          isLinkedAppointmentTimeSlotSelectVisible={
            isLinkedAppointmentTimeSlotSelectVisible
          }
          setIsLinkedAppointmentTimeSlotSelectVisible={
            setIsLinkedAppointmentTimeSlotSelectVisible
          }
          samplePickCount={samplePickCount}
          samplePickPatientIds={samplePickPatientIds}
          sampleCollectionEasyTough={sampleCollectionEasyTough}
          sampleCollectionEasyToughPatientIds={
            sampleCollectionEasyToughPatientIds
          }
          onSamplePickCountChange={handleSamplePickCountChange}
          onSamplePickPatientToggle={handleSamplePickPatientToggle}
          onSampleCollectionEasyToughChange={
            handleSampleCollectionEasyToughChange
          }
          onSampleCollectionEasyToughPatientToggle={
            handleSampleCollectionEasyToughPatientToggle
          }
          closeCompleteBookingScreen={closeCompleteBookingScreen}
          confirmCompleteBooking={confirmCompleteBooking}
          completeBillingTotal={completeBillingTotal}
          completeBaseDiscountAmount={completeBaseDiscountAmount}
          completeAdditionalDiscountAmount={completeAdditionalDiscountAmount}
          completeCreditAmount={completeCreditAmount}
          completeNetAmount={completeNetAmount}
          localBillingSummary={localBillingSummary}
          isAdditionalDiscountEnabled={isAdditionalDiscountEnabled}
          onAdditionalDiscountToggle={handleAdditionalDiscountToggle}
          patientAdditionalDiscountRows={patientAdditionalDiscountUiRows}
          completePayments={completePayments}
          completePaymentModeOptions={COMPLETE_PAYMENT_MODE_OPTIONS}
          paymentPatientOptions={completePaymentPatientOptions}
          isPatientWisePaymentRequired={completePaymentPatientOptions.length > 0}
          pendingPaymentAmount={pendingPaymentAmount}
          extraPaymentAmount={extraPaymentAmount}
          pendingPaymentPatientId={pendingPaymentPatientId}
          shouldCollectPendingPaymentPatient={shouldCollectPendingPaymentPatient}
          handlePendingPaymentPatientSelect={handlePendingPaymentPatientSelect}
          handlePatientAdditionalDiscountChange={
            handlePatientAdditionalDiscountChange
          }
          handleApplyPatientAdditionalDiscount={
            handleApplyPatientAdditionalDiscount
          }
          handleCompletePaymentChange={handleCompletePaymentChange}
          handleRemoveCompletePayment={handleRemoveCompletePayment}
          handleAddCompletePayment={handleAddCompletePayment}
          handlePickCompletePaymentProof={handlePickCompletePaymentProof}
          handleRemoveCompletePaymentProof={handleRemoveCompletePaymentProof}
        />
      ) : (
        <>
          <BookingDetailOverview
            styles={styles}
            selectedBooking={selectedBooking}
            patientCount={patientCount}
            isSmallPhone={isSmallPhone}
            canUseActiveBookingControls={canUseActiveBookingControls}
            canUsePatientActions={canUsePatientActions}
            shouldShowProgressActions={shouldShowProgressActions}
            shouldShowStartOnly={shouldShowStartOnly}
            bookingActionLoading={bookingActionLoading}
            resolvedAddress={resolvedAddress}
            resolvedLandmark={resolvedLandmark}
            latitude={latitude}
            longitude={longitude}
            locationUrl={locationUrl}
            onEditAddress={
              isAppointmentSourceBooking ? null : openEditAddressScreen
            }
            isAppointmentSource={isAppointmentSourceBooking}
            isTerminalBooking={isTerminalBooking}
            isCompletedBooking={isCompletedBooking}
            isCancelledBooking={isCancelledBooking}
            terminalBookingMessage={terminalBookingMessage}
            canCallBookingPhone={Boolean(
              normalizeFormText(selectedBooking.phoneNumber),
            )}
            handleCallBookingPhone={handleCallBookingPhone}
            handleOpenLocation={handleOpenLocation}
            handleAddPatientPress={handleAddPatientPress}
            openCancelBookingModal={openCancelBookingModal}
            onBookingAction={handleBookingControlAction}
          />

          <PatientSelectorSection
            styles={styles}
            isSmallPhone={isSmallPhone}
            patientCount={patientCount}
            patientSelectorItems={patientSelectorItems}
            filteredPatientSelectorItems={filteredPatientSelectorItems}
            selectedPatientItem={selectedPatientItem}
            patientSearchText={patientSearchText}
            setPatientSearchText={setPatientSearchText}
            setSelectedPatientKey={setSelectedPatientKey}
          />

          <SelectedPatientAppointmentSection
            selectedPatientItem={selectedPatientItem}
            styles={styles}
            isSmallPhone={isSmallPhone}
            canUsePatientActions={canUsePatientActions}
            canCancelPatientForBooking={canCancelPatientForBooking}
            isTerminalBooking={isTerminalBooking}
            isBookingCompleteOrCancelled={isCompletedBooking || isCancelledBooking}
            activePatientPanelCompanyMap={activePatientPanelCompanyMap}
            patientSelectedTestsMap={patientSelectedTestsMap}
            patientPrecomputedSampleTubesMap={patientPrecomputedSampleTubesMap}
            patientSampleCollectionMap={patientSampleCollectionMap}
            patientTestBookingStatusMap={patientTestBookingStatusMap}
            useBackendTestPrices={isAppointmentSourceBooking}
            hidePatientEditAction={isAppointmentSourceBooking}
            skipPatientDocumentRequirements={isAppointmentSourceBooking}
            isAppointmentSourceBooking={isAppointmentSourceBooking}
            patientCghsEnabledMap={patientCghsEnabledMap}
            patientCghsIdMap={patientCghsIdMap}
            patientCghsDocumentsMap={patientCghsDocumentsMap}
            patientManualSlipDocumentsMap={patientManualSlipDocumentsMap}
            patientCompletionDocumentsMap={patientCompletionDocumentsMap}
            addingTestPatientId={addingTestPatientId}
            cancellingPatientId={cancellingPatientId}
            defaultTestBookingStatus={DEFAULT_TEST_BOOKING_STATUS}
            emptyUploadDocuments={EMPTY_UPLOAD_DOCUMENTS}
            getPatientPanelCompanies={getPatientPanelCompanies}
            isManualHcSlipSelected={isManualHcSlipSelected}
            doesPatientNeedPaymentProof={doesPatientNeedPaymentProof}
            doesPatientRequireIdentityDocuments={doesPatientRequireIdentityDocuments}
            handlePrimaryPanelCompanyPress={handlePrimaryPanelCompanyPress}
            openPanelCompanyTests={openPanelCompanyTests}
            handleRemovePatientPanelCompany={handleRemovePatientPanelCompany}
            handlePatientCancelBooking={handlePatientCancelBooking}
            handleEditPatientPress={handleEditPatientPress}
            handleTestBookingStatusChange={handleTestBookingStatusChange}
            handlePatientCghsEnabledChange={handlePatientCghsEnabledChange}
            handlePatientCghsIdChange={handlePatientCghsIdChange}
            handlePatientCghsDocumentsChange={handlePatientCghsDocumentsChange}
            handlePatientManualSlipDocumentsChange={
              handlePatientManualSlipDocumentsChange
            }
            handlePatientPaymentProofDocumentsChange={
              handlePatientPaymentProofDocumentsChange
            }
            showAppAlert={showAppAlert}
            onOpenSampleCollection={onOpenSampleCollection}
            handleRemoveSelectedTestWithSampleReset={
              handleRemoveSelectedTestWithSampleReset
            }
            handlePatientAddPanelCompany={handlePatientAddPanelCompany}
            referredByOptions={patientFormReferredByItems}
            onUpdatePatientReferredBy={handleUpdatePatientReferredBy}
            updatingReferredByPatientId=""
          />

          <ReportDeliverySection
            styles={styles}
            patients={reportDeliveryPatients}
            patientReportCourierMap={patientReportCourierMap}
            patientReportScheduleMap={patientReportScheduleMap}
            onToggleReportDelivery={
              canUsePatientActions ? handleReportCourierChange : undefined
            }
            onReportScheduleChange={
              canUsePatientActions ? handleReportScheduleChange : undefined
            }
          />

          {shouldShowProgressActions ? (
            <View style={styles.completeBookingLaunchCard}>
              <View style={styles.completeBookingLaunchHeader}>
                <View style={styles.completeBookingLaunchIconWrap}>
                  <Ionicons
                    name="wallet-outline"
                    size={18}
                    style={styles.completeBookingLaunchIcon}
                  />
                </View>
                <View style={styles.completeBookingLaunchText}>
                  <Text style={styles.completeBookingLaunchTitle}>
                    Billing & Completion
                  </Text>
                  <Text style={styles.completeBookingLaunchSubtitle}>
                    Review billing, uploads, payments, and final booking steps on
                    a separate screen.
                  </Text>
                </View>
              </View>
              <View style={styles.completeBookingLaunchStats}>
                <View style={styles.completeBookingLaunchStat}>
                  <Text style={styles.completeBookingLaunchStatLabel}>
                    Final Amount
                  </Text>
                  <Text style={styles.completeBookingLaunchStatValue}>
                    Rs. {completeNetAmount.toFixed(2)}
                  </Text>
                </View>
                <View style={styles.completeBookingLaunchStat}>
                  <Text style={styles.completeBookingLaunchStatLabel}>
                    Payments
                  </Text>
                  <Text style={styles.completeBookingLaunchStatValue}>
                    {completePayments.length}
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                activeOpacity={0.88}
                style={styles.completeBookingLaunchButton}
                onPress={openCompleteBookingScreen}>
                <Text style={styles.completeBookingLaunchButtonText}>
                  Open Billing Summary
                </Text>
                <Ionicons
                  name="arrow-forward"
                  size={16}
                  style={styles.completeBookingLaunchButtonIcon}
                />
              </TouchableOpacity>
            </View>
          ) : null}
        </>
      )}

      <AddPatientModal
        styles={styles}
        isAddPatientModalVisible={isAddPatientModalVisible}
        closeAddPatientModal={closeAddPatientModal}
        isNarrowScreen={isNarrowScreen}
        editingPatient={editingPatient}
        addPatientModalStep={addPatientModalStep}
        isAddingPatient={isAddingPatient}
        isUpdatingPatient={isUpdatingPatient}
        linkedPatients={linkedPatients}
        selectedLinkedPatientId={selectedLinkedPatientId}
        setSelectedLinkedPatientId={setSelectedLinkedPatientId}
        handleOpenAddPatientForm={handleOpenAddPatientForm}
        handleUseLinkedPatient={handleUseLinkedPatient}
        patientForm={patientForm}
        updatePatientFormField={updatePatientFormField}
        handleTitleChange={handleTitleChange}
        isGenderEditable={isGenderEditable}
        setIsDobCalendarVisible={setIsDobCalendarVisible}
        handlePickPatientDocuments={handlePickPatientDocuments}
        patientDocuments={patientDocuments}
        handleRemovePatientDocument={handleRemovePatientDocument}
        handlePatientFormPanelCompanyChange={handlePatientFormPanelCompanyChange}
        setIsPatientFormPanelCompanyFocused={
          setIsPatientFormPanelCompanyFocused
        }
        shouldShowPatientFormPanelCompanySuggestions={
          shouldShowPatientFormPanelCompanySuggestions
        }
        filteredPatientFormPanelCompanyItems={
          filteredPatientFormPanelCompanyItems
        }
        handleSelectPatientFormPanelCompany={
          handleSelectPatientFormPanelCompany
        }
        patientTagOptions={patientTagOptions}
        handleSubmitAddPatient={handleSubmitAddPatient}
      />

      <CalendarPickerModal
        styles={styles}
        visible={isDobCalendarVisible}
        eyebrow="Date of Birth"
        title={patientForm.dateOfBirth || 'Select DOB'}
        calendarMonth={dobCalendarMonth}
        calendarDays={calendarDays}
        selectedDateValue={patientForm.dateOfBirth}
        onClose={() => setIsDobCalendarVisible(false)}
        onMoveMonth={moveDobCalendarMonth}
        onSelectDate={handleDobDateSelect}
        quickActions={[
          {label: '-10 yr', onPress: () => moveDobCalendarMonth(-120)},
          {label: '-1 yr', onPress: () => moveDobCalendarMonth(-12)},
          {label: '+1 yr', onPress: () => moveDobCalendarMonth(12)},
          {label: '+10 yr', onPress: () => moveDobCalendarMonth(120)},
        ]}
        disableDate={date => date > new Date()}
        emptyKeyPrefix="dob-empty"
        dateKeyPrefix="dob"
      />

      <OptionSelectModal
        styles={styles}
        visible={isCancellationReasonSelectVisible}
        title="Cancellation Reason"
        options={CANCELLATION_REASON_OPTIONS}
        selectedValue={cancellationReason}
        onClose={() => setIsCancellationReasonSelectVisible(false)}
        onSelect={reason => {
          setCancellationReason(reason);
          setIsCancellationReasonSelectVisible(false);
        }}
      />

      <OptionSelectModal
        styles={styles}
        visible={isCancelTimeSlotSelectVisible}
        title="New Time Slot"
        options={CANCEL_TIME_SLOT_OPTIONS}
        selectedValue={cancelNewTimeSlot}
        onClose={() => setIsCancelTimeSlotSelectVisible(false)}
        onSelect={slot => {
          setCancelNewTimeSlot(slot);
          setIsCancelTimeSlotSelectVisible(false);
        }}
      />

      <OptionSelectModal
        styles={styles}
        visible={isLinkedAppointmentTimeSlotSelectVisible}
        title="Linked Appointment Time Slot"
        options={CANCEL_TIME_SLOT_OPTIONS}
        selectedValue={linkedAppointmentTimeSlot}
        onClose={() => setIsLinkedAppointmentTimeSlotSelectVisible(false)}
        onSelect={slot => {
          setLinkedAppointmentTimeSlot(slot);
          setIsLinkedAppointmentTimeSlotSelectVisible(false);
        }}
      />

      <CalendarPickerModal
        styles={styles}
        visible={isCancelCalendarVisible}
        eyebrow="New Visit Date"
        title={cancelNewVisitDate || 'Select date'}
        calendarMonth={cancelCalendarMonth}
        calendarDays={cancelCalendarDays}
        selectedDateValue={cancelNewVisitDate}
        onClose={() => setIsCancelCalendarVisible(false)}
        onMoveMonth={moveCancelCalendarMonth}
        onSelectDate={handleCancelDateSelect}
        disableDate={date => {
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          return date < today;
        }}
        emptyKeyPrefix="cancel-empty"
        dateKeyPrefix="cancel"
      />
      <CalendarPickerModal
        styles={styles}
        visible={isLinkedAppointmentCalendarVisible}
        eyebrow="Linked Appointment Date"
        title={linkedAppointmentDate || 'Select date'}
        calendarMonth={linkedAppointmentCalendarMonth}
        calendarDays={linkedAppointmentCalendarDays}
        selectedDateValue={linkedAppointmentDate}
        onClose={() => setIsLinkedAppointmentCalendarVisible(false)}
        onMoveMonth={moveLinkedAppointmentCalendarMonth}
        onSelectDate={handleLinkedAppointmentDateSelect}
        disableDate={date => {
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          return date < today;
        }}
        emptyKeyPrefix="linked-appointment-empty"
        dateKeyPrefix="linked-appointment"
      />
      <AppAlertModal
        alert={appAlert}
        styles={styles}
        onClose={closeAppAlert}
      />
    </>
  );
}

export default React.memo(AppointmentDetailsScreen);
