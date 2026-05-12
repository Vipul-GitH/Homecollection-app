import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
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
import PatientDocumentsList from './patient/PatientDocumentsList';
import ReportCourierSelector from './patient/ReportCourierSelector';

const {LocalDocumentPickerModule, LocalGeoCameraModule} = NativeModules;
const DOCUMENT_ZOOM_MIN = 1;
const DOCUMENT_ZOOM_MAX = 3;
const EMPTY_PAYMENT_PROOF_DOCUMENTS = [];
const EMPTY_MANUAL_SLIP_DOCUMENTS = [];
const MANUAL_HC_SLIP_STATUS = 'manual_hc_slip';
const TEST_BOOKING_STATUS_OPTIONS = [
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
    label: 'Uncomplete Test Booking, registration Executive to complete',
    icon: 'alert-circle-outline',
  },
];
const CGHS_DOCUMENT_SECTIONS = [
  {key: 'patientPhotos', label: 'Patient Photos (multi-select)'},
  {key: 'cghsCard', label: 'CGHS / CAPF Card (multi-select)'},
];

const toStableValue = value =>
  value === null || value === undefined ? '' : String(value).trim();

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

  sourceTests.forEach(test => {
    const directMode = getTestBillingChargeMode(test);
    const matchedCompany =
      (activePanelCompany && doesTestMatchPanelCompany(test, activePanelCompany)
        ? activePanelCompany
        : null) ||
      sourceCompanies.find(company => doesTestMatchPanelCompany(test, company)) ||
      (sourceCompanies.length === 1 ? sourceCompanies[0] : null);
    const resolvedMode = directMode || getBillingChargeMode(matchedCompany);

    if (resolvedMode && !modes.includes(resolvedMode)) {
      modes.push(resolvedMode);
    }
  });

  return modes.join(',');
};

const formatTestBookingStatusLabel = value => {
  const normalizedValue = toStableValue(value);

  if (!normalizedValue) {
    return TEST_BOOKING_STATUS_OPTIONS[0].label;
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

const getDocumentImageSource = document => {
  if (document?.imageSource) {
    return document.imageSource;
  }

  const uri =
    typeof document === 'string' ? toStableValue(document) : toStableValue(document?.uri);

  return uri ? {uri} : null;
};

function PatientDetailCard({
  patient,
  styles,
  onCancelBooking,
  onEditPatient,
  onReportCourierChange,
  onPrimaryPanelCompanyPress,
  onOpenSampleCollection,
  selectedTests = [],
  selectedTestsSourceReady = false,
  onRemoveSelectedTest,
  panelCompanies = [],
  activePanelCompanyId = '',
  reportCourierValue: reportCourierValueProp,
  testBookingStatusValue = 'confirmed_booked',
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
  const previousShouldShowPaymentProofUploadRef = useRef(false);
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
  const hasPanelCompanies = panelCompanies.length > 0;
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
  const shouldShowPaymentProofUpload = requiresPaymentProof;
  const shouldShowManualSlipUpload = testBookingStatusValue === MANUAL_HC_SLIP_STATUS;
  const rawReportCourierValue = toStableValue(
    reportCourierValueProp !== undefined
      ? reportCourierValueProp
      : patient.reportCourier,
  ).toLowerCase();
  const reportCourierValue =
    rawReportCourierValue === 'yes'
      ? 'Yes'
      : rawReportCourierValue === 'no'
      ? 'No'
      : '';
  const genderBadge = getGenderBadgeConfig(patient.gender);
  const labmatePid = toStableValue(patient.labmatePid || patient.labmate_pid);
  const cceTestBookingStatusLabel = toStableValue(testBookingStatusFromCce)
    ? formatTestBookingStatusLabel(testBookingStatusFromCce)
    : '';
  const selectedTestBookingStatus =
    TEST_BOOKING_STATUS_OPTIONS.find(
      option => option.value === testBookingStatusValue,
    ) || TEST_BOOKING_STATUS_OPTIONS[0];

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
      }));
    }

    return (Array.isArray(patient.tests) ? patient.tests : []).map((test, index) => ({
      id: `${test.id || 'test'}-${test.code || 'na'}-${index}`,
      code: test.code || 'N/A',
      name: test.name || 'Unnamed Test',
      tat: test.tat || test.TAT || test.turnaroundTime || test.turnaround_time || '',
      isAppAdded: false,
      removeKey: '',
      panelCompanyName: patient.panelCompany || '',
      panelCompanyId: patient.compCatId || patient.comp_cat_id || '',
      parentDescription: '',
      mrp: Number(test?.mrp || test?.charge || test?.amount || 0) || 0,
    }));
  }, [
    patient.compCatId,
    patient.comp_cat_id,
    patient.panelCompany,
    patient.tests,
    selectedTests,
    selectedTestsSourceReady,
  ]);
  const normalizedDocuments = (Array.isArray(patient.documents)
    ? patient.documents
    : [])
    .map((document, index) => {
      const imageSource = getDocumentImageSource(document);

      if (!imageSource) {
        return null;
      }

      return {
        id: String(document?.id || document?.uri || document || `document-${index}`),
        label:
          String(document?.label || document?.name || document || '').trim() ||
          `Photo ${index + 1}`,
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

  useEffect(() => {
    if (
      previousShouldShowPaymentProofUploadRef.current &&
      !shouldShowPaymentProofUpload
    ) {
      setPaymentProofDocuments(EMPTY_PAYMENT_PROOF_DOCUMENTS);
      onPaymentProofDocumentsChange?.(patient, EMPTY_PAYMENT_PROOF_DOCUMENTS);
    }
    previousShouldShowPaymentProofUploadRef.current = shouldShowPaymentProofUpload;
  }, [onPaymentProofDocumentsChange, patient, shouldShowPaymentProofUpload]);
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
    if (!LocalDocumentPickerModule?.pickDocuments) {
      showPatientAlert(
        'Upload Not Available',
        'Document picker module is not available in this build.',
      );
      return;
    }

    try {
      const pickedFiles = await LocalDocumentPickerModule.pickDocuments();

      const pickedDocuments = (Array.isArray(pickedFiles) ? pickedFiles : [])
        .filter(file => file?.uri)
        .map((file, index) => ({
          uri: file.uri,
          name: file.name || `payment-proof-${Date.now()}-${index}`,
          type: file.type || getMimeTypeFromFileName(file.name),
        }));

      if (!pickedDocuments.length) {
        return;
      }

      setPaymentProofDocuments(previousDocuments => {
        const nextDocuments = [...previousDocuments, ...pickedDocuments];
        onPaymentProofDocumentsChange?.(patient, nextDocuments);
        return nextDocuments;
      });
    } catch (error) {
      if (
        error?.code === 'DOCUMENT_PICKER_CANCELLED' ||
        String(error?.message || '').toLowerCase().includes('cancel')
      ) {
        return;
      }

      showPatientAlert(
        'Upload Failed',
        'Unable to select documents right now. Please try again.',
      );
    }
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
    if (!LocalDocumentPickerModule?.pickDocuments) {
      showPatientAlert(
        'Upload Not Available',
        'Document picker module is not available in this build.',
      );
      return;
    }

    try {
      const pickedFiles = await LocalDocumentPickerModule.pickDocuments();

      const pickedDocuments = (Array.isArray(pickedFiles) ? pickedFiles : [])
        .filter(file => file?.uri)
        .map((file, index) => ({
          uri: file.uri,
          name: file.name || `manual-hc-slip-${Date.now()}-${index}`,
          type: file.type || getMimeTypeFromFileName(file.name),
        }));

      if (!pickedDocuments.length) {
        return;
      }

      setManualSlipDocuments(previousDocuments => {
        const nextDocuments = [...previousDocuments, ...pickedDocuments];
        onManualSlipDocumentsChange?.(patient, nextDocuments);
        return nextDocuments;
      });
    } catch (error) {
      if (
        error?.code === 'DOCUMENT_PICKER_CANCELLED' ||
        String(error?.message || '').toLowerCase().includes('cancel')
      ) {
        return;
      }

      showPatientAlert(
        'Upload Failed',
        'Unable to select documents right now. Please try again.',
      );
    }
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
    if (!LocalDocumentPickerModule?.pickDocuments) {
      showPatientAlert(
        'Upload Not Available',
        'Document picker module is not available in this build.',
      );
      return;
    }

    try {
      const pickedFiles = await LocalDocumentPickerModule.pickDocuments();
      const pickedDocuments = (Array.isArray(pickedFiles) ? pickedFiles : [])
        .filter(file => file?.uri)
        .map((file, index) => ({
          uri: file.uri,
          name: file.name || `cghs-document-${Date.now()}-${index}`,
          type: file.type || getMimeTypeFromFileName(file.name),
        }));

      if (!pickedDocuments.length) {
        return;
      }

      appendCghsDocuments(sectionKey, pickedDocuments);
    } catch (error) {
      if (
        error?.code === 'DOCUMENT_PICKER_CANCELLED' ||
        String(error?.message || '').toLowerCase().includes('cancel')
      ) {
        return;
      }

      showPatientAlert(
        'Upload Failed',
        'Unable to select documents right now. Please try again.',
      );
    }
  };
  const handleCaptureCghsPatientPhoto = async () => {
    if (!LocalGeoCameraModule?.captureStampedPhoto) {
      showPatientAlert(
        'Camera Not Available',
        'Geo camera module is not available in this build.',
      );
      return;
    }

    try {
      if (Platform.OS === 'android') {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        );

        if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
          showPatientAlert(
            'Location Required',
            'Location permission is required for geo-stamped patient photos.',
          );
          return;
        }
      }

      const location = await GetLocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 20000,
      });
      let addressText = '';

      try {
        const address = await getAddressFromCoords(
          location.latitude,
          location.longitude,
        );
        addressText = address?.fullAddress || address?.displayName || '';
      } catch {
        addressText = '';
      }

      const stampText = [
        `Patient: ${patient?.name || 'N/A'}`,
        `Lat: ${formatGeoCoordinate(location.latitude)}, Long: ${formatGeoCoordinate(
          location.longitude,
        )}`,
        addressText ? `Address: ${addressText}` : '',
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

      appendCghsDocuments('patientPhotos', [
        {
          uri: capturedPhoto.uri,
          name: capturedPhoto.name || `patient-photo-${Date.now()}.jpg`,
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
        'Unable to capture a geo-stamped photo right now. Please try again.',
      );
    }
  };
  const handlePickCghsDocuments = sectionKey => {
    if (sectionKey !== 'patientPhotos') {
      handleUploadCghsDocuments(sectionKey);
      return;
    }

    showPatientAlert('Patient Photo', 'Choose how to add patient photo.', [
      {text: 'Camera', onPress: handleCaptureCghsPatientPhoto},
      {text: 'Upload', onPress: () => handleUploadCghsDocuments(sectionKey)},
      {text: 'Cancel', style: 'cancel'},
    ]);
  };
  const handleRemoveCghsDocument = (sectionKey, indexToRemove) => {
    const nextDocuments = (cghsDocumentsBySection[sectionKey] || []).filter(
      (_, index) => index !== indexToRemove,
    );
    onCghsDocumentsChange?.(patient, sectionKey, nextDocuments);
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
              {reportCourierValue ? (
                <View style={styles.patientInfoPillSuccess}>
                  <Text style={styles.patientInfoPillSuccessText}>
                    Reports: {reportCourierValue}
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
              {!hasPanelCompanies ? (
                <TouchableOpacity
                  activeOpacity={onPrimaryPanelCompanyPress ? 0.85 : 1}
                  style={styles.patientPanelBadge}
                  onPress={() => onPrimaryPanelCompanyPress?.(patient)}
                  disabled={!onPrimaryPanelCompanyPress}>
                  <View style={styles.patientPanelBadgeRow}>
                    <Text style={styles.patientPanelText}>{patient.panelCompany}</Text>
                    {onPrimaryPanelCompanyPress ? (
                      <Ionicons
                        name="chevron-forward"
                        size={13}
                        style={styles.patientPanelBadgeIcon}
                      />
                    ) : null}
                  </View>
                </TouchableOpacity>
              ) : null}
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
            isNarrowCard && styles.patientDetailMetaItemStacked,
          ]}>
          <Text style={styles.patientDetailMetaLabel}>Referred By</Text>
          <Text style={styles.patientDetailMetaValue} numberOfLines={1}>
            {patient.referredBy || 'N/A'}
          </Text>
        </View>
        <View
          style={[
            styles.patientDetailMetaItem,
            isNarrowCard && styles.patientDetailMetaItemStacked,
          ]}>
          <Text style={styles.patientDetailMetaLabel}>Internal Referenced By</Text>
          <Text style={styles.patientDetailMetaValue} numberOfLines={1}>
            {patient.internalReferencedBy || 'N/A'}
          </Text>
        </View>
      </View>
      <ReportCourierSelector
        styles={styles}
        patient={patient}
        value={reportCourierValue}
        isNarrow={isNarrowCard}
        onChange={onReportCourierChange}
      />
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
                        </Text>
                        {sectionDocuments.length ? (
                          <Text style={styles.patientCghsDocumentCount}>
                            {sectionDocuments.length}
                          </Text>
                        ) : null}
                        <TouchableOpacity
                          activeOpacity={0.85}
                          style={styles.patientCghsUploadButton}
                          onPress={() => handlePickCghsDocuments(section.key)}
                          disabled={typeof onCghsDocumentsChange !== 'function'}>
                          <Ionicons
                            name="cloud-upload-outline"
                            size={14}
                            style={styles.patientCghsUploadButtonIcon}
                          />
                          <Text style={styles.patientCghsUploadButtonText}>
                            Upload
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
        <Text style={styles.patientDetailLabel}>Test booking status</Text>
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
          <Text style={styles.addPatientFieldLabel}>Upload manual slip *</Text>
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
              shouldShowPaymentProofUpload &&
                styles.patientPaymentReadOnlyChipCredit,
            ]}>
            <Text
              style={[
                styles.patientPaymentReadOnlyText,
                shouldShowPaymentProofUpload &&
                  styles.patientPaymentReadOnlyTextCredit,
              ]}>
              {paymentDisplayLabel}
            </Text>
          </View>
        </View>
      </View>
      {shouldShowPaymentProofUpload ? (
        <View style={styles.patientPaymentProofSection}>
          <Text style={styles.addPatientFieldLabel}>
            Billing Proof / Prescription *
          </Text>
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
      />
      </View>

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
                <Text style={styles.patientDocumentViewerCounter}>
                  {activeCghsDocument.label}
                </Text>
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
              <Text style={styles.patientDocumentViewerCounter}>
                {activeDocumentIndex + 1} / {normalizedDocuments.length}
              </Text>
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
