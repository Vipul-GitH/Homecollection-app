import React, {useEffect, useMemo, useState} from 'react';
import {Modal, NativeModules, Text, TouchableOpacity, View} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import {getUploadFileName} from '../../../screens/bookings/appointmentDetails/helpers';
import {API_BASE_URL} from '../../../constants/config/api';

const {LocalDocumentPickerModule, LocalGeoCameraModule} = NativeModules;

const toStableValue = value =>
  value === null || value === undefined ? '' : String(value).trim();

const getCompanyKey = company =>
  [
    toStableValue(company?.compCatId || company?.id || company?.chipId),
    toStableValue(company?.name).toLowerCase(),
  ].join('|');

const getTestCompanyKey = test =>
  [
    toStableValue(test?.panelCompanyId),
    toStableValue(test?.panelCompanyName).toLowerCase(),
  ].join('|');

const getTestIdentity = (test, index = 0) =>
  toStableValue(test?.id || test?.removeKey || test?.code || `test-${index}`);

const getPanelNameFromTest = test =>
  toStableValue(test?.panelCompanyName) || 'Current Panel';

const getPanelKeyFromTest = test =>
  [
    toStableValue(test?.panelCompanyChipId),
    toStableValue(test?.panelCompanyId),
    getPanelNameFromTest(test).toLowerCase(),
    toStableValue(test?.panelCompanySource).toUpperCase(),
  ].join('|');

const doesTestBelongToCompany = (test, company) => {
  const companyChipId = toStableValue(company?.chipId || company?.id);
  const testChipId = toStableValue(test?.panelCompanyChipId);
  const companySource = toStableValue(company?.chipSource).toUpperCase();
  const testSource = toStableValue(test?.panelCompanySource).toUpperCase();

  if (companyChipId && testChipId) {
    return companyChipId === testChipId;
  }

  if (companySource === 'APP') {
    return testSource === 'APP' && getTestCompanyKey(test) === getCompanyKey(company);
  }

  if (testSource === 'APP') {
    return false;
  }

  const companyKey = getCompanyKey(company);
  const companyName = toStableValue(company?.name || company?.panelCompany);
  const companyId = toStableValue(company?.compCatId || company?.id);
  const testCompanyId = toStableValue(test?.panelCompanyId);
  const testCompanyName = toStableValue(test?.panelCompanyName).toLowerCase();

  return (
    (companyId && testCompanyId === companyId) ||
    (companyName && testCompanyName === companyName.toLowerCase()) ||
    getTestCompanyKey(test) === companyKey
  );
};

const getChargeModeLabel = company => {
  const mode = toStableValue(
    company?.billingChargeMode ||
      company?.chargeMode ||
      company?.selected_charge_mode ||
      company?.selectedChargeMode,
  ).toUpperCase();

  if (mode.includes('P')) {
    return 'Paying';
  }
  if (mode.includes('C')) {
    return 'Credit';
  }
  if (mode.includes('F')) {
    return 'Free';
  }

  return mode || '';
};

const getTestPrice = test =>
  (() => {
    const resolvedCharge = Number(test?.charge || 0) || 0;
    if (resolvedCharge > 0) {
      return resolvedCharge;
    }

    const mrp = Number(test?.mrp || test?.amount || 0) || 0;
    const charge = resolvedCharge;
    const baseMrp = mrp || charge;
    const discountPercent =
      Number(
        test?.percentageonstandard ||
          test?.percentageOnStandard ||
          test?.percentage_on_standard ||
          test?.PercentageOnStandard ||
          test?.percentagestandard ||
          test?.percentageStandard ||
          test?.percentage_standard ||
          0,
      ) || 0;

    if (discountPercent > 0 && baseMrp > 0) {
      return Math.max(0, baseMrp - (baseMrp * discountPercent) / 100);
    }

    return charge || baseMrp;
  })();

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
const MANUAL_HC_SLIP_STATUS = 'manual_hc_slip';

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

  return 'application/octet-stream';
};

const normalizePickedDocuments = pickedFiles =>
  (Array.isArray(pickedFiles) ? pickedFiles : [])
    .filter(file => Boolean(file?.uri))
    .map((file, index) => {
      const type = file.type || getMimeTypeFromFileName(file?.name);

      return {
        uri: file.uri,
        name: getUploadFileName({
          originalName: file.name,
          mimeType: type,
          fallbackPrefix: 'manual-hc-slip',
          fallbackIndex: index + 1,
        }),
        type,
      };
    });

const resolveDocumentUrl = value => {
  const rawValue = toStableValue(
    typeof value === 'string'
      ? value
      : value?.url || value?.uri || value?.path || value?.file,
  );

  if (!rawValue) {
    return '';
  }

  if (/^https?:\/\//i.test(rawValue)) {
    return rawValue;
  }

  return `${API_BASE_URL}/${rawValue.replace(/^\/+/, '')}`;
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

const buildBackendManualSlipDocuments = patient =>
  (Array.isArray(patient?.patientDocuments) ? patient.patientDocuments : [])
    .filter(
      document =>
        toStableValue(document?.type || document?.document_type).toLowerCase() ===
        'manual_slip',
    )
    .map((document, index) => {
      const uri = resolveDocumentUrl(document);
      if (!uri) {
        return null;
      }

      return {
        uri,
        name:
          toStableValue(document?.name || document?.label) ||
          getDisplayNameFromUri(document?.file || document?.url || document?.path) ||
          `Manual Slip ${index + 1}`,
        canRemove: false,
      };
    })
    .filter(Boolean);

const buildFallbackCompanyFromTests = ({patient, tests}) => {
  const firstTestWithPanel = (Array.isArray(tests) ? tests : []).find(
    test =>
      toStableValue(test?.panelCompanyName) ||
      toStableValue(test?.panelCompanyId) ||
      toStableValue(test?.panelCompanyChipId),
  );
  const name =
    toStableValue(firstTestWithPanel?.panelCompanyName) ||
    '';
  const compCatId =
    toStableValue(firstTestWithPanel?.panelCompanyId);

  if (!name && !compCatId) {
    return null;
  }

  const source =
    toStableValue(firstTestWithPanel?.panelCompanySource).toUpperCase() || 'API';
  const chipId =
    toStableValue(firstTestWithPanel?.panelCompanyChipId) ||
    `${source.toLowerCase()}-${compCatId || name.toLowerCase()}`;

  return {
    id: compCatId || chipId,
    chipId,
    chipSource: source,
    name: name || 'Current Panel',
    compCatId,
    billingChargeMode:
      firstTestWithPanel?.billingChargeMode ||
      firstTestWithPanel?.chargeMode ||
      patient?.billingChargeMode ||
      patient?.chargeMode ||
      '',
  };
};

const buildTestDerivedPanelGroups = ({patient, tests, consumedTestIds}) => {
  const groupMap = new Map();

  tests.forEach((test, index) => {
    const testIdentity = getTestIdentity(test, index);
    if (consumedTestIds.has(testIdentity)) {
      return;
    }

    const groupKey = getPanelKeyFromTest(test);
    const groupName = getPanelNameFromTest(test);

    if (!groupMap.has(groupKey)) {
      groupMap.set(groupKey, {
        key: groupKey || `panel-from-test-${groupMap.size}`,
        company: buildFallbackCompanyFromTests({patient, tests: [test]}),
        name: groupName,
        tests: [],
      });
    }

    groupMap.get(groupKey).tests.push(test);
    consumedTestIds.add(testIdentity);
  });

  return Array.from(groupMap.values());
};

const buildPanelGroups = ({patient, tests, panelCompanies}) => {
  const groups = [];
  const consumedTestIds = new Set();

  panelCompanies.forEach((company, index) => {
    const companyKey = getCompanyKey(company);
    const companyName = toStableValue(company?.name);
    const panelTests = tests.filter(test => {
      const isMatch = doesTestBelongToCompany(test, company);

      if (isMatch) {
        consumedTestIds.add(getTestIdentity(test));
      }
      return isMatch;
    });

    groups.push({
      key: company.chipId || company.id || companyKey || `panel-${index}`,
      company,
      name: companyName || 'Panel Company',
      tests: panelTests,
    });
  });

  const testDerivedGroups = buildTestDerivedPanelGroups({
    patient,
    tests,
    consumedTestIds,
  });
  groups.push(...testDerivedGroups);

  const unmappedTests = tests.filter((test, index) =>
    !consumedTestIds.has(getTestIdentity(test, index)),
  );
  if (unmappedTests.length || (!groups.length && tests.length)) {
    const currentPanelTests = unmappedTests.length ? unmappedTests : tests;
    const fallbackCompany = buildFallbackCompanyFromTests({
      patient,
      tests: currentPanelTests,
    });

    groups.push({
      key: 'current-panel-tests',
      company: fallbackCompany,
      name:
        toStableValue(currentPanelTests[0]?.panelCompanyName) ||
        'Current Panel',
      tests: currentPanelTests,
    });
  }

  return groups;
};

function PatientTestsAccordion({
  styles,
  patient,
  tests,
  subtotal = 0,
  isNarrow,
  onRemoveSelectedTest,
  panelCompanies = [],
  canOpenPanelCompanyTests = false,
  onSelectPanelCompany,
  onRemovePanelCompany,
  onAddPanelCompany,
  addPanelCompanyLabel = 'Add Panel',
  isAddPanelCompanyDisabled = false,
  testBookingStatusValue = 'none',
  onTestBookingStatusChange,
  manualSlipDocuments = [],
  onManualSlipDocumentsChange,
  showAlert,
}) {
  const [isTestBookingStatusExpanded, setIsTestBookingStatusExpanded] =
    useState(false);
  const panelGroups = buildPanelGroups({patient, tests, panelCompanies});
  const selectedTestBookingStatus = useMemo(
    () =>
      TEST_BOOKING_STATUS_OPTIONS.find(
        option => option.value === testBookingStatusValue,
      ) || TEST_BOOKING_STATUS_OPTIONS[0],
    [testBookingStatusValue],
  );
  const shouldShowManualSlipUpload =
    testBookingStatusValue === MANUAL_HC_SLIP_STATUS;
  const displayManualSlipDocuments = useMemo(
    () => [
      ...buildBackendManualSlipDocuments(patient),
      ...(Array.isArray(manualSlipDocuments)
        ? manualSlipDocuments.map((document, index) => ({
            ...document,
            canRemove: true,
            sourceIndex: index,
          }))
        : []),
    ],
    [manualSlipDocuments, patient],
  );
  const appendManualSlipDocuments = pickedDocuments => {
    if (!pickedDocuments.length) {
      return;
    }

    onManualSlipDocumentsChange?.(patient, [
      ...(Array.isArray(manualSlipDocuments) ? manualSlipDocuments : []),
      ...pickedDocuments,
    ]);
  };

  useEffect(() => {
    if (
      !shouldShowManualSlipUpload &&
      Array.isArray(manualSlipDocuments) &&
      manualSlipDocuments.length
    ) {
      onManualSlipDocumentsChange?.(patient, []);
    }
  }, [
    manualSlipDocuments,
    onManualSlipDocumentsChange,
    patient,
    shouldShowManualSlipUpload,
  ]);

  const handlePickManualSlipDocumentsFromGallery = async () => {
    if (!LocalDocumentPickerModule?.pickDocuments) {
      showAlert?.(
        'Upload Not Available',
        'Document picker module is not available in this build.',
      );
      return;
    }

    try {
      const pickedFiles = await LocalDocumentPickerModule.pickDocuments();
      const pickedDocuments = normalizePickedDocuments(pickedFiles);

      if (!pickedDocuments.length) {
        return;
      }

      appendManualSlipDocuments(pickedDocuments);
    } catch (error) {
      if (
        error?.code === 'DOCUMENT_PICKER_CANCELLED' ||
        String(error?.message || '').toLowerCase().includes('cancel')
      ) {
        return;
      }

      showAlert?.(
        'Upload Failed',
        'Unable to select documents right now. Please try again.',
      );
    }
  };
  const handleCaptureManualSlipDocument = async () => {
    if (!LocalGeoCameraModule?.captureStampedPhoto) {
      showAlert?.(
        'Camera Not Available',
        'Camera module is not available in this build.',
      );
      return;
    }

    try {
      const capturedPhoto = await LocalGeoCameraModule.captureStampedPhoto('');

      if (!capturedPhoto?.uri) {
        return;
      }

      const type = capturedPhoto.type || 'image/jpeg';
      appendManualSlipDocuments([
        {
          uri: capturedPhoto.uri,
          name: getUploadFileName({
            preferredName: 'Manual HC Slip',
            originalName: capturedPhoto.name,
            mimeType: type,
            fallbackPrefix: 'manual-hc-slip',
          }),
          type,
        },
      ]);
    } catch (error) {
      if (
        error?.code === 'CAMERA_CANCELLED' ||
        String(error?.message || '').toLowerCase().includes('cancel')
      ) {
        return;
      }

      showAlert?.(
        'Camera Failed',
        'Unable to capture manual slip right now. Please try again.',
      );
    }
  };
  const handlePickManualSlipDocuments = () => {
    showAlert?.('Upload manual slip', 'Choose how to add this file.', [
      {text: 'Camera', onPress: handleCaptureManualSlipDocument},
      {text: 'Gallery', onPress: handlePickManualSlipDocumentsFromGallery},
      {text: 'Cancel', style: 'cancel'},
    ]);
  };

  const handleRemoveManualSlipDocument = indexToRemove => {
    onManualSlipDocumentsChange?.(
      patient,
      (Array.isArray(manualSlipDocuments) ? manualSlipDocuments : []).filter(
        (_, index) => index !== indexToRemove,
      ),
    );
  };

  return (
    <View style={styles.patientTestsSection}>
      <View
        style={[
          styles.patientTestsSectionHeader,
          isNarrow && styles.patientTestsSectionHeaderStacked,
        ]}>
        <View style={styles.patientTestsSectionTitleWrap}>
          <Text style={styles.patientTestsSectionTitle}>Tests</Text>
          <Text style={styles.patientTestsSectionSubtitle}>
            {tests.length
              ? `${tests.length} tests | Rs. ${Number(subtotal || 0).toFixed(2)}`
              : 'No tests added yet'}
          </Text>
        </View>
        <View style={styles.patientTestsHeaderActions}>
          {onAddPanelCompany ? (
            <TouchableOpacity
              activeOpacity={0.85}
              style={[
                styles.patientTestsAddPanelButton,
                isAddPanelCompanyDisabled &&
                  styles.patientTestsAddPanelButtonDisabled,
              ]}
              onPress={() => onAddPanelCompany(patient)}
              disabled={Boolean(isAddPanelCompanyDisabled)}>
              <Ionicons
                name="add"
                size={14}
                style={styles.patientTestsAddPanelIcon}
              />
              <Text style={styles.patientTestsAddPanelText}>
                {addPanelCompanyLabel}
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      {panelGroups.length ? (
        <View style={styles.patientTestsPanelList}>
          {panelGroups.map(group => {
            const chargeModeLabel = getChargeModeLabel(group.company);
            const groupSubtotal = group.tests.reduce(
              (total, test) => total + getTestPrice(test),
              0,
            );

            return (
              <View key={group.key} style={styles.patientTestsPanelCard}>
                <View
                  style={[
                    styles.patientTestsPanelHeader,
                    isNarrow && styles.patientTestsPanelHeaderStacked,
                  ]}>
                  <View style={styles.patientTestsPanelTitleRow}>
                    <Text
                      style={styles.patientTestsPanelTitle}
                      numberOfLines={2}>
                      {group.name}
                    </Text>
                    {chargeModeLabel ? (
                      <View
                        style={[
                          styles.patientTestsPanelHeaderModeChip,
                          chargeModeLabel === 'Credit' &&
                            styles.patientTestsPanelHeaderModeChipCredit,
                        ]}>
                        <Text
                          style={[
                            styles.patientTestsPanelHeaderModeText,
                            chargeModeLabel === 'Credit' &&
                              styles.patientTestsPanelHeaderModeTextCredit,
                          ]}>
                          {chargeModeLabel}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                </View>

                  <View style={styles.patientTestsPanelActions}>
                    <View style={styles.patientTestsPanelAmountChip}>
                      <Text style={styles.patientTestsPanelAmountText}>
                        Rs. {groupSubtotal.toFixed(2)}
                      </Text>
                    </View>
                    {group.company && onSelectPanelCompany ? (
                      <TouchableOpacity
                        activeOpacity={0.85}
                        style={[
                          styles.patientTestsSmallButton,
                          styles.patientTestsAddTestButtonHighlight,
                        ]}
                        disabled={!canOpenPanelCompanyTests}
                        onPress={() =>
                          onSelectPanelCompany({
                            patient,
                            panelCompany: group.company,
                          })
                        }>
                        <Text
                          style={[
                            styles.patientTestsSmallButtonText,
                            styles.patientTestsAddTestButtonHighlightText,
                          ]}>
                          + Add Test
                        </Text>
                      </TouchableOpacity>
                    ) : null}
                    {group.company && onRemovePanelCompany ? (
                      <TouchableOpacity
                        activeOpacity={0.85}
                        style={[
                          styles.patientTestsSmallButton,
                          styles.patientTestsRemovePanelButton,
                        ]}
                        onPress={() =>
                          onRemovePanelCompany(patient, group.company)
                        }>
                        <Text
                          style={[
                            styles.patientTestsSmallButtonText,
                            styles.patientTestsRemovePanelButtonText,
                          ]}>
                          Remove
                        </Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>

                {group.tests.length ? (
                  <View style={styles.patientTestsCardList}>
                    {group.tests.map(test => (
                      <View key={test.id} style={styles.patientTestsTestCard}>
                        <View style={styles.sampleCollectionSelectedTextWrap}>
                          <Text style={styles.patientTestsTestCode}>
                            {test.code}
                          </Text>
                          <Text style={styles.patientTestsTestName}>
                            {test.name}
                          </Text>
                          {test.parentDescription ? (
                            <Text style={styles.patientTestsTestMeta}>
                              Child of {test.parentDescription}
                            </Text>
                          ) : null}
                        </View>
                        <View style={styles.patientTestsPricePill}>
                          <Text style={styles.patientTestsPriceText}>
                            Rs. {getTestPrice(test).toFixed(2)}
                          </Text>
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
                              name="close"
                              size={15}
                              style={styles.sampleCollectionRemoveButtonIcon}
                            />
                          </TouchableOpacity>
                        ) : null}
                      </View>
                    ))}
                  </View>
                ) : (
                  <Text style={styles.patientTestsEmptyPanelText}>
                    No tests added for this panel.
                  </Text>
                )}
              </View>
            );
          })}
        </View>
      ) : (
        <Text style={styles.patientTestsEmptyText}>No tests available</Text>
      )}

      <View style={styles.patientTestsHeaderActions}>
        <View style={styles.patientTestBookingStatusControl}>
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
              name={isTestBookingStatusExpanded ? 'chevron-up' : 'chevron-down'}
              size={16}
              style={styles.patientTestBookingStatusChevron}
            />
          </TouchableOpacity>
        </View>
      </View>

      {shouldShowManualSlipUpload ? (
        <View style={styles.patientPaymentProofSection}>
          <Text style={styles.patientDetailLabel}>Upload manual slip</Text>
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
              <Text style={styles.completeUploadTitle}>Upload manual slip</Text>
              <Text style={styles.completeUploadHint}>
                Pick image or PDF from device
              </Text>
            </View>
          </TouchableOpacity>
          {displayManualSlipDocuments.length ? (
            <View style={styles.patientTestsManualSlipList}>
              {displayManualSlipDocuments.map((document, index) => (
                <View
                  key={`${document?.uri || document?.name || 'manual-slip'}-${index}`}
                  style={styles.patientTestsManualSlipItem}>
                  <Text
                    numberOfLines={1}
                    style={styles.patientTestsManualSlipName}>
                    {document?.name || `Manual Slip ${index + 1}`}
                  </Text>
                  {document?.canRemove ? (
                    <TouchableOpacity
                      activeOpacity={0.85}
                      style={styles.sampleCollectionRemoveButton}
                      onPress={() =>
                        handleRemoveManualSlipDocument(
                          document.sourceIndex ?? index,
                        )
                      }>
                      <Ionicons
                        name="close"
                        size={15}
                        style={styles.sampleCollectionRemoveButtonIcon}
                      />
                    </TouchableOpacity>
                  ) : null}
                </View>
              ))}
            </View>
          ) : null}
        </View>
      ) : null}

      <Modal
        visible={isTestBookingStatusExpanded}
        transparent
        animationType="fade"
        onRequestClose={() => setIsTestBookingStatusExpanded(false)}>
        <View style={styles.patientTestBookingStatusModalOverlay}>
          <TouchableOpacity
            activeOpacity={1}
            style={styles.patientTestBookingStatusModalBackdrop}
            onPress={() => setIsTestBookingStatusExpanded(false)}
          />
          <View style={styles.patientTestBookingStatusModalCard}>
            <Text style={styles.patientTestBookingStatusModalTitle}>
              Test booking status
            </Text>
            <View style={styles.patientTestBookingStatusOptionList}>
              {TEST_BOOKING_STATUS_OPTIONS.map(option => {
                const isSelected =
                  option.value === selectedTestBookingStatus.value;

                return (
                  <TouchableOpacity
                    key={option.value}
                    activeOpacity={0.85}
                    style={[
                      styles.patientTestBookingStatusOption,
                      isSelected && styles.patientTestBookingStatusOptionActive,
                    ]}
                    onPress={() => {
                      if (!isSelected) {
                        onTestBookingStatusChange?.(patient, option.value);
                      }
                      setIsTestBookingStatusExpanded(false);
                    }}>
                    <Ionicons
                      name={option.icon}
                      size={16}
                      style={[
                        styles.patientTestBookingStatusIcon,
                        isSelected && styles.patientTestBookingStatusIconActive,
                      ]}
                    />
                    <Text
                      style={[
                        styles.patientTestBookingStatusText,
                        isSelected &&
                          styles.patientTestBookingStatusTextActive,
                      ]}>
                      {option.label}
                    </Text>
                    {isSelected ? (
                      <Ionicons
                        name="checkmark-circle"
                        size={18}
                        style={styles.patientTestBookingStatusChevron}
                      />
                    ) : null}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

export default React.memo(PatientTestsAccordion);
