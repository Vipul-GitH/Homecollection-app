import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  ActivityIndicator,
  Linking,
  Modal,
  NativeModules,
  PermissionsAndroid,
  Platform,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import GetLocation from 'react-native-get-location';
import {getAddressFromCoords} from '../../utils/location/getAddressFromCoords';
import {
  getLastKnownGeoCapture,
  persistLastKnownGeoCapture,
} from '../../utils/location/lastKnownGeoCapture';
import {getUploadFileName} from '../../screens/bookings/appointmentDetails/helpers';
import {BRAND} from '../../styles/appStyles';
import PatientDocumentsList from './patient/PatientDocumentsList';
import PatientDocumentViewerModal from './patient/PatientDocumentViewerModal';
import RequiredLabel from './appointmentDetails/RequiredLabel';

const {LocalDocumentPickerModule, LocalGeoCameraModule} = NativeModules;
const DOCUMENT_ZOOM_MIN = 1;
const DOCUMENT_ZOOM_MAX = 3;
const PATIENT_DOCUMENT_BASE_URL = 'https://labmate.bhasinpathlabs.com:2010/';
const CGHS_DOCUMENT_SECTIONS = [
  {key: 'patientPhotos', label: 'Patient Photos (multi-select)'},
  {key: 'cghsCard', label: 'CGHS / CAPF Card (multi-select)'},
];

const toStableValue = value =>
  value === null || value === undefined ? '' : String(value).trim();

const normalizePatientTagValues = value => {
  if (Array.isArray(value)) {
    return value.map(tag => toStableValue(tag)).filter(Boolean);
  }

  return toStableValue(value)
    .split(',')
    .map(tag => toStableValue(tag))
    .filter(Boolean);
};

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

const normalizePickedDocuments = (pickedFiles, fileNamePrefix, documentName = '') =>
  (Array.isArray(pickedFiles) ? pickedFiles : [])
    .filter(file => file?.uri)
    .map((file, index) => {
      const type = file.type || getMimeTypeFromFileName(file.name);

      return {
        uri: file.uri,
        name: getUploadFileName({
          preferredName: documentName,
          originalName: file.name,
          mimeType: type,
          fallbackPrefix: fileNamePrefix,
          fallbackIndex: index,
        }),
        type,
      };
    });

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

const normalizeDocumentIdentityValue = value => {
  const rawValue = toStableValue(value).toLowerCase();

  if (!rawValue) {
    return '';
  }

  const withoutQuery = rawValue.split('?')[0].split('#')[0];
  const withoutProtocol = withoutQuery.replace(/^https?:\/\/[^/]+\/?/i, '');
  return withoutProtocol
    .replace(/^\/+/, '')
    .replace(/^static\/uploads\//, '')
    .replace(/^uploads\//, '');
};

const getDocumentIdentity = document => {
  const primaryValue = toStableValue(
    typeof document === 'string'
      ? document
      : document?.uri ||
          document?.url ||
          document?.path ||
          document?.file ||
          document?.document_url ||
          document?.imageSource?.uri ||
          document?.id,
  );
  const normalizedPrimaryValue = normalizeDocumentIdentityValue(primaryValue);

  if (normalizedPrimaryValue) {
    return normalizedPrimaryValue;
  }

  const fallbackLabel = getDocumentDisplayLabel(document, '');
  return normalizeDocumentIdentityValue(fallbackLabel);
};

const dedupeDocumentsByIdentity = documents => {
  const seenDocuments = new Set();

  return (Array.isArray(documents) ? documents : []).filter((document, index) => {
    const identity = getDocumentIdentity(document) || `index-${index}`;

    if (seenDocuments.has(identity)) {
      return false;
    }

    seenDocuments.add(identity);
    return true;
  });
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
        label: labelPrefix,
        documentType: labelPrefix,
        uri,
      };
    })
    .filter(Boolean);

const buildTypedPatientDocumentItems = (items, type, labelPrefix) =>
  (Array.isArray(items) ? items : [])
    .filter(
      item => toStableValue(item?.type || item?.document_type).toLowerCase() === type,
    )
    .map((item, index) => {
      const uri = resolvePatientDocumentUrl(item);

      if (!uri) {
        return null;
      }

      return {
        id: `${type}-${uri}-${index}`,
        label: labelPrefix,
        documentType: labelPrefix,
        uri,
      };
    })
    .filter(Boolean);

function PatientDetailCard({
  patient,
  styles,
  children,
  onCancelBooking,
  onEditPatient,
  onPrimaryPanelCompanyPress,
  onOpenSampleCollection,
  selectedTests = [],
  selectedTestsSourceReady = false,
  onRemoveSelectedTest,
  panelCompanies = [],
  activePanelCompanyId = '',
  testBookingStatusFromCce = '',
  cghsEnabled = false,
  cghsIdValue = '',
  cghsDocumentsBySection = {},
  onCghsEnabledChange,
  onCghsIdChange,
  onCghsDocumentsChange,
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
  const [activeDocumentIndex, setActiveDocumentIndex] = useState(-1);
  const [activeCghsDocument, setActiveCghsDocument] = useState(null);
  const [documentZoom, setDocumentZoom] = useState(DOCUMENT_ZOOM_MIN);
  const [documentOffset, setDocumentOffset] = useState({x: 0, y: 0});
  const [cghsCameraLoadingSection, setCghsCameraLoadingSection] = useState('');
  const [paymentProofDocuments, setPaymentProofDocuments] = useState(
    Array.isArray(paymentProofDocumentsProp) ? paymentProofDocumentsProp : [],
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
  const patientStatusLabel = useMemo(
    () =>
      bookingPatientStatusCode === 3
        ? 'Complete'
        : bookingPatientStatusCode === 4
        ? 'Cancelled'
        : bookingPatientStatusCode === 5
        ? 'Partial Complete'
        : '',
    [bookingPatientStatusCode],
  );
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
  const shouldHighlightPaymentProofRequired = requiresPaymentProof;
  const genderBadge = useMemo(
    () => getGenderBadgeConfig(patient.gender),
    [patient.gender],
  );
  const labmatePid = useMemo(
    () => toStableValue(patient.labmatePid || patient.labmate_pid),
    [patient.labmatePid, patient.labmate_pid],
  );
  const patientTags = useMemo(
    () => normalizePatientTagValues(patient.tags || patient.tag),
    [patient.tags, patient.tag],
  );
  const cceTestBookingStatusLabel = useMemo(
    () =>
      toStableValue(testBookingStatusFromCce)
        ? formatTestBookingStatusLabel(testBookingStatusFromCce)
        : '',
    [testBookingStatusFromCce],
  );
  const patientMobileDialable = useMemo(
    () => getDialablePhoneNumber(patient.mobileNumber),
    [patient.mobileNumber],
  );
  const patientAlternateMobileDialable = useMemo(
    () => getDialablePhoneNumber(patient.alternateMobileNumber),
    [patient.alternateMobileNumber],
  );
  const patientBookingDueAmount = Number(patient.bookingDueAmount || 0);
  const patientBookingExtraAmount = Number(patient.bookingExtraAmount || 0);

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
  const normalizedDocuments = useMemo(
    () =>
      dedupeDocumentsByIdentity([
        ...(Array.isArray(patient.documents) ? patient.documents : []),
        ...buildApiDocumentItems(
          patient.patientDocumentUrls || patient.patient_document_urls,
          'Patient Document',
        ),
        ...buildTypedPatientDocumentItems(
          patient.patientDocuments,
          'patient_photo',
          'Patient Photo',
        ),
        ...buildTypedPatientDocumentItems(
          patient.patientDocuments,
          'cghs_card',
          'CGHS Card',
        ),
        ...buildTypedPatientDocumentItems(
          patient.patientDocuments,
          'manual_slip',
          'Manual Slip',
        ),
        ...buildApiDocumentItems(
          patient.prescriptionUrls || patient.prescription_urls,
          'Prescription',
        ),
        ...(Array.isArray(cghsDocumentsBySection.patientPhotos)
          ? cghsDocumentsBySection.patientPhotos.map((document, index) => ({
              ...document,
              label:
                document?.label ||
                document?.name ||
                `Patient Photo ${index + 1}`,
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
              label:
                document?.label || document?.name || `CGHS Card ${index + 1}`,
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
      ])
        .map((document, index) => {
          const imageSource = getDocumentImageSource(document);

          if (!imageSource) {
            return null;
          }

          return {
            ...document,
            id: String(
              document?.id || document?.uri || document || `document-${index}`,
            ),
            label: getDocumentDisplayLabel(document, `Document ${index + 1}`),
            documentType: toStableValue(document?.documentType) || 'Document',
            imageSource,
          };
        })
        .filter(Boolean),
    [
      cghsDocumentsBySection.cghsCard,
      cghsDocumentsBySection.patientPhotos,
      patient.documents,
      patient.patientDocuments,
      patient.patientDocumentUrls,
      patient.patient_document_urls,
      patient.prescriptionUrls,
      patient.prescription_urls,
      paymentProofDocuments,
    ],
  );
  const backendPatientPhotoDocuments = useMemo(
    () => buildTypedPatientDocumentItems(patient.patientDocuments, 'patient_photo', 'Patient Photo'),
    [patient.patientDocuments],
  );
  const backendCghsCardDocuments = useMemo(
    () => buildTypedPatientDocumentItems(patient.patientDocuments, 'cghs_card', 'CGHS Card'),
    [patient.patientDocuments],
  );
  const backendPrescriptionDocuments = useMemo(
    () => buildApiDocumentItems(
      patient.prescriptionUrls || patient.prescription_urls,
      'Prescription',
    ),
    [patient.prescriptionUrls, patient.prescription_urls],
  );
  const displayPatientPhotoDocuments = useMemo(
    () =>
      dedupeDocumentsByIdentity([
        ...backendPatientPhotoDocuments.map(document => ({
          ...document,
          name: document.label,
          canRemove: false,
        })),
        ...(Array.isArray(cghsDocumentsBySection.patientPhotos)
          ? cghsDocumentsBySection.patientPhotos.map((document, index) => ({
              ...document,
              name:
                document?.label || document?.name || `Patient Photo ${index + 1}`,
              canRemove: true,
              sourceIndex: index,
            }))
          : []),
      ]),
    [backendPatientPhotoDocuments, cghsDocumentsBySection.patientPhotos],
  );
  const displayCghsCardDocuments = useMemo(
    () =>
      dedupeDocumentsByIdentity([
        ...backendCghsCardDocuments.map(document => ({
          ...document,
          name: document.label,
          canRemove: false,
        })),
        ...(Array.isArray(cghsDocumentsBySection.cghsCard)
          ? cghsDocumentsBySection.cghsCard.map((document, index) => ({
              ...document,
              name: document?.label || document?.name || `CGHS Card ${index + 1}`,
              canRemove: true,
              sourceIndex: index,
            }))
          : []),
      ]),
    [backendCghsCardDocuments, cghsDocumentsBySection.cghsCard],
  );
  const displayPrescriptionDocuments = useMemo(
    () =>
      dedupeDocumentsByIdentity([
        ...backendPrescriptionDocuments.map(document => ({
          ...document,
          name: document.label,
          canRemove: false,
        })),
        ...(Array.isArray(paymentProofDocuments)
          ? paymentProofDocuments.map((document, index) => ({
              ...document,
              name:
                document?.label || document?.name || `Prescription ${index + 1}`,
              canRemove: true,
              sourceIndex: index,
            }))
          : []),
      ]),
    [backendPrescriptionDocuments, paymentProofDocuments],
  );
  const hasBackendCghsDocuments =
    backendPatientPhotoDocuments.length > 0 || backendCghsCardDocuments.length > 0;
  const shouldShowPaymentProofUpload = false;
  const activeDocument = useMemo(
    () =>
      activeDocumentIndex >= 0
        ? normalizedDocuments[activeDocumentIndex]
        : null,
    [activeDocumentIndex, normalizedDocuments],
  );
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
  const pickDocumentsFromDevice = useCallback(
    async ({
      fileNamePrefix,
      documentName,
      onDocumentsPicked,
      emptyMessage,
      failureMessage,
    }) => {
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
          documentName,
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
            name: getUploadFileName({
              preferredName: documentLabel,
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
          fileNamePrefix: 'prescription',
          documentName: 'Prescription',
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
      documentName: sectionKey === 'patientPhotos' ? 'Patient Photo' : 'CGHS Card',
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
                  <Text style={styles.patientInfoPillText}>
                    Labmate PID: {labmatePid}
                  </Text>
                </View>
              ) : null}
              {patientTags.map((tag, index) => (
                <View
                  key={`${tag}-${index}`}
                  style={styles.patientTagHighlightChip}>
                  <Ionicons
                    name="pricetag-outline"
                    size={12}
                    style={styles.patientTagHighlightIcon}
                  />
                  <Text style={styles.patientTagHighlightText}>{tag}</Text>
                </View>
              ))}
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
              {onCancelBooking ? (
                <TouchableOpacity
                  activeOpacity={0.85}
                  style={[
                    styles.patientEditButton,
                    styles.patientCancelIconButton,
                    isCancelBookingDisabled && styles.patientCancelIconButtonDisabled,
                  ]}
                  onPress={() => onCancelBooking(patient)}
                  disabled={isCancelBookingDisabled}
                  accessibilityLabel={cancelBookingLabel}>
                  <Ionicons
                    name="close-circle-outline"
                    size={18}
                    style={styles.patientCancelIconButtonIcon}
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
      {sampleCollected ? (
        <View style={styles.patientTopActionRow}>
          <View style={styles.patientCollectedInlineBadge}>
            <Text style={styles.patientCollectedInlineBadgeText}>
              Sample Collected
            </Text>
          </View>
        </View>
      ) : null}
      <View style={styles.patientDetailMetaStrip}>
        <TouchableOpacity
          activeOpacity={0.75}
          style={[
            styles.patientDetailMetaItem,
            isNarrowCard && styles.patientDetailMetaItemStacked,
          ]}
          disabled={!patientMobileDialable}
          onPress={() => handleCallPatientNumber(patient.mobileNumber)}>
          <Text style={styles.patientDetailMetaLabel}>Mobile</Text>
          <Text
            style={[
              styles.patientDetailMetaValue,
              patientMobileDialable && styles.patientPhoneLinkText,
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
          disabled={!patientAlternateMobileDialable}
          onPress={() => handleCallPatientNumber(patient.alternateMobileNumber)}>
          <Text style={styles.patientDetailMetaLabel}>Alternate</Text>
          <Text
            style={[
              styles.patientDetailMetaValue,
              patientAlternateMobileDialable && styles.patientPhoneLinkText,
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
      {patientBookingDueAmount > 0 || patientBookingExtraAmount > 0 ? (
        <View style={styles.patientDetailMetaStrip}>
          {patientBookingDueAmount > 0 ? (
            <View
              style={[
                styles.patientDetailMetaItem,
                isNarrowCard && styles.patientDetailMetaItemStacked,
              ]}>
              <Text style={styles.patientDetailMetaLabel}>Due</Text>
              <Text style={styles.patientDetailMetaValue}>
                Rs. {patientBookingDueAmount.toFixed(2)}
              </Text>
            </View>
          ) : null}
          {patientBookingExtraAmount > 0 ? (
            <View
              style={[
                styles.patientDetailMetaItem,
                isNarrowCard && styles.patientDetailMetaItemStacked,
              ]}>
              <Text style={styles.patientDetailMetaLabel}>Extra</Text>
              <Text style={styles.patientDetailMetaValue}>
                Rs. {patientBookingExtraAmount.toFixed(2)}
              </Text>
            </View>
          ) : null}
          {patient.bookingPaymentMode ? (
            <View
              style={[
                styles.patientDetailMetaItem,
                isNarrowCard && styles.patientDetailMetaItemStacked,
              ]}>
              <Text style={styles.patientDetailMetaLabel}>Mode</Text>
              <Text style={styles.patientDetailMetaValue}>
                {patient.bookingPaymentMode}
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}
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

          {cghsEnabled || hasBackendCghsDocuments ? (
            <View style={styles.patientCghsInputBlock}>
              {cghsEnabled ? (
                <>
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
                </>
              ) : null}

              <View style={styles.patientCghsDocumentSectionList}>
                {CGHS_DOCUMENT_SECTIONS.map(section => {
                  const sectionDocuments =
                    section.key === 'patientPhotos'
                      ? displayPatientPhotoDocuments
                      : displayCghsCardDocuments;

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
                              {document.canRemove ? (
                                <TouchableOpacity
                                  activeOpacity={0.85}
                                  style={styles.patientCghsDocumentRemoveButton}
                                  onPress={() =>
                                    handleRemoveCghsDocument(
                                      section.key,
                                      document.sourceIndex ?? index,
                                    )
                                  }>
                                  <Ionicons
                                    name="close"
                                    size={12}
                                    style={styles.patientCghsDocumentRemoveIcon}
                                  />
                                </TouchableOpacity>
                              ) : null}
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
      {children}
      {shouldShowPaymentProofUpload ? (
        <View style={styles.patientPaymentProofSection}>
          {renderConditionalFieldLabel('Prescription')}
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
              <Text style={styles.completeUploadTitle}>Upload prescription</Text>
              <Text style={styles.completeUploadHint}>
                This file will be sent with complete booking
              </Text>
            </View>
            <Ionicons
              name="chevron-forward"
              size={18}
              style={styles.completeUploadChevron}
            />
          </TouchableOpacity>

          {displayPrescriptionDocuments.length ? (
            <View style={styles.completeProofList}>
              {displayPrescriptionDocuments.map((document, index) => (
                <View
                  key={`${document.uri || document.id}-${index}`}
                  style={styles.completeProofItem}>
                  <Ionicons
                    name="document-attach-outline"
                    size={16}
                    style={styles.completeProofIcon}
                  />
                  <Text style={styles.completeProofName} numberOfLines={1}>
                    {document.name}
                  </Text>
                  {document.canRemove ? (
                    <TouchableOpacity
                      activeOpacity={0.85}
                      style={styles.completeProofRemoveButton}
                      onPress={() =>
                        handleRemovePaymentProofDocument(
                          document.sourceIndex ?? index,
                        )
                      }>
                      <Ionicons
                        name="close"
                        size={14}
                        style={styles.completeProofRemoveIcon}
                      />
                    </TouchableOpacity>
                  ) : null}
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

      <PatientDocumentViewerModal
        styles={styles}
        visible={Boolean(viewerDocument)}
        viewerDocument={viewerDocument}
        activeCghsDocument={activeCghsDocument}
        documentViewerTests={documentViewerTests}
        documentViewerHeight={documentViewerHeight}
        documentOffset={documentOffset}
        documentZoom={documentZoom}
        activeDocumentIndex={activeDocumentIndex}
        documentCount={normalizedDocuments.length}
        onClose={handleCloseDocumentViewer}
        onNavigate={handleNavigateDocument}
        onTouchStart={handleDocumentTouchStart}
        onTouchMove={handleDocumentTouchMove}
        onTouchEnd={handleDocumentTouchEnd}
      />
    </>
  );
}

export default React.memo(PatientDetailCard);
