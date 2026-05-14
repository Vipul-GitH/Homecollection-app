import React, {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Linking,
  NativeModules,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import AppAlertModal from '../../components/common/AppAlertModal';
import AddPatientModal from '../../components/bookings/appointmentDetails/AddPatientModal';
import BookingDetailOverview from '../../components/bookings/appointmentDetails/BookingDetailOverview';
import CancelBookingModal from '../../components/bookings/appointmentDetails/CancelBookingModal';
import CompleteBookingScreen from '../../components/bookings/appointmentDetails/CompleteBookingScreen';
import OptionSelectModal from '../../components/bookings/appointmentDetails/OptionSelectModal';
import PatientSelectorSection from '../../components/bookings/appointmentDetails/PatientSelectorSection';
import ReportDeliverySection, {
  normalizeReportDeliveryValues,
} from '../../components/bookings/appointmentDetails/ReportDeliverySection';
import {
  CATALOG_ITEM_PAGE_SIZE,
  CATALOG_TEST_VISIBLE_LIMIT,
  EDITABLE_GENDER_TITLES,
  INITIAL_PATIENT_FORM,
  PANEL_COMPANY_DEFAULT_VISIBLE,
  PANEL_COMPANY_SEARCH_VISIBLE_LIMIT,
  TAG_OPTIONS,
  TITLE_OPTIONS,
} from './appointmentDetails/constants';
import CalendarPickerModal from './appointmentDetails/CalendarPickerModal';
import {
  getCatalogDisplayTitle,
  getCatalogGroupId,
  getCatalogSubgroupId,
  sortCatalogGroupsById,
  sortCatalogTestsByCode,
} from './appointmentDetails/catalogHelpers';
import {
  calculateAgeFromDob,
  buildApiPanelCompaniesFromPatient,
  getCalendarDays,
  getGenderFromTitle,
  getMimeTypeFromFileName,
  isSamePanelCompany,
  getPatientMutationId,
  getUpdatePatientId,
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
import SelectedPatientAppointmentSection from './appointmentDetails/SelectedPatientAppointmentSection';
import {
  areSampleTubeListsEqual,
  buildSampleTubeRootTests,
  getSampleTubeMappingCacheKey,
  mergeSampleTubeMaps,
  normalizeTestsForSampleTubeMapping,
} from './appointmentDetails/sampleTubeHelpers';
import {BRAND} from '../../styles/appStyles';
import {warnDebug} from '../../utils/app/logger';
import {
  getLocalPanelCompaniesResponse,
} from '../../services/local/panelCatalogLocal';
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
const EMPTY_UPLOAD_DOCUMENTS = [];
const DEFAULT_TEST_BOOKING_STATUS = 'none';
const MANUAL_HC_SLIP_STATUS = 'manual_hc_slip';
const toCurrencyNumber = value => {
  const normalizedValue = Number(String(value || '').replace(/[^0-9.]/g, ''));
  return Number.isFinite(normalizedValue) ? normalizedValue : 0;
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
  const standardDiscount = Math.min(
    100,
    Math.max(0, getTestStandardDiscountPercent(test)),
  );
  if (standardDiscount > 0 && baseMrp > 0) {
    return Math.max(0, baseMrp - (baseMrp * standardDiscount) / 100);
  }
  return charge || baseMrp;
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
  const basePanelCompanyName =
    normalizeFormText(panelCompany?.name || patient?.panelCompany) || 'Current Panel';
  const basePanelCompanyId = normalizeFormText(
    panelCompany?.compCatId || patient?.compCatId || patient?.comp_cat_id,
  );
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

  (Array.isArray(patient?.tests) ? patient.tests : []).forEach(test => {
    const dedupeKey = normalizeFormText(
      test?.code || test?.booked_code,
    ).toUpperCase();
    if (!dedupeKey) {
      return;
    }

    mergedMap.set(dedupeKey, {
      key: `seed|${test?.code || test?.booked_code || 'na'}|${
        test?.name || test?.test_name || 'na'
      }`,
      panelCompanyName: basePanelCompanyName,
      panelCompanySource: panelCompany?.chipSource || 'API',
      panelCompanyChipId: panelCompany?.chipId || panelCompany?.id || '',
      panelCompanyId: basePanelCompanyId,
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
      mrp: toCurrencyNumber(test?.mrp || test?.charge || test?.amount),
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

const normalizeUploadDocuments = (pickedFiles, fileNamePrefix) =>
  (Array.isArray(pickedFiles) ? pickedFiles : [])
    .filter(file => file?.uri)
    .map((file, index) => ({
      uri: file.uri,
      name: file.name || `${fileNamePrefix}-${Date.now()}-${index}`,
      type: file.type || getMimeTypeFromFileName(file.name),
    }));

const isPatientTerminalForCompletion = patient => {
  const statusCode = Number(patient?.bookingPatientStatusCode || 0);
  return statusCode === 3 || statusCode === 4 || statusCode === 5;
};

const isManualHcSlipSelected = value =>
  normalizeFormText(value) === MANUAL_HC_SLIP_STATUS;

const getCompleteBookingPatientOptionId = (patient, index) =>
  String(
    getCompletePayloadPatientId(patient) ||
      getPatientMutationId(patient) ||
      patient?.id ||
      patient?.patientId ||
      `patient-${index}`,
  );

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
  const [isAdditionalDiscountEnabled] = useState(true);
  const [completePayments, setCompletePayments] = useState(() =>
    normalizeCompletePaymentDrafts(appointmentDetailState?.completePayments),
  );
  const [patientAdditionalDiscountDraftMap, setPatientAdditionalDiscountDraftMap] =
    useState({});
  const [pendingPaymentPatientId, setPendingPaymentPatientId] = useState(
    () => appointmentDetailState?.pendingPaymentPatientId || '',
  );
  const additionalDiscountLimitAlertKeyRef = useRef('');
  const [dobCalendarMonth, setDobCalendarMonth] = useState(() => new Date());
  const [patientForm, setPatientForm] = useState(INITIAL_PATIENT_FORM);
  const [patientCompletionDocumentsMap, setPatientCompletionDocumentsMap] =
    useState({});
  const [patientManualSlipDocumentsMap, setPatientManualSlipDocumentsMap] =
    useState({});
  const [patientFormPanelCompanyItems, setPatientFormPanelCompanyItems] =
    useState([]);
  const [isPatientFormPanelCompanyFocused, setIsPatientFormPanelCompanyFocused] =
    useState(false);
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
      Array.isArray(selectedBooking?.patients)
        ? selectedBooking.patients
        : [],
    [selectedBooking?.patients],
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
          name: normalizeFormText(patient?.name) || `Patient ${index + 1}`,
        });

        return options;
      }, []),
    [patients],
  );
  const completePaymentPatientOptions = useMemo(
    () =>
      patients.reduce((options, patient, index) => {
        if (isPatientTerminalForCompletion(patient)) {
          return options;
        }

        options.push({
          id: getCompleteBookingPatientOptionId(patient, index),
          patientId: getCompletePayloadPatientId(patient),
          name: normalizeFormText(patient?.name) || `Patient ${index + 1}`,
        });

        return options;
      }, []),
    [patients],
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

        options.push({
          id: patientId,
          name: normalizeFormText(patient?.name) || `Patient ${index + 1}`,
        });

        return options;
      }, []),
    [patients],
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
    const searchText = patientSearchText.trim().toLowerCase();

    if (!searchText) {
      return patientSelectorItems;
    }

    return patientSelectorItems.filter(item =>
      `${item.name} ${item.meta}`.toLowerCase().includes(searchText),
    );
  }, [patientSearchText, patientSelectorItems]);
  const selectedPatientItem =
    patientSelectorItems.find(item => item.key === selectedPatientKey) ||
    patientSelectorItems[0] ||
    null;
  useEffect(() => {
    let isMounted = true;
    const bookingPatients = Array.isArray(patients) ? patients : [];

    if (!bookingPatients.length) {
      setPatientPrecomputedSampleTubesMap({});
      return () => {
        isMounted = false;
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

    bookingPatients.forEach(patient => {
      const patientId = getPatientMutationId(patient);
      if (!patientId) {
        return;
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
        return;
      }

      const fallbackMaps = buildSampleTubeMapsFromTests(normalizedTests);
      const fallbackTubes = collectUniqueTubesForSelectedTests(
        normalizedTests,
        fallbackMaps.testsMap,
        fallbackMaps.childrenMap,
      );
      applyPatientTubes(patientId, fallbackTubes);

      const rootTests = buildSampleTubeRootTests(normalizedTests);
      if (
        !rootTests.length ||
        !CatalogDatabaseModule?.getSampleTubeMappingForTestCodes
      ) {
        return;
      }

      const cacheKey = getSampleTubeMappingCacheKey(rootTests);
      const cachedMaps = sampleTubeMappingCache.get(cacheKey);
      const applyNativeMaps = nativeMaps => {
        const mergedMaps = mergeSampleTubeMaps(fallbackMaps, nativeMaps);
        const nativeTubes = collectUniqueTubesForSelectedTests(
          normalizedTests,
          mergedMaps.testsMap,
          mergedMaps.childrenMap,
        );
        applyPatientTubes(patientId, nativeTubes);
      };

      if (cachedMaps) {
        applyNativeMaps(cachedMaps);
        return;
      }

      const mappingRequest =
        sampleTubeMappingRequests.get(cacheKey) ||
        CatalogDatabaseModule.getSampleTubeMappingForTestCodes(
          JSON.stringify(rootTests),
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
      mappingRequest.then(applyNativeMaps).catch(error => {
        warnDebug('Unable to precompute patient sample tubes:', error);
        applyPatientTubes(patientId, fallbackTubes);
      });
    });

    return () => {
      isMounted = false;
    };
  }, [patientSelectedTestsMap, patients]);
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
    setPatientCompletionDocumentsMap({});
    setPatientManualSlipDocumentsMap({});
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
    const shouldLoadPatientFormPanelCompanies =
      isAddPatientModalVisible &&
      (editingPatient || addPatientModalStep === 'form') &&
      !patientFormPanelCompanyItems.length;

    if (!shouldLoadPatientFormPanelCompanies) {
      return () => {
        isMounted = false;
      };
    }

    const loadPatientFormPanelCompanies = async () => {
      try {
        const responseData = await getLocalPanelCompaniesResponse();
        const items = normalizePanelCompanyItems(responseData);

        if (isMounted) {
          setPatientFormPanelCompanyItems(items);
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

      if (panelCompanies.length) {
        return panelCompanies.some(
          company =>
            hasSpecialIdentityPanel(company?.name) ||
            hasSpecialIdentityPanel(company?.details),
        );
      }

      return (
        hasSpecialIdentityPanel(patient?.panelCompany || patient?.panel_company) ||
        hasSpecialIdentityPanel(patient?.cat_details || patient?.catDetails)
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
          const selectedChargeMode = getBillingModeForCalculation(
            test?.selected_charge_mode ||
              test?.selectedChargeMode ||
              test?.billingChargeMode ||
              test?.chargeMode ||
              patient?.billingChargeMode ||
              patient?.chargeMode,
          );

          return {
            key:
              normalizeFormText(test?.key) ||
              `${normalizeFormText(test?.booked_code || test?.code)}-${patientId}`,
            patientId,
            patientName: normalizeFormText(patient?.name),
            code: normalizeFormText(test?.booked_code || test?.code),
            description:
              normalizeFormText(test?.description || test?.name) || 'Unnamed Test',
            selectedChargeMode,
            billingBucket: getBillingBucketFromChargeMode(selectedChargeMode),
            mrp: toCurrencyNumber(test?.mrp || test?.charge || test?.amount),
            charge: getDiscountedTestPrice(test),
            percentageonstandard: getTestStandardDiscountPercent(test),
            standard_discount_amount: Math.max(
              0,
              toCurrencyNumber(test?.mrp || test?.charge || test?.amount) -
                getDiscountedTestPrice(test),
            ),
            max_discount:
              toCurrencyNumber(test?.max_discount || test?.maxDiscount) ||
              Math.max(
                0,
                toCurrencyNumber(test?.mrp || test?.charge || test?.amount) -
                  getDiscountedTestPrice(test),
              ),
            max_allowed_discount: toCurrencyNumber(
              test?.max_allowed_discount || test?.maxAllowedDiscount,
            ),
          };
        });
      }),
    [patients, patientSelectedTestsMap],
  );
  const bookingAmountFields = selectedBooking?.amountFields || {};
  const localBillingSummary = useMemo(() => {
    const payingTests = completeBillingTests.filter(
      test => test.billingBucket === 'paying',
    );
    const creditTests = completeBillingTests.filter(
      test => test.billingBucket === 'credit',
    );
    const freeTests = completeBillingTests.filter(
      test => test.billingBucket === 'free',
    );
    const subtotal = completeBillingTests.reduce(
      (total, test) => total + toCurrencyNumber(test?.mrp),
      0,
    );
    const payingSubtotal = payingTests.reduce(
      (total, test) => total + toCurrencyNumber(test?.mrp),
      0,
    );
    const creditSubtotal = creditTests.reduce(
      (total, test) => total + toCurrencyNumber(test?.mrp),
      0,
    );
    const freeSubtotal = freeTests.reduce(
      (total, test) => total + toCurrencyNumber(test?.mrp),
      0,
    );
    const creditTotal = creditTests.reduce(
      (total, test) => total + toCurrencyNumber(test?.mrp),
      0,
    );
    const freeTotal = freeTests.reduce(
      (total, test) => total + toCurrencyNumber(test?.mrp),
      0,
    );
    const payingBaseDiscount = payingTests.reduce(
      (total, test) => total + toCurrencyNumber(test?.standard_discount_amount),
      0,
    );
    const baseDiscount = payingBaseDiscount;
    const maxTotalDiscount = payingTests.reduce(
      (total, test) =>
        total +
        Math.max(
          toCurrencyNumber(test?.max_allowed_discount),
          toCurrencyNumber(test?.max_discount),
        ),
      0,
    );
    const patientSummaryMap = new Map();

    completeBillingTests.forEach(test => {
      const patientId = normalizeFormText(test?.patientId);
      if (!patientId) {
        return;
      }

      if (!patientSummaryMap.has(patientId)) {
        patientSummaryMap.set(patientId, {
          patientId,
          patientName: normalizeFormText(test?.patientName) || 'Patient',
          subtotal: 0,
          payingSubtotal: 0,
          baseDiscount: 0,
          maxTotalDiscount: 0,
          requestedAdditional: 0,
          effectiveAdditional: 0,
          maxAdditionalAllowed: 0,
          payingTestCount: 0,
        });
      }

      const entry = patientSummaryMap.get(patientId);
      entry.subtotal += toCurrencyNumber(test?.mrp);

      if (test.billingBucket === 'paying') {
        entry.payingSubtotal += toCurrencyNumber(test?.mrp);
        entry.baseDiscount += toCurrencyNumber(test?.standard_discount_amount);
        entry.maxTotalDiscount += Math.max(
          toCurrencyNumber(test?.max_allowed_discount),
          toCurrencyNumber(test?.max_discount),
        );
        entry.payingTestCount += 1;
      }
    });

    const patientAdditionalDiscountRows = Array.from(patientSummaryMap.values())
      .map(entry => {
        const enteredValue = toCurrencyNumber(
          patientAdditionalDiscountMap[entry.patientId],
        );
        const maxAdditionalAllowed = Math.max(
          0,
          entry.maxTotalDiscount - entry.baseDiscount,
        );
        const effectiveAdditional = Math.min(enteredValue, maxAdditionalAllowed);

        return {
          ...entry,
          enteredAdditional: normalizeFormText(
            patientAdditionalDiscountMap[entry.patientId],
          ),
          requestedAdditional: enteredValue,
          maxAdditionalAllowed,
          effectiveAdditional,
          hasOverflow: enteredValue > maxAdditionalAllowed,
        };
      })
      .filter(
        entry =>
          entry.payingTestCount > 0 &&
          entry.maxAdditionalAllowed > 0.009,
      )
      .sort((leftItem, rightItem) =>
        leftItem.patientName.localeCompare(rightItem.patientName),
      );

    const maxAdditionalAllowed = patientAdditionalDiscountRows.reduce(
      (total, patient) => total + patient.maxAdditionalAllowed,
      0,
    );
    const requestedAdditional = patientAdditionalDiscountRows.reduce(
      (total, patient) => total + patient.requestedAdditional,
      0,
    );
    const effectiveAdditional = patientAdditionalDiscountRows.reduce(
      (total, patient) => total + patient.effectiveAdditional,
      0,
    );
    const finalDiscount = baseDiscount + effectiveAdditional;
    const nonPayingTotal = creditTotal + freeTotal;
    const finalAmount = Math.max(0, subtotal - finalDiscount - nonPayingTotal);

    return {
      subtotal,
      payingSubtotal,
      creditSubtotal,
      freeSubtotal,
      creditTotal,
      freeTotal,
      nonPayingTotal,
      baseDiscount,
      payingBaseDiscount,
      maxTotalDiscount,
      maxAdditionalAllowed,
      requestedAdditional,
      effectiveAdditional,
      finalDiscount,
      finalAmount,
      patientAdditionalDiscountRows,
      payingTestCount: payingTests.length,
      creditTestCount: creditTests.length,
      freeTestCount: freeTests.length,
    };
  }, [
    completeBillingTests,
    patientAdditionalDiscountMap,
  ]);
  const patientSeedAdditionalDiscountTotal = useMemo(
    () =>
      (Array.isArray(selectedBooking?.patients) ? selectedBooking.patients : []).reduce(
        (total, patient) =>
          total +
          toCurrencyNumber(
            patient?.additionalDiscountAmount ||
              patient?.additional_discount_amount ||
              patient?.ad_dis ||
              patient?.Ad_Dis,
          ),
        0,
      ),
    [selectedBooking?.patients],
  );
  const hasBackendPatientLevelAdditionalDiscount = useMemo(
    () =>
      (Array.isArray(selectedBooking?.patients) ? selectedBooking.patients : []).some(
        patient =>
          toCurrencyNumber(
            patient?.additionalDiscountAmount ||
              patient?.additional_discount_amount ||
              patient?.ad_dis ||
              patient?.Ad_Dis,
          ) > 0,
      ),
    [selectedBooking?.patients],
  );
  const explicitPreloadedAdditionalDiscount = toCurrencyNumber(
    bookingAmountFields.additionalDiscount ||
      selectedBooking?.Ad_Dis ||
      selectedBooking?.ad_dis ||
      selectedBooking?.additional_discount ||
      selectedBooking?.additionalDiscount ||
      selectedBooking?.additional_discount_amount ||
      selectedBooking?.additionalDiscountAmount ||
      selectedBooking?.billing_summary?.Ad_Dis ||
      selectedBooking?.billing_summary?.ad_dis ||
      selectedBooking?.billingSummary?.Ad_Dis ||
      selectedBooking?.billingSummary?.ad_dis ||
      patientSeedAdditionalDiscountTotal,
  );
  const derivedPreloadedAdditionalDiscount = Math.max(
    0,
    toCurrencyNumber(bookingAmountFields.baseDiscount) -
      localBillingSummary.baseDiscount,
  );
  const preloadedAdditionalDiscount =
    explicitPreloadedAdditionalDiscount > 0
      ? explicitPreloadedAdditionalDiscount
      : derivedPreloadedAdditionalDiscount;
  const hasPatientAdditionalDiscountEntry =
    localBillingSummary.patientAdditionalDiscountRows.some(
      patient => patient.requestedAdditional > 0,
    );
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
  const completeBillingTotal = localBillingSummary.subtotal;
  const completeAdditionalDiscountAmount =
    hasBackendPatientLevelAdditionalDiscount
      ? localBillingSummary.effectiveAdditional
      : preloadedAdditionalDiscount > 0 && !hasPatientAdditionalDiscountEntry
      ? preloadedAdditionalDiscount
      : localBillingSummary.effectiveAdditional;
  const completeBaseDiscountAmount = localBillingSummary.baseDiscount;
  const completeDiscountAmount =
    completeBaseDiscountAmount + completeAdditionalDiscountAmount;
  const completeCreditAmount = localBillingSummary.creditTotal;
  const completeNetAmount = Math.max(
    0,
    completeBillingTotal -
      completeDiscountAmount -
      localBillingSummary.nonPayingTotal,
  );
  const completeAmountReceived = useMemo(
    () =>
      completePayments.reduce(
        (total, payment) => total + toCurrencyNumber(payment?.amount),
        0,
      ),
    [completePayments],
  );
  const completePaymentMode =
    completePayments.find(payment => normalizeFormText(payment?.mode))?.mode ||
    COMPLETE_PAYMENT_MODE_OPTIONS[0];
  const hasEnteredCompletePaymentAmount = completePayments.some(payment =>
    normalizeFormText(payment?.amount),
  );
  const pendingPaymentAmount = Math.max(
    0,
    completeNetAmount - completeAmountReceived,
  );
  const extraPaymentAmount = Math.max(
    0,
    completeAmountReceived - completeNetAmount,
  );
  const shouldCollectPendingPaymentPatient =
    hasEnteredCompletePaymentAmount &&
    (pendingPaymentAmount > 0.009 || extraPaymentAmount > 0.009) &&
    completePaymentPatientOptions.length > 0;
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

  const completeBookingPayload = useMemo(() => {
    const patientAdditionalDiscountMapForPayload =
      localBillingSummary.patientAdditionalDiscountRows.reduce(
        (accumulator, patientDiscount) => ({
          ...accumulator,
          [patientDiscount.patientId]: patientDiscount,
        }),
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
        const panelMap = new Map();

        sourceTests.forEach(test => {
          const panelCompany =
            normalizeFormText(
              test?.panelCompanyName ||
                test?.panel_company ||
                patient?.panelCompany,
            ) || 'Current Panel';
          const compCatId = normalizeFormText(
            test?.panelCompanyId ||
              test?.compCatId ||
              test?.comp_cat_id ||
              patient?.compCatId ||
              patient?.comp_cat_id,
          );
          const catDetails = normalizeFormText(
            test?.cat_details ||
              test?.catDetails ||
              test?.panelCompanyDetails ||
              test?.panel_company_details ||
              test?.details,
          );
          const selectedChargeMode =
            normalizeCompleteChargeMode(
              test?.selected_charge_mode ||
                test?.selectedChargeMode ||
                test?.billingChargeMode ||
                test?.chargeMode ||
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
              test?.booked_code ||
                test?.code ||
                test?.testcode1 ||
                test?.test_code,
            ),
            description:
              normalizeFormText(test?.description || test?.name) ||
              'Unnamed Test',
            mrp: toCurrencyNumber(test?.mrp || test?.charge || test?.amount),
            charge: getDiscountedTestPrice(test),
            percentageonstandard: getTestStandardDiscountPercent(test),
            standard_discount_amount: Math.max(
              0,
              toCurrencyNumber(test?.mrp || test?.charge || test?.amount) -
                getDiscountedTestPrice(test),
            ),
            max_discount:
              toCurrencyNumber(test?.max_discount || test?.maxDiscount) ||
              Math.max(
                0,
                toCurrencyNumber(test?.mrp || test?.charge || test?.amount) -
                  getDiscountedTestPrice(test),
              ),
            max_allowed_discount: toCurrencyNumber(
              test?.max_allowed_discount || test?.maxAllowedDiscount,
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
          test_booking_status: testBookingStatus,
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
      );
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

    return {
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
      linked_appointment: isLinkedAppointmentSelected ? 'yes' : 'no',
      linked_appointment_date: isLinkedAppointmentSelected
        ? linkedAppointmentDate
        : '',
      linked_appointment_time_slot: isLinkedAppointmentSelected
        ? linkedAppointmentTimeSlot
        : '',
      sample_collection_pick_count: samplePickCount,
      sample_collection_pick_patients: completeBookingPatientOptions.filter(
        option => samplePickPatientIds.includes(option.id),
      ),
      sample_collection_easy_tough: sampleCollectionEasyTough,
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
          mode: payment.mode,
          amount: toCurrencyNumber(payment.amount),
          documents: payment.proofDocuments,
        }))
        .filter(payment => payment.documents.length),
      tests_payload: testsPayload,
      pending_child_tests: pendingChildTestsPayload,
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
      patient_documents_map: patientCompletionDocumentsMap,
      manual_slip_documents_map: patientManualSlipDocumentsMap,
      patient_cghs_documents_map: patientCghsDocumentsMap,
    };
  }, [
    completeBookingPatientOptions,
    completePaymentPatientOptions,
    completeAdditionalDiscountAmount,
    completeAmountReceived,
    completePaymentMode,
    completePayments,
    isLinkedAppointmentSelected,
    linkedAppointmentDate,
    linkedAppointmentTimeSlot,
    patientCompletionDocumentsMap,
    patientCghsDocumentsMap,
    patientManualSlipDocumentsMap,
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
  const handlePanelCatalogScroll = useCallback(
    event => {
      if (!hasMoreCatalogItems) {
        return;
      }

      const {contentOffset, contentSize, layoutMeasurement} = event.nativeEvent;
      const distanceFromBottom =
        contentSize.height - (contentOffset.y + layoutMeasurement.height);

      if (distanceFromBottom <= 120) {
        loadMoreCatalogItems();
      }
    },
    [hasMoreCatalogItems, loadMoreCatalogItems],
  );

  const mergedSelectedBookingAddress = [
    selectedBooking.address.addressType,
    selectedBooking.address.houseNumber,
    selectedBooking.address.floor,
    selectedBooking.address.streetLine,
    selectedBooking.address.landmark,
    selectedBooking.address.colonyName,
    selectedBooking.address.city,
    selectedBooking.address.pincode,
  ]
    .filter(value => value && value !== 'N/A')
    .join(', ');
  const resolvedAddress =
    selectedBooking.address.fullAddress &&
    selectedBooking.address.fullAddress !== 'Address not available'
      ? selectedBooking.address.fullAddress
      : mergedSelectedBookingAddress;
  const latitude =
    selectedBooking.address.latitude && selectedBooking.address.latitude !== 'N/A'
      ? selectedBooking.address.latitude
      : '';
  const longitude =
    selectedBooking.address.longitude &&
    selectedBooking.address.longitude !== 'N/A'
      ? selectedBooking.address.longitude
      : '';
  const locationUrl = normalizeFormText(selectedBooking.address.locationUrl);
  const patientCount = selectedBooking.patients.length;

  const handleOpenLocation = async () => {
    if (!locationUrl && !resolvedAddress && (!latitude || !longitude)) {
      return;
    }

    const mapsQuery =
      latitude && longitude
        ? `${latitude},${longitude}`
        : encodeURIComponent(resolvedAddress);
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
    if (!canUsePatientActions) {
      showBookingStartRequiredAlert();
      return;
    }

    const title = normalizeOptionValue(
      patient.title,
      TITLE_OPTIONS,
      INITIAL_PATIENT_FORM.title,
    );
    const dateOfBirth = normalizeFormText(patient.dob);
    const ageYears =
      calculateAgeFromDob(dateOfBirth) || normalizeFormText(patient.age);

    setEditingPatient(patient);
    setPatientForm({
      title,
      fullName: normalizeFormText(patient.name),
      gender: normalizeFormText(patient.gender) || getGenderFromTitle(title),
      dateOfBirth,
      ageYears,
      primaryMobile: normalizeMobileValue(patient.mobileNumber),
      alternateMobile: normalizeMobileValue(patient.alternateMobileNumber),
      email: normalizeFormText(patient.email),
      labmatePid: normalizeFormText(patient.labmatePid),
      panelCompany:
        normalizeFormText(patient.panelCompany) ||
        INITIAL_PATIENT_FORM.panelCompany,
      cghsCardNo: normalizeFormText(
        patient.cardNo ||
          patient.card_no ||
          patient.cghsCardNo ||
          patient.cghs_card_no,
      ),
      tag: normalizeOptionValue(patient.tag, TAG_OPTIONS, INITIAL_PATIENT_FORM.tag),
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

  const handleReportCourierChange = (patient, nextValue) => {
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
  };

  const handleReportScheduleChange = (patient, nextValue) => {
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
  };

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
        [sectionKey]: Array.isArray(documents) ? documents : [],
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

    setPatientCompletionDocumentsMap(previousMap => {
      const nextDocuments = Array.isArray(documents) ? documents : EMPTY_UPLOAD_DOCUMENTS;
      const previousDocuments = previousMap[patientId] || EMPTY_UPLOAD_DOCUMENTS;

      if (previousDocuments === nextDocuments) {
        return previousMap;
      }

      return {
        ...previousMap,
        [patientId]: nextDocuments,
      };
    });
  }, [canUsePatientActions, showBookingStartRequiredAlert]);

  const handlePatientManualSlipDocumentsChange = useCallback((patient, documents) => {
    if (!canUsePatientActions) {
      showBookingStartRequiredAlert();
      return;
    }

    const patientId = getPatientMutationId(patient);

    if (!patientId) {
      return;
    }

    setPatientManualSlipDocumentsMap(previousMap => ({
      ...previousMap,
      [patientId]: Array.isArray(documents) ? documents : EMPTY_UPLOAD_DOCUMENTS,
    }));
  }, [canUsePatientActions, showBookingStartRequiredAlert]);

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

  const openCompleteBookingScreen = () => {
    if (!shouldShowProgressActions) {
      showBookingStartRequiredAlert();
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
    () => ({
      cancellation_reason: cancellationReason,
      cancel_reason: cancellationReason,
      reason: cancellationReason,
      remarks: cancelRemarks,
      cancel_remarks: cancelRemarks,
      reschedule_requested: Boolean(isCancelRescheduleRequested),
      is_reschedule_requested: Boolean(isCancelRescheduleRequested),
      is_new_slot_known: Boolean(isCancelRescheduleRequested && isCancelKnownSlot),
      new_visit_date:
        isCancelRescheduleRequested && isCancelKnownSlot ? cancelNewVisitDate : '',
      new_time_slot:
        isCancelRescheduleRequested && isCancelKnownSlot ? cancelNewTimeSlot : '',
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
      ? await onCancelPatient(cancelTargetPatient, cancelPayload)
      : await onBookingAction('cancel', cancelPayload);

    if (didCancel) {
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

    const message = `${invalidDiscount.patientName} ke liye additional discount max Rs. ${invalidDiscount.maxAdditionalAllowed.toFixed(
      2,
    )} tak hi allowed hai.`;
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
        const message = `${patientDiscount.patientName} ke liye additional discount max Rs. ${patientDiscount.maxAdditionalAllowed.toFixed(
          2,
        )} tak hi allowed hai.`;
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
        [normalizedPatientId]:
          requestedAdditional > 0
            ? String(patientAdditionalDiscountDraftMap[normalizedPatientId] || '')
            : '',
      }));
    },
    [
      patientAdditionalDiscountDraftMap,
      patientAdditionalDiscountUiRows,
      setPatientAdditionalDiscountMap,
      showAppAlert,
    ],
  );

  const confirmCompleteBooking = async () => {
    if (!samplePickCount) {
      showAppAlert(
        'No. of Pricks Required',
        'Please select no. of pricks in sample collection.',
      );
      return;
    }

    if (
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

    if (!sampleCollectionEasyTough) {
      showAppAlert(
        'Sample Collection Required',
        'Please select whether sample collection was easy/tough.',
      );
      return;
    }

    if (
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
      isLinkedAppointmentSelected &&
      (!linkedAppointmentDate || !linkedAppointmentTimeSlot)
    ) {
      showAppAlert(
        'Linked Appointment Required',
        'Please select linked appointment date and time slot.',
      );
      return;
    }

    const pendingIdentityDocumentsPatients = patients
      .filter(patient => {
        if (isPatientTerminalForCompletion(patient)) {
          return false;
        }

        return doesPatientRequireIdentityDocuments(patient);
      })
      .map(patient => {
        const patientId = getPatientMutationId(patient);
        const cghsDocuments = patientId
          ? patientCghsDocumentsMap[patientId] || {}
          : {};
        const missingDocuments = [];

        if (!Array.isArray(cghsDocuments.patientPhotos) || !cghsDocuments.patientPhotos.length) {
          missingDocuments.push('patient photo');
        }
        if (!Array.isArray(cghsDocuments.cghsCard) || !cghsDocuments.cghsCard.length) {
          missingDocuments.push('CGHS card');
        }

        return missingDocuments.length
          ? {
              patientName: patient?.name || 'Patient',
              missingDocuments,
            }
          : null;
      })
      .filter(Boolean);

    if (pendingIdentityDocumentsPatients.length) {
      showAppAlert(
        'CAPF / NHA Documents Required',
        pendingIdentityDocumentsPatients
          .map(
            item =>
              `${item.patientName}: ${item.missingDocuments.join(' and ')}`,
          )
          .join('\n'),
      );
      return;
    }

    const pendingManualSlipPatients = patients.filter(patient => {
      if (isPatientTerminalForCompletion(patient)) {
        return false;
      }

      const patientId = getPatientMutationId(patient);
      const testBookingStatus =
        patientTestBookingStatusMap[patientId] ||
        DEFAULT_TEST_BOOKING_STATUS;

      if (!isManualHcSlipSelected(testBookingStatus)) {
        return false;
      }

      const uploadedDocuments = patientId
        ? patientManualSlipDocumentsMap[patientId] || []
        : [];
      return !uploadedDocuments.length;
    });

    if (pendingManualSlipPatients.length) {
      showAppAlert(
        'Manual Slip Required',
        `Please upload manual HC slip for: ${pendingManualSlipPatients
          .map(patient => patient?.name || 'Patient')
          .join(', ')}.`,
      );
      return;
    }

    const pendingSamplePatients = patients.filter(patient => {
      if (isPatientTerminalForCompletion(patient)) {
        return false;
      }

      const patientId = getPatientMutationId(patient);
      const testBookingStatus =
        patientTestBookingStatusMap[patientId] ||
        DEFAULT_TEST_BOOKING_STATUS;

      if (isManualHcSlipSelected(testBookingStatus)) {
        return false;
      }

      return !patientSampleCollectionMap[patientId]?.collected;
    });

    if (pendingSamplePatients.length && !isLinkedAppointmentSelected) {
      showAppAlert(
        'Sample Collection Pending',
        `Please collect sample or cancel patient booking for: ${pendingSamplePatients
          .map(patient => patient?.name || 'Patient')
          .join(', ')}.`,
      );
      return;
    }

    const pendingProofPatients = patients.filter(patient => {
      const patientId = getPatientMutationId(patient);
      const testBookingStatus =
        patientTestBookingStatusMap[patientId] ||
        DEFAULT_TEST_BOOKING_STATUS;

      if (isManualHcSlipSelected(testBookingStatus)) {
        return false;
      }

      if (!doesPatientNeedPaymentProof(patient)) {
        return false;
      }

      const uploadedDocuments = patientId
        ? patientCompletionDocumentsMap[patientId] || []
        : [];
      return !uploadedDocuments.length;
    });

    if (pendingProofPatients.length) {
      showAppAlert(
        'Upload Required',
        `Please upload prescription or billing proof for: ${pendingProofPatients
          .map(patient => patient?.name || 'Patient')
          .join(', ')}.`,
      );
      return;
    }

    const pendingReportDeliveryPatients = patients.filter(patient => {
      if (isPatientTerminalForCompletion(patient)) {
        return false;
      }

      const patientId = getPatientMutationId(patient);
      if (!patientId) {
        return false;
      }

      return !normalizeReportDeliveryValues(
        patientReportCourierMap[patientId],
      ).length;
    });

    if (pendingReportDeliveryPatients.length) {
      showAppAlert(
        'Report Delivery Required',
        `Please select report delivery for: ${pendingReportDeliveryPatients
          .map(patient => patient?.name || 'Patient')
          .join(', ')}.`,
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

    const didComplete = await onBookingAction('completed', completeBookingPayload);

    if (!didComplete) {
      return;
    }

    setIsCompleteBookingScreenVisible(false);
    setIsLinkedAppointmentCalendarVisible(false);
    setIsLinkedAppointmentTimeSlotSelectVisible(false);

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
        payment.id === paymentId ? {...payment, ...updates} : payment,
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

          return {
            ...payment,
            proofDocuments: [
              ...(Array.isArray(payment.proofDocuments)
                ? payment.proofDocuments
                : []),
              ...nextDocuments,
            ],
          };
        }),
      );
    },
    [],
  );
  const pickUploadDocumentsFromDevice = useCallback(
    async ({fileNamePrefix, onDocumentsPicked, failureMessage}) => {
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
    async ({fileNamePrefix, documentLabel, onDocumentsPicked}) => {
      if (!LocalGeoCameraModule?.captureStampedPhoto) {
        showAppAlert(
          'Camera Not Available',
          'Geo camera module is not available in this build.',
        );
        return;
      }

      try {
        const stampText = [
          `Document: ${documentLabel || 'Document'}`,
          `Time: ${new Date().toLocaleString('en-IN')}`,
        ].join('\n');
        const capturedPhoto = await LocalGeoCameraModule.captureStampedPhoto(
          stampText,
        );

        if (!capturedPhoto?.uri) {
          return;
        }

        onDocumentsPicked([
          {
            uri: capturedPhoto.uri,
            name: capturedPhoto.name || `${fileNamePrefix}-${Date.now()}.jpg`,
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
    ({title, onCameraPress, onScreenshotPress}) => {
      showAppAlert(title, 'Choose how to add this file.', [
        {text: 'Camera', onPress: onCameraPress},
        {text: 'Screenshot', onPress: onScreenshotPress},
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
            onDocumentsPicked: documents =>
              appendCompletePaymentProofDocuments(paymentId, documents),
          }),
        onScreenshotPress: () =>
          pickUploadDocumentsFromDevice({
            fileNamePrefix: 'upi-payment-proof',
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
      onScreenshotPress: () =>
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
            isSamePanelCompany(matchedCompany, company),
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
      <>
        <View style={styles.sectionCard}>
          <View
            style={[
              styles.patientsSectionHeaderRow,
              isNarrowScreen && styles.patientsSectionHeaderRowStacked,
            ]}>
            <View style={styles.sectionTitleRow}>
              <View style={styles.sectionIconWrap}>
                <Ionicons name="flask" size={16} style={styles.sectionIcon} />
              </View>
              <Text
                style={[styles.sectionTitle, styles.panelFlowHeadingText]}
                numberOfLines={2}>
                Select Panel Company
              </Text>
            </View>
            <TouchableOpacity
              activeOpacity={0.85}
              style={[
                styles.addPatientButton,
                isSmallPhone && styles.addPatientButtonCompact,
              ]}
              onPress={handleAddTestFlowBack}>
              <Ionicons
                name="arrow-back"
                size={16}
                style={styles.addPatientButtonIcon}
              />
              <Text style={styles.addPatientButtonText}>Back</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.sectionText}>
            Patient: {selectedPanelPatient?.name || 'N/A'}
          </Text>
          {isPanelCatalogVisible ? (
            <Text style={styles.sectionText}>
              Company: {selectedPanelCompanyName || 'Selected'}
            </Text>
          ) : null}
        </View>

        <View style={[styles.bookingDetailCard, styles.panelCatalogBodyFull]}>
          {isPanelCompanyModalVisible ? (
            <>
              <View style={styles.panelCompanySearchWrap}>
                <Ionicons
                  name="search-outline"
                  size={18}
                  style={styles.panelCompanySearchIcon}
                />
                <TextInput
                  value={panelCompanySearch}
                  onChangeText={setPanelCompanySearch}
                  placeholder="Search panel company"
                  placeholderTextColor={BRAND.textMuted}
                  style={styles.panelCompanySearchInput}
                />
              </View>
              <Text style={styles.sectionText}>
                Showing first {PANEL_COMPANY_DEFAULT_VISIBLE} companies only.
                Search to find the rest.
              </Text>
              {hasPanelCompanySearch ? (
                <Text style={styles.sectionText}>
                  Showing {visiblePanelCompanyItems.length} of{' '}
                  {filteredPanelCompanyItems.length} matching panel companies.
                  Type more to narrow results.
                </Text>
              ) : null}

              <View style={styles.panelCompanyList}>
                <ScrollView
                  showsVerticalScrollIndicator
                  nestedScrollEnabled
                  contentContainerStyle={styles.panelCompanyListContent}>
                  {filteredPanelCompanyItems.length ? (
                    visiblePanelCompanyItems.map((item, index) => {
                      const isSelected = selectedPanelCompanyId === item.id;

                      return (
                        <TouchableOpacity
                          key={`${item.id}-${index}`}
                          activeOpacity={0.85}
                          style={[
                            styles.panelCompanyItem,
                            isSelected && styles.panelCompanyItemActive,
                          ]}
                          onPress={() => handleSelectPanelCompany(item)}>
                          <View style={styles.panelCompanyItemTextWrap}>
                            <Text
                              style={[
                                styles.panelCompanyName,
                                isSelected && styles.panelCompanyNameActive,
                              ]}>
                              {item.name}
                            </Text>
                            {item.details ? (
                              <Text style={styles.panelCompanyDetails}>
                                {item.details}
                              </Text>
                            ) : null}
                            {item.centerId ? (
                              <Text style={styles.panelCompanyMeta}>
                                Center: {item.centerId}
                              </Text>
                            ) : null}
                          </View>
                          {item.billingChargeMode ? (
                            <View style={styles.panelCompanyModeChip}>
                              <Text style={styles.panelCompanyModeChipText}>
                                {item.billingChargeMode}
                              </Text>
                            </View>
                          ) : null}
                        </TouchableOpacity>
                      );
                    })
                  ) : (
                    <View style={styles.panelCompanyEmptyState}>
                      <Text style={styles.panelCompanyEmptyStateText}>
                        No companies match your search.
                      </Text>
                    </View>
                  )}
                </ScrollView>
              </View>
            </>
          ) : (
            <View style={styles.panelCompanyList}>
              <View style={styles.panelCatalogHeaderFixed}>
                {selectedPanelCompany ? (
                  <View style={styles.selectedPanelCompanyCard}>
                    <Text style={styles.selectedPanelCompanyTitle}>
                      Selected Panel Company
                    </Text>
                    <View
                      style={[
                        styles.selectedPanelCompanyFieldRow,
                        isNarrowScreen && styles.selectedPanelCompanyFieldRowStacked,
                      ]}>
                      <View style={styles.selectedPanelCompanyField}>
                        <Text style={styles.selectedPanelCompanyFieldLabel}>
                          Panel Company
                        </Text>
                        <Text style={styles.selectedPanelCompanyFieldValue}>
                          {selectedPanelCompany.name || 'N/A'}
                        </Text>
                      </View>
                      <View style={styles.selectedPanelCompanyField}>
                        <Text style={styles.selectedPanelCompanyFieldLabel}>
                          Billing Type
                        </Text>
                        <Text style={styles.selectedPanelCompanyFieldValue}>
                          {getPaymentLabelFromBillingMode(
                            selectedPanelCompany.billingChargeMode,
                          )}
                        </Text>
                      </View>
                    </View>
                  </View>
                ) : null}
                <Text style={styles.sectionText}>
                  {selectedCatalogSubgroup
                    ? `Tests inside: ${getCatalogDisplayTitle({
                        item: selectedCatalogSubgroup,
                        isSubgroupList: true,
                      })}`
                    : selectedCatalogGroup
                    ? `Subgroups inside: ${getCatalogDisplayTitle({
                        item: selectedCatalogGroup,
                        isGroupList: true,
                      })}`
                    : 'Select a group to view its subgroups.'}
                </Text>
                {selectedCatalogSubgroup ? (
                  <>
                    <View style={styles.panelCompanySearchWrap}>
                      <Ionicons
                        name="search-outline"
                        size={18}
                        style={styles.panelCompanySearchIcon}
                      />
                      <TextInput
                        value={testSearch}
                        onChangeText={setTestSearch}
                        placeholder="Search tests or child tests"
                        placeholderTextColor={BRAND.textMuted}
                        style={styles.panelCompanySearchInput}
                      />
                    </View>
                    <Text style={styles.sectionText}>
                      {hasTestSearch
                        ? `Showing ${activeCatalogItems.length} matching tests across the selected subgroup.`
                        : `Showing first ${CATALOG_TEST_VISIBLE_LIMIT} tests. Scroll for more.`}
                    </Text>
                  </>
                ) : null}
              </View>
              <ScrollView
                style={styles.panelCompanyListScroll}
                showsVerticalScrollIndicator
                nestedScrollEnabled
                persistentScrollbar
                scrollEventThrottle={16}
                onScroll={handlePanelCatalogScroll}
                contentContainerStyle={styles.panelCompanyListContent}>
                {activeCatalogItems.length ? (
                  visibleCatalogItems.map(
                    (item, index) => {
                      const isGroupList =
                        !selectedCatalogGroup && !selectedCatalogSubgroup;
                      const isSubgroupList =
                        Boolean(selectedCatalogGroup) && !selectedCatalogSubgroup;
                      const isTestsList = Boolean(selectedCatalogSubgroup);
                      const title = getCatalogDisplayTitle({
                        item,
                        isGroupList,
                        isSubgroupList,
                      });
                      const subgroupCount = Array.isArray(item?.subgroups)
                        ? item.subgroups.length
                        : 0;
                      const testCount = Array.isArray(item?.tests)
                        ? item.tests.length
                        : 0;
                      const childTests = Array.isArray(item?.child_tests)
                        ? item.child_tests
                        : [];
                      const testKey = `${item?.booked_code || title || 'test'}-${index}`;
                      const isTestExpanded = Boolean(expandedCatalogTests[testKey]);

                      return (
                        <TouchableOpacity
                          key={`${title || 'item'}-${index}`}
                          activeOpacity={0.85}
                          style={styles.panelCompanyItem}
                          onPress={() => {
                            if (isGroupList) {
                              setSelectedCatalogGroup(item);
                              setSelectedCatalogSubgroup(null);
                              setTestSearch('');
                              setExpandedCatalogTests({});
                              setCatalogVisibleCount(CATALOG_ITEM_PAGE_SIZE);
                              return;
                            }

                            if (isSubgroupList) {
                              setSelectedCatalogSubgroup(item);
                              setTestSearch('');
                              setExpandedCatalogTests({});
                              setCatalogVisibleCount(CATALOG_ITEM_PAGE_SIZE);
                              return;
                            }

                            if (isTestsList && childTests.length) {
                              setExpandedCatalogTests(previousState => ({
                                ...previousState,
                                [testKey]: !previousState[testKey],
                              }));
                              setCatalogVisibleCount(CATALOG_ITEM_PAGE_SIZE);
                            }
                          }}
                          disabled={isTestsList && !childTests.length}>
                          <View style={styles.panelCompanyItemTextWrap}>
                            <Text style={styles.panelCompanyName}>
                              {title ||
                                `Unnamed ${
                                  isGroupList
                                    ? 'Group'
                                    : isSubgroupList
                                    ? 'Subgroup'
                                    : 'Test'
                                } ${index + 1}`}
                            </Text>
                            <Text style={styles.panelCompanyMeta}>
                              {isGroupList
                                ? `GCode: ${
                                    getCatalogGroupId(item) || 'N/A'
                                  } | Subgroups: ${subgroupCount}`
                                : isSubgroupList
                                ? `SCode: ${
                                    getCatalogSubgroupId(item) || 'N/A'
                                  } | Tests: ${testCount}`
                                : `Code: ${item?.booked_code || 'N/A'} | MRP: ${
                                    item?.mrp ?? 0
                                  }`}
                            </Text>
                            {isTestsList ? (
                              <Text style={styles.panelCompanyMeta}>
                                Panel Company:{' '}
                                {item?.panel_company_name || selectedPanelCompanyName || 'N/A'}
                              </Text>
                            ) : null}
                            {isTestsList ? (
                              <Text style={styles.panelCompanyMeta}>
                                {childTests.length
                                  ? `Child tests: ${childTests.length} (tap to ${
                                      isTestExpanded ? 'hide' : 'view'
                                    })`
                                  : 'No child tests'}
                              </Text>
                            ) : null}
                            {isTestsList && isTestExpanded && childTests.length ? (
                              <View style={styles.panelCompanyListContent}>
                                {childTests.map((childTest, childIndex) => (
                                  <View
                                    key={`${childTest?.booked_code || 'child'}-${childIndex}`}
                                    style={styles.panelCompanyItem}>
                                    <View style={styles.panelCompanyItemTextWrap}>
                                      <Text style={styles.panelCompanyName}>
                                        {childTest?.description || 'Unnamed Child Test'}
                                      </Text>
                                      <Text style={styles.panelCompanyMeta}>
                                        Code: {childTest?.booked_code || 'N/A'}
                                      </Text>
                                    </View>
                                  </View>
                                ))}
                              </View>
                            ) : null}
                          </View>
                          {isGroupList || isSubgroupList ? (
                            <Ionicons
                              name="chevron-forward"
                              size={16}
                              style={styles.panelCompanySearchIcon}
                            />
                          ) : isTestsList && childTests.length ? (
                            <Ionicons
                              name={isTestExpanded ? 'chevron-up' : 'chevron-down'}
                              size={16}
                              style={styles.panelCompanySearchIcon}
                            />
                          ) : null}
                        </TouchableOpacity>
                      );
                    },
                  )
                ) : (
                  <View style={styles.panelCompanyEmptyState}>
                    <Text style={styles.panelCompanyEmptyStateText}>
                      {selectedCatalogSubgroup
                        ? 'No tests available for this subgroup.'
                        : selectedCatalogGroup
                        ? 'No subgroups available for this group.'
                        : 'No groups available for this panel company.'}
                    </Text>
                  </View>
                )}
                {hasMoreCatalogItems ? (
                  <TouchableOpacity
                    activeOpacity={0.85}
                    style={styles.addPatientButton}
                    onPress={loadMoreCatalogItems}>
                    <Text style={styles.addPatientButtonText}>
                      Load More ({visibleCatalogItems.length}/
                      {activeCatalogItems.length})
                    </Text>
                  </TouchableOpacity>
                ) : null}
              </ScrollView>
            </View>
          )}
        </View>
        <AppAlertModal
          alert={appAlert}
          styles={styles}
          onClose={closeAppAlert}
        />
      </>
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
      ...(patientForm.tag ? {tag: patientForm.tag} : {}),
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
          patientAdditionalDiscountRows={patientAdditionalDiscountUiRows}
          completePayments={completePayments}
          completePaymentModeOptions={COMPLETE_PAYMENT_MODE_OPTIONS}
          paymentPatientOptions={completeBookingPatientOptions}
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
            latitude={latitude}
            longitude={longitude}
            locationUrl={locationUrl}
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
            onBookingAction={onBookingAction}
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
