import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  Alert,
  LayoutAnimation,
  Linking,
  Modal,
  NativeModules,
  Platform,
  Text,
  TouchableOpacity,
  UIManager,
  useWindowDimensions,
  View,
  Image,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import {collectUniqueTubesForSelectedTests} from '../../utils/bookings/sampleTubeMapping';

const {LocalDocumentPickerModule} = NativeModules;
const DUMMY_DOCUMENT_SOURCE = require('../../assests/splash-screen.png');
const DOCUMENT_ZOOM_MIN = 1;
const DOCUMENT_ZOOM_MAX = 3;
const DUMMY_PATIENT_DOCUMENTS = [
  {
    id: 'dummy-photo-1',
    label: 'Photo 1',
    imageSource: DUMMY_DOCUMENT_SOURCE,
  },
  {
    id: 'dummy-photo-2',
    label: 'Photo 2',
    imageSource: DUMMY_DOCUMENT_SOURCE,
  },
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
      company?.chargeMode,
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

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

function PatientDetailCard({
  patient,
  styles,
  onCancelBooking,
  onEditPatient,
  onReportCourierChange,
  onPrimaryPanelCompanyPress,
  onAddPanelCompany,
  onOpenSampleCollection,
  selectedTests = [],
  onRemoveSelectedTest,
  panelCompanies = [],
  activePanelCompanyId = '',
  reportCourierValue: reportCourierValueProp,
  onSelectPanelCompany,
  onRemovePanelCompany,
  isAddPanelCompanyDisabled,
  addPanelCompanyLabel = 'Add Panel Company',
  isCancelBookingDisabled,
  cancelBookingLabel = 'Cancel Patient',
}) {
  const {width} = useWindowDimensions();
  const isNarrowCard = width < 370;
  const [isTestsExpanded, setIsTestsExpanded] = useState(false);
  const [activeDocumentIndex, setActiveDocumentIndex] = useState(-1);
  const [documentZoom, setDocumentZoom] = useState(DOCUMENT_ZOOM_MIN);
  const [documentOffset, setDocumentOffset] = useState({x: 0, y: 0});
  const [paymentProofDocuments, setPaymentProofDocuments] = useState([]);
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
  const paymentBillingMode = getBillingChargeMode(activePanelCompany || patient);
  const paymentDisplayLabel = getPaymentLabelFromBillingMode(paymentBillingMode);
  const shouldShowPaymentProofUpload = paymentBillingMode.includes('C');
  const reportCourierValue =
    toStableValue(reportCourierValueProp || patient.reportCourier).toLowerCase() ===
    'yes'
      ? 'Yes'
      : 'No';
  const canOpenPanelCompanyTests = typeof onSelectPanelCompany === 'function';
  const panelCompanyHintText = canOpenPanelCompanyTests
    ? 'Tap panel to add tests'
    : 'Start booking to add tests';
  const displayTests = useMemo(() => {
    if (selectedTests.length) {
      return dedupeSelectedTests(selectedTests).map(test => ({
        id: test.key,
        code: test.booked_code || 'N/A',
        name: test.description || 'Unnamed Test',
        isAppAdded: !String(test.key || '').startsWith('seed|'),
        removeKey: test.key,
        panelCompanyName: test.panelCompanyName || '',
        panelCompanyId: test.panelCompanyId || '',
        parentDescription: test.parentDescription || '',
      }));
    }

    return (Array.isArray(patient.tests) ? patient.tests : []).map((test, index) => ({
      id: `${test.id || 'test'}-${test.code || 'na'}-${index}`,
      code: test.code || 'N/A',
      name: test.name || 'Unnamed Test',
      isAppAdded: false,
      removeKey: '',
      panelCompanyName: '',
      panelCompanyId: '',
      parentDescription: '',
    }));
  }, [patient.tests, selectedTests]);
  const displayTubes = useMemo(() => {
    const selectedTestTubes = collectUniqueTubesForSelectedTests(selectedTests);

    if (selectedTestTubes.length) {
      return selectedTestTubes;
    }

    return Array.isArray(patient.tubes) ? patient.tubes : [];
  }, [patient.tubes, selectedTests]);
  const normalizedDocuments = (Array.isArray(patient.documents) &&
  patient.documents.length
    ? patient.documents.map((document, index) => ({
        id: String(document?.id || document?.uri || document || `document-${index}`),
        label:
          String(document?.label || document?.name || document || '').trim() ||
          `Photo ${index + 1}`,
        imageSource: document?.imageSource || DUMMY_DOCUMENT_SOURCE,
      }))
    : DUMMY_PATIENT_DOCUMENTS);
  const activeDocument =
    activeDocumentIndex >= 0 ? normalizedDocuments[activeDocumentIndex] : null;
  const documentViewerWidth = Math.min(width - 76, 520);
  const documentViewerHeight = 300;
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

  const handleTestsAccordionToggle = () => {
    LayoutAnimation.configureNext({
      duration: 220,
      create: {
        type: LayoutAnimation.Types.easeInEaseOut,
        property: LayoutAnimation.Properties.opacity,
      },
      update: {
        type: LayoutAnimation.Types.easeInEaseOut,
      },
      delete: {
        type: LayoutAnimation.Types.easeInEaseOut,
        property: LayoutAnimation.Properties.opacity,
      },
    });

    setIsTestsExpanded(previous => !previous);
  };
  const handleOpenDocument = index => {
    setDocumentZoom(DOCUMENT_ZOOM_MIN);
    setDocumentOffset({x: 0, y: 0});
    setActiveDocumentIndex(index);
  };
  const handleCloseDocumentViewer = () => {
    setActiveDocumentIndex(-1);
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
    if (!shouldShowPaymentProofUpload) {
      setPaymentProofDocuments([]);
    }
  }, [shouldShowPaymentProofUpload]);

  const handlePickPaymentProofDocuments = async () => {
    if (!LocalDocumentPickerModule?.pickDocuments) {
      Alert.alert(
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

      setPaymentProofDocuments(previousDocuments => [
        ...previousDocuments,
        ...pickedDocuments,
      ]);
    } catch (error) {
      if (
        error?.code === 'DOCUMENT_PICKER_CANCELLED' ||
        String(error?.message || '').toLowerCase().includes('cancel')
      ) {
        return;
      }

      Alert.alert(
        'Upload Failed',
        'Unable to select documents right now. Please try again.',
      );
    }
  };
  const handleRemovePaymentProofDocument = indexToRemove => {
    setPaymentProofDocuments(previousDocuments =>
      previousDocuments.filter((_, index) => index !== indexToRemove),
    );
  };
  const handleCallPatientNumber = async phoneNumber => {
    const dialableNumber = getDialablePhoneNumber(phoneNumber);

    if (!dialableNumber) {
      return;
    }

    try {
      await Linking.openURL(`tel:${dialableNumber}`);
    } catch (error) {
      Alert.alert('Call Failed', 'Unable to open the phone dialer right now.');
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
          <View
            style={[
              styles.patientHeaderActionStack,
              isNarrowCard && styles.patientHeaderActionStackInline,
            ]}>
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
        {panelCompanies.length ? (
          <View style={styles.patientCompanySection}>
            <View style={styles.patientCompanyHeaderRow}>
              <Text style={styles.patientCompanySectionLabel}>Panel Companies</Text>
              <Text style={styles.patientCompanySectionHint}>
                {panelCompanyHintText}
              </Text>
            </View>
            <View style={styles.patientCompanyChipRow}>
              {panelCompanies.map(company => {
                const isActive =
                  String(activePanelCompanyId) ===
                  String(company.chipId || company.id);
                const isAppChip = company.chipSource === 'APP';

                return (
                  <View
                    key={company.chipId || company.id}
                    style={styles.patientCompanyChipWrap}>
                    <TouchableOpacity
                      activeOpacity={canOpenPanelCompanyTests ? 0.75 : 1}
                      style={[
                        styles.patientCompanyChip,
                        isActive && styles.patientCompanyChipActive,
                        !canOpenPanelCompanyTests &&
                          styles.patientCompanyChipDisabled,
                      ]}
                      disabled={!canOpenPanelCompanyTests}
                      hitSlop={{top: 6, bottom: 6, left: 6, right: 6}}
                      onPress={() =>
                        onSelectPanelCompany({patient, panelCompany: company})
                      }>
                      <Ionicons
                        name="add-circle-outline"
                        size={15}
                        style={[
                          styles.patientCompanyChipIcon,
                          isActive && styles.patientCompanyChipIconActive,
                          !canOpenPanelCompanyTests &&
                            styles.patientCompanyChipIconDisabled,
                        ]}
                      />
                      <View style={styles.patientCompanyChipTextWrap}>
                        <Text
                          style={[
                            styles.patientCompanyChipText,
                            isActive && styles.patientCompanyChipTextActive,
                            !canOpenPanelCompanyTests &&
                              styles.patientCompanyChipTextDisabled,
                          ]}
                          numberOfLines={1}>
                          {company.name} ({company.compCatId || 'N/A'})
                        </Text>
                        <Text
                          style={[
                            styles.patientCompanyChipHintText,
                            isActive && styles.patientCompanyChipHintTextActive,
                            !canOpenPanelCompanyTests &&
                              styles.patientCompanyChipHintTextDisabled,
                          ]}
                          numberOfLines={1}>
                          {canOpenPanelCompanyTests ? 'Add tests' : 'Start first'}
                        </Text>
                      </View>
                      <Ionicons
                        name="chevron-forward"
                        size={13}
                        style={[
                          styles.patientCompanyChipChevron,
                          isActive && styles.patientCompanyChipChevronActive,
                          !canOpenPanelCompanyTests &&
                            styles.patientCompanyChipChevronDisabled,
                        ]}
                      />
                    </TouchableOpacity>
                    {isAppChip && onRemovePanelCompany ? (
                      <TouchableOpacity
                        activeOpacity={0.85}
                        style={styles.patientPanelRemoveButton}
                        onPress={() => onRemovePanelCompany(patient, company)}>
                        <Ionicons
                          name="close"
                          size={13}
                          style={styles.patientPanelRemoveButtonIcon}
                        />
                      </TouchableOpacity>
                    ) : null}
                  </View>
                );
              })}
            </View>
          </View>
        ) : null}

      <View style={styles.patientDetailMetaStrip}>
        <View style={styles.patientDetailMetaItem}>
          <Text style={styles.patientDetailMetaLabel}>Gender</Text>
          <Text style={styles.patientDetailMetaValue} numberOfLines={1}>
            {patient.gender}
          </Text>
        </View>
        <TouchableOpacity
          activeOpacity={0.75}
          style={styles.patientDetailMetaItem}
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
          style={styles.patientDetailMetaItem}
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
        <View style={styles.patientDetailMetaItem}>
          <Text style={styles.patientDetailMetaLabel}>Referred By</Text>
          <Text style={styles.patientDetailMetaValue} numberOfLines={1}>
            {patient.referredBy || 'N/A'}
          </Text>
        </View>
        <View style={styles.patientDetailMetaItem}>
          <Text style={styles.patientDetailMetaLabel}>Internal Referenced By</Text>
          <Text style={styles.patientDetailMetaValue} numberOfLines={1}>
            {patient.internalReferencedBy || 'N/A'}
          </Text>
        </View>
      </View>
      <View
        style={[
          styles.patientDetailInfoRow,
          isNarrowCard && styles.patientDetailInfoRowStacked,
        ]}>
        <Text style={styles.patientDetailLabel}>Report Courier</Text>
        <View
          style={[
            styles.patientReportCourierControl,
            isNarrowCard && styles.patientReportCourierControlStacked,
          ]}>
          {['Yes', 'No'].map(value => {
            const isSelected = reportCourierValue === value;

            return (
              <TouchableOpacity
                key={value}
                activeOpacity={0.85}
                style={[
                  styles.patientReportCourierButton,
                  isSelected && styles.patientReportCourierButtonActive,
                ]}
                disabled={
                  typeof onReportCourierChange !== 'function'
                }
                onPress={() => onReportCourierChange?.(patient, value)}>
                <Text
                  style={[
                    styles.patientReportCourierButtonText,
                    isSelected && styles.patientReportCourierButtonTextActive,
                  ]}>
                  {value}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
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
      <View
        style={[
          styles.patientDetailInfoRow,
          isNarrowCard && styles.patientDetailInfoRowStacked,
        ]}>
        <Text style={styles.patientDetailLabel}>Tests</Text>
        <View
          style={[
            styles.patientTestsWrap,
            isNarrowCard && styles.patientTestsWrapStacked,
          ]}>
          {displayTests.length ? (
            <>
              <TouchableOpacity
                activeOpacity={0.85}
                style={styles.testsAccordionButton}
                onPress={handleTestsAccordionToggle}>
                <Text style={styles.testsAccordionButtonText}>
                  {isTestsExpanded
                    ? 'Hide Tests'
                    : `View Tests (${displayTests.length})`}
                </Text>
                <Ionicons
                  name={isTestsExpanded ? 'chevron-up' : 'chevron-down'}
                  size={16}
                  style={styles.testsAccordionIcon}
                />
              </TouchableOpacity>

              {isTestsExpanded
                ? displayTests.map(test => (
                    <View
                      key={test.id}
                      style={styles.patientTestChip}>
                      <View style={styles.sampleCollectionSelectedTextWrap}>
                        <Text style={styles.patientTestLine}>
                          <Text style={styles.patientTestCode}>{test.code}</Text>
                          <Text style={styles.patientTestSeparator}>: </Text>
                          <Text style={styles.patientTestName}>{test.name}</Text>
                        </Text>
                        {test.parentDescription ? (
                          <Text style={styles.sampleCollectionSelectedMeta}>
                            Child of {test.parentDescription}
                          </Text>
                        ) : null}
                        {test.panelCompanyName ? (
                          <Text style={styles.sampleCollectionSelectedMeta}>
                            Panel: {test.panelCompanyName}
                            {test.panelCompanyId ? ` (${test.panelCompanyId})` : ''}
                          </Text>
                        ) : null}
                      </View>
                      {test.isAppAdded && onRemoveSelectedTest ? (
                        <TouchableOpacity
                          activeOpacity={0.85}
                          style={styles.sampleCollectionRemoveButton}
                          onPress={() =>
                            onRemoveSelectedTest({
                              patient,
                              testKey: test.removeKey,
                            })
                          }>
                          <Ionicons
                            name="trash-outline"
                            size={15}
                            style={styles.sampleCollectionRemoveButtonIcon}
                          />
                        </TouchableOpacity>
                      ) : null}
                    </View>
                  ))
                : null}
            </>
          ) : (
            <Text
              style={[
                styles.patientDetailValueWide,
                isNarrowCard && styles.patientDetailValueWideStacked,
              ]}>
              No tests available
            </Text>
          )}
        </View>
      </View>
      <View
        style={[
          styles.patientDetailInfoRow,
          isNarrowCard && styles.patientDetailInfoRowStacked,
        ]}>
        <Text style={styles.patientDetailLabel}>Tubes</Text>
        <Text
          style={[
            styles.patientDetailValueWide,
            isNarrowCard && styles.patientDetailValueWideStacked,
          ]}>
          {displayTubes.length ? displayTubes.join(', ') : '-'}
        </Text>
      </View>
      <View
        style={[
          styles.patientDetailInfoRow,
          isNarrowCard && styles.patientDetailInfoRowStacked,
        ]}>
        <Text style={styles.patientDetailLabel}>Documents</Text>
        <View
          style={[
            styles.patientDetailDocumentsWrap,
            isNarrowCard && styles.patientDetailDocumentsWrapStacked,
          ]}>
          {normalizedDocuments.map((document, index) => (
            <TouchableOpacity
              key={document.id}
              activeOpacity={0.85}
              onPress={() => handleOpenDocument(index)}>
              <Text style={styles.patientDocumentLink}>{document.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
        </View>
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
              size={16}
              style={styles.patientCancelBookingButtonIcon}
            />
            <Text style={styles.patientCancelBookingButtonText}>
              {cancelBookingLabel}
            </Text>
          </TouchableOpacity>
        ) : null}
        {onAddPanelCompany ? (
          <View
            style={[
              styles.patientActionButtonsRow,
              isNarrowCard && styles.patientActionButtonsRowStacked,
            ]}>
            {onOpenSampleCollection ? (
              <TouchableOpacity
                activeOpacity={0.85}
                style={[
                  styles.patientAddTestButton,
                  styles.patientActionButtonHalf,
                  isNarrowCard && styles.patientActionButtonFull,
                ]}
                onPress={() => onOpenSampleCollection(patient)}>
                <Ionicons
                  name="flask-outline"
                  size={16}
                  style={styles.patientAddTestButtonIcon}
                />
                <Text style={styles.patientAddTestButtonText}>
                  Sample Collection
                </Text>
              </TouchableOpacity>
            ) : null}
            {onAddPanelCompany ? (
              <TouchableOpacity
                activeOpacity={0.85}
                style={[
                  styles.patientAddTestButton,
                  styles.patientActionButtonHalf,
                  isNarrowCard && styles.patientActionButtonFull,
                  isAddPanelCompanyDisabled && styles.patientAddTestButtonDisabled,
                ]}
                onPress={() => onAddPanelCompany(patient)}
                disabled={Boolean(isAddPanelCompanyDisabled)}>
                <Ionicons
                  name="business-outline"
                  size={16}
                  style={styles.patientAddTestButtonIcon}
                />
                <Text style={styles.patientAddTestButtonText}>
                  {addPanelCompanyLabel}
                </Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}
      </View>

      <Modal
        transparent
        animationType="fade"
        visible={Boolean(activeDocument)}
        onRequestClose={handleCloseDocumentViewer}>
        <View style={styles.patientDocumentViewerOverlay}>
          <TouchableOpacity
            activeOpacity={1}
            style={styles.patientDocumentViewerBackdrop}
            onPress={handleCloseDocumentViewer}
          />
          <View style={styles.patientDocumentViewerCard}>
            <View style={styles.patientDocumentViewerHeader}>
              <View>
                <Text style={styles.patientDocumentViewerEyebrow}>Document Preview</Text>
                <Text style={styles.patientDocumentViewerTitle}>
                  {activeDocument?.label || 'Photo'}
                </Text>
              </View>
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

            <View style={styles.patientDocumentViewerImageWrap}>
              {activeDocument ? (
                <View
                  collapsable={false}
                  style={styles.patientDocumentViewerGestureViewport}
                  onStartShouldSetResponder={() => true}
                  onMoveShouldSetResponder={() => true}
                  onResponderGrant={handleDocumentTouchStart}
                  onResponderMove={handleDocumentTouchMove}
                  onResponderRelease={handleDocumentTouchEnd}
                  onResponderTerminationRequest={() => false}
                  onResponderTerminate={handleDocumentTouchEnd}>
                  <Image
                    source={activeDocument.imageSource}
                    style={[
                      styles.patientDocumentViewerImage,
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
          </View>
        </View>
      </Modal>
    </>
  );
}

export default React.memo(PatientDetailCard);
