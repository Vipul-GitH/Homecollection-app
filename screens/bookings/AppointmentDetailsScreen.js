import React, {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Alert,
  ActivityIndicator,
  Animated,
  Linking,
  Modal,
  NativeModules,
  PanResponder,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import PatientDetailCard from '../../components/bookings/PatientDetailCard';
import BookingLocationCard from '../../components/bookings/appointmentDetails/BookingLocationCard';
import RequiredLabel from '../../components/bookings/appointmentDetails/RequiredLabel';
import TerminalStatusCard from '../../components/bookings/appointmentDetails/TerminalStatusCard';
import {
  CATALOG_ITEM_PAGE_SIZE,
  CATALOG_TEST_VISIBLE_LIMIT,
  DUMMY_LINKED_PATIENTS,
  EDITABLE_GENDER_TITLES,
  GENDER_OPTIONS,
  INITIAL_PATIENT_FORM,
  MONTH_LABELS,
  PANEL_COMPANY_DEFAULT_VISIBLE,
  PANEL_COMPANY_SEARCH_VISIBLE_LIMIT,
  TAG_OPTIONS,
  TITLE_OPTIONS,
  WEEKDAY_LABELS,
} from './appointmentDetails/constants';
import {
  calculateAgeFromDob,
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
import {BRAND} from '../../styles/appStyles';
import {warnDebug} from '../../utils/app/logger';
import {
  getLocalMatchedPanelCompaniesResponse,
  getLocalPanelCompaniesResponse,
} from '../../services/local/panelCatalogLocal';
const {LocalDocumentPickerModule} = NativeModules;
const CANCELLATION_REASON_OPTIONS = [
  'Patient requested cancellation',
  'Duplicate / wrong booking created',
  'Operational inability to service',
  'Address not serviceable',
  'Doctor / company cancelled request',
  'Billing / approval issue',
  'Test no longer required',
  'Phlebotomist delay',
  'High charges / booked at another lab',
];
const CANCEL_TIME_SLOT_OPTIONS = [
  '07:30 AM to 08:00 AM',
  '08:30 AM to 09:00 AM',
  '09:00 AM to 09:30 AM',
  '10:30 AM to 11:00 AM',
];
const COMPLETE_PAYMENT_MODE_OPTIONS = ['Cash', 'UPI', 'Online', 'At Lab'];
const toCurrencyNumber = value => {
  const normalizedValue = Number(String(value || '').replace(/[^0-9.]/g, ''));
  return Number.isFinite(normalizedValue) ? normalizedValue : 0;
};

const getBillingChargeMode = company =>
  normalizeFormText(
    company?.billingChargeMode ||
      company?.BillingChargeMode ||
      company?.billing_charge_mode ||
      company?.chargeMode ||
      company?.charge_mode,
  ).toUpperCase();

const getPanelCompanyChipIdentity = company =>
  [
    normalizeFormText(company?.compCatId || company?.id),
    normalizeFormText(company?.centerId),
    normalizeFormText(company?.name || company?.panelCompany).toLowerCase(),
  ].join('|');

const dedupePanelCompanyChips = companies => {
  const chipMap = new Map();

  (Array.isArray(companies) ? companies : []).forEach(company => {
    const key = getPanelCompanyChipIdentity(company);

    if (!key.replace(/\|/g, '')) {
      return;
    }

    if (!chipMap.has(key) || company?.chipSource === 'APP') {
      chipMap.set(key, company);
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

const doesSelectedTestBelongToPanelCompany = (test, panelCompany) => {
  if (!test || !panelCompany) {
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

  (Array.isArray(patient?.tests) ? patient.tests : []).forEach(test => {
    const dedupeKey = normalizeFormText(test?.code).toUpperCase();
    if (!dedupeKey) {
      return;
    }

    mergedMap.set(dedupeKey, {
      key: `seed|${test?.code || 'na'}|${test?.name || 'na'}`,
      panelCompanyName: basePanelCompanyName,
      panelCompanyId: basePanelCompanyId,
      centerId: baseCenterId,
      atype: baseAtype,
      panelCode: basePanelCode,
      panelAbarid: basePanelAbarid,
      booked_code: test?.code || 'N/A',
      catalog_key: [basePanelCompanyId, '', '', test?.code || ''].join('|'),
      gcode: test?.gcode || '',
      scode: test?.scode || '',
      test_code: test?.test_code || test?.code || '',
      description: test?.name || 'Unnamed Test',
      specimenName: test?.specimen_name || test?.specimenName || 'N/A',
      mrp: toCurrencyNumber(test?.mrp || test?.charge || test?.amount),
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

const getCatalogGroupId = group =>
  normalizeFormText(group?.group_id || group?.gcode || group?.group_code);

const getCatalogSubgroupId = subgroup =>
  normalizeFormText(
    subgroup?.subgroup_id || subgroup?.scode || subgroup?.subgroup_code,
  );

const compareCatalogIds = (leftId, rightId) =>
  normalizeFormText(leftId).localeCompare(normalizeFormText(rightId), undefined, {
    numeric: true,
    sensitivity: 'base',
  });

const clamp = (value, minValue, maxValue) =>
  Math.min(maxValue, Math.max(minValue, value));

const sortCatalogGroupsById = groups =>
  (Array.isArray(groups) ? groups : [])
    .map(group => ({
      ...group,
      subgroups: (Array.isArray(group?.subgroups) ? group.subgroups : []).sort(
        (leftSubgroup, rightSubgroup) =>
          compareCatalogIds(
            getCatalogSubgroupId(leftSubgroup),
            getCatalogSubgroupId(rightSubgroup),
          ),
      ),
    }))
    .sort((leftGroup, rightGroup) =>
      compareCatalogIds(getCatalogGroupId(leftGroup), getCatalogGroupId(rightGroup)),
    );

const getCatalogDisplayTitle = ({item, isGroupList, isSubgroupList}) => {
  if (isGroupList) {
    const groupId = getCatalogGroupId(item);
    const groupName = item?.group_name || '';
    return groupId ? `${groupId} - ${groupName || 'Unnamed Group'}` : groupName;
  }

  if (isSubgroupList) {
    const subgroupId = getCatalogSubgroupId(item);
    const subgroupName = item?.subgroup_name || '';
    return subgroupId
      ? `${subgroupId} - ${subgroupName || 'Unnamed Subgroup'}`
      : subgroupName;
  }

  return item?.description || item?.booked_code;
};

function SwipeCompleteButton({styles, disabled, isLoading, onComplete}) {
  const translateX = useRef(new Animated.Value(0)).current;
  const [trackWidth, setTrackWidth] = useState(0);
  const thumbSize = 52;
  const maxTranslateX = Math.max(trackWidth - thumbSize - 8, 0);

  const resetThumb = useCallback(() => {
    Animated.spring(translateX, {
      toValue: 0,
      useNativeDriver: true,
    }).start();
  }, [translateX]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => !disabled && !isLoading,
        onMoveShouldSetPanResponder: (_, gestureState) =>
          !disabled && !isLoading && Math.abs(gestureState.dx) > 4,
        onPanResponderMove: (_, gestureState) => {
          translateX.setValue(clamp(gestureState.dx, 0, maxTranslateX));
        },
        onPanResponderRelease: (_, gestureState) => {
          const didComplete =
            maxTranslateX > 0 && gestureState.dx >= maxTranslateX * 0.78;

          if (didComplete) {
            Animated.timing(translateX, {
              toValue: maxTranslateX,
              duration: 120,
              useNativeDriver: true,
            }).start(() => {
              onComplete?.();
              resetThumb();
            });
            return;
          }

          resetThumb();
        },
        onPanResponderTerminate: resetThumb,
      }),
    [disabled, isLoading, maxTranslateX, onComplete, resetThumb, translateX],
  );

  return (
    <View
      style={[
        styles.swipeCompleteTrack,
        (disabled || isLoading) && styles.swipeCompleteTrackDisabled,
      ]}
      onLayout={event => setTrackWidth(event.nativeEvent.layout.width)}>
      <Text style={styles.swipeCompleteText}>
        {isLoading ? 'Completing...' : 'Swipe to Complete'}
      </Text>
      <Animated.View
        {...panResponder.panHandlers}
        style={[
          styles.swipeCompleteThumb,
          {
            transform: [{translateX}],
          },
        ]}>
        {isLoading ? (
          <ActivityIndicator color={BRAND.surface} size="small" />
        ) : (
          <Ionicons
            name="chevron-forward"
            size={24}
            style={styles.swipeCompleteThumbIcon}
          />
        )}
      </Animated.View>
    </View>
  );
}

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
}) {
  const {width} = useWindowDimensions();
  const isNarrowScreen = width < 370;
  const [isAddPatientModalVisible, setIsAddPatientModalVisible] =
    useState(false);
  const [addPatientModalStep, setAddPatientModalStep] = useState('linked-list');
  const [selectedLinkedPatientId, setSelectedLinkedPatientId] = useState('');
  const [isDobCalendarVisible, setIsDobCalendarVisible] = useState(false);
  const [isCancelBookingModalVisible, setIsCancelBookingModalVisible] =
    useState(false);
  const [isCompleteBookingModalVisible, setIsCompleteBookingModalVisible] =
    useState(false);
  const [isCancelCalendarVisible, setIsCancelCalendarVisible] = useState(false);
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
  const [cancelCalendarMonth, setCancelCalendarMonth] = useState(
    () => new Date(),
  );
  const [completeCollectedCash, setCompleteCollectedCash] = useState('');
  const [completeRemarks, setCompleteRemarks] = useState('');
  const [isAdditionalDiscountEnabled, setIsAdditionalDiscountEnabled] =
    useState(false);
  const [completeAdditionalDiscount, setCompleteAdditionalDiscount] = useState('');
  const [completePaymentMode, setCompletePaymentMode] = useState(
    COMPLETE_PAYMENT_MODE_OPTIONS[0],
  );
  const [completeProofDocuments, setCompleteProofDocuments] = useState([]);
  const [dobCalendarMonth, setDobCalendarMonth] = useState(() => new Date());
  const [patientForm, setPatientForm] = useState(INITIAL_PATIENT_FORM);
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

  useEffect(() => {
    const bookingId = normalizeFormText(selectedBooking?.id);
    const patients = Array.isArray(selectedBooking?.patients)
      ? selectedBooking.patients
      : [];

    if (!bookingId || !patients.length) {
      return;
    }

    const hasMissingPanelCompanies = patients.some(patient => {
      const patientId = getPatientMutationId(patient);
      return patientId && !(patientApiPanelCompaniesMap[patientId] || []).length;
    });

    if (!hasMissingPanelCompanies) {
      return;
    }

    let isMounted = true;

    const hydratePatientPaymentModes = async () => {
      try {
        onLocalDatabaseLoadingChange?.(
          'Loading patient panel companies from local database...',
        );
        const nextEntries = [];

        for (const patient of patients) {
          const patientId = getPatientMutationId(patient);
          if (!patientId || (patientApiPanelCompaniesMap[patientId] || []).length) {
            continue;
          }

          const responseData = await getLocalMatchedPanelCompaniesResponse(patient);
          const matchedCompanies = normalizePanelCompanyItems(responseData);

          if (matchedCompanies.length) {
            nextEntries.push([patientId, matchedCompanies]);
          }
        }

        if (!isMounted || !nextEntries.length) {
          return;
        }

        setPatientApiPanelCompaniesMap(previousMap => {
          const nextMap = {...previousMap};
          let didChange = false;

          nextEntries.forEach(([patientId, matchedCompanies]) => {
            if (!(nextMap[patientId] || []).length) {
              nextMap[patientId] = matchedCompanies;
              didChange = true;
            }
          });

          return didChange ? nextMap : previousMap;
        });
      } catch (error) {
        warnDebug('Unable to hydrate panel company payment modes:', error);
      } finally {
        if (isMounted) {
          onLocalDatabaseLoadingChange?.('');
        }
      }
    };

    hydratePatientPaymentModes();

    return () => {
      isMounted = false;
      onLocalDatabaseLoadingChange?.('');
    };
  }, [
    selectedBooking?.id,
    selectedBooking?.patients,
    onLocalDatabaseLoadingChange,
    patientApiPanelCompaniesMap,
    setPatientApiPanelCompaniesMap,
  ]);
  const [patientDocuments, setPatientDocuments] = useState([]);
  const selectedLinkedPatient = DUMMY_LINKED_PATIENTS.find(
    patient => patient.id === selectedLinkedPatientId,
  );
  const completeBookingPanelCompanies = (() => {
    const companyMap = new Map();
    const patients = Array.isArray(selectedBooking?.patients)
      ? selectedBooking.patients
      : [];

    const addCompany = (company, fallbackPatientName = '') => {
      const name = normalizeFormText(company?.name || company?.panelCompany);
      if (!name) {
        return;
      }

      const mode = getBillingChargeMode(company);
      const key = [
        normalizeFormText(company?.compCatId || company?.id),
        name.toLowerCase(),
        mode,
      ].join('|');

      if (companyMap.has(key)) {
        return;
      }

      companyMap.set(key, {
        id: key,
        name,
        billingChargeMode: mode,
        paymentLabel: getPaymentLabelFromBillingMode(mode),
        patientName: fallbackPatientName,
      });
    };

    patients.forEach(patient => {
      const patientId = getPatientMutationId(patient);
      const patientName = normalizeFormText(patient?.name);
      const apiCompanies = patientId
        ? patientApiPanelCompaniesMap[patientId] || []
        : [];
      const selectedCompanies = patientId
        ? patientPanelCompaniesMap[patientId] || []
        : [];

      [...apiCompanies, ...selectedCompanies].forEach(company =>
        addCompany(company, patientName),
      );

      if (!apiCompanies.length && !selectedCompanies.length) {
        addCompany(
          {
            name: patient?.panelCompany,
            billingChargeMode:
              patient?.billingChargeMode ||
              patient?.BillingChargeMode ||
              patient?.billing_charge_mode ||
              patient?.chargeMode,
          },
          patientName,
        );
      }
    });

    return Array.from(companyMap.values()).sort((leftItem, rightItem) =>
      leftItem.name.localeCompare(rightItem.name),
    );
  })();
  const hasCreditPanelCompany = completeBookingPanelCompanies.some(company =>
    getBillingChargeMode(company).includes('C'),
  );
  const completeBillingTests = useMemo(
    () =>
      patients.flatMap(patient => {
        const patientId = getPatientMutationId(patient);
        const selectedTests = patientId
          ? getMergedPatientSelectedTests(
              patient,
              patientSelectedTestsMap[patientId] || [],
              null,
            )
          : getMergedPatientSelectedTests(patient, []);
        const sourceTests = selectedTests.length
          ? selectedTests
          : Array.isArray(patient?.tests)
          ? patient.tests
          : [];

        return sourceTests.map(test => ({
          key:
            normalizeFormText(test?.key) ||
            `${normalizeFormText(test?.booked_code || test?.code)}-${patientId}`,
          patientName: normalizeFormText(patient?.name),
          code: normalizeFormText(test?.booked_code || test?.code),
          description: normalizeFormText(test?.description || test?.name) || 'Unnamed Test',
          mrp: toCurrencyNumber(test?.mrp || test?.charge || test?.amount),
        }));
      }),
    [patients, patientSelectedTestsMap],
  );
  const completeBillingTotal = useMemo(
    () =>
      completeBillingTests.reduce(
        (total, test) => total + toCurrencyNumber(test?.mrp),
        0,
      ),
    [completeBillingTests],
  );
  const completeDiscountAmount = useMemo(
    () =>
      Math.min(
        completeBillingTotal,
        isAdditionalDiscountEnabled
          ? toCurrencyNumber(completeAdditionalDiscount)
          : 0,
      ),
    [
      completeAdditionalDiscount,
      completeBillingTotal,
      isAdditionalDiscountEnabled,
    ],
  );
  const completeNetAmount = Math.max(
    completeBillingTotal - completeDiscountAmount,
    0,
  );
  const completeAmountPaid = toCurrencyNumber(completeCollectedCash);
  const completeBalanceAmount = Math.max(
    completeNetAmount - completeAmountPaid,
    0,
  );
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
  const shouldShowCompleteProofUpload = hasCreditPanelCompany;
  const terminalBookingMessage = isCancelledBooking
    ? 'This booking has been cancelled. No further action is available.'
    : isPartialCompleteBooking
    ? 'This booking is partially completed. No further action is available.'
    : 'This booking has already been completed. No further action is available.';
  const deferredPanelCompanySearch = useDeferredValue(panelCompanySearch);
  const deferredTestSearch = useDeferredValue(testSearch);
  const hasPanelCompanySearch = deferredPanelCompanySearch.trim().length > 0;
  const hasTestSearch = deferredTestSearch.trim().length > 0;
  const filteredPanelCompanyItems = useMemo(() => {
    const searchText = deferredPanelCompanySearch.trim().toLowerCase();

    if (!searchText) {
      return panelCompanyItems;
    }

    return panelCompanyItems.filter(item => item.searchKey.includes(searchText));
  }, [panelCompanyItems, deferredPanelCompanySearch]);
  const visiblePanelCompanyItems = useMemo(
    () =>
      hasPanelCompanySearch
        ? filteredPanelCompanyItems.slice(0, PANEL_COMPANY_SEARCH_VISIBLE_LIMIT)
        : filteredPanelCompanyItems.slice(0, PANEL_COMPANY_DEFAULT_VISIBLE),
    [filteredPanelCompanyItems, hasPanelCompanySearch],
  );
  const activeCatalogItems = useMemo(() => {
    if (!selectedCatalogSubgroup) {
      return selectedCatalogGroup?.subgroups || panelCatalogGroups;
    }

    const tests = Array.isArray(selectedCatalogSubgroup.tests)
      ? selectedCatalogSubgroup.tests
      : [];
    const searchText = deferredTestSearch.trim().toLowerCase();

    if (!searchText) {
      return tests;
    }

    return tests.filter(test => {
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
    });
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
  const patientCount = selectedBooking.patients.length;
  const completedPatientCount = selectedBooking.patients.filter(
    patient => Number(patient.bookingPatientStatusCode || 0) === 3,
  ).length;

  const handleOpenLocation = async () => {
    if (!resolvedAddress && (!latitude || !longitude)) {
      return;
    }

    const mapsQuery =
      latitude && longitude
        ? `${latitude},${longitude}`
        : encodeURIComponent(resolvedAddress);
    const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${mapsQuery}`;

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

    try {
      await Linking.openURL(`tel:${phoneNumber}`);
    } catch (error) {
      warnDebug('Open booking phone error:', error);
    }
  };

  const updatePatientFormField = (field, value) => {
    setPatientForm(previousForm => ({
      ...previousForm,
      [field]: value,
    }));
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
    setIsAddPatientModalVisible(false);
  };

  const handleAddPatientPress = () => {
    resetAddPatientForm();
    setIsAddPatientModalVisible(true);
  };

  const handleEditPatientPress = patient => {
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
    setAddPatientModalStep('form');
    setIsAddPatientModalVisible(true);
  };

  const handleOpenAddPatientForm = () => {
    setSelectedLinkedPatientId('');
    setAddPatientModalStep('form');
  };

  const handleUseLinkedPatient = () => {
    if (!selectedLinkedPatient) {
      Alert.alert(
        'Select Linked Patient',
        'Please select a linked patient first.',
      );
      return;
    }

    Alert.alert(
      'Linked Patient Selected',
      `${selectedLinkedPatient.name} selected. Dummy linked patient flow is active for now.`,
      [
        {
          text: 'OK',
          onPress: () => {
            closeAddPatientModal();
            resetAddPatientForm();
          },
        },
      ],
    );
  };

  const handlePatientCancelBooking = patient => {
    Alert.alert(
      'Cancel Patient',
      `Cancel ${patient.name} from this booking?`,
      [
        {text: 'Keep Patient', style: 'cancel'},
        {
          text: 'Cancel Patient',
          style: 'destructive',
          onPress: () => onCancelPatient(patient),
        },
      ],
    );
  };

  const handleReportCourierChange = (patient, nextValue) => {
    const patientId = getPatientMutationId(patient);

    if (!patientId) {
      return;
    }

    setPatientReportCourierMap(previousMap => ({
      ...previousMap,
      [patientId]: nextValue,
    }));
  };

  const openCancelBookingModal = () => {
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
    setIsCancelBookingModalVisible(true);
  };

  const closeCancelBookingModal = () => {
    if (bookingActionLoading === 'cancel') {
      return;
    }

    setIsCancelBookingModalVisible(false);
    setIsCancelCalendarVisible(false);
    setIsCancellationReasonSelectVisible(false);
    setIsCancelTimeSlotSelectVisible(false);
  };

  const confirmCancelBooking = async () => {
    await onBookingAction('cancel');
    setIsCancelBookingModalVisible(false);
  };

  const openCompleteBookingModal = () => {
    setCompleteCollectedCash('');
    setCompleteRemarks('');
    setIsAdditionalDiscountEnabled(false);
    setCompleteAdditionalDiscount('');
    setCompletePaymentMode(COMPLETE_PAYMENT_MODE_OPTIONS[0]);
    setCompleteProofDocuments([]);
    setIsCompleteBookingModalVisible(true);
  };

  const closeCompleteBookingModal = () => {
    if (bookingActionLoading === 'completed') {
      return;
    }

    setIsCompleteBookingModalVisible(false);
  };

  const confirmCompleteBooking = async () => {
    if (shouldShowCompleteProofUpload && !completeProofDocuments.length) {
      Alert.alert(
        'Upload Required',
        'Please upload billing proof or prescription for credit panel company before completing.',
      );
      return;
    }

    await onBookingAction('completed');
    setIsCompleteBookingModalVisible(false);
  };

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

  const handleCancelDateSelect = date => {
    setCancelNewVisitDate(toDateInputValue(date));
    setCancelCalendarMonth(new Date(date.getFullYear(), date.getMonth(), 1));
    setIsCancelCalendarVisible(false);
  };

  const handlePickPatientDocuments = async () => {
    if (!LocalDocumentPickerModule?.pickDocuments) {
      Alert.alert(
        'Upload Not Available',
        'Document picker module is not available in this build.',
      );
      return;
    }

    try {
      const pickedFiles = await LocalDocumentPickerModule.pickDocuments();

      const normalizedDocuments = (Array.isArray(pickedFiles) ? pickedFiles : [])
        .filter(file => file?.uri)
        .map((file, index) => ({
          uri: file.uri,
          name: file.name || `patient-document-${Date.now()}-${index}`,
          type: file.type || getMimeTypeFromFileName(file.name),
        }));

      if (!normalizedDocuments.length) {
        return;
      }

      setPatientDocuments(previousDocuments => [
        ...previousDocuments,
        ...normalizedDocuments,
      ]);
    } catch (error) {
      if (
        error?.code === 'DOCUMENT_PICKER_CANCELLED' ||
        String(error?.message || '').toLowerCase().includes('cancel')
      ) {
        return;
      }

      warnDebug('Patient document pick error:', error);
      Alert.alert(
        'Upload Failed',
        'Unable to select documents right now. Please try again.',
      );
    }
  };

  const handleRemovePatientDocument = indexToRemove => {
    setPatientDocuments(previousDocuments =>
      previousDocuments.filter((_, index) => index !== indexToRemove),
    );
  };

  const handlePickCompleteProofDocuments = async () => {
    if (!LocalDocumentPickerModule?.pickDocuments) {
      Alert.alert(
        'Upload Not Available',
        'Document picker module is not available in this build.',
      );
      return;
    }

    try {
      const pickedFiles = await LocalDocumentPickerModule.pickDocuments();

      const normalizedDocuments = (Array.isArray(pickedFiles) ? pickedFiles : [])
        .filter(file => file?.uri)
        .map((file, index) => ({
          uri: file.uri,
          name: file.name || `complete-proof-${Date.now()}-${index}`,
          type: file.type || getMimeTypeFromFileName(file.name),
        }));

      if (!normalizedDocuments.length) {
        return;
      }

      setCompleteProofDocuments(previousDocuments => [
        ...previousDocuments,
        ...normalizedDocuments,
      ]);
    } catch (error) {
      if (
        error?.code === 'DOCUMENT_PICKER_CANCELLED' ||
        String(error?.message || '').toLowerCase().includes('cancel')
      ) {
        return;
      }

      warnDebug('Complete proof pick error:', error);
      Alert.alert(
        'Upload Failed',
        'Unable to select documents right now. Please try again.',
      );
    }
  };

  const handleRemoveCompleteProofDocument = indexToRemove => {
    setCompleteProofDocuments(previousDocuments =>
      previousDocuments.filter((_, index) => index !== indexToRemove),
    );
  };

  const closePanelCompanyModal = () => {
    setIsPanelCompanyModalVisible(false);
    setIsPanelCatalogVisible(false);
    setPanelCatalogGroups([]);
    setSelectedCatalogGroup(null);
    setSelectedCatalogSubgroup(null);
    setTestSearch('');
    setExpandedCatalogTests({});
    setSelectedPanelCompanyName('');
    setSelectedPanelCompany(null);
    setPanelCompanySearch('');
    setCatalogVisibleCount(CATALOG_ITEM_PAGE_SIZE);
  };

  const handleSelectPanelCompany = async panelCompany => {
    setSelectedPanelCompanyId(panelCompany.id);
    if (panelFlowMode === 'panel-only') {
      const selectedPatientId = getPatientMutationId(selectedPanelPatient);
      if (selectedPatientId) {
        setPatientPanelCompaniesMap(previousMap => {
          const previousCompanies = previousMap[selectedPatientId] || [];
          const hasCompany = previousCompanies.some(
            existingCompany => isSamePanelCompany(existingCompany, panelCompany),
          );

          return {
            ...previousMap,
            [selectedPatientId]: hasCompany
              ? previousCompanies
              : [...previousCompanies, panelCompany],
          };
        });
        setActivePatientPanelCompanyMap(previousMap => ({
          ...previousMap,
          [selectedPatientId]: `app-${panelCompany.id}`,
        }));
      }
      setSelectedPanelCompanyName(panelCompany.name);
      setSelectedPanelCompany(panelCompany);
      setIsPanelCompanyModalVisible(false);
      setIsPanelCatalogVisible(false);
      Alert.alert(
        'Panel Company Selected',
        `${panelCompany.name || 'Panel company'} selected successfully.`,
      );
      return;
    }

    const catalogResponse = await onPanelCompanySelect({
      patient: selectedPanelPatient,
      compCatId: panelCompany.compCatId,
      panelCompany,
    });

    if (catalogResponse) {
      const groups = sortCatalogGroupsById(catalogResponse?.groups);

      if (!groups.length) {
        Alert.alert(
          'No Groups Found',
          'No groups were returned for the selected panel company.',
        );
        return;
      }

      setSelectedPanelCompanyName(panelCompany.name);
      setSelectedPanelCompany(panelCompany);
      setPanelCatalogGroups(groups);
      setSelectedCatalogGroup(null);
      setSelectedCatalogSubgroup(null);
      setTestSearch('');
      setExpandedCatalogTests({});
      setCatalogVisibleCount(CATALOG_ITEM_PAGE_SIZE);
      setIsPanelCompanyModalVisible(false);
      setIsPanelCatalogVisible(true);
    }
  };

  const openPanelCompanyTests = async ({patient, panelCompany}) => {
    const selectedPatientId = getPatientMutationId(patient);
    if (selectedPatientId) {
      setActivePatientPanelCompanyMap(previousMap => ({
        ...previousMap,
        [selectedPatientId]: panelCompany.chipId || panelCompany.id,
      }));
    }

    if (!onOpenAddTest) {
      return;
    }

    onOpenAddTest?.(patient, panelCompany);
  };

  const handlePatientAddPanelCompany = async patient => {
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
      Alert.alert(
        'No Panel Companies',
        'Panel company data is empty in the local database.',
      );
      return;
    }

    if (selectedPatientId) {
      setPatientApiPanelCompaniesMap(previousMap => ({
        ...previousMap,
        [selectedPatientId]: apiMatchedCompanies,
      }));
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
  };

  const ensureApiPanelCompanyMatch = async patient => {
    const selectedPatientId = getPatientMutationId(patient);
    const existingMatches = selectedPatientId
      ? patientApiPanelCompaniesMap[selectedPatientId] || []
      : [];

    if (existingMatches.length) {
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
    const apiMatchedCompanies = await ensureApiPanelCompanyMatch(patient);

    if (!apiMatchedCompanies.length) {
      Alert.alert(
        'No Panel Company Found',
        'No matching API panel company was found for this patient.',
      );
      return;
    }

    onOpenAddTest?.(patient, {
      ...apiMatchedCompanies[0],
      chipId: `api-${apiMatchedCompanies[0].id}`,
      chipSource: 'API',
    });
  };

  const handleRemovePatientPanelCompany = (patient, panelCompanyToRemove) => {
    const selectedPatientId = getPatientMutationId(patient);
    if (!selectedPatientId) {
      return;
    }

    setPatientPanelCompaniesMap(previousMap => {
      const nextMap = {...previousMap};
      const nextCompanies = (nextMap[selectedPatientId] || []).filter(
        company => !isSamePanelCompany(company, panelCompanyToRemove),
      );

      if (nextCompanies.length) {
        nextMap[selectedPatientId] = nextCompanies;
      } else {
        delete nextMap[selectedPatientId];
      }
      return nextMap;
    });

    setActivePatientPanelCompanyMap(previousMap => {
      const nextMap = {...previousMap};
      const currentActiveId = nextMap[selectedPatientId];

      if (
        String(currentActiveId) === String(`app-${panelCompanyToRemove?.id}`) ||
        String(currentActiveId) === String(panelCompanyToRemove?.id)
      ) {
        const nextCompanies = patientPanelCompaniesMap[selectedPatientId] || [];
        const remainingCompanies = nextCompanies.filter(
          company => !isSamePanelCompany(company, panelCompanyToRemove),
        );

        if (remainingCompanies.length) {
          nextMap[selectedPatientId] = `app-${remainingCompanies[0].id}`;
        } else {
          delete nextMap[selectedPatientId];
        }
      }

      return nextMap;
    });

    setPatientSelectedTestsMap(previousTestsMap => {
      const previousTests = previousTestsMap[selectedPatientId] || [];
      const remainingTests = previousTests.filter(
        test =>
          !String(test?.key || '').startsWith('seed|') &&
          !doesSelectedTestBelongToPanelCompany(test, panelCompanyToRemove),
      );

      if (remainingTests.length === previousTests.length) {
        return previousTestsMap;
      }

      const nextTestsMap = {...previousTestsMap};
      if (remainingTests.length) {
        nextTestsMap[selectedPatientId] = remainingTests;
      } else {
        delete nextTestsMap[selectedPatientId];
      }

      return nextTestsMap;
    });

    if (isSamePanelCompany(selectedPanelCompany, panelCompanyToRemove)) {
      closePanelCompanyModal();
    }
  };

  const calendarDays = getCalendarDays(dobCalendarMonth);
  const cancelCalendarDays = getCalendarDays(cancelCalendarMonth);
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
                  Showing top {PANEL_COMPANY_SEARCH_VISIBLE_LIMIT} matches for
                  better speed. Type more to narrow results.
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
      </>
    );
  }

  const handleSubmitAddPatient = async () => {
    const fullName = patientForm.fullName.trim();
    const primaryMobile = patientForm.primaryMobile.trim();
    const alternateMobile = patientForm.alternateMobile.trim();
    const email = patientForm.email.trim();
    const labmatePid = patientForm.labmatePid.trim();
    const panelCompany = patientForm.panelCompany.trim();
    const ageYears = Number(patientForm.ageYears);

    if (!fullName) {
      Alert.alert('Missing Name', 'Please enter the patient full name.');
      return;
    }

    if (!/^\d{10}$/.test(primaryMobile)) {
      Alert.alert(
        'Invalid Mobile',
        'Please enter a valid 10 digit primary mobile number.',
      );
      return;
    }

    if (alternateMobile && !/^\d{10}$/.test(alternateMobile)) {
      Alert.alert(
        'Invalid Alternate Mobile',
        'Please enter a valid 10 digit alternate mobile number.',
      );
      return;
    }

    if (!patientForm.dateOfBirth || !patientForm.ageYears) {
      Alert.alert(
        'Invalid DOB',
        'Please enter date of birth in YYYY-MM-DD format.',
      );
      return;
    }

    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      Alert.alert('Invalid Email', 'Please enter a valid email address.');
      return;
    }

    if (!panelCompany) {
      Alert.alert('Missing Panel', 'Please enter the panel company.');
      return;
    }

    const patientPayload = {
      title: patientForm.title,
      full_name: fullName,
      gender: patientForm.gender,
      date_of_birth: patientForm.dateOfBirth,
      age_years: ageYears,
      contact_mobile: primaryMobile,
      primary_mobile: primaryMobile,
      alternate_mobile: alternateMobile,
      email,
      labmate_pid: labmatePid,
      panel_company: panelCompany,
      tag: patientForm.tag,
      patient_documents: patientDocuments,
    };

    const didSavePatient = editingPatient
      ? await onUpdatePatient({
          patientId: getUpdatePatientId(editingPatient),
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
      <Modal
        transparent
        animationType="slide"
        visible={isCancelBookingModalVisible}
        onRequestClose={closeCancelBookingModal}>
        <View
          style={[
            styles.addPatientModalOverlay,
            styles.cancelBookingScreenOverlay,
          ]}>
          <View
            style={[
              styles.addPatientModalCard,
              styles.cancelBookingModalCard,
              isNarrowScreen && styles.addPatientModalCardCompact,
            ]}>
            <View style={[styles.addPatientModalHeader, styles.cancelBookingHeader]}>
              <View style={styles.panelCompanyModalHeaderText}>
                <Text style={styles.cancelBookingTitle}>Cancel entire booking</Text>
                <Text style={styles.cancelBookingSubtitle}>
                  {selectedBooking?.bookingCode ||
                    selectedBooking?.bookingNumber ||
                    selectedBooking?.id ||
                    'Appointment'}{' '}
                  • {patientCount} Patient{patientCount > 1 ? 's' : ''}
                </Text>
              </View>
              <TouchableOpacity
                activeOpacity={0.85}
                style={[
                  styles.addPatientModalCloseButton,
                  styles.cancelBookingCloseButton,
                ]}
                onPress={closeCancelBookingModal}
                disabled={bookingActionLoading === 'cancel'}>
                <Ionicons
                  name="close"
                  size={20}
                  style={styles.cancelBookingCloseIcon}
                />
              </TouchableOpacity>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={[
                styles.addPatientModalContent,
                styles.cancelBookingContent,
              ]}>
              <View style={styles.cancelBookingSpacer} />

              <View style={styles.cancelFormSection}>
                <View style={styles.cancelFieldGroup}>
                  <RequiredLabel styles={styles}>Cancellation Reason</RequiredLabel>
                  <View style={styles.cancelReasonChipRow}>
                    {CANCELLATION_REASON_OPTIONS.map(reason => {
                      const isSelected = cancellationReason === reason;

                      return (
                        <TouchableOpacity
                          key={reason}
                          activeOpacity={0.85}
                          style={[
                            styles.cancelReasonChip,
                            isSelected && styles.cancelReasonChipActive,
                          ]}
                          onPress={() => setCancellationReason(reason)}>
                          <Text
                            style={[
                              styles.cancelReasonChipText,
                              isSelected && styles.cancelReasonChipTextActive,
                            ]}>
                            {reason}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>

                <TextInput
                  value={cancelRemarks}
                  onChangeText={setCancelRemarks}
                  placeholder="Remarks (optional)"
                  placeholderTextColor={BRAND.textMuted}
                  style={styles.cancelRemarksInput}
                />

                <TouchableOpacity
                  activeOpacity={0.85}
                  style={styles.cancelCheckboxRow}
                  onPress={() =>
                    setIsCancelRescheduleRequested(previous => !previous)
                  }>
                  <View
                    style={[
                      styles.cancelCheckbox,
                      isCancelRescheduleRequested && styles.cancelCheckboxActive,
                    ]}>
                    {isCancelRescheduleRequested ? (
                      <Ionicons
                        name="checkmark"
                        size={13}
                        style={styles.cancelCheckboxIcon}
                      />
                    ) : null}
                  </View>
                  <Text style={styles.cancelCheckboxText}>
                    Reschedule this booking
                  </Text>
                </TouchableOpacity>
              </View>

              {isCancelRescheduleRequested ? (
                <View style={styles.cancelFormSection}>
                  <Text style={styles.addPatientFieldLabel}>
                    Is new date and slot known?
                  </Text>
                  <View style={styles.cancelSegmentedRow}>
                    {[true, false].map(value => {
                      const isSelected = isCancelKnownSlot === value;
                      return (
                        <TouchableOpacity
                          key={value ? 'known' : 'unknown'}
                          activeOpacity={0.85}
                          style={[
                            styles.cancelSegmentButton,
                            isSelected && styles.cancelSegmentButtonActive,
                          ]}
                          onPress={() => setIsCancelKnownSlot(value)}>
                          <Text
                            style={[
                              styles.cancelSegmentButtonText,
                              isSelected && styles.cancelSegmentButtonTextActive,
                            ]}>
                            {value ? 'Yes' : 'No'}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  {isCancelKnownSlot ? (
                    <>
                      <View
                        style={[
                          styles.addPatientFieldRow,
                          isNarrowScreen && styles.addPatientFieldRowStacked,
                        ]}>
                        <View style={styles.addPatientFieldHalf}>
                          <RequiredLabel styles={styles}>New Visit Date</RequiredLabel>
                          <TouchableOpacity
                            activeOpacity={0.85}
                            style={styles.cancelSelectButton}
                            onPress={() => setIsCancelCalendarVisible(true)}>
                            <Text
                              style={[
                                styles.cancelSelectButtonText,
                                !cancelNewVisitDate &&
                                  styles.addPatientDatePickerPlaceholder,
                              ]}>
                              {cancelNewVisitDate || 'Select date'}
                            </Text>
                            <Ionicons
                              name="calendar-outline"
                              size={18}
                              style={styles.cancelSelectButtonIcon}
                            />
                          </TouchableOpacity>
                        </View>
                        <View style={styles.addPatientFieldHalf}>
                          <RequiredLabel styles={styles}>New Time Slot</RequiredLabel>
                          <TouchableOpacity
                            activeOpacity={0.85}
                            style={styles.cancelSelectButton}
                            onPress={() =>
                              setIsCancelTimeSlotSelectVisible(previous => !previous)
                            }>
                            <Text style={styles.cancelSelectButtonText}>
                              {cancelNewTimeSlot}
                            </Text>
                            <Ionicons
                              name={
                                isCancelTimeSlotSelectVisible
                                  ? 'chevron-up'
                                  : 'chevron-down'
                              }
                              size={18}
                              style={styles.cancelSelectButtonIcon}
                            />
                          </TouchableOpacity>
                        </View>
                      </View>
                    </>
                  ) : (
                    <View style={styles.cancelInfoBox}>
                      <Text style={styles.cancelInfoText}>
                        Booking will be cancelled and follow-up will be sent to
                        Lead Management.
                      </Text>
                    </View>
                  )}
                </View>
              ) : null}

              <Text style={styles.cancelReviewMeta}>
                Reason: {cancellationReason}
                {cancelRemarks ? ` • ${cancelRemarks}` : ''}
              </Text>
            </ScrollView>

            <View style={styles.cancelModalFooter}>
              <TouchableOpacity
                activeOpacity={0.85}
                style={[
                  styles.cancelModalPrimaryButton,
                  styles.cancelBookingConfirmButton,
                  bookingActionLoading === 'cancel' &&
                    styles.addPatientSubmitButtonDisabled,
                ]}
                onPress={confirmCancelBooking}
                disabled={bookingActionLoading === 'cancel'}>
                {bookingActionLoading === 'cancel' ? (
                  <ActivityIndicator color={BRAND.surface} />
                ) : (
                  <Text style={styles.cancelModalPrimaryButtonText}>
                    CONFIRM CANCELLATION
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        transparent
        animationType="slide"
        visible={isCompleteBookingModalVisible}
        onRequestClose={closeCompleteBookingModal}>
        <View style={styles.addPatientModalOverlay}>
          <TouchableOpacity
            activeOpacity={1}
            style={styles.addPatientModalBackdrop}
            onPress={closeCompleteBookingModal}
          />
          <View
            style={[
              styles.addPatientModalCard,
              isNarrowScreen && styles.addPatientModalCardCompact,
            ]}>
            <View style={styles.addPatientModalHeader}>
              <View style={styles.panelCompanyModalHeaderText}>
                <Text style={styles.addPatientModalTitle}>Complete Booking</Text>
                <Text style={styles.addPatientModalEyebrow}>
                  {selectedBooking?.bookingNumber || selectedBooking?.id || 'Appointment'}
                </Text>
              </View>
              <TouchableOpacity
                activeOpacity={0.85}
                style={styles.addPatientModalCloseButton}
                onPress={closeCompleteBookingModal}
                disabled={bookingActionLoading === 'completed'}>
                <Ionicons
                  name="close"
                  size={20}
                  style={styles.addPatientModalCloseIcon}
                />
              </TouchableOpacity>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.addPatientModalContent}>
              <View style={styles.completeFormSection}>
                <RequiredLabel styles={styles}>Panel Companies</RequiredLabel>
                {completeBookingPanelCompanies.length ? (
                  <View style={styles.completePanelCompanyBadgeWrap}>
                    {completeBookingPanelCompanies.map(company => {
                      const isCreditCompany = getBillingChargeMode(company).includes(
                        'C',
                      );

                      return (
                        <View
                          key={company.id}
                          style={[
                            styles.completePanelCompanyBadge,
                            isCreditCompany &&
                              styles.completePanelCompanyBadgeCredit,
                          ]}>
                          <Text
                            style={styles.completePanelCompanyName}
                            numberOfLines={1}>
                            {company.name}
                          </Text>
                          <Text style={styles.completePanelCompanyMode}>
                            {company.paymentLabel}
                          </Text>
                        </View>
                      );
                    })}
                  </View>
                ) : (
                  <Text style={styles.completePanelCompanyEmptyText}>
                    No panel company found for this booking.
                  </Text>
                )}
              </View>

              <View style={styles.completeFormSection}>
                <RequiredLabel styles={styles}>Billing Summary</RequiredLabel>
                <View style={styles.completeBillingSummaryGrid}>
                  <View style={styles.completeBillingSummaryCard}>
                    <Text style={styles.completeBillingSummaryLabel}>Total</Text>
                    <Text style={styles.completeBillingSummaryValue}>
                      Rs. {completeBillingTotal.toFixed(2)}
                    </Text>
                  </View>
                  <View style={styles.completeBillingSummaryCard}>
                    <Text style={styles.completeBillingSummaryLabel}>Discount</Text>
                    <Text style={styles.completeBillingSummaryValue}>
                      Rs. {completeDiscountAmount.toFixed(2)}
                    </Text>
                  </View>
                  <View style={styles.completeBillingSummaryCard}>
                    <Text style={styles.completeBillingSummaryLabel}>Amount Paid</Text>
                    <Text style={styles.completeBillingSummaryValue}>
                      Rs. {completeAmountPaid.toFixed(2)}
                    </Text>
                  </View>
                  <View style={styles.completeBillingSummaryCard}>
                    <Text style={styles.completeBillingSummaryLabel}>Balance</Text>
                    <Text style={styles.completeBillingSummaryValue}>
                      Rs. {completeBalanceAmount.toFixed(2)}
                    </Text>
                  </View>
                </View>
                <TouchableOpacity
                  activeOpacity={0.85}
                  style={[
                    styles.completeSecondaryButton,
                    isAdditionalDiscountEnabled &&
                      styles.completeSecondaryButtonActive,
                  ]}
                  onPress={() =>
                    setIsAdditionalDiscountEnabled(previousValue => !previousValue)
                  }>
                  <Ionicons
                    name="pricetag-outline"
                    size={16}
                    style={[
                      styles.completeSecondaryButtonIcon,
                      isAdditionalDiscountEnabled &&
                        styles.completeSecondaryButtonIconActive,
                    ]}
                  />
                  <Text
                    style={[
                      styles.completeSecondaryButtonText,
                      isAdditionalDiscountEnabled &&
                        styles.completeSecondaryButtonTextActive,
                    ]}>
                    Additional Discount
                  </Text>
                </TouchableOpacity>
                {isAdditionalDiscountEnabled ? (
                  <View style={styles.completeCashInputWrap}>
                    <Text style={styles.completeCashPrefix}>Rs.</Text>
                    <TextInput
                      value={completeAdditionalDiscount}
                      onChangeText={setCompleteAdditionalDiscount}
                      keyboardType="numeric"
                      placeholder="Enter additional discount"
                      placeholderTextColor="#7B8AA3"
                      style={styles.completeCashInput}
                    />
                  </View>
                ) : null}
                <Text style={styles.completeBillingHintText}>
                  {completeBillingTests.length} tests included in billing summary
                </Text>
              </View>

              <View style={styles.completeFormSection}>
                <RequiredLabel styles={styles}>Payment Mode</RequiredLabel>
                <View style={styles.cancelSegmentedRow}>
                  {COMPLETE_PAYMENT_MODE_OPTIONS.map(mode => {
                    const isSelected = completePaymentMode === mode;

                    return (
                      <TouchableOpacity
                        key={mode}
                        activeOpacity={0.85}
                        style={[
                          styles.cancelSegmentButton,
                          isSelected && styles.cancelSegmentButtonActive,
                        ]}
                        onPress={() => setCompletePaymentMode(mode)}>
                        <Text
                          style={[
                            styles.cancelSegmentButtonText,
                            isSelected && styles.cancelSegmentButtonTextActive,
                          ]}>
                          {mode}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              <View style={styles.completeFormSection}>
                <RequiredLabel styles={styles}>Amount Paid</RequiredLabel>
                <View style={styles.completeCashInputWrap}>
                  <Text style={styles.completeCashPrefix}>Rs.</Text>
                  <TextInput
                    value={completeCollectedCash}
                    onChangeText={setCompleteCollectedCash}
                    keyboardType="numeric"
                    placeholder="Enter amount paid"
                    placeholderTextColor="#7B8AA3"
                    style={styles.completeCashInput}
                  />
                </View>
              </View>

              <View style={styles.completeFormSection}>
                <Text style={styles.addPatientFieldLabel}>Remarks</Text>
                <TextInput
                  value={completeRemarks}
                  onChangeText={setCompleteRemarks}
                  placeholder="Add billing or reporting remarks"
                  placeholderTextColor="#7B8AA3"
                  multiline
                  textAlignVertical="top"
                  style={styles.completeRemarksInput}
                />
              </View>

              {shouldShowCompleteProofUpload ? (
                <View style={styles.completeFormSection}>
                  <RequiredLabel styles={styles}>Credit Proof / Prescription</RequiredLabel>
                  <TouchableOpacity
                    activeOpacity={0.85}
                    style={styles.completeUploadBox}
                    onPress={handlePickCompleteProofDocuments}>
                    <View style={styles.completeUploadIconWrap}>
                      <Ionicons
                        name="cloud-upload-outline"
                        size={22}
                        style={styles.completeUploadIcon}
                      />
                    </View>
                    <View style={styles.completeUploadTextWrap}>
                      <Text style={styles.completeUploadTitle}>Upload document</Text>
                      <Text style={styles.completeUploadHint}>
                        Required because one or more panels are credit
                      </Text>
                    </View>
                    <Ionicons
                      name="chevron-forward"
                      size={18}
                      style={styles.completeUploadChevron}
                    />
                  </TouchableOpacity>

                  {completeProofDocuments.length ? (
                    <View style={styles.completeProofList}>
                      {completeProofDocuments.map((document, index) => (
                        <View
                          key={`${document.uri}-${index}`}
                          style={styles.completeProofItem}>
                          <Ionicons
                            name="document-attach-outline"
                            size={16}
                            style={styles.completeProofIcon}
                          />
                          <Text style={styles.completeProofName} numberOfLines={1}>
                            {document.name}
                          </Text>
                          <TouchableOpacity
                            activeOpacity={0.85}
                            style={styles.completeProofRemoveButton}
                            onPress={() => handleRemoveCompleteProofDocument(index)}>
                            <Ionicons
                              name="close"
                              size={14}
                              style={styles.completeProofRemoveIcon}
                            />
                          </TouchableOpacity>
                        </View>
                      ))}
                    </View>
                  ) : null}
                </View>
              ) : null}
            </ScrollView>

            <View style={styles.cancelModalFooter}>
              <TouchableOpacity
                activeOpacity={0.85}
                style={styles.cancelModalSecondaryButton}
                onPress={closeCompleteBookingModal}
                disabled={bookingActionLoading === 'completed'}>
                <Text style={styles.cancelModalSecondaryButtonText}>Close</Text>
              </TouchableOpacity>
              <TouchableOpacity
                activeOpacity={0.85}
                style={[
                  styles.completeModalPrimaryButton,
                  bookingActionLoading === 'completed' &&
                    styles.addPatientSubmitButtonDisabled,
                ]}
                onPress={confirmCompleteBooking}
                disabled={bookingActionLoading === 'completed'}>
                {bookingActionLoading === 'completed' ? (
                  <ActivityIndicator color={BRAND.surface} />
                ) : (
                  <Text style={styles.completeModalPrimaryButtonText}>
                    Confirm Complete
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <View style={styles.bookingDetailShell}>
        <View style={styles.bookingDetailHero}>
          <View style={styles.bookingDetailHeroTopRow}>
            <View style={styles.bookingDetailHeroText}>
              <Text style={styles.bookingDetailHeroCode}>
                {selectedBooking.bookingCode || selectedBooking.id}
              </Text>
              <Text style={styles.bookingDetailHeroMeta}>
                {patientCount} Patient{patientCount > 1 ? 's' : ''} |{' '}
                {selectedBooking.timeSlot}
              </Text>
            </View>
            <View style={styles.bookingDetailHeroIconRow}>
              <TouchableOpacity
                activeOpacity={0.85}
                style={styles.bookingDetailHeroIconButton}
                onPress={handleCallBookingPhone}
                disabled={!normalizeFormText(selectedBooking.phoneNumber)}>
                <Ionicons
                  name="call-outline"
                  size={18}
                  style={styles.bookingDetailHeroIcon}
                />
              </TouchableOpacity>
              {canUseActiveBookingControls ? (
                <TouchableOpacity
                  activeOpacity={0.85}
                  style={styles.bookingDetailHeroIconButton}
                  onPress={handleOpenLocation}>
                  <Ionicons
                    name="map-outline"
                    size={18}
                    style={styles.bookingDetailHeroIcon}
                  />
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
          <View style={styles.bookingDetailHeroStatusRow}>
            <View style={styles.bookingDetailHeroStatusChip}>
              <Text style={styles.bookingDetailHeroStatusText}>
                {selectedBooking.status}
              </Text>
            </View>
            <Text style={styles.bookingDetailHeroDate}>
              {selectedBooking.preferredVisitDate}
            </Text>
          </View>
        </View>

        {canUsePatientActions || shouldShowProgressActions ? (
          <View
            style={[
              styles.bookingDetailQuickActionRow,
              isSmallPhone && styles.bookingDetailQuickActionRowStacked,
            ]}>
            {canUsePatientActions ? (
              <TouchableOpacity
                activeOpacity={0.85}
                style={[
                  styles.bookingDetailQuickAction,
                  styles.bookingDetailQuickActionPrimary,
                ]}
                onPress={handleAddPatientPress}>
                <Ionicons
                  name="person-add-outline"
                  size={17}
                  style={styles.bookingDetailQuickActionIcon}
                />
                <Text style={styles.bookingDetailQuickActionText}>
                  ADD PATIENT
                </Text>
              </TouchableOpacity>
            ) : null}
            {shouldShowProgressActions ? (
              <TouchableOpacity
                activeOpacity={0.85}
                style={[
                  styles.bookingDetailQuickAction,
                  styles.bookingDetailQuickActionDanger,
                ]}
                onPress={openCancelBookingModal}
                disabled={Boolean(bookingActionLoading)}>
                <Ionicons
                  name="close-circle-outline"
                  size={17}
                  style={styles.bookingDetailQuickActionDangerIcon}
                />
                <Text
                  style={[
                    styles.bookingDetailQuickActionText,
                    styles.bookingDetailQuickActionDangerText,
                  ]}>
                  CANCEL
                </Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}

        {shouldShowStartOnly || shouldShowProgressActions ? (
          <View style={styles.bookingDetailSecondaryRow}>
            <Text style={styles.bookingDetailSecondaryText}>Booking control</Text>
            {shouldShowStartOnly ? (
              <TouchableOpacity
                activeOpacity={0.85}
                style={styles.bookingDetailSecondaryButton}
                onPress={() => onBookingAction('start')}
                disabled={Boolean(bookingActionLoading)}>
                <Text style={styles.bookingDetailSecondaryButtonText}>
                  {bookingActionLoading === 'start' ? 'STARTING...' : 'START'}
                </Text>
              </TouchableOpacity>
            ) : null}
            {shouldShowProgressActions ? (
              <TouchableOpacity
                activeOpacity={0.85}
                style={styles.bookingDetailSecondaryButton}
                onPress={() => onBookingAction('stop')}
                disabled={Boolean(bookingActionLoading)}>
                <Text style={styles.bookingDetailSecondaryButtonText}>
                  {bookingActionLoading === 'stop' ? 'STOPPING...' : 'STOP'}
                </Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}

        <View style={styles.bookingDetailProgressCard}>
          <View style={styles.bookingDetailProgressRow}>
            <Text style={styles.bookingDetailProgressLabel}>Patients closed</Text>
            <Text style={styles.bookingDetailProgressValue}>
              {completedPatientCount} / {patientCount}
            </Text>
          </View>
          <View style={styles.bookingDetailProgressTrack}>
            <View
              style={[
                styles.bookingDetailProgressFill,
                {
                  width: `${
                    patientCount
                      ? Math.round((completedPatientCount / patientCount) * 100)
                      : 0
                  }%`,
                },
              ]}
            />
          </View>
        </View>

        <BookingLocationCard
          styles={styles}
          address={resolvedAddress}
          accessNotes={selectedBooking.address.accessNotes}
          disabled={!resolvedAddress && (!latitude || !longitude)}
          onOpenLocation={handleOpenLocation}
        />

        {isTerminalBooking ? (
          <TerminalStatusCard
            styles={styles}
            isCompleted={isCompletedBooking}
            isCancelled={isCancelledBooking}
            message={terminalBookingMessage}
          />
        ) : null}
      </View>

      {selectedBooking.patients.map((patient, index) => {
        const patientStatusCode = Number(patient.bookingPatientStatusCode || 0);
        const canUseThisPatientActions =
          canUsePatientActions &&
          ![3, 4, 5].includes(patientStatusCode);
        const patientId = getPatientMutationId(patient);
        const apiMatchedCompanies = patientId
          ? patientApiPanelCompaniesMap[patientId] || []
          : [];
        const selectedCompanies = patientId
          ? patientPanelCompaniesMap[patientId] || []
          : [];
        const activePanelCompanyId = patientId
          ? activePatientPanelCompanyMap[patientId] || ''
          : '';
        const selectedTests = patientId
          ? patientSelectedTestsMap[patientId] || []
          : [];
        const companyChips = dedupePanelCompanyChips([
          ...apiMatchedCompanies.map(company => ({
            ...company,
            chipId: `api-${company.id}`,
            chipSource: 'API',
          })),
          ...selectedCompanies.map(company => ({
            ...company,
            chipId: `app-${company.id}`,
            chipSource: 'APP',
          })),
        ]);

        return (
        <PatientDetailCard
          key={`patient-${getPatientMutationId(patient) || patient.id || 'na'}-${index}`}
          patient={patient}
          styles={styles}
          onPrimaryPanelCompanyPress={
            canUseThisPatientActions ? handlePrimaryPanelCompanyPress : undefined
          }
          panelCompanies={companyChips}
          activePanelCompanyId={activePanelCompanyId}
          onSelectPanelCompany={
            canUseThisPatientActions ? openPanelCompanyTests : undefined
          }
          onRemovePanelCompany={
            canUseThisPatientActions ? handleRemovePatientPanelCompany : undefined
          }
          onCancelBooking={
            canUseThisPatientActions &&
            canCancelPatientForBooking
              ? handlePatientCancelBooking
              : undefined
          }
          onEditPatient={canUseThisPatientActions ? handleEditPatientPress : undefined}
          onReportCourierChange={
            canUseThisPatientActions ? handleReportCourierChange : undefined
          }
          reportCourierValue={
            patientId && patientReportCourierMap[patientId]
              ? patientReportCourierMap[patientId]
              : ''
          }
          onAddPanelCompany={
            canUseThisPatientActions ? handlePatientAddPanelCompany : undefined
          }
          onOpenSampleCollection={
            canUseThisPatientActions ? onOpenSampleCollection : undefined
          }
          selectedTests={selectedTests}
          onRemoveSelectedTest={
            canUseThisPatientActions ? onRemovePatientSelectedTest : undefined
          }
          isAddPanelCompanyDisabled={
            Boolean(addingTestPatientId)
          }
          isCancelBookingDisabled={Boolean(cancellingPatientId)}
          addPanelCompanyLabel={
            String(addingTestPatientId) === String(getPatientMutationId(patient))
              ? 'Loading...'
              : 'Add Company'
          }
          cancelBookingLabel={
            String(cancellingPatientId) === String(patient.id)
              ? 'Cancelling...'
              : 'Cancel Patient'
          }
        />
        );
      })}

      {shouldShowProgressActions ? (
        <View style={styles.swipeCompleteSection}>
          <SwipeCompleteButton
            styles={styles}
            disabled={Boolean(bookingActionLoading)}
            isLoading={bookingActionLoading === 'completed'}
            onComplete={openCompleteBookingModal}
          />
        </View>
      ) : null}

      <Modal
        transparent
        animationType="slide"
        visible={isAddPatientModalVisible}
        onRequestClose={closeAddPatientModal}>
        <View style={styles.addPatientModalOverlay}>
          <TouchableOpacity
            activeOpacity={1}
            style={styles.addPatientModalBackdrop}
            onPress={closeAddPatientModal}
          />
          <View
            style={[
              styles.addPatientModalCard,
              styles.addPatientFormModalCard,
              isNarrowScreen && styles.addPatientModalCardCompact,
            ]}>
            <View
              style={[
                styles.addPatientModalHeader,
                styles.addPatientFormModalHeader,
              ]}>
              <View style={styles.addPatientFormHeaderText}>
                <Text
                  style={[
                    styles.addPatientModalTitle,
                    styles.addPatientFormModalTitle,
                  ]}>
                  {editingPatient
                    ? 'Edit Patient'
                    : addPatientModalStep === 'linked-list'
                    ? 'Linked Patients'
                    : 'Add Patient'}
                </Text>
                <Text
                  style={[
                    styles.addPatientModalEyebrow,
                    styles.addPatientFormModalEyebrow,
                  ]}>
                  {editingPatient
                    ? 'Update patient details'
                    : addPatientModalStep === 'linked-list'
                    ? 'Choose linked patient or add a new one'
                    : 'Add a new patient to this appointment'}
                </Text>
              </View>
              <TouchableOpacity
                activeOpacity={0.85}
                style={[
                  styles.addPatientModalCloseButton,
                  styles.addPatientFormModalCloseButton,
                ]}
                onPress={closeAddPatientModal}
                disabled={isAddingPatient || isUpdatingPatient}>
                <Ionicons
                  name="close"
                  size={20}
                  style={[
                    styles.addPatientModalCloseIcon,
                    styles.addPatientFormModalCloseIcon,
                  ]}
                />
              </TouchableOpacity>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={[
                styles.addPatientModalContent,
                styles.addPatientFormModalContent,
              ]}>
              {!editingPatient && addPatientModalStep === 'linked-list' ? (
                <>
                  <View style={styles.linkedPatientList}>
                    {DUMMY_LINKED_PATIENTS.map(linkedPatient => {
                      const isSelected =
                        selectedLinkedPatientId === linkedPatient.id;

                      return (
                        <TouchableOpacity
                          key={linkedPatient.id}
                          activeOpacity={0.85}
                          style={[
                            styles.linkedPatientCard,
                            isSelected && styles.linkedPatientCardActive,
                          ]}
                          onPress={() => setSelectedLinkedPatientId(linkedPatient.id)}>
                          <View style={styles.linkedPatientCardHeader}>
                            <Text style={styles.linkedPatientName}>
                              {linkedPatient.name}
                            </Text>
                            <View
                              style={[
                                styles.linkedPatientSelectChip,
                                isSelected &&
                                  styles.linkedPatientSelectChipActive,
                              ]}>
                              <Text
                                style={[
                                  styles.linkedPatientSelectChipText,
                                  isSelected &&
                                    styles.linkedPatientSelectChipTextActive,
                                ]}>
                                {isSelected ? 'Selected' : 'Tap to Select'}
                              </Text>
                            </View>
                          </View>
                          <Text style={styles.linkedPatientMeta}>
                            {linkedPatient.gender} | {linkedPatient.age} yrs
                          </Text>
                          <Text style={styles.linkedPatientMeta}>
                            {linkedPatient.mobileNumber}
                          </Text>
                          <Text style={styles.linkedPatientMeta}>
                            Panel: {linkedPatient.panelCompany}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  <TouchableOpacity
                    activeOpacity={0.85}
                    style={styles.addPatientSubmitButton}
                    onPress={handleUseLinkedPatient}>
                    <Ionicons
                      name="checkmark-circle-outline"
                      size={18}
                      style={styles.addPatientSubmitButtonIcon}
                    />
                    <Text style={styles.addPatientSubmitButtonText}>
                      Use Selected Patient
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    activeOpacity={0.85}
                    style={styles.linkedPatientSecondaryButton}
                    onPress={handleOpenAddPatientForm}>
                    <Ionicons
                      name="person-add-outline"
                      size={18}
                      style={styles.linkedPatientSecondaryButtonIcon}
                    />
                    <Text style={styles.linkedPatientSecondaryButtonText}>
                      Add New Patient
                    </Text>
                  </TouchableOpacity>
                </>
              ) : (
                <>
              <RequiredLabel styles={styles}>Title</RequiredLabel>
              <View style={styles.addPatientChipGrid}>
                {TITLE_OPTIONS.map(title => {
                  const isSelected = patientForm.title === title;
                  return (
                    <TouchableOpacity
                      key={title}
                      activeOpacity={0.85}
                      style={[
                        styles.addPatientChoiceChip,
                        isSelected && styles.addPatientChoiceChipActive,
                      ]}
                      onPress={() => handleTitleChange(title)}>
                      <Text
                        style={[
                          styles.addPatientChoiceChipText,
                          isSelected && styles.addPatientChoiceChipTextActive,
                        ]}>
                        {title}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <View style={styles.addPatientInputGroup}>
                <RequiredLabel styles={styles}>Full Name</RequiredLabel>
                <TextInput
                  value={patientForm.fullName}
                  onChangeText={value => updatePatientFormField('fullName', value)}
                  placeholder="Patient full name"
                  placeholderTextColor={BRAND.textMuted}
                  style={styles.addPatientInput}
                />
              </View>

              <View
                style={[
                  styles.addPatientFieldRow,
                  isNarrowScreen && styles.addPatientFieldRowStacked,
                ]}>
                <View style={styles.addPatientFieldHalf}>
                  <RequiredLabel styles={styles}>Gender</RequiredLabel>
                  {isGenderEditable ? (
                    <View style={styles.addPatientGenderChipRow}>
                      {GENDER_OPTIONS.map(gender => {
                        const isSelected = patientForm.gender === gender;
                        return (
                          <TouchableOpacity
                            key={gender}
                            activeOpacity={0.85}
                            style={[
                              styles.addPatientGenderChip,
                              isSelected && styles.addPatientGenderChipActive,
                            ]}
                            onPress={() =>
                              updatePatientFormField('gender', gender)
                            }>
                            <Text
                              style={[
                                styles.addPatientGenderChipText,
                                isSelected &&
                                  styles.addPatientGenderChipTextActive,
                              ]}>
                              {gender}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  ) : (
                    <View style={styles.addPatientReadonlyInput}>
                      <Text style={styles.addPatientReadonlyInputText}>
                        {patientForm.gender}
                      </Text>
                    </View>
                  )}
                </View>
                <View style={styles.addPatientFieldHalf}>
                  <Text style={styles.addPatientFieldLabel}>Age</Text>
                  <View style={styles.addPatientReadonlyInput}>
                    <Text style={styles.addPatientReadonlyInputText}>
                      {patientForm.ageYears || 'Auto'}
                    </Text>
                  </View>
                </View>
              </View>

              <View style={styles.addPatientInputGroup}>
                <RequiredLabel styles={styles}>Date of Birth</RequiredLabel>
                <TouchableOpacity
                  activeOpacity={0.85}
                  style={styles.addPatientDatePickerButton}
                  onPress={() => setIsDobCalendarVisible(true)}>
                  <Text
                    style={[
                      styles.addPatientDatePickerText,
                      !patientForm.dateOfBirth &&
                        styles.addPatientDatePickerPlaceholder,
                    ]}>
                    {patientForm.dateOfBirth || 'Select date'}
                  </Text>
                  <Ionicons
                    name="calendar-outline"
                    size={18}
                    style={styles.addPatientDatePickerIcon}
                  />
                </TouchableOpacity>
              </View>

              <View style={styles.addPatientInputGroup}>
                <RequiredLabel styles={styles}>Primary Mobile</RequiredLabel>
                <TextInput
                  value={patientForm.primaryMobile}
                  onChangeText={value =>
                    updatePatientFormField('primaryMobile', value.replace(/\D/g, ''))
                  }
                  placeholder="9898989898"
                  placeholderTextColor={BRAND.textMuted}
                  keyboardType="phone-pad"
                  maxLength={10}
                  style={styles.addPatientInput}
                />
              </View>

              <View style={styles.addPatientInputGroup}>
                <Text style={styles.addPatientFieldLabel}>Alternate Mobile</Text>
                <TextInput
                  value={patientForm.alternateMobile}
                  onChangeText={value =>
                    updatePatientFormField(
                      'alternateMobile',
                      value.replace(/\D/g, ''),
                    )
                  }
                  placeholder="Optional"
                  placeholderTextColor={BRAND.textMuted}
                  keyboardType="phone-pad"
                  maxLength={10}
                  style={styles.addPatientInput}
                />
              </View>

              <View style={styles.addPatientInputGroup}>
                <Text style={styles.addPatientFieldLabel}>Email</Text>
                <TextInput
                  value={patientForm.email}
                  onChangeText={value => updatePatientFormField('email', value)}
                  placeholder="Optional"
                  placeholderTextColor={BRAND.textMuted}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  style={styles.addPatientInput}
                />
              </View>

              <View style={styles.addPatientInputGroup}>
                <Text style={styles.addPatientFieldLabel}>Documents / Images</Text>
                <TouchableOpacity
                  activeOpacity={0.85}
                  style={styles.addPatientDatePickerButton}
                  onPress={handlePickPatientDocuments}>
                  <Text style={styles.addPatientDatePickerText}>
                    Upload Files
                  </Text>
                  <Ionicons
                    name="attach-outline"
                    size={18}
                    style={styles.addPatientDatePickerIcon}
                  />
                </TouchableOpacity>
                {patientDocuments.length ? (
                  <View style={styles.panelCompanyListContent}>
                    {patientDocuments.map((document, index) => (
                      <View
                        key={`${document.uri}-${index}`}
                        style={styles.panelCompanyItem}>
                        <View style={styles.panelCompanyItemTextWrap}>
                          <Text style={styles.panelCompanyName} numberOfLines={1}>
                            {document.name}
                          </Text>
                          <Text style={styles.panelCompanyMeta} numberOfLines={1}>
                            {document.type}
                          </Text>
                        </View>
                        <TouchableOpacity
                          activeOpacity={0.85}
                          style={styles.patientEditButton}
                          onPress={() => handleRemovePatientDocument(index)}>
                          <Ionicons
                            name="trash-outline"
                            size={16}
                            style={styles.patientEditButtonIcon}
                          />
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>
                ) : null}
              </View>

              <View
                style={[
                  styles.addPatientFieldRow,
                  isNarrowScreen && styles.addPatientFieldRowStacked,
                ]}>
                <View style={styles.addPatientFieldHalf}>
                  <Text style={styles.addPatientFieldLabel}>Labmate PID</Text>
                  <TextInput
                    value={patientForm.labmatePid}
                    onChangeText={value =>
                      updatePatientFormField('labmatePid', value)
                    }
                    placeholder="1000000"
                    placeholderTextColor={BRAND.textMuted}
                    keyboardType="number-pad"
                    style={styles.addPatientInput}
                  />
                </View>
                <View style={styles.addPatientFieldHalf}>
                  <RequiredLabel styles={styles}>Panel</RequiredLabel>
                  <TextInput
                    value={patientForm.panelCompany}
                    onChangeText={value =>
                      updatePatientFormField('panelCompany', value)
                    }
                    placeholder="CGHS"
                    placeholderTextColor={BRAND.textMuted}
                    style={styles.addPatientInput}
                  />
                </View>
              </View>

              <Text style={styles.addPatientFieldLabel}>Tag</Text>
              <View style={styles.addPatientChipGrid}>
                {TAG_OPTIONS.map(tag => {
                  const isSelected = patientForm.tag === tag;
                  return (
                    <TouchableOpacity
                      key={tag}
                      activeOpacity={0.85}
                      style={[
                        styles.addPatientChoiceChip,
                        isSelected && styles.addPatientChoiceChipActive,
                      ]}
                      onPress={() => updatePatientFormField('tag', tag)}>
                      <Text
                        style={[
                          styles.addPatientChoiceChipText,
                          isSelected && styles.addPatientChoiceChipTextActive,
                        ]}>
                        {tag}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
                </>
              )}
            </ScrollView>

            {editingPatient || addPatientModalStep === 'form' ? (
              <TouchableOpacity
                activeOpacity={0.85}
                style={[
                  styles.addPatientSubmitButton,
                  styles.addPatientFormSubmitButton,
                  isAddingPatient && styles.addPatientSubmitButtonDisabled,
                  isUpdatingPatient && styles.addPatientSubmitButtonDisabled,
                ]}
                onPress={handleSubmitAddPatient}
                disabled={isAddingPatient || isUpdatingPatient}>
                {isAddingPatient || isUpdatingPatient ? (
                  <ActivityIndicator color={BRAND.surface} />
                ) : (
                  <>
                    <Ionicons
                      name="checkmark-circle-outline"
                      size={18}
                      style={[
                        styles.addPatientSubmitButtonIcon,
                        styles.addPatientFormSubmitButtonIcon,
                      ]}
                    />
                    <Text
                      style={[
                        styles.addPatientSubmitButtonText,
                        styles.addPatientFormSubmitButtonText,
                      ]}>
                      {editingPatient ? 'Update Patient' : 'Save Patient'}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      </Modal>

      <Modal
        transparent
        animationType="fade"
        visible={isDobCalendarVisible}
        onRequestClose={() => setIsDobCalendarVisible(false)}>
        <View style={styles.dobPickerOverlay}>
          <TouchableOpacity
            activeOpacity={1}
            style={styles.dobPickerBackdrop}
            onPress={() => setIsDobCalendarVisible(false)}
          />
          <View style={styles.dobPickerCard}>
            <View style={styles.dobPickerHeader}>
              <View>
                <Text style={styles.addPatientModalEyebrow}>Date of Birth</Text>
                <Text style={styles.dobPickerTitle}>
                  {patientForm.dateOfBirth || 'Select DOB'}
                </Text>
              </View>
              <TouchableOpacity
                activeOpacity={0.85}
                style={styles.addPatientModalCloseButton}
                onPress={() => setIsDobCalendarVisible(false)}>
                <Ionicons
                  name="close"
                  size={20}
                  style={styles.addPatientModalCloseIcon}
                />
              </TouchableOpacity>
            </View>

            <View style={styles.dobPickerQuickRow}>
              <TouchableOpacity
                activeOpacity={0.85}
                style={styles.dobPickerQuickButton}
                onPress={() => moveDobCalendarMonth(-120)}>
                <Text style={styles.dobPickerQuickButtonText}>-10 yr</Text>
              </TouchableOpacity>
              <TouchableOpacity
                activeOpacity={0.85}
                style={styles.dobPickerQuickButton}
                onPress={() => moveDobCalendarMonth(-12)}>
                <Text style={styles.dobPickerQuickButtonText}>-1 yr</Text>
              </TouchableOpacity>
              <TouchableOpacity
                activeOpacity={0.85}
                style={styles.dobPickerQuickButton}
                onPress={() => moveDobCalendarMonth(12)}>
                <Text style={styles.dobPickerQuickButtonText}>+1 yr</Text>
              </TouchableOpacity>
              <TouchableOpacity
                activeOpacity={0.85}
                style={styles.dobPickerQuickButton}
                onPress={() => moveDobCalendarMonth(120)}>
                <Text style={styles.dobPickerQuickButtonText}>+10 yr</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.addPatientCalendarCard}>
              <View style={styles.addPatientCalendarHeader}>
                <TouchableOpacity
                  activeOpacity={0.85}
                  style={styles.addPatientCalendarNavButton}
                  onPress={() => moveDobCalendarMonth(-1)}>
                  <Ionicons
                    name="chevron-back"
                    size={18}
                    style={styles.addPatientCalendarNavIcon}
                  />
                </TouchableOpacity>
                <Text style={styles.addPatientCalendarTitle}>
                  {MONTH_LABELS[dobCalendarMonth.getMonth()]}{' '}
                  {dobCalendarMonth.getFullYear()}
                </Text>
                <TouchableOpacity
                  activeOpacity={0.85}
                  style={styles.addPatientCalendarNavButton}
                  onPress={() => moveDobCalendarMonth(1)}>
                  <Ionicons
                    name="chevron-forward"
                    size={18}
                    style={styles.addPatientCalendarNavIcon}
                  />
                </TouchableOpacity>
              </View>

              <View style={styles.addPatientCalendarGrid}>
                {WEEKDAY_LABELS.map((weekday, index) => (
                  <Text
                    key={`${weekday}-${index}`}
                    style={styles.addPatientCalendarWeekday}>
                    {weekday}
                  </Text>
                ))}
                {calendarDays.map((date, index) => {
                  if (!date) {
                    return (
                      <View
                        key={`empty-${index}`}
                        style={styles.addPatientCalendarDayPlaceholder}
                      />
                    );
                  }

                  const dateValue = toDateInputValue(date);
                  const isSelected = patientForm.dateOfBirth === dateValue;
                  const isFutureDate = date > new Date();

                  return (
                    <TouchableOpacity
                      key={dateValue}
                      activeOpacity={0.85}
                      style={[
                        styles.addPatientCalendarDay,
                        isSelected && styles.addPatientCalendarDaySelected,
                        isFutureDate && styles.addPatientCalendarDayDisabled,
                      ]}
                      onPress={() => handleDobDateSelect(date)}
                      disabled={isFutureDate}>
                      <Text
                        style={[
                          styles.addPatientCalendarDayText,
                          isSelected &&
                            styles.addPatientCalendarDayTextSelected,
                          isFutureDate &&
                            styles.addPatientCalendarDayTextDisabled,
                        ]}>
                        {date.getDate()}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        transparent
        animationType="fade"
        visible={isCancellationReasonSelectVisible}
        onRequestClose={() => setIsCancellationReasonSelectVisible(false)}>
        <View style={styles.cancelOptionOverlay}>
          <TouchableOpacity
            activeOpacity={1}
            style={styles.cancelOptionBackdrop}
            onPress={() => setIsCancellationReasonSelectVisible(false)}
          />
          <View style={styles.cancelOptionSheet}>
            <View style={styles.cancelOptionHeader}>
              <Text style={styles.cancelOptionTitle}>Cancellation Reason</Text>
              <TouchableOpacity
                activeOpacity={0.85}
                style={styles.cancelOptionCloseButton}
                onPress={() => setIsCancellationReasonSelectVisible(false)}>
                <Ionicons
                  name="close"
                  size={18}
                  style={styles.cancelOptionCloseIcon}
                />
              </TouchableOpacity>
            </View>
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.cancelOptionList}>
              {CANCELLATION_REASON_OPTIONS.map(reason => {
                const isSelected = cancellationReason === reason;
                return (
                  <TouchableOpacity
                    key={reason}
                    activeOpacity={0.85}
                    style={[
                      styles.cancelSelectOption,
                      isSelected && styles.cancelSelectOptionActive,
                    ]}
                    onPress={() => {
                      setCancellationReason(reason);
                      setIsCancellationReasonSelectVisible(false);
                    }}>
                    <Text
                      style={[
                        styles.cancelSelectOptionText,
                        isSelected && styles.cancelSelectOptionTextActive,
                      ]}>
                      {reason}
                    </Text>
                    {isSelected ? (
                      <Ionicons
                        name="checkmark-circle"
                        size={18}
                        style={styles.cancelSelectOptionIcon}
                      />
                    ) : null}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal
        transparent
        animationType="fade"
        visible={isCancelTimeSlotSelectVisible}
        onRequestClose={() => setIsCancelTimeSlotSelectVisible(false)}>
        <View style={styles.cancelOptionOverlay}>
          <TouchableOpacity
            activeOpacity={1}
            style={styles.cancelOptionBackdrop}
            onPress={() => setIsCancelTimeSlotSelectVisible(false)}
          />
          <View style={styles.cancelOptionSheet}>
            <View style={styles.cancelOptionHeader}>
              <Text style={styles.cancelOptionTitle}>New Time Slot</Text>
              <TouchableOpacity
                activeOpacity={0.85}
                style={styles.cancelOptionCloseButton}
                onPress={() => setIsCancelTimeSlotSelectVisible(false)}>
                <Ionicons
                  name="close"
                  size={18}
                  style={styles.cancelOptionCloseIcon}
                />
              </TouchableOpacity>
            </View>
            <View style={styles.cancelOptionList}>
              {CANCEL_TIME_SLOT_OPTIONS.map(slot => {
                const isSelected = cancelNewTimeSlot === slot;
                return (
                  <TouchableOpacity
                    key={slot}
                    activeOpacity={0.85}
                    style={[
                      styles.cancelSelectOption,
                      isSelected && styles.cancelSelectOptionActive,
                    ]}
                    onPress={() => {
                      setCancelNewTimeSlot(slot);
                      setIsCancelTimeSlotSelectVisible(false);
                    }}>
                    <Text
                      style={[
                        styles.cancelSelectOptionText,
                        isSelected && styles.cancelSelectOptionTextActive,
                      ]}>
                      {slot}
                    </Text>
                    {isSelected ? (
                      <Ionicons
                        name="checkmark-circle"
                        size={18}
                        style={styles.cancelSelectOptionIcon}
                      />
                    ) : null}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        transparent
        animationType="fade"
        visible={isCancelCalendarVisible}
        onRequestClose={() => setIsCancelCalendarVisible(false)}>
        <View style={styles.dobPickerOverlay}>
          <TouchableOpacity
            activeOpacity={1}
            style={styles.dobPickerBackdrop}
            onPress={() => setIsCancelCalendarVisible(false)}
          />
          <View style={styles.dobPickerCard}>
            <View style={styles.dobPickerHeader}>
              <View>
                <Text style={styles.addPatientModalEyebrow}>New Visit Date</Text>
                <Text style={styles.dobPickerTitle}>
                  {cancelNewVisitDate || 'Select date'}
                </Text>
              </View>
              <TouchableOpacity
                activeOpacity={0.85}
                style={styles.addPatientModalCloseButton}
                onPress={() => setIsCancelCalendarVisible(false)}>
                <Ionicons
                  name="close"
                  size={20}
                  style={styles.addPatientModalCloseIcon}
                />
              </TouchableOpacity>
            </View>

            <View style={styles.addPatientCalendarCard}>
              <View style={styles.addPatientCalendarHeader}>
                <TouchableOpacity
                  activeOpacity={0.85}
                  style={styles.addPatientCalendarNavButton}
                  onPress={() => moveCancelCalendarMonth(-1)}>
                  <Ionicons
                    name="chevron-back"
                    size={18}
                    style={styles.addPatientCalendarNavIcon}
                  />
                </TouchableOpacity>
                <Text style={styles.addPatientCalendarTitle}>
                  {MONTH_LABELS[cancelCalendarMonth.getMonth()]}{' '}
                  {cancelCalendarMonth.getFullYear()}
                </Text>
                <TouchableOpacity
                  activeOpacity={0.85}
                  style={styles.addPatientCalendarNavButton}
                  onPress={() => moveCancelCalendarMonth(1)}>
                  <Ionicons
                    name="chevron-forward"
                    size={18}
                    style={styles.addPatientCalendarNavIcon}
                  />
                </TouchableOpacity>
              </View>

              <View style={styles.addPatientCalendarGrid}>
                {WEEKDAY_LABELS.map((weekday, index) => (
                  <Text
                    key={`${weekday}-cancel-${index}`}
                    style={styles.addPatientCalendarWeekday}>
                    {weekday}
                  </Text>
                ))}
                {cancelCalendarDays.map((date, index) => {
                  if (!date) {
                    return (
                      <View
                        key={`cancel-empty-${index}`}
                        style={styles.addPatientCalendarDayPlaceholder}
                      />
                    );
                  }

                  const dateValue = toDateInputValue(date);
                  const isSelected = cancelNewVisitDate === dateValue;
                  const today = new Date();
                  today.setHours(0, 0, 0, 0);
                  const isPastDate = date < today;

                  return (
                    <TouchableOpacity
                      key={`cancel-${dateValue}`}
                      activeOpacity={0.85}
                      style={[
                        styles.addPatientCalendarDay,
                        isSelected && styles.addPatientCalendarDaySelected,
                        isPastDate && styles.addPatientCalendarDayDisabled,
                      ]}
                      onPress={() => handleCancelDateSelect(date)}
                      disabled={isPastDate}>
                      <Text
                        style={[
                          styles.addPatientCalendarDayText,
                          isSelected &&
                            styles.addPatientCalendarDayTextSelected,
                          isPastDate &&
                            styles.addPatientCalendarDayTextDisabled,
                        ]}>
                        {date.getDate()}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

export default React.memo(AppointmentDetailsScreen);

