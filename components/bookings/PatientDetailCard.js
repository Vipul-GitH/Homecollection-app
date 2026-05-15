import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  ActivityIndicator,
  Linking,
  Modal,
  NativeModules,
  PermissionsAndroid,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
  Image,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import GetLocation from 'react-native-get-location';
import {getAddressFromCoords} from '../../utils/location/getAddressFromCoords';
import {
  getLastKnownGeoCapture,
  persistLastKnownGeoCapture,
} from '../../utils/location/lastKnownGeoCapture';
import {BRAND} from '../../styles/appStyles';
import PatientDocumentsList from './patient/PatientDocumentsList';
import RequiredLabel from './appointmentDetails/RequiredLabel';

const {LocalDocumentPickerModule, LocalGeoCameraModule} = NativeModules;
const DOCUMENT_ZOOM_MIN = 1;
const DOCUMENT_ZOOM_MAX = 3;
const EMPTY_MANUAL_SLIP_DOCUMENTS = [];
const MANUAL_HC_SLIP_STATUS = 'manual_hc_slip';
const PATIENT_DOCUMENT_BASE_URL = 'https://labmate.bhasinpathlabs.com:2010/';
const TEST_BOOKING_STATUS_OPTIONS = [
  {
    value: 'none',
    label: 'None',
    icon: 'remove-circle-outline',
  },
  {
    value: 'confirmed_booked',
    label: 'Test confirmed & booked',
    icon: 'checkmark-circle-outline',
  },
  {
    value: 'manual_hc_slip',
    label: 'Manual HC Slip',
    icon: 'document-text-outline',
  },
  {
    value: 'incomplete_reg_exec',
    label: 'Incomplete Test Booking, registration Executive to complete',
    icon: 'alert-circle-outline',
  },
];
const CGHS_DOCUMENT_SECTIONS = [
  {key: 'patientPhotos', label: 'Patient Photos (multi-select)'},
  {key: 'cghsCard', label: 'CGHS / CAPF Card (multi-select)'},
];

const toStableValue = value =>
  value === null || value === undefined ? '' : String(value).trim();

const toPriceNumber = value => {
  const numericValue = Number(String(value || '').replace(/[^0-9.]/g, ''));
  return Number.isFinite(numericValue) ? numericValue : 0;
};

const getStandardDiscountPercent = test =>
  toPriceNumber(
    test?.percentageonstandard ||
      test?.percentageOnStandard ||
      test?.percentage_on_standard ||
      test?.PercentageOnStandard ||
      test?.percentagestandard ||
      test?.percentageStandard ||
      test?.percentage_standard ||
      test?.PercentageStandard,
  );

const getDisplayTestPrice = test => {
  const mrp = toPriceNumber(test?.mrp || test?.MRP || test?.amount);
  const charge = toPriceNumber(test?.charge || test?.Charge);
  const baseMrp = mrp || charge;
  const billingMode = toStableValue(
    test?.selected_charge_mode ||
      test?.selectedChargeMode ||
      test?.billingChargeMode ||
      test?.chargeMode ||
      test?.charge_mode ||
      test?.selectedChargeModes ||
      test?.selected_charge_modes,
  ).toUpperCase();

  if (billingMode.includes('C') || billingMode.includes('F')) {
    return mrp || baseMrp;
  }

  const discountPercent = Math.min(100, Math.max(0, getStandardDiscountPercent(test)));
  if (discountPercent > 0 && baseMrp > 0) {
    return Math.max(0, baseMrp - (baseMrp * discountPercent) / 100);
  }
  return charge || baseMrp;
};

const getTestDedupeKey = test =>
  toStableValue(
    test?.dedupe_key ||
      test?.booked_code ||
      test?.testcode1 ||
      test?.test_code ||
      test?.code,
  ).toUpperCase();

const dedupeSelectedTests = tests => {
  const dedupedMap = new Map();

  tests.forEach((test, index) => {
    const dedupeKey = getTestDedupeKey(test) || `index-${index}`;
    if (!dedupedMap.has(dedupeKey)) {
      dedupedMap.set(dedupeKey, test);
    }
  });

  return Array.from(dedupedMap.values());
};

const getTouchDistance = touches => {
  if (!touches || touches.length < 2) {
    return 0;
  }

  const [firstTouch, secondTouch] = touches;
  const xDistance = firstTouch.pageX - secondTouch.pageX;
  const yDistance = firstTouch.pageY - secondTouch.pageY;
  return Math.sqrt(xDistance * xDistance + yDistance * yDistance);
};

const clamp = (value, minValue, maxValue) =>
  Math.min(maxValue, Math.max(minValue, value));

const getDialablePhoneNumber = value => toStableValue(value).replace(/\D/g, '');

const getBillingChargeMode = company =>
  toStableValue(
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

const getPaymentLabelFromBillingMode = mode => {
  const normalizedMode = getBillingChargeMode({billingChargeMode: mode});

  if (!normalizedMode) {
    return 'Not available';
  }

  const labels = [];
  if (normalizedMode.includes('C')) {
    labels.push('Credit');
  }
  if (normalizedMode.includes('P')) {
    labels.push('Paying');
  }
  if (normalizedMode.includes('F')) {
    labels.push('Free');
  }

  return labels.length ? labels.join(' & ') : normalizedMode;
};

const getTestBillingChargeMode = test =>
  getBillingChargeMode({
    billingChargeMode:
      test?.selected_charge_mode ||
      test?.selectedChargeMode ||
      test?.billingChargeMode ||
      test?.chargeMode ||
      test?.charge_mode ||
      test?.selectedChargeModes ||
      test?.selected_charge_modes,
  });

const getFirstBillingChargeMode = items =>
  (Array.isArray(items) ? items : []).reduce((resolvedMode, item) => {
    if (resolvedMode) {
      return resolvedMode;
    }
    return getBillingChargeMode(item) || getTestBillingChargeMode(item);
  }, '');

const getPanelCompanyName = company =>
  toStableValue(company?.name || company?.panelCompany || company?.panel_company);

const doesTestMatchPanelCompany = (test, company) => {
  if (!test || !company) {
    return false;
  }

  const testChipId = toStableValue(test?.panelCompanyChipId);
  const companyChipId = toStableValue(company?.chipId || company?.id);
  if (testChipId && companyChipId && testChipId === companyChipId) {
    return true;
  }

  const testPanelId = toStableValue(test?.panelCompanyId || test?.compCatId);
  const companyPanelId = toStableValue(company?.compCatId || company?.id);
  if (testPanelId && companyPanelId && testPanelId === companyPanelId) {
    return true;
  }

  const testPanelName = toStableValue(
    test?.panelCompanyName || test?.panel_company_name,
  ).toLowerCase();
  const companyPanelName = getPanelCompanyName(company).toLowerCase();

  return Boolean(testPanelName && companyPanelName && testPanelName === companyPanelName);
};

const getBillingModeFromTests = ({tests, panelCompanies, activePanelCompany}) => {
  const sourceTests = Array.isArray(tests) ? tests : [];
  const sourceCompanies = Array.isArray(panelCompanies) ? panelCompanies : [];
  const modes = [];
  const pushMode = mode => {
    if (mode && !modes.includes(mode)) {
      modes.push(mode);
    }
  };

  sourceTests.forEach(test => {
    const directMode = getTestBillingChargeMode(test);
    const matchedCompany =
      (activePanelCompany && doesTestMatchPanelCompany(test, activePanelCompany)
        ? activePanelCompany
        : null) ||
      sourceCompanies.find(company => doesTestMatchPanelCompany(test, company)) ||
      (sourceCompanies.length === 1 ? sourceCompanies[0] : null);
    const resolvedMode = directMode || getBillingChargeMode(matchedCompany);

    pushMode(resolvedMode);
  });

  sourceCompanies.forEach(company => {
    pushMode(getBillingChargeMode(company));
  });

  return modes.join(',');
};

const formatTestBookingStatusLabel = value => {
  const normalizedValue = toStableValue(value);

  if (!normalizedValue) {
    return 'None';
  }

  return normalizedValue
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, character => character.toUpperCase());
};

const getGenderBadgeConfig = gender => {
  const normalizedGender = toStableValue(gender).toLowerCase();

  if (normalizedGender.startsWith('f')) {
    return {
      label: 'Female',
      icon: 'female',
      badgeStyle: 'patientGenderBadgeFemale',
      iconStyle: 'patientGenderBadgeIconFemale',
      textStyle: 'patientGenderBadgeTextFemale',
    };
  }

  if (normalizedGender.startsWith('m')) {
    return {
      label: 'Male',
      icon: 'male',
      badgeStyle: 'patientGenderBadgeMale',
      iconStyle: 'patientGenderBadgeIconMale',
      textStyle: 'patientGenderBadgeTextMale',
    };
  }

  return {
    label: normalizedGender ? formatTestBookingStatusLabel(normalizedGender) : 'Other',
    icon: 'male-female',
    badgeStyle: 'patientGenderBadgeOther',
    iconStyle: 'patientGenderBadgeIconOther',
    textStyle: 'patientGenderBadgeTextOther',
  };
};

const getMimeTypeFromFileName = fileName => {
  const normalizedFileName = String(fileName || '').toLowerCase();

  if (normalizedFileName.endsWith('.pdf')) {
    return 'application/pdf';
  }

  if (normalizedFileName.endsWith('.jpg') || normalizedFileName.endsWith('.jpeg')) {
    return 'image/jpeg';
  }

  if (normalizedFileName.endsWith('.png')) {
    return 'image/png';
  }

  if (normalizedFileName.endsWith('.webp')) {
    return 'image/webp';
  }

  return 'application/octet-stream';
};

const formatGeoCoordinate = value => {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue.toFixed(6) : 'N/A';
};

const formatPhotoTimestamp = () => {
  const date = new Date();
  return date.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
};

const formatStoredLocationTimestamp = value => {
  const dateValue = value ? new Date(value) : null;

  if (!dateValue || Number.isNaN(dateValue.getTime())) {
    return '';
  }

  return dateValue.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
};

const normalizePickedDocuments = (pickedFiles, fileNamePrefix) =>
  (Array.isArray(pickedFiles) ? pickedFiles : [])
    .filter(file => file?.uri)
    .map((file, index) => ({
      uri: file.uri,
      name: file.name || `${fileNamePrefix}-${Date.now()}-${index}`,
      type: file.type || getMimeTypeFromFileName(file.name),
    }));

const getDocumentImageSource = document => {
  if (document?.imageSource) {
    return document.imageSource;
  }

  const uri =
    typeof document === 'string' ? toStableValue(document) : toStableValue(document?.uri);

  return uri ? {uri} : null;
};

const resolvePatientDocumentUrl = value => {
  const rawUrl = toStableValue(
    typeof value === 'string'
      ? value
      : value?.url || value?.uri || value?.path || value?.file,
  );

  if (!rawUrl) {
    return '';
  }

  if (/^https?:\/\//i.test(rawUrl)) {
    return rawUrl;
  }

  return `${PATIENT_DOCUMENT_BASE_URL}${rawUrl.replace(/^\/+/, '')}`;
};

const getDisplayNameFromUri = value => {
  const rawValue = toStableValue(value);

  if (!rawValue) {
    return '';
  }

  const withoutQuery = rawValue.split('?')[0].split('#')[0];
  const decodedValue = (() => {
    try {
      return decodeURIComponent(withoutQuery);
    } catch {
      return withoutQuery;
    }
  })();

  return decodedValue.split(/[\\/]/).filter(Boolean).pop() || rawValue;
};

const getDocumentDisplayLabel = (document, fallbackLabel) => {
  if (typeof document === 'string') {
    return getDisplayNameFromUri(document) || fallbackLabel;
  }

  return (
    toStableValue(document?.label || document?.name) ||
    getDisplayNameFromUri(document?.uri || document?.url || document?.path) ||
    fallbackLabel
  );
};

const buildApiDocumentItems = (items, labelPrefix) =>
  (Array.isArray(items) ? items : [])
    .map((item, index) => {
      const uri = resolvePatientDocumentUrl(item);

      if (!uri) {
        return null;
      }

      return {
        id: `${labelPrefix}-${uri}-${index}`,
        label: getDocumentDisplayLabel(item, `${labelPrefix} ${index + 1}`),
        documentType: labelPrefix,
        uri,
      };
    })
    .filter(Boolean);

function PatientDetailCard({
  patient,
  styles,
  onCancelBooking,
  onEditPatient,
  onPrimaryPanelCompanyPress,
  onOpenSampleCollection,
  selectedTests = [],
  selectedTestsSourceReady = false,
  onRemoveSelectedTest,
  panelCompanies = [],
  activePanelCompanyId = '',
  testBookingStatusValue = 'none',
  testBookingStatusFromCce = '',
  onTestBookingStatusChange,
  cghsEnabled = false,
  cghsIdValue = '',
  cghsDocumentsBySection = {},
  onCghsEnabledChange,
  onCghsIdChange,
  onCghsDocumentsChange,
  manualSlipDocuments: manualSlipDocumentsProp = [],
  onManualSlipDocumentsChange,
  onSelectPanelCompany,
  onRemovePanelCompany,
  paymentProofDocuments: paymentProofDocumentsProp = [],
  onPaymentProofDocumentsChange,
  requiresPaymentProof = false,
  requiresIdentityDocuments = false,
  sampleCollected = false,
  showAlert,
  isCancelBookingDisabled,
  cancelBookingLabel = 'Cancel Patient',
}) {
  const {width, height} = useWindowDimensions();
  const isNarrowCard = width < 390;
  const documentViewerWidth = Math.min(width - 40, 640);
  const documentViewerHeight = clamp(
    Math.round(height * (isNarrowCard ? 0.34 : 0.4)),
    isNarrowCard ? 260 : 320,
    420,
  );
  const [isTestBookingStatusExpanded, setIsTestBookingStatusExpanded] =
    useState(false);
  const [activeDocumentIndex, setActiveDocumentIndex] = useState(-1);
  const [activeCghsDocument, setActiveCghsDocument] = useState(null);
  const [documentZoom, setDocumentZoom] = useState(DOCUMENT_ZOOM_MIN);
  const [documentOffset, setDocumentOffset] = useState({x: 0, y: 0});
  const [cghsCameraLoadingSection, setCghsCameraLoadingSection] = useState('');
  const [paymentProofDocuments, setPaymentProofDocuments] = useState(
    Array.isArray(paymentProofDocumentsProp) ? paymentProofDocumentsProp : [],
  );
  const [manualSlipDocuments, setManualSlipDocuments] = useState(
    Array.isArray(manualSlipDocumentsProp) ? manualSlipDocumentsProp : [],
  );
  const showPatientAlert = useCallback(
    (titleOrMessage, messageOrButtons, buttonsOrOptions, options) => {
      showAlert?.(titleOrMessage, messageOrButtons, buttonsOrOptions, options);
    },
    [showAlert],
  );
  const documentGestureRef = useRef({
    mode: 'idle',
    startDistance: 0,
    startZoom: DOCUMENT_ZOOM_MIN,
    startOffset: {x: 0, y: 0},
    startTouch: {x: 0, y: 0},
  });
  const bookingPatientStatusCode = Number(patient.bookingPatientStatusCode || 0);
  const patientStatusLabel =
    bookingPatientStatusCode === 3
      ? 'Complete'
      : bookingPatientStatusCode === 4
      ? 'Cancelled'
      : bookingPatientStatusCode === 5
      ? 'Partial Complete'
      : '';
  const activePanelCompany = useMemo(() => {
    if (!panelCompanies.length) {
      return null;
    }

    const activeCompany = panelCompanies.find(
      company =>
        String(activePanelCompanyId) === String(company.chipId || company.id),
    );

    return activeCompany || panelCompanies[0];
  }, [activePanelCompanyId, panelCompanies]);
  const paymentSourceTests =
    selectedTestsSourceReady && selectedTests.length
      ? selectedTests
      : patient?.tests || [];
  const paymentBillingMode =
    getBillingModeFromTests({
      tests: paymentSourceTests,
      panelCompanies,
      activePanelCompany,
    }) ||
    (paymentSourceTests.length ? getFirstBillingChargeMode(panelCompanies) : '');
  const paymentDisplayLabel = getPaymentLabelFromBillingMode(paymentBillingMode);
  const shouldShowPaymentProofUpload = false;
  const shouldHighlightPaymentProofRequired = requiresPaymentProof;
  const shouldShowManualSlipUpload = testBookingStatusValue === MANUAL_HC_SLIP_STATUS;
  const genderBadge = getGenderBadgeConfig(patient.gender);
  const labmatePid = toStableValue(patient.labmatePid || patient.labmate_pid);
  const cceTestBookingStatusLabel = toStableValue(testBookingStatusFromCce)
    ? formatTestBookingStatusLabel(testBookingStatusFromCce)
    : '';
  const selectedTestBookingStatus =
    TEST_BOOKING_STATUS_OPTIONS.find(
      option => option.value === testBookingStatusValue,
    ) || TEST_BOOKING_STATUS_OPTIONS[0];

  const renderConditionalFieldLabel = useCallback(
    label =>
      label ? (
        <RequiredLabel styles={styles}>{label}</RequiredLabel>
      ) : null,
    [styles],
  );

  useEffect(() => {
    setPaymentProofDocuments(
      Array.isArray(paymentProofDocumentsProp) ? paymentProofDocumentsProp : [],
    );
  }, [paymentProofDocumentsProp]);
  useEffect(() => {
    setManualSlipDocuments(
      Array.isArray(manualSlipDocumentsProp) ? manualSlipDocumentsProp : [],
    );
  }, [manualSlipDocumentsProp]);
  const displayTests = useMemo(() => {
    if (selectedTestsSourceReady) {
      return dedupeSelectedTests(selectedTests).map(test => ({
        id: test.key,
        code: test.booked_code || 'N/A',
        name: test.description || 'Unnamed Test',
        tat: test.tat || test.TAT || test.turnaroundTime || test.turnaround_time || '',
        isAppAdded: true,
        removeKey: test.key,
        panelCompanyName: test.panelCompanyName || '',
        panelCompanyId: test.panelCompanyId || '',
        parentDescription: test.parentDescription || '',
        mrp: Number(test?.mrp || test?.charge || 0) || 0,
        charge: getDisplayTestPrice(test),
        percentageonstandard: getStandardDiscountPercent(test),
      }));
    }

    return (Array.isArray(patient.tests) ? patient.tests : []).map((test, index) => ({
      id: `${test.id || 'test'}-${test.code || 'na'}-${index}`,
      code: test.code || 'N/A',
      name: test.name || 'Unnamed Test',
      tat: test.tat || test.TAT || test.turnaroundTime || test.turnaround_time || '',
      isAppAdded: false,
      removeKey: '',
      panelCompanyName: '',
      panelCompanyId: '',
      parentDescription: '',
      mrp: Number(test?.mrp || test?.charge || test?.amount || 0) || 0,
      charge: getDisplayTestPrice(test),
      percentageonstandard: getStandardDiscountPercent(test),
    }));
  }, [
    patient.tests,
    selectedTests,
    selectedTestsSourceReady,
  ]);
  const normalizedDocuments = [
    ...(Array.isArray(patient.documents) ? patient.documents : []),
    ...buildApiDocumentItems(
      patient.patientDocumentUrls || patient.patient_document_urls,
      'Patient Document',
    ),
    ...buildApiDocumentItems(
      patient.prescriptionUrls || patient.prescription_urls,
      'Prescription',
    ),
    ...(Array.isArray(cghsDocumentsBySection.patientPhotos)
      ? cghsDocumentsBySection.patientPhotos.map((document, index) => ({
          ...document,
          label:
            document?.label || document?.name || `Patient Photo ${index + 1}`,
          documentType: 'Patient Photo',
          canRemove: true,
          documentSource: 'cghs',
          documentSectionKey: 'patientPhotos',
          documentSourceIndex: index,
        }))
      : []),
    ...(Array.isArray(cghsDocumentsBySection.cghsCard)
      ? cghsDocumentsBySection.cghsCard.map((document, index) => ({
          ...document,
          label: document?.label || document?.name || `CGHS Card ${index + 1}`,
          documentType: 'CGHS Card',
          canRemove: true,
          documentSource: 'cghs',
          documentSectionKey: 'cghsCard',
          documentSourceIndex: index,
        }))
      : []),
    ...(Array.isArray(paymentProofDocuments)
      ? paymentProofDocuments.map((document, index) => ({
          ...document,
          label:
            document?.label || document?.name || `Prescription ${index + 1}`,
          documentType: 'Prescription',
          canRemove: true,
          documentSource: 'prescription',
          documentSourceIndex: index,
        }))
      : []),
  ]
    .map((document, index) => {
      const imageSource = getDocumentImageSource(document);

      if (!imageSource) {
        return null;
      }

      return {
        ...document,
        id: String(document?.id || document?.uri || document || `document-${index}`),
        label: getDocumentDisplayLabel(document, `Document ${index + 1}`),
        documentType: toStableValue(document?.documentType) || 'Document',
        imageSource,
      };
    })
    .filter(Boolean);
  const activeDocument =
    activeDocumentIndex >= 0 ? normalizedDocuments[activeDocumentIndex] : null;
  const viewerDocument = activeCghsDocument || activeDocument;
  const documentViewerTests = useMemo(
    () =>
      displayTests.map(test => ({
        id: test.id,
        label: `${test.name}`,
      })),
    [displayTests],
  );
  const clampDocumentOffset = useCallback((zoom, offset) => {
    if (zoom <= DOCUMENT_ZOOM_MIN) {
      return {x: 0, y: 0};
    }

    const maxOffsetX = (documentViewerWidth * (zoom - 1)) / 2;
    const maxOffsetY = (documentViewerHeight * (zoom - 1)) / 2;

    return {
      x: clamp(offset.x, -maxOffsetX, maxOffsetX),
      y: clamp(offset.y, -maxOffsetY, maxOffsetY),
    };
  }, [documentViewerHeight, documentViewerWidth]);

  const handleOpenDocument = index => {
    setDocumentZoom(DOCUMENT_ZOOM_MIN);
    setDocumentOffset({x: 0, y: 0});
    setActiveCghsDocument(null);
    setActiveDocumentIndex(index);
  };
  const handleOpenCghsDocument = document => {
    const imageSource = getDocumentImageSource(document);

    if (!imageSource) {
      return;
    }

    setDocumentZoom(DOCUMENT_ZOOM_MIN);
    setDocumentOffset({x: 0, y: 0});
    setActiveDocumentIndex(-1);
    setActiveCghsDocument({
      label: document?.name || 'Patient photo',
      documentType: document?.documentType || 'Document',
      imageSource,
    });
  };
  const handleCloseDocumentViewer = () => {
    setActiveDocumentIndex(-1);
    setActiveCghsDocument(null);
    setDocumentZoom(DOCUMENT_ZOOM_MIN);
    setDocumentOffset({x: 0, y: 0});
  };
  const handleNavigateDocument = direction => {
    setDocumentZoom(DOCUMENT_ZOOM_MIN);
    setDocumentOffset({x: 0, y: 0});
    setActiveDocumentIndex(previousIndex => {
      if (!normalizedDocuments.length) {
        return -1;
      }

      const nextIndex =
        (previousIndex + direction + normalizedDocuments.length) %
        normalizedDocuments.length;
      return nextIndex;
    });
  };
  const handleDocumentTouchStart = event => {
    const touches = event.nativeEvent.touches || [];
    const [touch] = touches;
    const startDistance = getTouchDistance(touches);

    documentGestureRef.current = {
      mode:
        touches.length >= 2 && startDistance > 0
          ? 'pinch'
          : documentZoom > DOCUMENT_ZOOM_MIN && touch
          ? 'pan'
          : 'idle',
      startDistance,
      startZoom: documentZoom,
      startOffset: documentOffset,
      startTouch: touch ? {x: touch.pageX, y: touch.pageY} : {x: 0, y: 0},
    };
  };
  const handleDocumentTouchMove = event => {
    const touches = event.nativeEvent.touches || [];
    const [touch] = touches;
    const gesture = documentGestureRef.current;

    if (touches.length >= 2 && gesture.mode !== 'pinch') {
      const startDistance = getTouchDistance(touches);
      documentGestureRef.current = {
        ...gesture,
        mode: startDistance > 0 ? 'pinch' : 'idle',
        startDistance,
        startZoom: documentZoom,
        startOffset: documentOffset,
      };
      return;
    }

    if (touches.length >= 2 && gesture.mode === 'pinch') {
      const currentDistance = getTouchDistance(touches);
      if (!gesture.startDistance || !currentDistance) {
        return;
      }

      const nextZoom = clamp(
        Number(
          (
            gesture.startZoom *
            (currentDistance / gesture.startDistance)
          ).toFixed(2),
        ),
        DOCUMENT_ZOOM_MIN,
        DOCUMENT_ZOOM_MAX,
      );

      setDocumentZoom(nextZoom);
      setDocumentOffset(previousOffset =>
        clampDocumentOffset(nextZoom, previousOffset),
      );
      return;
    }

    if (
      touches.length === 1 &&
      touch &&
      documentZoom > DOCUMENT_ZOOM_MIN &&
      gesture.mode !== 'pan'
    ) {
      documentGestureRef.current = {
        ...gesture,
        mode: 'pan',
        startZoom: documentZoom,
        startOffset: documentOffset,
        startTouch: {x: touch.pageX, y: touch.pageY},
      };
      return;
    }

    if (
      touches.length !== 1 ||
      !touch ||
      gesture.mode !== 'pan' ||
      documentZoom <= DOCUMENT_ZOOM_MIN
    ) {
      return;
    }

    const nextOffset = clampDocumentOffset(documentZoom, {
      x: gesture.startOffset.x + touch.pageX - gesture.startTouch.x,
      y: gesture.startOffset.y + touch.pageY - gesture.startTouch.y,
    });
    setDocumentOffset(nextOffset);
  };
  const handleDocumentTouchEnd = () => {
    if (documentZoom <= DOCUMENT_ZOOM_MIN) {
      setDocumentOffset({x: 0, y: 0});
      documentGestureRef.current.mode = 'idle';
      return;
    }

    setDocumentOffset(previousOffset =>
      clampDocumentOffset(documentZoom, previousOffset),
    );
    documentGestureRef.current.mode = 'idle';
  };
  const appendPaymentProofDocuments = useCallback(
    pickedDocuments => {
      if (!pickedDocuments.length) {
        return;
      }

      setPaymentProofDocuments(previousDocuments => {
        const nextDocuments = [...previousDocuments, ...pickedDocuments];
        onPaymentProofDocumentsChange?.(patient, nextDocuments);
        return nextDocuments;
      });
    },
    [onPaymentProofDocumentsChange, patient],
  );
  const appendManualSlipDocuments = useCallback(
    pickedDocuments => {
      if (!pickedDocuments.length) {
        return;
      }

      setManualSlipDocuments(previousDocuments => {
        const nextDocuments = [...previousDocuments, ...pickedDocuments];
        onManualSlipDocumentsChange?.(patient, nextDocuments);
        return nextDocuments;
      });
    },
    [onManualSlipDocumentsChange, patient],
  );
  const pickDocumentsFromDevice = useCallback(
    async ({fileNamePrefix, onDocumentsPicked, emptyMessage, failureMessage}) => {
      if (!LocalDocumentPickerModule?.pickDocuments) {
        showPatientAlert(
          'Upload Not Available',
          'Document picker module is not available in this build.',
        );
        return;
      }

      try {
        const pickedFiles = await LocalDocumentPickerModule.pickDocuments();
        const pickedDocuments = normalizePickedDocuments(
          pickedFiles,
          fileNamePrefix,
        );

        if (!pickedDocuments.length) {
          return;
        }

        onDocumentsPicked(pickedDocuments);
      } catch (error) {
        if (
          error?.code === 'DOCUMENT_PICKER_CANCELLED' ||
          String(error?.message || '').toLowerCase().includes('cancel')
        ) {
          return;
        }

        showPatientAlert('Upload Failed', failureMessage || emptyMessage);
      }
    },
    [showPatientAlert],
  );
  const captureDocumentFromCamera = useCallback(
    async ({
      documentLabel,
      fileNamePrefix,
      onDocumentsPicked,
      requireLocationMeta = false,
      onCaptureStart,
      onCaptureEnd,
    }) => {
      if (!LocalGeoCameraModule?.captureStampedPhoto) {
        showPatientAlert(
          'Camera Not Available',
          'Geo camera module is not available in this build.',
        );
        return;
      }

      onCaptureStart?.();

      try {
        let location = null;
        let addressText = '';
        let locationStatusLabel = '';
        let fallbackLocationTimestamp = '';

        if (requireLocationMeta && Platform.OS === 'android') {
          const granted = await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          );

          if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
            showPatientAlert(
              'Location Required',
              'Location permission is required to capture this photo.',
            );
            return;
          }
        }

        if (requireLocationMeta) {
          let lastKnownGeoCapture = null;

          try {
            location = await GetLocation.getCurrentPosition({
              enableHighAccuracy: true,
              timeout: 20000,
            });
            locationStatusLabel = 'Live GPS';

            try {
              const address = await getAddressFromCoords(
                location.latitude,
                location.longitude,
              );
              addressText = address?.fullAddress || address?.displayName || '';
            } catch {
              addressText = '';
            }

            if (addressText) {
              await persistLastKnownGeoCapture({
                latitude: location.latitude,
                longitude: location.longitude,
                addressText,
              });
            } else {
              lastKnownGeoCapture = await getLastKnownGeoCapture();

              if (lastKnownGeoCapture?.addressText) {
                addressText = lastKnownGeoCapture.addressText;
                locationStatusLabel = 'Live GPS + last known address';
                fallbackLocationTimestamp = formatStoredLocationTimestamp(
                  lastKnownGeoCapture.capturedAt,
                );
              }
            }
          } catch {
            lastKnownGeoCapture = await getLastKnownGeoCapture();

            if (!lastKnownGeoCapture) {
              showPatientAlert(
                'Location Unavailable',
                'Unable to get live or last known location for this photo. Please enable GPS and try again.',
              );
              return;
            }

            location = {
              latitude: lastKnownGeoCapture.latitude,
              longitude: lastKnownGeoCapture.longitude,
            };
            addressText = lastKnownGeoCapture.addressText || '';
            locationStatusLabel = 'Last known location fallback';
            fallbackLocationTimestamp = formatStoredLocationTimestamp(
              lastKnownGeoCapture.capturedAt,
            );
          }
        }

        const stampText = [
          `Patient: ${patient?.name || 'N/A'}`,
          `Document: ${documentLabel || 'Document'}`,
          locationStatusLabel ? `Location Status: ${locationStatusLabel}` : '',
          location
            ? `Lat: ${formatGeoCoordinate(location.latitude)}, Long: ${formatGeoCoordinate(
                location.longitude,
              )}`
            : '',
          addressText ? `Address: ${addressText}` : '',
          fallbackLocationTimestamp
            ? `Last Known Captured: ${fallbackLocationTimestamp}`
            : '',
          `Time: ${formatPhotoTimestamp()}`,
        ]
          .filter(Boolean)
          .join('\n');
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

        showPatientAlert(
          'Camera Failed',
          'Unable to capture a photo right now. Please try again.',
        );
      } finally {
        onCaptureEnd?.();
      }
    },
    [patient?.name, showPatientAlert],
  );
  const openUploadSourceOptions = useCallback(
    ({title, onCameraPress, onGalleryPress}) => {
      showPatientAlert(title, 'Choose how to add this file.', [
        {text: 'Camera', onPress: onCameraPress},
        {text: 'Gallery', onPress: onGalleryPress},
        {text: 'Cancel', style: 'cancel'},
      ]);
    },
    [showPatientAlert],
  );

  useEffect(() => {
    if (!shouldShowManualSlipUpload && manualSlipDocuments.length) {
      setManualSlipDocuments(EMPTY_MANUAL_SLIP_DOCUMENTS);
      onManualSlipDocumentsChange?.(patient, EMPTY_MANUAL_SLIP_DOCUMENTS);
    }
  }, [
    manualSlipDocuments.length,
    onManualSlipDocumentsChange,
    patient,
    shouldShowManualSlipUpload,
  ]);

  const handlePickPaymentProofDocuments = async () => {
    openUploadSourceOptions({
      title: 'Prescription',
      onCameraPress: () =>
        captureDocumentFromCamera({
          documentLabel: 'Prescription',
          fileNamePrefix: 'prescription',
          onDocumentsPicked: appendPaymentProofDocuments,
        }),
      onGalleryPress: () =>
        pickDocumentsFromDevice({
          fileNamePrefix: 'payment-proof',
          onDocumentsPicked: appendPaymentProofDocuments,
          failureMessage: 'Unable to select documents right now. Please try again.',
        }),
    });
  };
  const handleRemovePaymentProofDocument = indexToRemove => {
    setPaymentProofDocuments(previousDocuments => {
      const nextDocuments = previousDocuments.filter(
        (_, index) => index !== indexToRemove,
      );
      onPaymentProofDocumentsChange?.(patient, nextDocuments);
      return nextDocuments;
    });
  };
  const handlePickManualSlipDocuments = async () => {
    openUploadSourceOptions({
      title: 'Manual HC Slip',
      onCameraPress: () =>
        captureDocumentFromCamera({
          documentLabel: 'Manual HC Slip',
          fileNamePrefix: 'manual-hc-slip',
          onDocumentsPicked: appendManualSlipDocuments,
        }),
      onGalleryPress: () =>
        pickDocumentsFromDevice({
          fileNamePrefix: 'manual-hc-slip',
          onDocumentsPicked: appendManualSlipDocuments,
          failureMessage: 'Unable to select documents right now. Please try again.',
        }),
    });
  };
  const handleRemoveManualSlipDocument = indexToRemove => {
    setManualSlipDocuments(previousDocuments => {
      const nextDocuments = previousDocuments.filter(
        (_, index) => index !== indexToRemove,
      );
      onManualSlipDocumentsChange?.(patient, nextDocuments);
      return nextDocuments;
    });
  };
  const appendCghsDocuments = useCallback(
    (sectionKey, pickedDocuments) => {
      if (!pickedDocuments.length) {
        return;
      }

      onCghsDocumentsChange?.(patient, sectionKey, [
        ...(cghsDocumentsBySection[sectionKey] || []),
        ...pickedDocuments,
      ]);
    },
    [cghsDocumentsBySection, onCghsDocumentsChange, patient],
  );
  const handleUploadCghsDocuments = async sectionKey => {
    pickDocumentsFromDevice({
      fileNamePrefix: `cghs-document-${sectionKey}`,
      onDocumentsPicked: pickedDocuments =>
        appendCghsDocuments(sectionKey, pickedDocuments),
      failureMessage: 'Unable to select documents right now. Please try again.',
    });
  };
  const handlePickCghsDocuments = sectionKey => {
    const sectionLabel =
      sectionKey === 'patientPhotos' ? 'Patient Photo' : 'CGHS Card';

    openUploadSourceOptions({
      title: sectionLabel,
      onCameraPress: () =>
        captureDocumentFromCamera({
          documentLabel: sectionLabel,
          fileNamePrefix:
            sectionKey === 'patientPhotos' ? 'patient-photo' : 'cghs-card',
          requireLocationMeta: sectionKey === 'patientPhotos',
          onCaptureStart:
            sectionKey === 'patientPhotos'
              ? () => setCghsCameraLoadingSection(sectionKey)
              : undefined,
          onCaptureEnd:
            sectionKey === 'patientPhotos'
              ? () => setCghsCameraLoadingSection('')
              : undefined,
          onDocumentsPicked: pickedDocuments =>
            appendCghsDocuments(sectionKey, pickedDocuments),
        }),
      onGalleryPress: () => handleUploadCghsDocuments(sectionKey),
    });
  };
  const handleUploadPatientInfoDocument = () => {
    const uploadOptions = [];

    if (typeof onCghsDocumentsChange === 'function') {
      uploadOptions.push(
        {
          text: 'CGHS Card',
          onPress: () => handlePickCghsDocuments('cghsCard'),
        },
        {
          text: 'Patient Photo',
          onPress: () => handlePickCghsDocuments('patientPhotos'),
        },
      );
    }

    if (typeof onPaymentProofDocumentsChange === 'function') {
      uploadOptions.push({
        text: 'Prescription',
        onPress: handlePickPaymentProofDocuments,
      });
    }

    if (!uploadOptions.length) {
      showPatientAlert(
        'Upload Not Available',
        'Document upload is not available for this patient.',
      );
      return;
    }

    showPatientAlert('Upload Document', 'Choose document type.', [
      ...uploadOptions,
      {text: 'Cancel', style: 'cancel'},
    ]);
  };
  const handleRemoveCghsDocument = (sectionKey, indexToRemove) => {
    const nextDocuments = (cghsDocumentsBySection[sectionKey] || []).filter(
      (_, index) => index !== indexToRemove,
    );
    onCghsDocumentsChange?.(patient, sectionKey, nextDocuments);
  };
  const handleRemovePatientInfoDocument = document => {
    if (document?.documentSource === 'cghs') {
      handleRemoveCghsDocument(
        document.documentSectionKey,
        document.documentSourceIndex,
      );
      return;
    }

    if (document?.documentSource === 'prescription') {
      handleRemovePaymentProofDocument(document.documentSourceIndex);
    }
  };
  const handleCallPatientNumber = async phoneNumber => {
    const dialableNumber = getDialablePhoneNumber(phoneNumber);

    if (!dialableNumber) {
      return;
    }

    try {
      await Linking.openURL(`tel:${dialableNumber}`);
    } catch (error) {
      showPatientAlert('Call Failed', 'Unable to open the phone dialer right now.');
    }
  };

  return (
    <>
      <View style={styles.patientDetailCard}>
        <View
          style={[
            styles.patientDetailTopRow,
            isNarrowCard && styles.patientDetailTopRowStacked,
          ]}>
          <View style={styles.patientDetailHeaderText}>
            <Text style={styles.patientDetailName}>
              {patient.title} {patient.name}
            </Text>
            <Text style={styles.patientDetailSubText}>
              {patient.age} yrs | DOB {patient.dob}
            </Text>
            <View style={styles.patientQuickChipRow}>
              <View
                style={[
                  styles.patientGenderBadge,
                  styles[genderBadge.badgeStyle],
                ]}>
                <Ionicons
                  name={genderBadge.icon}
                  size={13}
                  style={[
                    styles.patientGenderBadgeIcon,
                    styles[genderBadge.iconStyle],
                  ]}
                />
                <Text
                  style={[
                    styles.patientGenderBadgeText,
                    styles[genderBadge.textStyle],
                  ]}>
                  {genderBadge.label}
                </Text>
              </View>
              {labmatePid ? (
                <View style={styles.patientInfoPill}>
                  <Text style={styles.patientInfoPillText} numberOfLines={1}>
                    Labmate PID: {labmatePid}
                  </Text>
                </View>
              ) : null}
              {patient.tag ? (
                <View style={styles.patientTagHighlightChip}>
                  <Ionicons
                    name="pricetag-outline"
                    size={12}
                    style={styles.patientTagHighlightIcon}
                  />
                  <Text style={styles.patientTagHighlightText} numberOfLines={1}>
                    {patient.tag}
                  </Text>
                </View>
              ) : null}
            </View>
          </View>
          <View
            style={[
              styles.patientHeaderActionStack,
              isNarrowCard && styles.patientHeaderActionStackInline,
            ]}>
            <View style={styles.patientHeaderActionRow}>
              {onEditPatient ? (
                <TouchableOpacity
                  activeOpacity={0.85}
                  style={styles.patientEditButton}
                  onPress={() => onEditPatient(patient)}>
                  <Ionicons
                    name="create-outline"
                    size={17}
                    style={styles.patientEditButtonIcon}
                  />
                </TouchableOpacity>
              ) : null}
            </View>
            <View style={styles.patientBadgeStack}>
              {patientStatusLabel ? (
                <View
                  style={[
                    styles.patientStatusBadge,
                    bookingPatientStatusCode === 3 &&
                      styles.patientStatusBadgeComplete,
                    bookingPatientStatusCode === 4 &&
                      styles.patientStatusBadgeCancelled,
                    bookingPatientStatusCode === 5 &&
                      styles.patientStatusBadgeComplete,
                  ]}>
                  <Text
                    style={[
                      styles.patientStatusBadgeText,
                      bookingPatientStatusCode === 3 &&
                        styles.patientStatusBadgeTextComplete,
                      bookingPatientStatusCode === 4 &&
                        styles.patientStatusBadgeTextCancelled,
                      bookingPatientStatusCode === 5 &&
                        styles.patientStatusBadgeTextComplete,
                    ]}>
                    {patientStatusLabel}
                  </Text>
                </View>
              ) : null}
            </View>
          </View>
        </View>
      {onCancelBooking || sampleCollected ? (
        <View style={styles.patientTopActionRow}>
          {sampleCollected ? (
            <View style={styles.patientCollectedInlineBadge}>
              <Text style={styles.patientCollectedInlineBadgeText}>
                Sample Collected
              </Text>
            </View>
          ) : null}
          {onCancelBooking ? (
            <TouchableOpacity
              activeOpacity={0.85}
              style={[
                styles.patientCancelBookingButton,
                isCancelBookingDisabled && styles.patientCancelBookingButtonDisabled,
              ]}
              onPress={() => onCancelBooking(patient)}
              disabled={isCancelBookingDisabled}>
              <Ionicons
                name="close-circle-outline"
                size={15}
                style={styles.patientCancelBookingButtonIcon}
              />
              <Text style={styles.patientCancelBookingButtonText}>
                {cancelBookingLabel}
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}
      <View style={styles.patientDetailMetaStrip}>
        <TouchableOpacity
          activeOpacity={0.75}
          style={[
            styles.patientDetailMetaItem,
            isNarrowCard && styles.patientDetailMetaItemStacked,
          ]}
          disabled={!getDialablePhoneNumber(patient.mobileNumber)}
          onPress={() => handleCallPatientNumber(patient.mobileNumber)}>
          <Text style={styles.patientDetailMetaLabel}>Mobile</Text>
          <Text
            style={[
              styles.patientDetailMetaValue,
              getDialablePhoneNumber(patient.mobileNumber) &&
                styles.patientPhoneLinkText,
            ]}
            numberOfLines={1}>
            {patient.mobileNumber}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          activeOpacity={0.75}
          style={[
            styles.patientDetailMetaItem,
            isNarrowCard && styles.patientDetailMetaItemStacked,
          ]}
          disabled={!getDialablePhoneNumber(patient.alternateMobileNumber)}
          onPress={() => handleCallPatientNumber(patient.alternateMobileNumber)}>
          <Text style={styles.patientDetailMetaLabel}>Alternate</Text>
          <Text
            style={[
              styles.patientDetailMetaValue,
              getDialablePhoneNumber(patient.alternateMobileNumber) &&
                styles.patientPhoneLinkText,
            ]}
            numberOfLines={1}>
            {patient.alternateMobileNumber}
          </Text>
        </TouchableOpacity>
      </View>
      <View style={styles.patientDetailMetaStrip}>
        <View
          style={[
            styles.patientDetailMetaItem,
            styles.patientDetailMetaItemFull,
            isNarrowCard && styles.patientDetailMetaItemStacked,
          ]}>
          <Text style={styles.patientDetailMetaLabel}>Referred By</Text>
          <Text style={styles.patientDetailMetaValue}>
            {patient.referredBy || 'N/A'}
          </Text>
        </View>
        <View
          style={[
            styles.patientDetailMetaItem,
            styles.patientDetailMetaItemFull,
            isNarrowCard && styles.patientDetailMetaItemStacked,
          ]}>
          <Text style={styles.patientDetailMetaLabel}>Internal Referenced By</Text>
          <Text style={styles.patientDetailMetaValue}>
            {patient.internalReferencedBy || 'N/A'}
          </Text>
        </View>
      </View>
      {false ? (
        <View style={styles.patientCghsSection}>
          <TouchableOpacity
            activeOpacity={0.85}
            style={styles.patientCghsToggleRow}
            onPress={() => onCghsEnabledChange?.(patient, !cghsEnabled)}
            disabled={typeof onCghsEnabledChange !== 'function'}>
            <View
              style={[
                styles.patientCghsCheckbox,
                cghsEnabled && styles.patientCghsCheckboxActive,
              ]}>
              {cghsEnabled ? (
                <Ionicons
                  name="checkmark"
                  size={14}
                  style={styles.patientCghsCheckboxIcon}
                />
              ) : null}
            </View>
            <View style={styles.patientCghsToggleTextWrap}>
              <Text style={styles.patientCghsToggleTitle}>CGHS / CAPF</Text>
              <Text style={styles.patientCghsToggleHint}>
                Enable when this patient needs CGHS details
              </Text>
            </View>
          </TouchableOpacity>

          {cghsEnabled ? (
            <View style={styles.patientCghsInputBlock}>
              <Text style={styles.cghsFieldLabel}>CGHS ID / CAPF ID</Text>
              <TextInput
                value={cghsIdValue}
                onChangeText={nextValue => onCghsIdChange?.(patient, nextValue)}
                placeholder="Enter CGHS ID"
                placeholderTextColor="#7A7F87"
                autoCapitalize="characters"
                style={styles.cghsTextInput}
                editable={typeof onCghsIdChange === 'function'}
              />

              <View style={styles.patientCghsDocumentSectionList}>
                {CGHS_DOCUMENT_SECTIONS.map(section => {
                  const sectionDocuments =
                    cghsDocumentsBySection[section.key] || [];

                  return (
                    <View
                      key={section.key}
                      style={styles.patientCghsDocumentSection}>
                      <View style={styles.patientCghsDocumentHeader}>
                        <Text style={styles.patientCghsDocumentLabel}>
                          {section.label}
                          {requiresIdentityDocuments ? (
                            <Text style={styles.requiredFieldAsterisk}> *</Text>
                          ) : null}
                        </Text>
                        {sectionDocuments.length ? (
                          <Text style={styles.patientCghsDocumentCount}>
                            {sectionDocuments.length}
                          </Text>
                        ) : null}
                        <TouchableOpacity
                          activeOpacity={0.85}
                          style={[
                            styles.patientCghsUploadButton,
                            cghsCameraLoadingSection === section.key &&
                              styles.patientCghsUploadButtonDisabled,
                          ]}
                          onPress={() => handlePickCghsDocuments(section.key)}
                          disabled={
                            typeof onCghsDocumentsChange !== 'function' ||
                            cghsCameraLoadingSection === section.key
                          }>
                          {cghsCameraLoadingSection === section.key ? (
                            <ActivityIndicator color="#FFFFFF" size="small" />
                          ) : (
                            <Ionicons
                              name="cloud-upload-outline"
                              size={14}
                              style={styles.patientCghsUploadButtonIcon}
                            />
                          )}
                          <Text style={styles.patientCghsUploadButtonText}>
                            {cghsCameraLoadingSection === section.key
                              ? 'Opening...'
                              : 'Upload'}
                          </Text>
                        </TouchableOpacity>
                      </View>

                      {sectionDocuments.length ? (
                        <View style={styles.patientCghsDocumentList}>
                          {sectionDocuments.map((document, index) => (
                            <TouchableOpacity
                              key={`${section.key}-${document.uri}-${index}`}
                              activeOpacity={0.85}
                              style={styles.patientCghsDocumentItem}
                              onPress={() => handleOpenCghsDocument(document)}>
                              <Ionicons
                                name={
                                  section.key === 'patientPhotos'
                                    ? 'image-outline'
                                    : 'document-attach-outline'
                                }
                                size={14}
                                style={styles.patientCghsDocumentIcon}
                              />
                              <Text
                                style={styles.patientCghsDocumentName}
                                numberOfLines={1}>
                                {document.name}
                              </Text>
                              <TouchableOpacity
                                activeOpacity={0.85}
                                style={styles.patientCghsDocumentRemoveButton}
                                onPress={() =>
                                  handleRemoveCghsDocument(section.key, index)
                                }>
                                <Ionicons
                                  name="close"
                                  size={12}
                                  style={styles.patientCghsDocumentRemoveIcon}
                                />
                              </TouchableOpacity>
                            </TouchableOpacity>
                          ))}
                        </View>
                      ) : null}
                    </View>
                  );
                })}
              </View>
            </View>
          ) : null}
        </View>
      ) : null}
      {cceTestBookingStatusLabel ? (
        <View style={styles.patientCceStatusRow}>
          <Text style={styles.patientCceStatusLabel}>
            Test booking status from CCE
          </Text>
          <Text style={styles.patientCceStatusValue}>
            {cceTestBookingStatusLabel}
          </Text>
        </View>
      ) : null}
      <View
        style={[
          styles.patientDetailInfoRow,
          isNarrowCard && styles.patientDetailInfoRowStacked,
        ]}>
        <RequiredLabel styles={styles}>Test booking status</RequiredLabel>
        <View
          style={[
            styles.patientTestBookingStatusControl,
            isNarrowCard && styles.patientTestBookingStatusControlStacked,
          ]}>
          <TouchableOpacity
            activeOpacity={0.85}
            style={[
              styles.patientTestBookingStatusOption,
              styles.patientTestBookingStatusOptionActive,
            ]}
            disabled={typeof onTestBookingStatusChange !== 'function'}
            onPress={() =>
              setIsTestBookingStatusExpanded(previousValue => !previousValue)
            }>
            <Ionicons
              name={selectedTestBookingStatus.icon}
              size={16}
              style={[
                styles.patientTestBookingStatusIcon,
                styles.patientTestBookingStatusIconActive,
              ]}
            />
            <Text
              style={[
                styles.patientTestBookingStatusText,
                styles.patientTestBookingStatusTextActive,
              ]}>
              {selectedTestBookingStatus.label}
            </Text>
            <Ionicons
              name={
                isTestBookingStatusExpanded ? 'chevron-up' : 'chevron-down'
              }
              size={16}
              style={styles.patientTestBookingStatusChevron}
            />
          </TouchableOpacity>

          {isTestBookingStatusExpanded ? (
            <View style={styles.patientTestBookingStatusOptionList}>
              {TEST_BOOKING_STATUS_OPTIONS.filter(
                option => option.value !== selectedTestBookingStatus.value,
              ).map(option => (
                <TouchableOpacity
                  key={option.value}
                  activeOpacity={0.85}
                  style={styles.patientTestBookingStatusOption}
                  onPress={() => {
                    onTestBookingStatusChange?.(patient, option.value);
                    setIsTestBookingStatusExpanded(false);
                  }}>
                  <Ionicons
                    name={option.icon}
                    size={16}
                    style={styles.patientTestBookingStatusIcon}
                  />
                  <Text style={styles.patientTestBookingStatusText}>
                    {option.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : null}
        </View>
      </View>
      {shouldShowManualSlipUpload ? (
        <View style={styles.patientPaymentProofSection}>
          {renderConditionalFieldLabel('Upload manual slip')}
          <TouchableOpacity
            activeOpacity={0.85}
            style={styles.completeUploadBox}
            onPress={handlePickManualSlipDocuments}>
            <View style={styles.completeUploadIconWrap}>
              <Ionicons
                name="cloud-upload-outline"
                size={22}
                style={styles.completeUploadIcon}
              />
            </View>
            <View style={styles.completeUploadTextWrap}>
              <Text style={styles.completeUploadTitle}>Upload manual HC slip</Text>
              <Text style={styles.completeUploadHint}>
                Required to complete this booking
              </Text>
            </View>
            <Ionicons
              name="chevron-forward"
              size={18}
              style={styles.completeUploadChevron}
            />
          </TouchableOpacity>

          {manualSlipDocuments.length ? (
            <View style={styles.completeProofList}>
              {manualSlipDocuments.map((document, index) => (
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
                    onPress={() => handleRemoveManualSlipDocument(index)}>
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
      <View
        style={[
          styles.patientDetailInfoRow,
          isNarrowCard && styles.patientDetailInfoRowStacked,
        ]}>
        <Text style={styles.patientDetailLabel}>Payment</Text>
        <View
          style={[
            styles.patientPaymentReadOnlyWrap,
            isNarrowCard && styles.patientPaymentReadOnlyWrapStacked,
          ]}>
          <View
            style={[
              styles.patientPaymentReadOnlyChip,
              shouldHighlightPaymentProofRequired &&
                styles.patientPaymentReadOnlyChipCredit,
            ]}>
            <Text
              style={[
                styles.patientPaymentReadOnlyText,
                shouldHighlightPaymentProofRequired &&
                  styles.patientPaymentReadOnlyTextCredit,
              ]}>
              {paymentDisplayLabel}
            </Text>
          </View>
        </View>
      </View>
      {shouldShowPaymentProofUpload ? (
        <View style={styles.patientPaymentProofSection}>
          {renderConditionalFieldLabel('Billing Proof / Prescription')}
          <TouchableOpacity
            activeOpacity={0.85}
            style={styles.completeUploadBox}
            onPress={handlePickPaymentProofDocuments}>
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
                Billing proof or prescription
              </Text>
            </View>
            <Ionicons
              name="chevron-forward"
              size={18}
              style={styles.completeUploadChevron}
            />
          </TouchableOpacity>

          {paymentProofDocuments.length ? (
            <View style={styles.completeProofList}>
              {paymentProofDocuments.map((document, index) => (
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
                    onPress={() => handleRemovePaymentProofDocument(index)}>
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
      <PatientDocumentsList
        styles={styles}
        documents={normalizedDocuments}
        isNarrow={isNarrowCard}
        onOpenDocument={handleOpenDocument}
        onUploadDocument={handleUploadPatientInfoDocument}
        onRemoveDocument={handleRemovePatientInfoDocument}
      />
      </View>

      <Modal
        transparent
        animationType="fade"
        visible={cghsCameraLoadingSection === 'patientPhotos'}
        onRequestClose={() => {}}>
        <View style={styles.loadingOverlay}>
          <View style={styles.loadingCard}>
            <View style={styles.loadingSpinnerWrap}>
              <ActivityIndicator color={BRAND.primaryStrong} size="large" />
            </View>
            <Text style={[styles.loadingTitle, styles.loadingTitleCompact]}>
              Opening camera
            </Text>
            <Text style={styles.loadingMessage}>
              Preparing geo-tagged patient photo. Please wait...
            </Text>
          </View>
        </View>
      </Modal>

      <Modal
        transparent
        animationType="fade"
        visible={Boolean(viewerDocument)}
        onRequestClose={handleCloseDocumentViewer}>
        <View style={styles.patientDocumentViewerOverlay}>
          <TouchableOpacity
            activeOpacity={1}
            style={styles.patientDocumentViewerBackdrop}
            onPress={handleCloseDocumentViewer}
          />
          <View style={styles.patientDocumentViewerCard}>
            <View style={styles.patientDocumentViewerHeader}>
              <TouchableOpacity
                activeOpacity={0.85}
                style={styles.patientDocumentViewerCloseButton}
                onPress={handleCloseDocumentViewer}>
                <Ionicons
                  name="close"
                  size={20}
                  style={styles.patientDocumentViewerCloseIcon}
                />
              </TouchableOpacity>
            </View>

            {!activeCghsDocument && documentViewerTests.length ? (
              <View style={styles.patientDocumentViewerTestsSection}>
                <ScrollView
                  nestedScrollEnabled
                  style={styles.patientDocumentViewerTestsScroll}
                  contentContainerStyle={styles.patientDocumentViewerTestsWrap}>
                  {documentViewerTests.map(test => (
                    <View
                      key={test.id}
                      style={styles.patientDocumentViewerTestChip}>
                      <Text
                        style={styles.patientDocumentViewerTestChipText}
                        numberOfLines={1}>
                        {test.label}
                      </Text>
                    </View>
                  ))}
                </ScrollView>
              </View>
            ) : null}

            <View
              style={[
                styles.patientDocumentViewerImageWrap,
                {minHeight: documentViewerHeight},
              ]}>
              {viewerDocument ? (
                <View
                  collapsable={false}
                  style={[
                    styles.patientDocumentViewerGestureViewport,
                    {height: documentViewerHeight},
                  ]}
                  onStartShouldSetResponder={() => true}
                  onMoveShouldSetResponder={() => true}
                  onResponderGrant={handleDocumentTouchStart}
                  onResponderMove={handleDocumentTouchMove}
                  onResponderRelease={handleDocumentTouchEnd}
                  onResponderTerminationRequest={() => false}
                  onResponderTerminate={handleDocumentTouchEnd}>
                  <Image
                    source={viewerDocument.imageSource}
                    style={[
                      styles.patientDocumentViewerImage,
                      {height: documentViewerHeight},
                      {
                        transform: [
                          {translateX: documentOffset.x},
                          {translateY: documentOffset.y},
                          {scale: documentZoom},
                        ],
                      },
                    ]}
                    resizeMode="contain"
                  />
                </View>
              ) : null}
            </View>

            {activeCghsDocument ? (
              <View style={styles.patientDocumentViewerFooter}>
                <View style={styles.patientDocumentViewerMeta}>
                  <Text style={styles.patientDocumentViewerType} numberOfLines={1}>
                    {activeCghsDocument.documentType || 'Document'}
                  </Text>
                  <Text
                    style={styles.patientDocumentViewerCounter}
                    numberOfLines={1}>
                    {activeCghsDocument.label}
                  </Text>
                </View>
              </View>
            ) : (
          <View style={styles.patientDocumentViewerFooter}>
            <TouchableOpacity
              activeOpacity={0.85}
              style={styles.patientDocumentViewerNavButton}
              onPress={() => handleNavigateDocument(-1)}>
                <Ionicons
                  name="chevron-back"
                  size={18}
                  style={styles.patientDocumentViewerNavIcon}
                />
                <Text style={styles.patientDocumentViewerNavText}>Previous</Text>
              </TouchableOpacity>
              <View style={styles.patientDocumentViewerMeta}>
                <Text style={styles.patientDocumentViewerType} numberOfLines={1}>
                  {viewerDocument?.documentType || 'Document'}
                </Text>
                <Text style={styles.patientDocumentViewerCounter} numberOfLines={1}>
                  {viewerDocument?.label ||
                    `${activeDocumentIndex + 1} / ${normalizedDocuments.length}`}
                </Text>
                <Text style={styles.patientDocumentViewerCounter}>
                  {activeDocumentIndex + 1} / {normalizedDocuments.length}
                </Text>
              </View>
              <TouchableOpacity
                activeOpacity={0.85}
                style={styles.patientDocumentViewerNavButton}
                onPress={() => handleNavigateDocument(1)}>
                <Text style={styles.patientDocumentViewerNavText}>Next</Text>
                <Ionicons
                  name="chevron-forward"
                  size={18}
                  style={styles.patientDocumentViewerNavIcon}
                />
              </TouchableOpacity>
            </View>
            )}
          </View>
        </View>
      </Modal>
    </>
  );
}

export default React.memo(PatientDetailCard);
