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
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import AppAlertModal from '../../components/common/AppAlertModal';
import {
  normalizePanelCompanyItems,
} from './appointmentDetails/helpers';

const CATALOG_PAGE_SIZE = 10;
const CATALOG_SCROLL_LOAD_THRESHOLD = 120;
const toStableValue = value =>
  value === null || value === undefined ? '' : String(value).trim();

const getPanelIdentity = panelCompany =>
  [
    toStableValue(panelCompany?.panelCode),
    toStableValue(panelCompany?.panelAbarid).toUpperCase(),
    toStableValue(panelCompany?.id),
    toStableValue(panelCompany?.compCatId),
    toStableValue(panelCompany?.centerId),
    toStableValue(panelCompany?.atype).toUpperCase(),
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

const getCatalogTestId = test =>
  toStableValue(test?.booked_code || test?.testcode1 || test?.test_code || test?.code);

const compareCatalogIds = (leftId, rightId) =>
  toStableValue(leftId).localeCompare(toStableValue(rightId), undefined, {
    numeric: true,
    sensitivity: 'base',
  });

const getCatalogCodeSortParts = code => {
  const normalizedCode = toStableValue(code).toUpperCase();
  const match = normalizedCode.match(/^G(\d+)S(\d+)T(\d+)/);

  return match
    ? {
        group: Number(match[1]),
        subgroup: Number(match[2]),
        test: Number(match[3]),
        code: normalizedCode,
      }
    : {
        group: Number.MAX_SAFE_INTEGER,
        subgroup: Number.MAX_SAFE_INTEGER,
        test: Number.MAX_SAFE_INTEGER,
        code: normalizedCode,
      };
};

const compareCatalogTestCodes = (leftCode, rightCode) => {
  const leftParts = getCatalogCodeSortParts(leftCode);
  const rightParts = getCatalogCodeSortParts(rightCode);

  return (
    leftParts.group - rightParts.group ||
    leftParts.subgroup - rightParts.subgroup ||
    leftParts.test - rightParts.test ||
    compareCatalogIds(leftParts.code, rightParts.code)
  );
};

const sortCatalogTestsByCode = tests =>
  (Array.isArray(tests) ? [...tests] : [])
    .map((test, index) => {
      const sortedTest = {...test};

      if (Array.isArray(test?.child_tests)) {
        sortedTest.child_tests = sortCatalogTestsByCode(test.child_tests);
      }

      if (Array.isArray(test?.childTests)) {
        sortedTest.childTests = sortCatalogTestsByCode(test.childTests);
      }

      return {test: sortedTest, index};
    })
    .sort(
      (leftItem, rightItem) =>
        compareCatalogTestCodes(
          getCatalogTestId(leftItem.test),
          getCatalogTestId(rightItem.test),
        ) || leftItem.index - rightItem.index,
    )
    .map(item => item.test);

const sortCatalogGroups = groups =>
  (Array.isArray(groups) ? [...groups] : [])
    .map(group => ({
      ...group,
      subgroups: (Array.isArray(group?.subgroups) ? [...group.subgroups] : [])
        .map(subgroup => ({
          ...subgroup,
          tests: sortCatalogTestsByCode(subgroup?.tests),
        }))
        .sort((leftSubgroup, rightSubgroup) =>
          compareCatalogIds(
            getCatalogSubgroupId(leftSubgroup),
            getCatalogSubgroupId(rightSubgroup),
          ),
        ),
    }))
    .sort((leftGroup, rightGroup) =>
      compareCatalogIds(getCatalogGroupId(leftGroup), getCatalogGroupId(rightGroup)),
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

  const leftPanelCode = toStableValue(leftCompany?.panelCode);
  const rightPanelCode = toStableValue(rightCompany?.panelCode);
  const leftPanelAbarid = toStableValue(leftCompany?.panelAbarid).toUpperCase();
  const rightPanelAbarid = toStableValue(rightCompany?.panelAbarid).toUpperCase();

  if (
    leftPanelCode &&
    rightPanelCode &&
    leftPanelAbarid &&
    rightPanelAbarid &&
    leftPanelCode === rightPanelCode &&
    leftPanelAbarid === rightPanelAbarid
  ) {
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

function AddTestScreen({
  selectedPatient,
  selectedPanelCompany,
  selectedTests,
  sampleCollectionDraft,
  styles,
  onAddTestPatient,
  onPanelCompanySelect,
  onToggleSelectedTest,
  onRemoveSelectedTest,
  onSampleCollectionReset,
  onLocalDatabaseLoadingChange,
}) {
  const [appAlert, setAppAlert] = useState(null);
  const [isLoadingCompanies, setIsLoadingCompanies] = useState(false);
  const [isLoadingCatalog, setIsLoadingCatalog] = useState(false);
  const [panelCompanies, setPanelCompanies] = useState([]);
  const [activePanelCompany, setActivePanelCompany] = useState(null);
  const [groups, setGroups] = useState([]);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [selectedSubgroup, setSelectedSubgroup] = useState(null);
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
          sortCatalogTestsByCode(
            dedupeTests(Array.isArray(subgroup?.tests) ? subgroup.tests : []),
          ).map(test => {
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
    setIsLoadingCatalog(false);
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

      if (selectedPanelCompany) {
        setPanelCompanies([selectedPanelCompany]);
        return;
      }

      setIsLoadingCompanies(true);
      onLocalDatabaseLoadingChange?.(
        'Loading panel companies from local database...',
      );

      try {
        const responseData = await onAddTestPatient(selectedPatient);
        if (!isMounted) {
          return;
        }

        const normalizedItems = normalizePanelCompanyItems(responseData);

        setPanelCompanies(
          normalizedItems.length ? normalizedItems : [],
        );
      } finally {
        if (isMounted) {
          setIsLoadingCompanies(false);
          onLocalDatabaseLoadingChange?.('');
        }
      }
    };

    loadPanelCompanies();

    return () => {
      isMounted = false;
      onLocalDatabaseLoadingChange?.('');
    };
  }, [
    onAddTestPatient,
    onLocalDatabaseLoadingChange,
    selectedPanelCompany,
    selectedPatient,
  ]);

  const activeItems = useMemo(() => {
    const normalizedSearch = deferredSearchText.trim().toLowerCase();

    if (selectedSubgroup) {
      const tests = Array.isArray(selectedSubgroup.tests)
        ? selectedSubgroup.tests
        : [];
      return sortCatalogTestsByCode(dedupeTests(tests));
    }

    if (selectedGroup) {
      const subgroups = Array.isArray(selectedGroup.subgroups)
        ? selectedGroup.subgroups
        : [];
      return [...subgroups].sort((leftSubgroup, rightSubgroup) =>
        compareCatalogIds(
          getCatalogSubgroupId(leftSubgroup),
          getCatalogSubgroupId(rightSubgroup),
        ),
      );
    }

    if (normalizedSearch) {
      return sortCatalogTestsByCode(
        flattenedCompanyTests.filter(test =>
          test.__searchKey?.includes(normalizedSearch),
        ),
      );
    }

    return sortCatalogGroups(groups);
  }, [
    dedupeTests,
    deferredSearchText,
    flattenedCompanyTests,
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

      if (
        activePanelCompany &&
        isSamePanelCompany(activePanelCompany, panelCompany) &&
        groups.length
      ) {
        return;
      }

      setActivePanelCompany(panelCompany);
      setGroups([]);
      setSelectedGroup(null);
      setSelectedSubgroup(null);
      setExpandedTests({});
      setSearchText('');
      setIsLoadingCatalog(true);
      onLocalDatabaseLoadingChange?.('Loading test catalog...');

      try {
        const catalogResponse = await onPanelCompanySelect({
          patient: selectedPatient,
          compCatId: panelCompany.compCatId,
          panelCompany,
        });

        const nextGroups = sortCatalogGroups(catalogResponse?.groups);

        if (!nextGroups.length) {
          setAppAlert({
            title: 'No Groups Found',
            message:
              'No groups were returned for the selected panel company.',
            actions: [{text: 'OK'}],
            cancelable: false,
          });
          return;
        }

        setGroups(nextGroups);
      } finally {
        setIsLoadingCatalog(false);
        onLocalDatabaseLoadingChange?.('');
      }
    },
    [
      activePanelCompany,
      groups.length,
      onLocalDatabaseLoadingChange,
      onPanelCompanySelect,
      selectedPatient,
    ],
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
    setSearchText('');
  };
  const confirmSampleCollectionReset = useCallback(
    onConfirm => {
      if (!sampleCollectionDraft?.collected) {
        onConfirm?.();
        return;
      }

      setAppAlert({
        title: 'Reset Sample Collection?',
        message:
          'Is patient ka sample collect ho chuka hai. Test change karne par sample collection reset ho jayega aur tubes phir se select karni padegi.',
        actions: [
          {text: 'Cancel', style: 'cancel'},
          {
            text: 'Reset & Continue',
            style: 'destructive',
            onPress: () => {
              onSampleCollectionReset?.();
              onConfirm?.();
            },
          },
        ],
        cancelable: true,
      });
    },
    [onSampleCollectionReset, sampleCollectionDraft?.collected],
  );

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
                        confirmSampleCollectionReset(() =>
                          onRemoveSelectedTest({
                          patient: selectedPatient,
                          testKey: test.key,
                          }),
                        )
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
            <View style={styles.sampleCollectionSectionHeader}>
              <Text style={styles.sampleCollectionSectionTitle}>
                {selectedSubgroup
                  ? `Tests in ${getCatalogSubgroupTitle(selectedSubgroup)}`
                  : !selectedGroup && searchText.trim().length > 0
                  ? `Search Results in ${activePanelCompany.name}`
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
              {isLoadingCatalog ? (
                <View style={styles.sampleCollectionLoadingCard}>
                  <ActivityIndicator color="#1557B7" />
                  <Text style={styles.sampleCollectionLoadingText}>
                    Loading test catalog...
                  </Text>
                </View>
              ) : activeItems.length ? (
                visibleActiveItems.map((item, index) => {
                  const isSearchResultsList =
                    !selectedGroup &&
                    !selectedSubgroup &&
                    searchText.trim().length > 0;
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
                              confirmSampleCollectionReset(() =>
                                onToggleSelectedTest?.({
                                patient: selectedPatient,
                                panelCompany: activePanelCompany,
                                test: item,
                                }),
                              )
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
                  {searchText.trim().length
                    ? 'No tests match your search.'
                    : 'Select a panel company to browse its catalog.'}
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
            {!selectedGroup && !selectedSubgroup ? (
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
      <AppAlertModal
        alert={appAlert}
        styles={styles}
        onClose={() => setAppAlert(null)}
      />
    </>
  );
}

export default React.memo(AddTestScreen);
