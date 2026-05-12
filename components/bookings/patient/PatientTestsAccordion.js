import React from 'react';
import {Text, TouchableOpacity, View} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';

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

const buildFallbackCompanyFromTests = ({patient, tests}) => {
  const firstTestWithPanel = (Array.isArray(tests) ? tests : []).find(
    test =>
      toStableValue(test?.panelCompanyName) ||
      toStableValue(test?.panelCompanyId) ||
      toStableValue(test?.panelCompanyChipId),
  );
  const name =
    toStableValue(firstTestWithPanel?.panelCompanyName) ||
    toStableValue(patient?.panelCompany);
  const compCatId =
    toStableValue(firstTestWithPanel?.panelCompanyId) ||
    toStableValue(patient?.compCatId || patient?.comp_cat_id);

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

const buildPanelGroups = ({patient, tests, panelCompanies}) => {
  const groups = [];
  const consumedTestIds = new Set();

  panelCompanies.forEach((company, index) => {
    const companyKey = getCompanyKey(company);
    const companyName = toStableValue(company?.name || patient?.panelCompany);
    const panelTests = tests.filter(test => {
      const isMatch = doesTestBelongToCompany(test, company);

      if (isMatch) {
        consumedTestIds.add(test.id);
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

  const unmappedTests = tests.filter(test => !consumedTestIds.has(test.id));
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
        toStableValue(currentPanelTests[0]?.panelCompanyName || patient?.panelCompany) ||
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
}) {
  const panelGroups = buildPanelGroups({patient, tests, panelCompanies});

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
          {panelGroups.length
            ? panelGroups.map(group => (
                <View key={`header-${group.key}`} style={styles.patientTestsMappedBadge}>
                  <Text
                    style={styles.patientTestsMappedBadgeText}
                    numberOfLines={2}>
                    {group.name}
                  </Text>
                </View>
              ))
            : null}
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

            return (
              <View key={group.key} style={styles.patientTestsPanelCard}>
                <View style={styles.patientTestsPanelActions}>
                  {chargeModeLabel ? (
                    <View
                      style={[
                        styles.patientTestsPanelModeChip,
                        chargeModeLabel === 'Credit' &&
                          styles.patientTestsPanelModeChipCredit,
                      ]}>
                      <Text
                        style={[
                          styles.patientTestsPanelModeText,
                          chargeModeLabel === 'Credit' &&
                            styles.patientTestsPanelModeTextCredit,
                        ]}>
                        {chargeModeLabel}
                      </Text>
                    </View>
                  ) : null}
                  <View style={styles.patientTestsPanelCountChip}>
                    <Text style={styles.patientTestsPanelCountText}>
                      {group.tests.length} tests
                    </Text>
                  </View>
                  {group.company && onSelectPanelCompany ? (
                    <TouchableOpacity
                      activeOpacity={0.85}
                      style={styles.patientTestsSmallButton}
                      disabled={!canOpenPanelCompanyTests}
                      onPress={() =>
                        onSelectPanelCompany({
                          patient,
                          panelCompany: group.company,
                        })
                      }>
                      <Text style={styles.patientTestsSmallButtonText}>
                        + Add Test
                      </Text>
                    </TouchableOpacity>
                  ) : null}
                  {group.company && onRemovePanelCompany ? (
                    <TouchableOpacity
                      activeOpacity={0.85}
                      style={styles.patientTestsSmallButton}
                      onPress={() =>
                        onRemovePanelCompany(patient, group.company)
                      }>
                      <Text style={styles.patientTestsSmallButtonText}>
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
    </View>
  );
}

export default React.memo(PatientTestsAccordion);
