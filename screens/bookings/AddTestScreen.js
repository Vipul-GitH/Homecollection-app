import React, {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import {
  findMatchingPanelCompanies,
  normalizePanelCompanyItems,
} from './appointmentDetails/helpers';

const CATALOG_PAGE_SIZE = 10;
const CATALOG_SCROLL_LOAD_THRESHOLD = 120;
const toStableValue = value =>
  value === null || value === undefined ? '' : String(value).trim();

const getPanelIdentity = panelCompany =>
  [
    toStableValue(panelCompany?.id),
    toStableValue(panelCompany?.compCatId),
    toStableValue(panelCompany?.centerId),
    toStableValue(panelCompany?.name).toLowerCase(),
  ].join('|');

const getPatientIdentity = patient =>
  toStableValue(
    patient?.bookingPatientId ||
      patient?.booking_patient_id ||
      patient?.patientId ||
      patient?.patient_id ||
      patient?.id,
  );

const getTestDedupeKey = test =>
  toStableValue(
    test?.dedupe_key ||
      test?.booked_code ||
      test?.testcode1 ||
      test?.test_code ||
      test?.code,
  ).toUpperCase();

const testHasChildren = test =>
  Boolean(test?.has_children) ||
  (Array.isArray(test?.child_tests) && test.child_tests.length > 0);

const getCatalogGroupId = group =>
  toStableValue(group?.group_id || group?.gcode || group?.group_code);

const getCatalogSubgroupId = subgroup =>
  toStableValue(
    subgroup?.subgroup_id || subgroup?.scode || subgroup?.subgroup_code,
  );

const getCatalogGroupTitle = group => {
  const groupId = getCatalogGroupId(group);
  const groupName = toStableValue(group?.group_name) || 'Unnamed Group';
  return groupId ? `${groupId} - ${groupName}` : groupName;
};

const getCatalogSubgroupTitle = subgroup => {
  const subgroupId = getCatalogSubgroupId(subgroup);
  const subgroupName =
    toStableValue(subgroup?.subgroup_name) || 'Unnamed Subgroup';
  return subgroupId ? `${subgroupId} - ${subgroupName}` : subgroupName;
};

const buildTestSelectionKey = (panelCompany, test, childTest = null) =>
  [
    toStableValue(panelCompany?.compCatId) || 'na',
    childTest ? 'child' : 'test',
    getTestDedupeKey(childTest || test),
    childTest?.catalog_key || test?.catalog_key || '',
    childTest?.booked_code || test?.booked_code || 'na',
    childTest?.description || test?.description || 'na',
  ].join('|');

const isSamePanelCompany = (leftCompany, rightCompany) => {
  if (!leftCompany || !rightCompany) {
    return false;
  }

  const leftId = toStableValue(leftCompany?.id);
  const rightId = toStableValue(rightCompany?.id);
  if (leftId && rightId && leftId === rightId) {
    return true;
  }

  return (
    toStableValue(leftCompany?.compCatId) ===
      toStableValue(rightCompany?.compCatId) &&
    toStableValue(leftCompany?.centerId) ===
      toStableValue(rightCompany?.centerId) &&
    toStableValue(leftCompany?.name).toLowerCase() ===
      toStableValue(rightCompany?.name).toLowerCase() &&
    toStableValue(leftCompany?.details).toLowerCase() ===
      toStableValue(rightCompany?.details).toLowerCase()
  );
};

export default function AddTestScreen({
  selectedPatient,
  selectedPanelCompany,
  selectedTests,
  styles,
  onAddTestPatient,
  onPanelCompanySelect,
  onToggleSelectedTest,
  onRemoveSelectedTest,
}) {
  const [isLoadingCompanies, setIsLoadingCompanies] = useState(false);
  const [panelCompanies, setPanelCompanies] = useState([]);
  const [activePanelCompany, setActivePanelCompany] = useState(null);
  const [groups, setGroups] = useState([]);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [selectedSubgroup, setSelectedSubgroup] = useState(null);
  const [catalogMode, setCatalogMode] = useState('search');
  const [expandedTests, setExpandedTests] = useState({});
  const [searchText, setSearchText] = useState('');
  const [visibleItemCount, setVisibleItemCount] = useState(CATALOG_PAGE_SIZE);
  const deferredSearchText = useDeferredValue(searchText);
  const autoOpenedPanelKeyRef = useRef('');
  const loggedDuplicateKeysRef = useRef(new Set());

  const selectedDedupeKeys = useMemo(
    () => new Set(selectedTests.map(getTestDedupeKey).filter(Boolean)),
    [selectedTests],
  );
  const selectedTestsSummary = useMemo(
    () =>
      selectedTests.map((test, index) => ({
        key: test?.key || `${getTestDedupeKey(test) || 'test'}-${index}`,
        code: toStableValue(test?.booked_code || test?.code) || 'N/A',
        name:
          toStableValue(test?.description || test?.name) || 'Unnamed Test',
        panelCompanyName:
          toStableValue(test?.panelCompanyName) ||
          toStableValue(selectedPanelCompany?.name) ||
          'Selected Panel',
        specimenName: toStableValue(test?.specimenName) || 'N/A',
        childCount: Array.isArray(test?.childTests) ? test.childTests.length : 0,
        isAppAdded: Boolean(test?.isAppAdded),
      })),
    [selectedPanelCompany?.name, selectedTests],
  );

  const dedupeTests = useCallback(
    tests => {
      const dedupedMap = new Map();
      const duplicateLogs = [];

      tests.forEach((test, index) => {
        const dedupeKey = getTestDedupeKey(test);
        if (!dedupeKey) {
          return;
        }

        if (Number(test?.duplicate_count || 0) > 1) {
          duplicateLogs.push({
            compCatId: toStableValue(activePanelCompany?.compCatId),
            dedupe_key: dedupeKey,
            source_row_ids: toStableValue(test?.source_row_ids),
          });
        }

        const candidate = {...test, __sourceIndex: index};
        const existing = dedupedMap.get(dedupeKey);
        if (!existing) {
          dedupedMap.set(dedupeKey, candidate);
          return;
        }

        const candidateSelected = selectedDedupeKeys.has(dedupeKey);
        const existingHasChildren = testHasChildren(existing);
        const candidateHasChildren = testHasChildren(candidate);
        const existingMrp = Number(existing?.mrp || 0);
        const candidateMrp = Number(candidate?.mrp || 0);
        const shouldReplace =
          candidateSelected ||
          (!existingHasChildren && candidateHasChildren) ||
          (existingHasChildren === candidateHasChildren &&
            candidateMrp > existingMrp);

        if (shouldReplace) {
          dedupedMap.set(dedupeKey, candidate);
        }

        duplicateLogs.push({
          compCatId: toStableValue(activePanelCompany?.compCatId),
          dedupe_key: dedupeKey,
          source_row_ids: [
            toStableValue(existing?.source_row_ids || existing?.__sourceIndex),
            toStableValue(candidate?.source_row_ids || candidate?.__sourceIndex),
          ]
            .filter(Boolean)
            .join(','),
        });
      });

      duplicateLogs.forEach(logItem => {
        const logKey = `${logItem.compCatId}|${logItem.dedupe_key}|${logItem.source_row_ids}`;
        if (loggedDuplicateKeysRef.current.has(logKey)) {
          return;
        }

        loggedDuplicateKeysRef.current.add(logKey);
      });

      return Array.from(dedupedMap.values());
    },
    [activePanelCompany?.compCatId, selectedDedupeKeys],
  );

  const flattenedCompanyTests = useMemo(
    () =>
      groups.flatMap(group =>
        (Array.isArray(group?.subgroups) ? group.subgroups : []).flatMap(subgroup =>
          dedupeTests(Array.isArray(subgroup?.tests) ? subgroup.tests : []).map(test => {
            const childSearchKey = (Array.isArray(test?.child_tests)
              ? test.child_tests
              : [])
              .map(
                child =>
                  `${child?.description || ''} ${child?.booked_code || ''}`,
              )
              .join(' ');

            return {
              ...test,
              __groupName: group?.group_name || '',
              __subgroupName: subgroup?.subgroup_name || '',
              __searchKey: `${test?.description || ''} ${
                test?.booked_code || ''
              } ${group?.group_name || ''} ${
                subgroup?.subgroup_name || ''
              } ${childSearchKey}`.toLowerCase(),
            };
          }),
        ),
      ),
    [dedupeTests, groups],
  );

  useEffect(() => {
    autoOpenedPanelKeyRef.current = '';
    setActivePanelCompany(null);
    setGroups([]);
    setSelectedGroup(null);
    setSelectedSubgroup(null);
    setExpandedTests({});
    setSearchText('');
  }, [selectedPatient]);

  useEffect(() => {
    let isMounted = true;

    const loadPanelCompanies = async () => {
      if (!selectedPatient || !onAddTestPatient) {
        return;
      }

      setIsLoadingCompanies(true);

      try {
        const responseData = await onAddTestPatient(selectedPatient);
        if (!isMounted) {
          return;
        }

        const normalizedItems = normalizePanelCompanyItems(responseData);
        const matchedCompanies = findMatchingPanelCompanies(
          normalizedItems,
          selectedPatient?.panelCompany,
        );

        if (selectedPanelCompany) {
          const matchingSelectedCompany =
            normalizedItems.find(company =>
              isSamePanelCompany(company, selectedPanelCompany),
            ) || selectedPanelCompany;

          setPanelCompanies([matchingSelectedCompany]);
          return;
        }

        setPanelCompanies(
          matchedCompanies.length ? matchedCompanies : normalizedItems.slice(0, 6),
        );
      } finally {
        if (isMounted) {
          setIsLoadingCompanies(false);
        }
      }
    };

    loadPanelCompanies();

    return () => {
      isMounted = false;
    };
  }, [onAddTestPatient, selectedPanelCompany, selectedPatient]);

  const activeItems = useMemo(() => {
    const normalizedSearch = deferredSearchText.trim().toLowerCase();

    if (catalogMode === 'search' && !selectedGroup && !selectedSubgroup) {
      if (!normalizedSearch) {
        return flattenedCompanyTests;
      }

      return flattenedCompanyTests.filter(test =>
        test.__searchKey?.includes(normalizedSearch),
      );
    }

    if (selectedSubgroup) {
      const tests = Array.isArray(selectedSubgroup.tests)
        ? selectedSubgroup.tests
        : [];
      return dedupeTests(tests);
    }

    if (selectedGroup) {
      const subgroups = Array.isArray(selectedGroup.subgroups)
        ? selectedGroup.subgroups
        : [];
      return subgroups;
    }

    if (!normalizedSearch) {
      return groups;
    }

    return flattenedCompanyTests.filter(test =>
      test.__searchKey?.includes(normalizedSearch),
    );
  }, [
    dedupeTests,
    deferredSearchText,
    flattenedCompanyTests,
    catalogMode,
    groups,
    selectedGroup,
    selectedSubgroup,
  ]);
  const visibleActiveItems = useMemo(
    () => activeItems.slice(0, visibleItemCount),
    [activeItems, visibleItemCount],
  );
  const hasMoreActiveItems = visibleItemCount < activeItems.length;

  useEffect(() => {
    setVisibleItemCount(CATALOG_PAGE_SIZE);
  }, [
    activePanelCompany?.compCatId,
    catalogMode,
    deferredSearchText,
    selectedGroup?.group_id,
    selectedGroup?.gcode,
    selectedSubgroup?.subgroup_id,
    selectedSubgroup?.scode,
  ]);

  const loadMoreActiveItems = useCallback(() => {
    setVisibleItemCount(previousCount =>
      previousCount >= activeItems.length
        ? previousCount
        : Math.min(previousCount + CATALOG_PAGE_SIZE, activeItems.length),
    );
  }, [activeItems.length]);

  const handleCatalogScroll = useCallback(
    event => {
      if (!hasMoreActiveItems) {
        return;
      }

      const {contentOffset, contentSize, layoutMeasurement} = event.nativeEvent;
      const distanceFromBottom =
        contentSize.height - (contentOffset.y + layoutMeasurement.height);

      if (distanceFromBottom <= CATALOG_SCROLL_LOAD_THRESHOLD) {
        loadMoreActiveItems();
      }
    },
    [hasMoreActiveItems, loadMoreActiveItems],
  );

  const handleOpenPanelCompany = useCallback(
    async panelCompany => {
      if (!selectedPatient || !onPanelCompanySelect) {
        return;
      }

      const catalogResponse = await onPanelCompanySelect({
        patient: selectedPatient,
        compCatId: panelCompany.compCatId,
      });

      const nextGroups = Array.isArray(catalogResponse?.groups)
        ? catalogResponse.groups
        : [];

      if (!nextGroups.length) {
        Alert.alert(
          'No Groups Found',
          'No groups were returned for the selected panel company.',
        );
        return;
      }

      setActivePanelCompany(panelCompany);
      setGroups(nextGroups);
      setSelectedGroup(null);
      setSelectedSubgroup(null);
      setCatalogMode('search');
      setExpandedTests({});
      setSearchText('');
    },
    [onPanelCompanySelect, selectedPatient],
  );

  useEffect(() => {
    if (!selectedPanelCompany) {
      return;
    }

    const panelKey = `${getPatientIdentity(selectedPatient)}|${getPanelIdentity(
      selectedPanelCompany,
    )}`;
    if (autoOpenedPanelKeyRef.current === panelKey) {
      return;
    }

    autoOpenedPanelKeyRef.current = panelKey;
    handleOpenPanelCompany(selectedPanelCompany);
  }, [handleOpenPanelCompany, selectedPanelCompany, selectedPatient]);

  const isSelectedTest = ({panelCompany, test, childTest = null}) =>
    selectedTests.some(item => {
      if (item.key === buildTestSelectionKey(panelCompany, test, childTest)) {
        return true;
      }

      return (
        toStableValue(item?.panelCompanyId) ===
          toStableValue(panelCompany?.compCatId) &&
        getTestDedupeKey(item) === getTestDedupeKey(childTest || test)
      );
    });

  const handleNavigateBack = () => {
    if (selectedSubgroup) {
      setSelectedSubgroup(null);
      setExpandedTests({});
      setSearchText('');
      return;
    }

    if (selectedGroup) {
      setSelectedGroup(null);
      setSearchText('');
      return;
    }

    setActivePanelCompany(null);
    setGroups([]);
    setCatalogMode('search');
    setSearchText('');
  };

  return (
    <>
      <View style={styles.sectionCard}>
        <View style={styles.sectionTitleRow}>
          <View style={styles.sectionIconWrap}>
            <Ionicons name="flask" size={16} style={styles.sectionIcon} />
          </View>
          <Text style={styles.sectionTitle}>Add Test</Text>
        </View>
      </View>

      <View style={styles.bookingDetailCard}>
        <View style={styles.sampleCollectionCompactHeader}>
          <Text style={styles.sampleCollectionCompactTitle}>
            {selectedPatient?.name || 'Patient Not Selected'}
          </Text>
          <Text style={styles.sampleCollectionCompactMeta}>
            {selectedPatient
              ? `${selectedPatient.gender} | ${selectedPatient.age} yrs | ${
                  selectedPatient.mobileNumber || 'N/A'
                }`
              : 'No patient selected'}
          </Text>
        </View>

        <View style={styles.sampleCollectionSection}>
          <View style={styles.sampleCollectionSectionHeader}>
            <Text style={styles.sampleCollectionSectionTitle}>Added Tests</Text>
            <View style={styles.addTestSelectedCountBadge}>
              <Text style={styles.addTestSelectedCountText}>
                {selectedTestsSummary.length}
              </Text>
            </View>
          </View>
          {selectedTestsSummary.length ? (
            <ScrollView
              horizontal
              nestedScrollEnabled
              showsHorizontalScrollIndicator={false}
              style={styles.addTestSelectedScroll}
              contentContainerStyle={styles.addTestSelectedList}>
              {selectedTestsSummary.map(test => (
                <View key={test.key} style={styles.addTestSelectedPill}>
                  <View style={styles.addTestSelectedCodeWrap}>
                    <Text style={styles.addTestSelectedCode} numberOfLines={1}>
                      {test.code}
                    </Text>
                  </View>
                  <View style={styles.addTestSelectedPillTextWrap}>
                    <Text style={styles.addTestSelectedName} numberOfLines={1}>
                      {test.name}
                    </Text>
                    <Text style={styles.addTestSelectedMeta} numberOfLines={1}>
                      {test.specimenName}
                      {test.childCount ? ` | ${test.childCount} child` : ''}
                    </Text>
                  </View>
                  {onRemoveSelectedTest ? (
                    <TouchableOpacity
                      activeOpacity={0.85}
                      style={styles.addTestSelectedRemoveButton}
                      onPress={() =>
                        onRemoveSelectedTest({
                          patient: selectedPatient,
                          testKey: test.key,
                        })
                      }>
                      <Ionicons
                        name="close"
                        size={14}
                        style={styles.addTestSelectedRemoveIcon}
                      />
                    </TouchableOpacity>
                  ) : null}
                </View>
              ))}
            </ScrollView>
          ) : (
            <View style={styles.addTestEmptySelectedCard}>
              <Ionicons
                name="flask-outline"
                size={17}
                style={styles.addTestEmptySelectedIcon}
              />
              <Text style={styles.addTestEmptySelectedText}>
                No tests added yet. Select tests from the catalog below.
              </Text>
            </View>
          )}
        </View>

        <View style={styles.sampleCollectionSection}>
          <Text style={styles.sampleCollectionSectionTitle}>Panel Companies</Text>
          {isLoadingCompanies ? (
            <View style={styles.sampleCollectionLoadingCard}>
              <ActivityIndicator color="#1557B7" />
              <Text style={styles.sampleCollectionLoadingText}>
                Loading panel companies...
              </Text>
            </View>
          ) : panelCompanies.length ? (
            <View style={styles.sampleCollectionChipRow}>
              {panelCompanies.map(company => {
                const isActive =
                  toStableValue(activePanelCompany?.compCatId) ===
                  toStableValue(company.compCatId);

                return (
                  <TouchableOpacity
                    key={company.id}
                    activeOpacity={0.85}
                    style={[
                      styles.sampleCollectionChip,
                      isActive && styles.sampleCollectionChipActive,
                    ]}
                    onPress={() => handleOpenPanelCompany(company)}>
                    <Text
                      style={[
                        styles.sampleCollectionChipText,
                        isActive && styles.sampleCollectionChipTextActive,
                      ]}
                      numberOfLines={1}>
                      {company.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          ) : (
            <Text style={styles.sectionText}>No panel companies available.</Text>
          )}
        </View>

        {activePanelCompany ? (
          <View style={styles.sampleCollectionSection}>
            {!selectedGroup && !selectedSubgroup ? (
              <>
                <View style={styles.testPickerToolbar}>
                  <TouchableOpacity
                    activeOpacity={0.85}
                    style={[
                      styles.testPickerModeButton,
                      catalogMode === 'search' && styles.testPickerModeButtonActive,
                    ]}
                    onPress={() => {
                      setCatalogMode('search');
                      setSelectedGroup(null);
                      setSelectedSubgroup(null);
                    }}>
                    <Ionicons
                      name="search-outline"
                      size={15}
                      style={[
                        styles.testPickerModeIcon,
                        catalogMode === 'search' &&
                          styles.testPickerModeIconActive,
                      ]}
                    />
                    <Text
                      style={[
                        styles.testPickerModeText,
                        catalogMode === 'search' &&
                          styles.testPickerModeTextActive,
                      ]}>
                      Search
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    activeOpacity={0.85}
                    style={[
                      styles.testPickerModeButton,
                      catalogMode === 'browse' && styles.testPickerModeButtonActive,
                    ]}
                    onPress={() => {
                      setCatalogMode('browse');
                      setSearchText('');
                    }}>
                    <Ionicons
                      name="albums-outline"
                      size={15}
                      style={[
                        styles.testPickerModeIcon,
                        catalogMode === 'browse' &&
                          styles.testPickerModeIconActive,
                      ]}
                    />
                    <Text
                      style={[
                        styles.testPickerModeText,
                        catalogMode === 'browse' &&
                          styles.testPickerModeTextActive,
                      ]}>
                      Browse
                    </Text>
                  </TouchableOpacity>
                </View>
                {catalogMode === 'search' ? (
                  <View style={styles.panelCompanySearchWrap}>
                    <Ionicons
                      name="search-outline"
                      size={18}
                      style={styles.panelCompanySearchIcon}
                    />
                    <TextInput
                      value={searchText}
                      onChangeText={setSearchText}
                      placeholder="Search test, profile, code, or specimen"
                      placeholderTextColor="#6D7C80"
                      style={styles.panelCompanySearchInput}
                    />
                  </View>
                ) : null}
              </>
            ) : null}
            <View style={styles.sampleCollectionSectionHeader}>
              <Text style={styles.sampleCollectionSectionTitle}>
                {selectedSubgroup
                  ? `Tests in ${getCatalogSubgroupTitle(selectedSubgroup)}`
                  : !selectedGroup && catalogMode === 'search'
                  ? searchText.trim().length > 0
                    ? `Search Results in ${activePanelCompany.name}`
                    : `Tests in ${activePanelCompany.name}`
                  : selectedGroup
                  ? `Subgroups in ${getCatalogGroupTitle(selectedGroup)}`
                  : `Groups in ${activePanelCompany.name}`}
              </Text>
              {(selectedGroup || selectedSubgroup) ? (
                <TouchableOpacity
                  activeOpacity={0.85}
                  style={styles.sampleCollectionBackButton}
                  onPress={handleNavigateBack}>
                  <Ionicons
                    name="chevron-back"
                    size={15}
                    style={styles.sampleCollectionBackButtonIcon}
                  />
                  <Text style={styles.sampleCollectionBackButtonText}>Back</Text>
                </TouchableOpacity>
              ) : null}
            </View>

            <ScrollView
              style={styles.sampleCollectionCatalogScroll}
              nestedScrollEnabled
              showsVerticalScrollIndicator
              persistentScrollbar
              scrollEventThrottle={16}
              onScroll={handleCatalogScroll}
              contentContainerStyle={styles.sampleCollectionCatalogList}>
              {activeItems.length ? (
                visibleActiveItems.map((item, index) => {
                  const isSearchResultsList =
                    !selectedGroup &&
                    !selectedSubgroup &&
                    catalogMode === 'search';
                  const isGroupList =
                    !isSearchResultsList && !selectedGroup && !selectedSubgroup;
                  const isSubgroupList =
                    !isSearchResultsList &&
                    Boolean(selectedGroup) &&
                    !selectedSubgroup;
                  const isTestsList = Boolean(selectedSubgroup) || isSearchResultsList;
                  const childTests = Array.isArray(item?.child_tests)
                    ? item.child_tests
                    : [];
                  const testDisplayTitle =
                    item?.description?.trim() ||
                    (item?.booked_code ? `Test ${item.booked_code}` : '');
                  const title = isSearchResultsList
                    ? testDisplayTitle
                    : isGroupList
                    ? getCatalogGroupTitle(item)
                    : isSubgroupList
                    ? getCatalogSubgroupTitle(item)
                    : testDisplayTitle;
                  const itemKey = `${title || 'item'}-${index}`;
                  const isExpanded = Boolean(expandedTests[itemKey]);

                  return (
                    <View key={itemKey} style={styles.sampleCollectionCatalogCard}>
                      <TouchableOpacity
                        activeOpacity={0.85}
                        style={styles.sampleCollectionCatalogHeader}
                        onPress={() => {
                          if (isSearchResultsList) {
                            if (childTests.length) {
                              setExpandedTests(previousState => ({
                                ...previousState,
                                [itemKey]: !previousState[itemKey],
                              }));
                            }
                            return;
                          }

                          if (isGroupList) {
                            setSelectedGroup(item);
                            setSearchText('');
                            return;
                          }

                          if (isSubgroupList) {
                            setSelectedSubgroup(item);
                            setSearchText('');
                            return;
                          }

                          if (childTests.length) {
                            setExpandedTests(previousState => ({
                              ...previousState,
                              [itemKey]: !previousState[itemKey],
                            }));
                          }
                        }}>
                        <View style={styles.sampleCollectionCatalogTextWrap}>
                          <Text style={styles.sampleCollectionCatalogTitle}>
                            {title ||
                              (isTestsList ? 'Unnamed Test' : 'Unnamed Item')}
                          </Text>
                          <Text style={styles.sampleCollectionCatalogMeta}>
                            {isGroupList
                              ? `GCode: ${
                                  getCatalogGroupId(item) || 'N/A'
                                } | ${
                                  Array.isArray(item?.subgroups)
                                    ? item.subgroups.length
                                    : 0
                                } subgroups`
                              : isSubgroupList
                              ? `SCode: ${
                                  getCatalogSubgroupId(item) || 'N/A'
                                } | ${
                                  Array.isArray(item?.tests)
                                    ? item.tests.length
                                    : 0
                                } tests`
                              : isSearchResultsList
                              ? `${item?.__groupName || 'N/A'} -> ${
                                  item?.__subgroupName || 'N/A'
                                }`
                              : `Code: ${item?.booked_code || 'N/A'}`}
                          </Text>
                          {isSearchResultsList ? (
                            <Text style={styles.sampleCollectionCatalogMeta}>
                              Code: {item?.booked_code || 'N/A'} | Specimen:{' '}
                              {item?.specimen_name || 'N/A'} | MRP:{' '}
                              {item?.mrp ?? 0}
                            </Text>
                          ) : null}
                        </View>
                        {isTestsList ? (
                          <TouchableOpacity
                            activeOpacity={0.85}
                            style={[
                              styles.sampleCollectionAddButton,
                              isSelectedTest({
                                panelCompany: activePanelCompany,
                                test: item,
                              }) && styles.sampleCollectionAddButtonActive,
                            ]}
                            onPress={() =>
                              onToggleSelectedTest?.({
                                patient: selectedPatient,
                                panelCompany: activePanelCompany,
                                test: item,
                              })
                            }>
                            <Text
                              style={[
                                styles.sampleCollectionAddButtonText,
                                isSelectedTest({
                                  panelCompany: activePanelCompany,
                                  test: item,
                                }) && styles.sampleCollectionAddButtonTextActive,
                              ]}>
                              {isSelectedTest({
                                panelCompany: activePanelCompany,
                                test: item,
                              })
                                ? 'Remove'
                                : 'Add'}
                            </Text>
                          </TouchableOpacity>
                        ) : (
                          <Ionicons
                            name="chevron-forward"
                            size={16}
                            style={styles.sampleCollectionChevron}
                          />
                        )}
                      </TouchableOpacity>

                      {isTestsList && childTests.length ? (
                        <View style={styles.sampleCollectionChildSection}>
                          <TouchableOpacity
                            activeOpacity={0.85}
                            style={styles.sampleCollectionChildToggle}
                            onPress={() =>
                              setExpandedTests(previousState => ({
                                ...previousState,
                                [itemKey]: !previousState[itemKey],
                              }))
                            }>
                            <Text style={styles.sampleCollectionChildToggleText}>
                              {isExpanded ? 'Hide Child Tests' : 'Show Child Tests'}
                            </Text>
                            <Ionicons
                              name={isExpanded ? 'chevron-up' : 'chevron-down'}
                              size={15}
                              style={styles.sampleCollectionChevron}
                            />
                          </TouchableOpacity>

                          {isExpanded
                            ? childTests.map((childTest, childIndex) => (
                                <View
                                  key={`${childTest?.booked_code || 'child'}-${childIndex}`}
                                  style={styles.sampleCollectionChildCard}>
                                  <View style={styles.sampleCollectionCatalogTextWrap}>
                                    <Text style={styles.sampleCollectionCatalogTitle}>
                                      {childTest?.description?.trim() ||
                                        (childTest?.booked_code
                                          ? `Child Test ${childTest.booked_code}`
                                          : 'Unnamed Child Test')}
                                    </Text>
                                    <Text style={styles.sampleCollectionCatalogMeta}>
                                      Code: {childTest?.booked_code || 'N/A'}
                                    </Text>
                                  </View>
                                </View>
                              ))
                            : null}
                        </View>
                      ) : null}
                    </View>
                  );
                })
              ) : (
                <Text style={styles.sectionText}>
                  Select a panel company to browse its catalog.
                </Text>
              )}
              {hasMoreActiveItems ? (
                <View style={styles.testPickerLoadMoreHint}>
                  <Text style={styles.testPickerLoadMoreText}>
                    Scroll for more ({visibleActiveItems.length}/
                    {activeItems.length})
                  </Text>
                </View>
              ) : null}
            </ScrollView>
            {catalogMode === 'search' && !selectedGroup && !selectedSubgroup ? (
              <View style={styles.testPickerSelectedBar}>
                <Text style={styles.testPickerSelectedText}>
                  {selectedTests.length} selected
                </Text>
                <Text style={styles.testPickerSelectedHint}>
                  Added tests are saved automatically
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}
      </View>
    </>
  );
}
