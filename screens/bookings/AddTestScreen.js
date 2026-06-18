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
  NativeModules,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import AppAlertModal from '../../components/common/AppAlertModal';
import LoadingOverlay from '../../components/common/LoadingOverlay';
import {
  buildSampleTubeRootTests,
  getSampleTubeMappingCacheKey,
  normalizeTestsForSampleTubeMapping,
} from './appointmentDetails/sampleTubeHelpers';
import {
  sampleTubeMappingCache,
  sampleTubeMappingRequests,
} from '../../utils/bookings/sampleTubeMappingCache';
import {
  normalizePanelCompanyItems,
} from './appointmentDetails/helpers';
import {getTestPricing} from '../../utils/bookings/pricing';

const {CatalogDatabaseModule} = NativeModules;
const CATALOG_PAGE_SIZE = 10;
const CATALOG_SCROLL_LOAD_THRESHOLD = 120;
const SAMPLE_TUBE_WARM_TIMEOUT_MS = 7000;
const toStableValue = value =>
  value === null || value === undefined ? '' : String(value).trim();

const withPromiseTimeout = (promise, timeoutMs) =>
  new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error(`Request timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    Promise.resolve(promise)
      .then(result => {
        clearTimeout(timeoutId);
        resolve(result);
      })
      .catch(error => {
        clearTimeout(timeoutId);
        reject(error);
      });
  });

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

const testHasChildren = () => false;

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

const sortCatalogGroups = (groups, shouldSortTests = true) =>
  (Array.isArray(groups) ? [...groups] : [])
    .map(group => ({
      ...group,
      subgroups: (Array.isArray(group?.subgroups) ? [...group.subgroups] : [])
        .map(subgroup => ({
          ...subgroup,
          tests: shouldSortTests
            ? sortCatalogTestsByCode(subgroup?.tests)
            : Array.isArray(subgroup?.tests)
            ? subgroup.tests
            : [],
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

const extractSearchTestsFromCatalogResponse = response => {
  if (Array.isArray(response?.tests)) {
    return response.tests;
  }

  return (Array.isArray(response?.groups) ? response.groups : []).flatMap(group =>
    (Array.isArray(group?.subgroups) ? group.subgroups : []).flatMap(subgroup =>
      (Array.isArray(subgroup?.tests) ? subgroup.tests : []).map(test => ({
        ...test,
        __groupName: group?.group_name || '',
        __subgroupName: subgroup?.subgroup_name || '',
      })),
    ),
  );
};

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
  onDone,
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
  const [, setExpandedTests] = useState({});
  const [searchText, setSearchText] = useState('');
  const [catalogSearchResults, setCatalogSearchResults] = useState([]);
  const [isSearchingCatalog, setIsSearchingCatalog] = useState(false);
  const [visibleItemCount, setVisibleItemCount] = useState(CATALOG_PAGE_SIZE);
  const addTestLoadingOverlayVisible = isLoadingCompanies || isLoadingCatalog;
  const addTestLoadingOverlayCopy = isLoadingCompanies
    ? {
        title: 'Loading Panel Companies',
        message: 'Getting the available panel companies ready...',
      }
    : {
        title: 'Loading Test Catalog',
        message: 'Preparing the test catalog for this patient...',
      };
  const deferredSearchText = useDeferredValue(searchText);
  const normalizedSearchText = useMemo(
    () => deferredSearchText.trim().toLowerCase(),
    [deferredSearchText],
  );
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
        childCount: 0,
        isAppAdded: Boolean(test?.isAppAdded),
      })),
    [selectedPanelCompany?.name, selectedTests],
  );
  const normalizedSelectedTests = useMemo(
    () => normalizeTestsForSampleTubeMapping(selectedTests),
    [selectedTests],
  );
  const sampleTubeRootTests = useMemo(
    () => buildSampleTubeRootTests(normalizedSelectedTests),
    [normalizedSelectedTests],
  );
  const sampleTubeWarmCacheKey = useMemo(
    () => getSampleTubeMappingCacheKey(sampleTubeRootTests),
    [sampleTubeRootTests],
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
    () => {
      if (!normalizedSearchText) {
        return [];
      }

      return groups.flatMap(group =>
        (Array.isArray(group?.subgroups) ? group.subgroups : []).flatMap(subgroup =>
          dedupeTests(Array.isArray(subgroup?.tests) ? subgroup.tests : []).map(test => {
            return {
              ...test,
              __groupName: group?.group_name || '',
              __subgroupName: subgroup?.subgroup_name || '',
              __searchKey: `${test?.description || ''} ${
                test?.booked_code || ''
              } ${group?.group_name || ''} ${
                subgroup?.subgroup_name || ''
              }`.toLowerCase(),
            };
          }),
        ),
      );
    },
    [dedupeTests, groups, normalizedSearchText],
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

    if (normalizedSearchText) {
      return catalogSearchResults.length
        ? sortCatalogTestsByCode(catalogSearchResults)
        : sortCatalogTestsByCode(
            flattenedCompanyTests.filter(test =>
              test.__searchKey?.includes(normalizedSearchText),
            ),
          );
    }

    return groups;
  }, [
    catalogSearchResults,
    dedupeTests,
    flattenedCompanyTests,
    groups,
    normalizedSearchText,
    selectedGroup,
    selectedSubgroup,
  ]);
  const visibleActiveItems = useMemo(
    () => activeItems.slice(0, visibleItemCount),
    [activeItems, visibleItemCount],
  );
  const hasMoreActiveItems = visibleItemCount < activeItems.length;

  useEffect(() => {
    if (
      !activePanelCompany ||
      selectedGroup ||
      selectedSubgroup ||
      normalizedSearchText.length < 2 ||
      !onPanelCompanySelect ||
      !selectedPatient
    ) {
      setCatalogSearchResults([]);
      setIsSearchingCatalog(false);
      return undefined;
    }

    let isActive = true;
    const timeoutId = setTimeout(async () => {
      try {
        setIsSearchingCatalog(true);
        const response = await onPanelCompanySelect({
          patient: selectedPatient,
          compCatId: activePanelCompany.compCatId,
          panelCompany: activePanelCompany,
          catalogLevel: 'search',
          query: normalizedSearchText,
        });

        if (!isActive) {
          return;
        }

        const tests = extractSearchTestsFromCatalogResponse(response).filter(test => {
          const searchKey = `${test?.description || ''} ${
            test?.booked_code || ''
          } ${test?.__groupName || test?.group_name || ''} ${
            test?.__subgroupName || test?.subgroup_name || ''
          }`.toLowerCase();

          return searchKey.includes(normalizedSearchText);
        });
        setCatalogSearchResults(
          tests.map(test => ({
            ...test,
            __groupName: test?.__groupName || test?.group_name || '',
            __subgroupName: test?.__subgroupName || test?.subgroup_name || '',
            __searchKey: `${test?.description || ''} ${
              test?.booked_code || ''
            } ${test?.__groupName || test?.group_name || ''} ${
              test?.__subgroupName || test?.subgroup_name || ''
            }`.toLowerCase(),
          })),
        );
      } finally {
        if (isActive) {
          setIsSearchingCatalog(false);
          onLocalDatabaseLoadingChange?.('');
        }
      }
    }, 120);

    return () => {
      isActive = false;
      clearTimeout(timeoutId);
    };
  }, [
    activePanelCompany,
    normalizedSearchText,
    onLocalDatabaseLoadingChange,
    onPanelCompanySelect,
    selectedGroup,
    selectedPatient,
    selectedSubgroup,
  ]);

  useEffect(() => {
    if (
      !selectedPatient ||
      !sampleTubeRootTests.length ||
      !sampleTubeWarmCacheKey ||
      !CatalogDatabaseModule?.getSampleTubeMappingForTestCodes
    ) {
      return undefined;
    }

    if (sampleTubeMappingCache.get(sampleTubeWarmCacheKey)) {
      return undefined;
    }

    if (sampleTubeMappingRequests.get(sampleTubeWarmCacheKey)) {
      return undefined;
    }

    let isActive = true;
    const timeoutId = setTimeout(() => {
      const warmRequest = withPromiseTimeout(
        CatalogDatabaseModule.getSampleTubeMappingForTestCodes(
          JSON.stringify(sampleTubeRootTests),
        ),
        SAMPLE_TUBE_WARM_TIMEOUT_MS,
      )
        .then(response => {
          const parsedResponse =
            typeof response === 'string' ? JSON.parse(response) : response;
          sampleTubeMappingCache.set(sampleTubeWarmCacheKey, parsedResponse);
          sampleTubeMappingRequests.delete(sampleTubeWarmCacheKey);
          return parsedResponse;
        })
        .catch(error => {
          sampleTubeMappingRequests.delete(sampleTubeWarmCacheKey);
          throw error;
        });

      if (isActive) {
        sampleTubeMappingRequests.set(sampleTubeWarmCacheKey, warmRequest);
      }
    }, 260);

    return () => {
      isActive = false;
      clearTimeout(timeoutId);
    };
  }, [
    sampleTubeRootTests,
    sampleTubeWarmCacheKey,
    selectedPatient,
  ]);

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
            setCatalogSearchResults([]);
            setIsLoadingCatalog(true);

      try {
        const catalogResponse = await onPanelCompanySelect({
          patient: selectedPatient,
          compCatId: panelCompany.compCatId,
          panelCompany,
          catalogLevel: 'groups',
        });

        const nextGroups = sortCatalogGroups(catalogResponse?.groups, false);

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

  const isSelectedTest = useCallback(
    ({panelCompany, test, childTest = null}) =>
      selectedTests.some(item => {
        if (item.key === buildTestSelectionKey(panelCompany, test, childTest)) {
          return true;
        }

        return (
          toStableValue(item?.panelCompanyId) ===
            toStableValue(panelCompany?.compCatId) &&
          getTestDedupeKey(item) === getTestDedupeKey(childTest || test)
        );
      }),
    [selectedTests],
  );

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

  const handleDonePress = useCallback(() => {
    onDone?.();
  }, [onDone]);
  const confirmSampleCollectionReset = useCallback(
    onConfirm => {
      if (!sampleCollectionDraft?.collected) {
        onConfirm?.();
        return;
      }

      setAppAlert({
        title: 'Reset Sample Collection?',
        message:
          'Sample collection has already been completed for this patient. Changing the tests will reset sample collection and the tubes will need to be selected again.',
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
  const confirmRemoveSelectedTest = useCallback(
    ({testName, onConfirm}) => {
      const displayName = toStableValue(testName);

      setAppAlert({
        title: 'Remove Test?',
        message: displayName
          ? `Are you sure you want to remove "${displayName}"?`
          : 'Are you sure you want to remove this test?',
        actions: [
          {text: 'Cancel', style: 'cancel'},
          {
            text: 'Remove',
            style: 'destructive',
            onPress: () => confirmSampleCollectionReset(onConfirm),
          },
        ],
        cancelable: true,
      });
    },
    [confirmSampleCollectionReset],
  );
  const handleSelectedTestRemove = useCallback(
    test => {
      confirmRemoveSelectedTest({
        testName: test?.name || test?.code,
        onConfirm: () =>
          onRemoveSelectedTest?.({
            patient: selectedPatient,
            testKey: test.key,
          }),
      });
    },
    [confirmRemoveSelectedTest, onRemoveSelectedTest, selectedPatient],
  );
  const handleCatalogTestPress = useCallback(
    test => {
      const isRemoving = isSelectedTest({
        panelCompany: activePanelCompany,
        test,
      });
      const toggleTest = () =>
        onToggleSelectedTest?.({
          patient: selectedPatient,
          panelCompany: activePanelCompany,
          test,
        });

      if (isRemoving) {
        confirmRemoveSelectedTest({
          testName: test?.description || test?.booked_code,
          onConfirm: toggleTest,
        });
        return;
      }

      confirmSampleCollectionReset(toggleTest);
    },
    [
      activePanelCompany,
      confirmRemoveSelectedTest,
      confirmSampleCollectionReset,
      isSelectedTest,
      onToggleSelectedTest,
      selectedPatient,
    ],
  );

  const handleSelectGroup = useCallback(
    async group => {
      if (!activePanelCompany || !selectedPatient || !onPanelCompanySelect) {
        return;
      }

      const gcode = getCatalogGroupId(group);
      if (!gcode) {
        setSelectedGroup(group);
        setSearchText('');
        return;
      }

      setIsLoadingCatalog(true);
      try {
        const response = await onPanelCompanySelect({
          patient: selectedPatient,
          compCatId: activePanelCompany.compCatId,
          panelCompany: activePanelCompany,
          catalogLevel: 'subgroups',
          gcode,
        });
        const subgroups = Array.isArray(response?.subgroups)
          ? response.subgroups
          : Array.isArray(group?.subgroups)
          ? group.subgroups
          : [];
        const nextGroup = {
          ...group,
          subgroups: [...subgroups].sort((leftSubgroup, rightSubgroup) =>
            compareCatalogIds(
              getCatalogSubgroupId(leftSubgroup),
              getCatalogSubgroupId(rightSubgroup),
            ),
          ),
        };

        setGroups(previousGroups =>
          previousGroups.map(previousGroup =>
            getCatalogGroupId(previousGroup) === gcode ? nextGroup : previousGroup,
          ),
        );
        setSelectedGroup(nextGroup);
        setSelectedSubgroup(null);
        setExpandedTests({});
        setSearchText('');
        setCatalogSearchResults([]);
      } finally {
        setIsLoadingCatalog(false);
        onLocalDatabaseLoadingChange?.('');
      }
    },
    [
      activePanelCompany,
      onLocalDatabaseLoadingChange,
      onPanelCompanySelect,
      selectedPatient,
    ],
  );

  const handleSelectSubgroup = useCallback(
    async subgroup => {
      if (!activePanelCompany || !selectedPatient || !onPanelCompanySelect) {
        return;
      }

      const gcode = getCatalogGroupId(selectedGroup);
      const scode = getCatalogSubgroupId(subgroup);
      if (!gcode || !scode) {
        setSelectedSubgroup(subgroup);
        setSearchText('');
        return;
      }

      setIsLoadingCatalog(true);
      try {
        const response = await onPanelCompanySelect({
          patient: selectedPatient,
          compCatId: activePanelCompany.compCatId,
          panelCompany: activePanelCompany,
          catalogLevel: 'tests',
          gcode,
          scode,
        });
        const tests = Array.isArray(response?.tests)
          ? response.tests
          : Array.isArray(subgroup?.tests)
          ? subgroup.tests
          : [];
        const nextSubgroup = {
          ...subgroup,
          tests: sortCatalogTestsByCode(dedupeTests(tests)),
        };

        setGroups(previousGroups =>
          previousGroups.map(previousGroup => {
            if (getCatalogGroupId(previousGroup) !== gcode) {
              return previousGroup;
            }

            return {
              ...previousGroup,
              subgroups: (Array.isArray(previousGroup?.subgroups)
                ? previousGroup.subgroups
                : []
              ).map(previousSubgroup =>
                getCatalogSubgroupId(previousSubgroup) === scode
                  ? nextSubgroup
                  : previousSubgroup,
              ),
            };
          }),
        );
        setSelectedGroup(previousGroup =>
          previousGroup
            ? {
                ...previousGroup,
                subgroups: (Array.isArray(previousGroup?.subgroups)
                  ? previousGroup.subgroups
                  : []
                ).map(previousSubgroup =>
                  getCatalogSubgroupId(previousSubgroup) === scode
                    ? nextSubgroup
                    : previousSubgroup,
                ),
              }
            : previousGroup,
        );
        setSelectedSubgroup(nextSubgroup);
        setExpandedTests({});
        setSearchText('');
        setCatalogSearchResults([]);
      } finally {
        setIsLoadingCatalog(false);
        onLocalDatabaseLoadingChange?.('');
      }
    },
    [
      activePanelCompany,
      dedupeTests,
      onLocalDatabaseLoadingChange,
      onPanelCompanySelect,
      selectedGroup,
      selectedPatient,
    ],
  );

  return (
    <>
      <View style={styles.bookingDetailCard}>
        <View style={styles.sampleCollectionCompactHeader}>
          <View style={styles.addTestPatientTitleRow}>
            <Text style={styles.sampleCollectionCompactTitle}>
              {selectedPatient?.name || 'Patient Not Selected'}
            </Text>
            {activePanelCompany?.name ? (
              <View style={styles.addTestPanelCompanyBadge}>
                <Text style={styles.addTestPanelCompanyBadgeText}>
                  {activePanelCompany.name}
                </Text>
              </View>
            ) : null}
          </View>
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
                      onPress={() => handleSelectedTestRemove(test)}>
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
          {isLoadingCompanies ? (
            <View style={styles.sampleCollectionLoadingCard}>
              <ActivityIndicator color="#1557B7" />
              <Text style={styles.sampleCollectionLoadingText}>
                Loading panel companies...
              </Text>
            </View>
          ) : panelCompanies.length > 1 ? (
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
          ) : !panelCompanies.length ? (
            <Text style={styles.sectionText}>No panel companies available.</Text>
          ) : null
          }
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
                  placeholder="Search test or code"
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
                  ? 'Search Results'
                  : selectedGroup
                  ? `Subgroups in ${getCatalogGroupTitle(selectedGroup)}`
                  : 'Groups'}
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
              ) : isSearchingCatalog ? (
                <View style={styles.sampleCollectionLoadingCard}>
                  <ActivityIndicator color="#1557B7" />
                  <Text style={styles.sampleCollectionLoadingText}>
                    Searching tests...
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
                  const testPricing = isTestsList
                    ? getTestPricing({
                        ...item,
                        selected_charge_mode:
                          activePanelCompany?.billingChargeMode ||
                          activePanelCompany?.chargeMode ||
                          activePanelCompany?.BillingChargeMode ||
                          '',
                        showmrp:
                          activePanelCompany?.showmrp ??
                          activePanelCompany?.showMrp ??
                          activePanelCompany?.show_mrp ??
                          activePanelCompany?.ShowMRP ??
                          item?.showmrp ??
                          0,
                      })
                    : null;
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
                  return (
                    <View key={itemKey} style={styles.sampleCollectionCatalogCard}>
                      <TouchableOpacity
                        activeOpacity={0.85}
                        style={styles.sampleCollectionCatalogHeader}
                        onPress={() => {
                          if (isSearchResultsList) {
                            return;
                          }

                          if (isGroupList) {
                            handleSelectGroup(item);
                            return;
                          }

                          if (isSubgroupList) {
                            handleSelectSubgroup(item);
                            return;
                          }

                        }}>
                        <View style={styles.sampleCollectionCatalogTextWrap}>
                          <Text style={styles.sampleCollectionCatalogTitle}>
                            {title ||
                              (isTestsList ? 'Unnamed Test' : 'Unnamed Item')}
                          </Text>
                          <Text style={styles.sampleCollectionCatalogMeta}>
                            {isGroupList
                              ? `GCode: ${getCatalogGroupId(item) || 'N/A'}`
                              : isSubgroupList
                              ? `SCode: ${getCatalogSubgroupId(item) || 'N/A'}`
                              : isSearchResultsList
                              ? `${item?.__groupName || 'N/A'} -> ${
                                  item?.__subgroupName || 'N/A'
                                }`
                              : `Code: ${item?.booked_code || 'N/A'}`}
                          </Text>
                          {isSearchResultsList ? (
                            <Text style={styles.sampleCollectionCatalogMeta}>
                              Code: {item?.booked_code || 'N/A'} | Price:{' '}
                              {testPricing?.charge ?? item?.mrp ?? 0}
                            </Text>
                          ) : null}
                          {isTestsList && !isSearchResultsList ? (
                            <Text style={styles.sampleCollectionCatalogMeta}>
                              Price: {testPricing?.charge ?? item?.mrp ?? 0}
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
                            onPress={() => handleCatalogTestPress(item)}>
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
                <View style={styles.testPickerSelectedContent}>
                  <Text style={styles.testPickerSelectedText}>
                    {selectedTests.length} selected
                  </Text>
                  <Text style={styles.testPickerSelectedHint}>
                    Added tests are saved automatically
                  </Text>
                </View>
                <TouchableOpacity
                  activeOpacity={0.85}
                  style={styles.testPickerDoneButton}
                  onPress={handleDonePress}>
                  <Text style={styles.testPickerDoneButtonText}>Done</Text>
                </TouchableOpacity>
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
      <LoadingOverlay
        styles={styles}
        visible={addTestLoadingOverlayVisible}
        title={addTestLoadingOverlayCopy.title}
        message={addTestLoadingOverlayCopy.message}
      />
    </>
  );
}

export default React.memo(AddTestScreen);
