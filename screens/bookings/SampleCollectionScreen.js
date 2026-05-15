import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {NativeModules, Text, TouchableOpacity, View} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import AppAlertModal from '../../components/common/AppAlertModal';
import {
  buildSampleTubeMapsFromTests,
  collectTubeNodesForSelectedTest,
  collectUniqueTubesForSelectedTests,
} from '../../utils/bookings/sampleTubeMapping';
import {
  sampleTubeMappingCache,
  sampleTubeMappingRequests,
} from '../../utils/bookings/sampleTubeMappingCache';

const {CatalogDatabaseModule} = NativeModules;

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

const getTestCode = test =>
  toStableValue(test?.testcode1 || test?.booked_code || test?.test_code || test?.code) ||
  'N/A';

const toNumberOrValue = value => {
  const normalizedValue = toStableValue(value);
  if (!normalizedValue) {
    return '';
  }

  const numericValue = Number(normalizedValue);
  return Number.isFinite(numericValue) ? numericValue : normalizedValue;
};

const getPatientApiId = patient =>
  toNumberOrValue(
    patient?.patientId ||
      patient?.patient_id ||
      patient?.labmatePid ||
      patient?.labmate_pid ||
      patient?.id,
  );

const getBookingPatientId = patient =>
  toNumberOrValue(
    patient?.bookingPatientId ||
      patient?.booking_patient_id ||
      patient?.booking_patient ||
      patient?.id,
  );

const getBookingTestId = test =>
  toNumberOrValue(
    test?.bookingTestId ||
      test?.booking_test_id ||
      test?.bookingTestID ||
      test?.booking_test ||
      test?.id,
  );

const getTestDescription = test =>
  toStableValue(test?.description || test?.name || test?.test_name) ||
  'Unnamed Test';

const isFullCatalogCode = code => /^G[^|]+S[^|]+T[^|]+$/i.test(toStableValue(code));

const mergeSampleTubeMaps = (fallbackMaps, nativeMaps) => {
  const fallbackChildrenMap = fallbackMaps?.childrenMap || {};
  const nativeChildrenMap = nativeMaps?.childrenMap || {};
  const mergedChildrenMap = {...fallbackChildrenMap};

  Object.entries(nativeChildrenMap).forEach(([code, children]) => {
    if (Array.isArray(children) && children.length) {
      mergedChildrenMap[code] = children;
    }
  });

  return {
    testsMap: {
      ...(fallbackMaps?.testsMap || {}),
      ...(nativeMaps?.testsMap || {}),
    },
    childrenMap: mergedChildrenMap,
  };
};

const parseCatalogKey = catalogKey => {
  const [compCatId = '', gcode = '', scode = '', bookedCode = ''] =
    toStableValue(catalogKey).split('|');
  return {compCatId, gcode, scode, bookedCode};
};

const parseFullCatalogCode = code => {
  const match = toStableValue(code)
    .toUpperCase()
    .match(/^(G[^S]+)(S[^T]+)T.+$/);

  return {
    gcode: match?.[1] || '',
    scode: match?.[2] || '',
  };
};

const getResolvedRootCode = test => {
  const rawCode = getTestCode(test);
  const catalogContext = parseCatalogKey(test?.catalog_key);
  const catalogCode = toStableValue(catalogContext.bookedCode);

  if (isFullCatalogCode(rawCode)) {
    return rawCode;
  }

  return catalogCode || rawCode;
};

const getSampleTubeMappingCacheKey = rootTests =>
  JSON.stringify(
    rootTests.map(test => ({
      code: test.code,
      compCatId: test.compCatId,
      centerId: test.centerId,
      atype: test.atype,
      gcode: test.gcode,
      scode: test.scode,
    })),
  );

const isUndefinedSpecimenName = value => {
  const normalizedValue = String(value || '').trim().toLowerCase();
  return !normalizedValue || normalizedValue === 'none' || normalizedValue === 'n/a';
};

const groupSpecimenTestsByParent = tests => {
  const groupedMap = new Map();

  (Array.isArray(tests) ? tests : []).forEach((test, index) => {
    const parentCode =
      toStableValue(test?.rootBookedCode) ||
      toStableValue(test?.booked_code) ||
      `test-${index}`;
    const parentName =
      toStableValue(test?.rootTestName) ||
      toStableValue(test?.description) ||
      `Test ${index + 1}`;
    const parentKey = `${parentCode}|${parentName}`;

    if (!groupedMap.has(parentKey)) {
      groupedMap.set(parentKey, {
        parentKey,
        parentCode,
        parentName,
        tests: [],
      });
    }

    groupedMap.get(parentKey).tests.push(test);
  });

  return Array.from(groupedMap.values()).sort((leftItem, rightItem) =>
    leftItem.parentName.localeCompare(rightItem.parentName),
  );
};

const ADDITIONAL_TUBE_OPTIONS = [
  'EDTA',
  'Plain',
  'Flu-F',
  'Flu-PP',
  'Flu-R',
  'Urine Sterile',
  'Sodium Citrate',
  'Heparin Plasma',
  'ACD',
  'Stool',
  'Pus',
];

const ADDITIONAL_TUBE_META = {
  EDTA: {icon: 'water-outline', tone: '#7C3AED'},
  Plain: {icon: 'ellipse-outline', tone: '#DC2626'},
  'Flu-F': {icon: 'snow-outline', tone: '#0891B2'},
  'Flu-PP': {icon: 'snow-outline', tone: '#0D9488'},
  'Flu-R': {icon: 'snow-outline', tone: '#2563EB'},
  'Urine Sterile': {icon: 'flask-outline', tone: '#CA8A04'},
  'Sodium Citrate': {icon: 'medical-outline', tone: '#9333EA'},
  'Heparin Plasma': {icon: 'fitness-outline', tone: '#16A34A'},
  ACD: {icon: 'beaker-outline', tone: '#EA580C'},
  Stool: {icon: 'cube-outline', tone: '#92400E'},
  Pus: {icon: 'bandage-outline', tone: '#BE123C'},
};

const normalizeDraftKey = value => toStableValue(value).toUpperCase();

const getRootCodeFromSelectionKey = value =>
  normalizeDraftKey(toStableValue(value).split('|')[0]);

const isMatchingDraftUnselectedTest = (test, draftTest) => {
  const testKey = normalizeDraftKey(test?.key);
  const draftKey = normalizeDraftKey(draftTest?.key);

  if (testKey && draftKey && testKey === draftKey) {
    return true;
  }

  const testCode = normalizeDraftKey(test?.booked_code);
  const draftCode = normalizeDraftKey(draftTest?.booked_code);

  if (!testCode || testCode !== draftCode) {
    return false;
  }

  const testRoot =
    normalizeDraftKey(test?.rootBookedCode) ||
    normalizeDraftKey(test?.root_booked_code) ||
    getRootCodeFromSelectionKey(test?.key);
  const draftRoot = normalizeDraftKey(draftTest?.root_booked_code);

  if (draftRoot && testRoot && draftRoot !== testRoot) {
    return false;
  }

  const testSpecimen = normalizeDraftKey(test?.specimenName);
  const draftSpecimen = normalizeDraftKey(
    draftTest?.specimenName || draftTest?.specimen_name,
  );

  return !draftSpecimen || !testSpecimen || draftSpecimen === testSpecimen;
};

function SampleCollectionScreen({
  selectedBooking,
  selectedPatient,
  selectedTests,
  sampleCollectionDraft,
  styles,
  onCollectSample,
  onSampleCollectionDraftChange,
  onLocalDatabaseLoadingChange,
}) {
  const [appAlert, setAppAlert] = useState(null);
  const [expandedSpecimens, setExpandedSpecimens] = useState({});
  const [expandedParentTests, setExpandedParentTests] = useState({});
  const [expandedAdditionalTubes, setExpandedAdditionalTubes] = useState(false);
  const [selectedSpecimens, setSelectedSpecimens] = useState(
    () => sampleCollectionDraft?.selectedSpecimens || {},
  );
  const [selectedSpecimenTests, setSelectedSpecimenTests] = useState(
    () => sampleCollectionDraft?.selectedSpecimenTests || {},
  );
  const [selectedAdditionalTubes, setSelectedAdditionalTubes] = useState(
    () =>
      Array.isArray(sampleCollectionDraft?.selectedAdditionalTubes)
        ? sampleCollectionDraft.selectedAdditionalTubes
        : [],
  );
  const [selectionRestoreVersion, setSelectionRestoreVersion] = useState(0);
  const sampleCollectionDraftRef = useRef(sampleCollectionDraft);
  const [sampleTubeMaps, setSampleTubeMaps] = useState(() =>
    buildSampleTubeMapsFromTests([]),
  );

  useEffect(() => {
    sampleCollectionDraftRef.current = sampleCollectionDraft;
  }, [sampleCollectionDraft]);

  useEffect(() => {
    const currentDraft = sampleCollectionDraftRef.current || {};
    setExpandedSpecimens({});
    setExpandedParentTests({});
    setExpandedAdditionalTubes(false);
    setSelectedSpecimens(currentDraft?.selectedSpecimens || {});
    setSelectedSpecimenTests(currentDraft?.selectedSpecimenTests || {});
    setSelectedAdditionalTubes(
      Array.isArray(currentDraft?.selectedAdditionalTubes)
        ? currentDraft.selectedAdditionalTubes
        : [],
    );
    setSelectionRestoreVersion(0);
  }, [selectedPatient]);

  const normalizedSelectedTests = useMemo(
    () =>
      dedupeSelectedTests(selectedTests).map(test => {
        const rootCode = getResolvedRootCode(test);
        return {
          ...test,
          testcode1: rootCode,
          booked_code: rootCode,
        };
      }),
    [selectedTests],
  );

  const selectedSpecimenSummary = useMemo(() => {
    const expandedTests = normalizedSelectedTests.flatMap(test =>
      collectTubeNodesForSelectedTest(
        test,
        sampleTubeMaps.testsMap,
        sampleTubeMaps.childrenMap,
      ).map(node => ({
        ...node,
        removalKey: test?.key,
        panelCompanyName: test?.panelCompanyName,
        rootBookedCode: getTestCode(test),
        rootTestName: getTestDescription(test),
        rootBookingTestId: getBookingTestId(test),
      })),
    );

    const summaryMap = expandedTests.reduce((accumulator, test) => {
      const specimenName = String(test?.specimenName || 'N/A').trim() || 'N/A';

      if (!accumulator[specimenName]) {
        accumulator[specimenName] = {
          specimenName,
          count: 0,
          tests: [],
        };
      }

      if (!test.isProfileContext) {
        accumulator[specimenName].count += 1;
      }
      accumulator[specimenName].tests.push(test);
      return accumulator;
    }, {});

    return Object.values(summaryMap).sort((leftItem, rightItem) =>
      leftItem.specimenName.localeCompare(rightItem.specimenName),
    );
  }, [normalizedSelectedTests, sampleTubeMaps.childrenMap, sampleTubeMaps.testsMap]);
  const totalSpecimenTestCount = selectedSpecimenSummary.reduce(
    (total, item) => total + item.count,
    0,
  );
  const patientLevelTubes = useMemo(
    () =>
      collectUniqueTubesForSelectedTests(
        normalizedSelectedTests,
        sampleTubeMaps.testsMap,
        sampleTubeMaps.childrenMap,
      ).filter(tube => !isUndefinedSpecimenName(tube)),
    [normalizedSelectedTests, sampleTubeMaps.childrenMap, sampleTubeMaps.testsMap],
  );
  const displayedSampleTubes = useMemo(() => {
    const seenTubes = new Set();
    return [...patientLevelTubes, ...selectedAdditionalTubes].filter(tube => {
      const tubeKey = tube.toLowerCase();
      if (seenTubes.has(tubeKey)) {
        return false;
      }
      seenTubes.add(tubeKey);
      return true;
    });
  }, [patientLevelTubes, selectedAdditionalTubes]);

  useEffect(() => {
    let isMounted = true;
    const fallbackMaps = buildSampleTubeMapsFromTests(normalizedSelectedTests);
    const rootTests = normalizedSelectedTests
      .map(test => {
        const catalogContext = parseCatalogKey(test?.catalog_key);
        const codeContext = parseFullCatalogCode(getResolvedRootCode(test));
        return {
          code: getResolvedRootCode(test),
          catalogKey: test?.catalog_key || '',
          compCatId:
            test?.panelCompanyId || test?.compCatId || catalogContext.compCatId || '',
          centerId: test?.centerId || test?.CenterID || '',
          atype: test?.atype || test?.Atype || '',
          panelCode: test?.panelCode || test?.panel_code || '',
          panelAbarid: test?.panelAbarid || test?.panel_abarid || '',
          gcode: test?.gcode || catalogContext.gcode || codeContext.gcode || '',
          scode: test?.scode || catalogContext.scode || codeContext.scode || '',
          testCode: test?.test_code || '',
        };
      })
      .filter(test => test.code && test.code !== 'N/A');

    if (!rootTests.length || !CatalogDatabaseModule?.getSampleTubeMappingForTestCodes) {
      onLocalDatabaseLoadingChange?.('');
      setSampleTubeMaps(fallbackMaps);
      return () => {
        isMounted = false;
      };
    }

    const cacheKey = getSampleTubeMappingCacheKey(rootTests);
    const cachedMaps = sampleTubeMappingCache.get(cacheKey);

    if (cachedMaps) {
      onLocalDatabaseLoadingChange?.('');
      setSampleTubeMaps(mergeSampleTubeMaps(fallbackMaps, cachedMaps));
      return () => {
        isMounted = false;
      };
    }

    setSampleTubeMaps(fallbackMaps);

    const mappingRequest =
      sampleTubeMappingRequests.get(cacheKey) ||
      CatalogDatabaseModule.getSampleTubeMappingForTestCodes(JSON.stringify(rootTests))
        .then(response => {
          const parsedResponse =
            typeof response === 'string' ? JSON.parse(response) : response;
          sampleTubeMappingCache.set(cacheKey, parsedResponse);
          sampleTubeMappingRequests.delete(cacheKey);
          return parsedResponse;
        })
        .catch(error => {
          sampleTubeMappingRequests.delete(cacheKey);
          throw error;
        });

    sampleTubeMappingRequests.set(cacheKey, mappingRequest);

    mappingRequest
      .then(response => {
        if (!isMounted) {
          return;
        }
        setSampleTubeMaps(mergeSampleTubeMaps(fallbackMaps, response));
        onLocalDatabaseLoadingChange?.('');
      })
      .catch(() => {
        if (isMounted) {
          setSampleTubeMaps(fallbackMaps);
          onLocalDatabaseLoadingChange?.('');
        }
      });

    return () => {
      isMounted = false;
      onLocalDatabaseLoadingChange?.('');
    };
  }, [normalizedSelectedTests, onLocalDatabaseLoadingChange]);

  useLayoutEffect(() => {
    const currentDraft = sampleCollectionDraftRef.current || {};
    const draftUnselectedTests = Array.isArray(currentDraft?.unselectedTests)
      ? currentDraft.unselectedTests
      : [];
    const draftSelectedSpecimens = currentDraft?.selectedSpecimens || {};
    const draftSelectedSpecimenTests = currentDraft?.selectedSpecimenTests || {};
    const draftUnselectedTubes = Array.isArray(currentDraft?.unselectedTubes)
      ? currentDraft.unselectedTubes
      : [];
    const hasSavedSelection =
      Object.keys(draftSelectedSpecimens).length > 0 ||
      Object.keys(draftSelectedSpecimenTests).length > 0 ||
      draftUnselectedTests.length > 0 ||
      draftUnselectedTubes.length > 0;
    const draftUnselectedTubeMap = draftUnselectedTubes.reduce(
      (nextMap, item) => ({
        ...nextMap,
        [toStableValue(item?.tubeName).toLowerCase()]: item,
      }),
      {},
    );

    setSelectedSpecimens(previousState => {
      const nextState = {};
      selectedSpecimenSummary.forEach(item => {
        const isUndefinedSpecimen = isUndefinedSpecimenName(item.specimenName);
        const draftTube = draftUnselectedTubeMap[
          toStableValue(item.specimenName).toLowerCase()
        ];
        nextState[item.specimenName] =
          isUndefinedSpecimen
            ? false
            : draftTube && Number(draftTube.selectedCount || 0) <= 0
            ? false
            : hasSavedSelection &&
              draftSelectedSpecimens[item.specimenName] !== undefined
            ? draftSelectedSpecimens[item.specimenName]
            : previousState[item.specimenName] !== undefined
            ? previousState[item.specimenName]
            : true;
      });
      return nextState;
    });

    setSelectedSpecimenTests(previousState => {
      const nextState = {};
      selectedSpecimenSummary.forEach(item => {
        const isUndefinedSpecimen = isUndefinedSpecimenName(item.specimenName);
        item.tests.forEach(test => {
          const wasDraftUnselected = draftUnselectedTests.some(draftTest =>
            isMatchingDraftUnselectedTest(test, draftTest),
          );
          nextState[test.key] =
            isUndefinedSpecimen
              ? false
              : wasDraftUnselected
              ? false
              : hasSavedSelection &&
                draftSelectedSpecimenTests[test.key] !== undefined
              ? draftSelectedSpecimenTests[test.key]
              : previousState[test.key] !== undefined
              ? previousState[test.key]
              : true;
        });
      });
      return nextState;
    });
    setSelectionRestoreVersion(version => version + 1);
  }, [selectedSpecimenSummary]);

  const toggleSpecimenExpansion = specimenName => {
    setExpandedSpecimens(previousState => ({
      ...previousState,
      [specimenName]: !previousState[specimenName],
    }));
  };

  const toggleParentTestExpansion = parentKey => {
    setExpandedParentTests(previousState => ({
      ...previousState,
      [parentKey]: !previousState[parentKey],
    }));
  };

  const toggleAdditionalTubesExpansion = () => {
    setExpandedAdditionalTubes(isExpanded => !isExpanded);
  };

  const allSpecimenTests = useMemo(
    () => selectedSpecimenSummary.flatMap(item => item.tests),
    [selectedSpecimenSummary],
  );

  const getRootKeyFromTestKey = useCallback(
    testKey => toStableValue(testKey).split('|')[0],
    [],
  );

  const getParentBookedCode = useCallback(
    childTest => {
      const parentDescription = toStableValue(childTest?.parentDescription);
      const rootKey = getRootKeyFromTestKey(childTest?.key);
      const childLevel = Number(childTest?.level || 0);

      if (!parentDescription || !rootKey) {
        return childTest?.rootBookedCode || rootKey;
      }

      const parentNode = allSpecimenTests.find(test => {
        const sameRoot = getRootKeyFromTestKey(test?.key) === rootKey;
        const sameDescription =
          toStableValue(test?.description) === parentDescription;
        const expectedLevel = Number(test?.level || 0) === childLevel - 1;
        return sameRoot && sameDescription && expectedLevel;
      });

      return parentNode?.booked_code || childTest?.rootBookedCode || rootKey;
    },
    [allSpecimenTests, getRootKeyFromTestKey],
  );

  const descendantKeysByTestKey = useMemo(() => {
    const keysMap = {};

    allSpecimenTests.forEach(selectedTest => {
      const rootKey = getRootKeyFromTestKey(selectedTest.key);
      const keys = new Set([selectedTest.key]);

      if (!rootKey) {
        keysMap[selectedTest.key] = Array.from(keys);
        return;
      }

      if (Number(selectedTest.level || 0) === 0) {
        allSpecimenTests.forEach(test => {
          if (getRootKeyFromTestKey(test.key) === rootKey) {
            keys.add(test.key);
          }
        });
        keysMap[selectedTest.key] = Array.from(keys);
        return;
      }

      const pendingParentNames = [selectedTest.description];
      while (pendingParentNames.length) {
        const parentName = pendingParentNames.shift();

        allSpecimenTests.forEach(test => {
          if (
            getRootKeyFromTestKey(test.key) === rootKey &&
            test.parentDescription === parentName &&
            !keys.has(test.key)
          ) {
            keys.add(test.key);
            pendingParentNames.push(test.description);
          }
        });
      }

      keysMap[selectedTest.key] = Array.from(keys);
    });

    return keysMap;
  }, [allSpecimenTests, getRootKeyFromTestKey]);

  const selectedDisplayMap = useMemo(() => {
    const nextMap = {};

    allSpecimenTests.forEach(test => {
      nextMap[test.key] =
        Boolean(selectedSpecimenTests[test.key]) ||
        (descendantKeysByTestKey[test.key] || []).some(
          testKey => testKey !== test.key && selectedSpecimenTests[testKey],
        );
    });

    return nextMap;
  }, [allSpecimenTests, descendantKeysByTestKey, selectedSpecimenTests]);

  const isSpecimenItemSelected = useCallback(
    item =>
      !isUndefinedSpecimenName(item.specimenName) &&
      item.tests.some(
        test => !test.isProfileContext && Boolean(selectedSpecimenTests[test.key]),
      ),
    [selectedSpecimenTests],
  );

  const toggleSpecimenSelection = item => {
    if (isUndefinedSpecimenName(item.specimenName)) {
      return;
    }

    const nextSelected = !isSpecimenItemSelected(item);
    setSelectedSpecimens(previousState => ({
      ...previousState,
      [item.specimenName]: nextSelected,
    }));
    setSelectedSpecimenTests(previousState => {
      const nextState = {...previousState};
      item.tests.forEach(test => {
        nextState[test.key] = nextSelected;
      });
      return nextState;
    });
  };

  const toggleSpecimenTestSelection = selectedTest => {
    if (isUndefinedSpecimenName(selectedTest?.specimenName)) {
      return;
    }

    setSelectedSpecimenTests(previousState => ({
      ...previousState,
      ...(descendantKeysByTestKey[selectedTest.key] || [selectedTest.key]).reduce(
        (nextState, testKey) => {
          nextState[testKey] = !previousState[selectedTest.key];
          return nextState;
        },
        {},
      ),
    }));
  };

  const toggleAdditionalTubeSelection = tubeName => {
    setSelectedAdditionalTubes(previousTubes =>
      previousTubes.includes(tubeName)
        ? previousTubes.filter(tube => tube !== tubeName)
        : [...previousTubes, tubeName],
    );
  };
  const clearAdditionalTubeSelection = () => {
    setSelectedAdditionalTubes([]);
  };

  const getSelectedSpecimenTestCount = useCallback(
    item =>
      isUndefinedSpecimenName(item.specimenName)
        ? 0
        : item.tests.filter(
            test => !test.isProfileContext && selectedSpecimenTests[test.key],
          ).length,
    [selectedSpecimenTests],
  );
  const selectedSampleTestCount = selectedSpecimenSummary.reduce(
    (total, item) => total + getSelectedSpecimenTestCount(item),
    0,
  );
  const tubeSelectionSummary = useMemo(
    () =>
      [
        ...selectedSpecimenSummary
          .filter(item => !isUndefinedSpecimenName(item.specimenName))
          .map(item => {
            const selectedCount = getSelectedSpecimenTestCount(item);
            const totalCount = Number(item.count || 0);

            return {
              tubeName: item.specimenName,
              totalCount,
              selectedCount,
              pendingCount: Math.max(totalCount - selectedCount, 0),
            };
          }),
        ...selectedAdditionalTubes.map(tubeName => ({
          tubeName,
          totalCount: 1,
          selectedCount: 1,
          pendingCount: 0,
          isAdditionalTube: true,
        })),
      ],
    [getSelectedSpecimenTestCount, selectedAdditionalTubes, selectedSpecimenSummary],
  );
  const selectedTubes = useMemo(
    () =>
      tubeSelectionSummary
        .filter(item => Number(item.selectedCount || 0) > 0)
        .map(item => ({
          tubeName: item.tubeName,
          totalCount: item.totalCount,
          selectedCount: item.selectedCount,
          pendingCount: item.pendingCount,
        })),
    [tubeSelectionSummary],
  );
  const unselectedTubes = useMemo(
    () =>
      tubeSelectionSummary
        .filter(item => Number(item.pendingCount || 0) > 0)
        .map(item => ({
          tubeName: item.tubeName,
          totalCount: item.totalCount,
          selectedCount: item.selectedCount,
          pendingCount: item.pendingCount,
        })),
    [tubeSelectionSummary],
  );
  const unselectedTests = useMemo(() => {
    const tests = [];

    selectedSpecimenSummary.forEach(item => {
      if (isUndefinedSpecimenName(item.specimenName)) {
        return;
      }

      item.tests.forEach(test => {
        if (test.isProfileContext || selectedSpecimenTests[test.key]) {
          return;
        }

        tests.push({
          key: test.key,
          booked_code: test.booked_code,
          description: test.description || getTestDescription(test),
          specimenName: item.specimenName || test.specimenName || 'N/A',
          parent_booked_code: getParentBookedCode(test),
          root_booked_code:
            toStableValue(test.rootBookedCode) || getRootKeyFromTestKey(test.key),
          root_test_name: test.rootTestName || test.rootBookedCode || '',
          booking_test_id: test.rootBookingTestId || '',
          level: Number(test.level || 0),
        });
      });
    });

    return tests;
  }, [
    getParentBookedCode,
    getRootKeyFromTestKey,
    selectedSpecimenSummary,
    selectedSpecimenTests,
  ]);
  const pendingChildTestsPayload = useMemo(() => {
    const bookingId = toNumberOrValue(selectedBooking?.id);
    const bookingPatientId = getBookingPatientId(selectedPatient);
    const patientId = getPatientApiId(selectedPatient);
    const pendingGroupMap = new Map();

    selectedSpecimenSummary.forEach(item => {
      if (isUndefinedSpecimenName(item.specimenName)) {
        return;
      }

      item.tests.forEach(test => {
        const isPendingChildTest =
          !test.isProfileContext &&
          Number(test.level || 0) > 0 &&
          !selectedSpecimenTests[test.key];

        if (!isPendingChildTest) {
          return;
        }

        const rootBookedCode =
          toStableValue(test.rootBookedCode) || getRootKeyFromTestKey(test.key);
        const groupKey = [
          rootBookedCode,
          toStableValue(item.specimenName || test.specimenName),
          toStableValue(test.rootBookingTestId),
        ].join('|');
        const pendingTest = {
          booked_code: test.booked_code,
          parent_booked_code: getParentBookedCode(test),
        };
        const existingGroup = pendingGroupMap.get(groupKey);

        if (existingGroup) {
          existingGroup.pending.push(pendingTest);
          return;
        }

        pendingGroupMap.set(groupKey, {
          booking_id: bookingId,
          booking_patient_id: bookingPatientId,
          patient_id: patientId,
          booking_test_id: test.rootBookingTestId || '',
          root_booked_code: rootBookedCode,
          root_test_name: test.rootTestName || rootBookedCode,
          tube_name: item.specimenName || test.specimenName || 'N/A',
          pending: [pendingTest],
        });
      });
    });

    return Array.from(pendingGroupMap.values());
  }, [
    getParentBookedCode,
    getRootKeyFromTestKey,
    selectedBooking?.id,
    selectedPatient,
    selectedSpecimenSummary,
    selectedSpecimenTests,
  ]);
  useEffect(() => {
    if (!selectedPatient || selectionRestoreVersion === 0) {
      return;
    }

    onSampleCollectionDraftChange?.({
      collected: Boolean(sampleCollectionDraft?.collected),
      selectedCount: selectedSampleTestCount,
      selectedSpecimens,
      selectedSpecimenTests,
      selectedAdditionalTubes,
      tubeSelectionSummary,
      selectedTubes,
      unselectedTubes,
      unselectedTests,
      pendingChildTests: pendingChildTestsPayload,
      updatedAt: new Date().toISOString(),
    });
  }, [
    allSpecimenTests.length,
    onSampleCollectionDraftChange,
    pendingChildTestsPayload,
    sampleCollectionDraft?.collected,
    selectedPatient,
    selectedSampleTestCount,
    selectedAdditionalTubes,
    selectedSpecimenTests,
    selectedSpecimens,
    selectionRestoreVersion,
    selectedTubes,
    tubeSelectionSummary,
    unselectedTests,
    unselectedTubes,
  ]);
  const canCollectSample =
    selectedSampleTestCount > 0 || selectedAdditionalTubes.length > 0;
  const selectedCollectionItemCount =
    selectedSampleTestCount + selectedAdditionalTubes.length;
  const showAppAlert = useCallback((title, message) => {
    setAppAlert({
      title,
      message,
      actions: [{text: 'OK'}],
      cancelable: false,
    });
  }, []);
  const handleCollectSample = () => {
    if (!canCollectSample) {
      return;
    }

    if (onCollectSample) {
      onCollectSample({
        patient: selectedPatient,
        selectedCount: selectedSampleTestCount,
        pendingChildTests: pendingChildTestsPayload,
        tubeSelectionSummary,
        selectedTubes,
        selectedSpecimens,
        selectedSpecimenTests,
        selectedAdditionalTubes,
        unselectedTubes,
        unselectedTests,
      });
      return;
    }

    showAppAlert(
      'Sample Collection',
      `${selectedCollectionItemCount} item${
        selectedCollectionItemCount > 1 ? 's' : ''
      } marked for collection.`,
    );
  };

  return (
    <>
      <View style={styles.sectionCard}>
        <View style={styles.sectionTitleRow}>
          <View style={styles.sectionIconWrap}>
            <Ionicons name="flask" size={16} style={styles.sectionIcon} />
          </View>
          <Text style={styles.sectionTitle}>Sample Collection</Text>
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
          <View style={styles.sampleTubeSummaryCard}>
            <View style={styles.sampleTubeSummaryIconWrap}>
              <Ionicons
                name="test-tube-outline"
                size={17}
                style={styles.sampleTubeSummaryIcon}
              />
            </View>
            <View style={styles.sampleTubeSummaryTextWrap}>
              <Text style={styles.sampleTubeSummaryLabel}>Sample Tubes</Text>
              <Text style={styles.sampleTubeSummaryValue}>
                {displayedSampleTubes.length
                  ? displayedSampleTubes.join(', ')
                  : '-'}
              </Text>
            </View>
          </View>

          <View style={styles.sampleCollectionAdditionalTubeCard}>
            <TouchableOpacity
              activeOpacity={0.85}
              style={styles.sampleCollectionAdditionalTubeHeader}
              onPress={toggleAdditionalTubesExpansion}>
              <View style={styles.sampleCollectionAdditionalTubeIconWrap}>
                <Ionicons
                  name="add-circle-outline"
                  size={19}
                  style={styles.sampleCollectionAdditionalTubeIcon}
                />
              </View>
              <View style={styles.sampleCollectionAdditionalTubeHeaderText}>
                <Text style={styles.sampleCollectionSectionTitle}>
                  Additional Tubes
                </Text>
                <Text style={styles.sampleCollectionAdditionalTubeMeta}>
                  {selectedAdditionalTubes.length
                    ? `${selectedAdditionalTubes.length} selected`
                    : 'Optional tubes'}
                </Text>
              </View>
              <View
                style={[
                  styles.sampleCollectionCountBadge,
                  selectedAdditionalTubes.length &&
                    styles.sampleCollectionCountBadgeActive,
                ]}>
                <Text style={styles.sampleCollectionCountText}>
                  {selectedAdditionalTubes.length}
                </Text>
              </View>
              <View style={styles.sampleCollectionAdditionalTubeChevronWrap}>
                <Ionicons
                  name={expandedAdditionalTubes ? 'chevron-up' : 'chevron-down'}
                  size={18}
                  style={styles.sampleCollectionSpecimenChevron}
                />
              </View>
            </TouchableOpacity>
            {selectedAdditionalTubes.length ? (
              <View style={styles.sampleCollectionAdditionalSelectedRow}>
                <View style={styles.sampleCollectionAdditionalSelectedChips}>
                  {selectedAdditionalTubes.map(tubeName => (
                    <View
                      key={`selected-additional-${tubeName}`}
                      style={styles.sampleCollectionAdditionalSelectedChip}>
                      <Text
                        style={styles.sampleCollectionAdditionalSelectedText}
                        numberOfLines={1}>
                        {tubeName}
                      </Text>
                    </View>
                  ))}
                </View>
                <TouchableOpacity
                  activeOpacity={0.85}
                  style={styles.sampleCollectionAdditionalClearButton}
                  onPress={clearAdditionalTubeSelection}>
                  <Text style={styles.sampleCollectionAdditionalClearText}>
                    Clear
                  </Text>
                </TouchableOpacity>
              </View>
            ) : null}
            {expandedAdditionalTubes ? (
              <View style={styles.sampleCollectionAdditionalGrid}>
                {ADDITIONAL_TUBE_OPTIONS.map(tubeName => {
                  const isSelected = selectedAdditionalTubes.includes(tubeName);
                  const tubeMeta = ADDITIONAL_TUBE_META[tubeName] || {};

                  return (
                    <TouchableOpacity
                      key={tubeName}
                      activeOpacity={0.85}
                      style={[
                        styles.sampleCollectionAdditionalTubeOption,
                        isSelected &&
                          styles.sampleCollectionAdditionalTubeOptionActive,
                      ]}
                      onPress={() => toggleAdditionalTubeSelection(tubeName)}>
                      <View
                        style={styles.sampleCollectionAdditionalTubeOptionIconWrap}>
                        <Ionicons
                          name={tubeMeta.icon || 'test-tube-outline'}
                          size={17}
                          style={[
                            styles.sampleCollectionAdditionalTubeOptionIcon,
                            tubeMeta.tone ? {color: tubeMeta.tone} : null,
                          ]}
                        />
                      </View>
                      <Text
                        style={[
                          styles.sampleCollectionAdditionalTubeOptionText,
                          isSelected &&
                            styles.sampleCollectionAdditionalTubeOptionTextActive,
                        ]}
                        numberOfLines={2}>
                        {tubeName}
                      </Text>
                      <View
                        style={[
                          styles.sampleCollectionAdditionalCheck,
                          isSelected &&
                            styles.sampleCollectionAdditionalCheckActive,
                        ]}>
                        {isSelected ? (
                          <Ionicons
                            name="checkmark"
                            size={13}
                            style={styles.sampleCollectionAdditionalCheckIcon}
                          />
                        ) : null}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ) : null}
          </View>

          <View style={styles.sampleCollectionSectionHeader}>
            <Text style={styles.sampleCollectionSectionTitle}>Specimens</Text>
            <View style={styles.sampleCollectionCountBadge}>
              <Text style={styles.sampleCollectionCountText}>
                {totalSpecimenTestCount}
              </Text>
            </View>
          </View>

          {selectedTests.length ? (
            <View style={styles.sampleCollectionSelectedList}>
              {selectedSpecimenSummary.map(item => {
                const isExpanded = Boolean(expandedSpecimens[item.specimenName]);
                const isUndefinedSpecimen = isUndefinedSpecimenName(
                  item.specimenName,
                );
                const isSpecimenSelected = isSpecimenItemSelected(item);
                const selectedCount = getSelectedSpecimenTestCount(item);

                return (
                  <View
                    key={item.specimenName}
                    style={styles.sampleCollectionSpecimenBlock}>
                    <View
                      style={[
                        styles.sampleCollectionSpecimenCard,
                        isExpanded && styles.sampleCollectionSpecimenCardActive,
                        isUndefinedSpecimen &&
                          styles.sampleCollectionUndefinedSpecimenCard,
                      ]}>
                      {isUndefinedSpecimen ? (
                        <View
                          style={[
                            styles.sampleCollectionSpecimenInfoIconWrap,
                          ]}>
                          <Ionicons
                            name="information-circle-outline"
                            size={19}
                            style={styles.sampleCollectionSpecimenInfoIcon}
                          />
                        </View>
                      ) : (
                        <TouchableOpacity
                          activeOpacity={0.85}
                          style={styles.sampleCollectionSpecimenCheckButton}
                          onPress={() => toggleSpecimenSelection(item)}>
                          <View
                            style={[
                              styles.sampleCollectionSpecimenCheck,
                              !isSpecimenSelected &&
                                styles.sampleCollectionSpecimenCheckUnchecked,
                            ]}>
                            {isSpecimenSelected ? (
                              <Ionicons
                                name="checkmark"
                                size={14}
                                style={styles.sampleCollectionSpecimenCheckIcon}
                              />
                            ) : null}
                          </View>
                        </TouchableOpacity>
                      )}
                      <TouchableOpacity
                        activeOpacity={0.85}
                        style={styles.sampleCollectionSpecimenHeaderContent}
                        onPress={() => toggleSpecimenExpansion(item.specimenName)}>
                        <View style={styles.sampleCollectionSpecimenTextWrap}>
                          <Text style={styles.sampleCollectionSpecimenTitle}>
                            {isUndefinedSpecimenName(item.specimenName)
                              ? 'Sample tube not defined'
                              : item.specimenName}
                          </Text>
                          <Text style={styles.sampleCollectionSpecimenMeta}>
                            {isUndefinedSpecimen
                              ? `${item.count} test${
                                  item.count > 1 ? 's' : ''
                                } need tube mapping`
                              : `${selectedCount}/${item.count} tests selected`}
                          </Text>
                        </View>
                        <View style={styles.sampleCollectionSpecimenCountBadge}>
                          <Text style={styles.sampleCollectionSpecimenCountText}>
                            {item.count}
                          </Text>
                        </View>
                        <Ionicons
                          name={isExpanded ? 'chevron-up' : 'chevron-down'}
                          size={18}
                          style={styles.sampleCollectionSpecimenChevron}
                        />
                      </TouchableOpacity>
                    </View>

                    {isExpanded ? (
                      <View style={styles.sampleCollectionSpecimenTestsList}>
                        {groupSpecimenTestsByParent(item.tests).map(parentGroup => {
                          const parentSelectedCount = parentGroup.tests.filter(
                            test => Boolean(selectedDisplayMap[test.key]),
                          ).length;
                          const isParentExpanded = Boolean(
                            expandedParentTests[
                              `${item.specimenName}|${parentGroup.parentKey}`
                            ],
                          );
                          const parentExpansionKey = `${item.specimenName}|${parentGroup.parentKey}`;

                          return (
                            <View
                              key={parentExpansionKey}
                              style={styles.sampleCollectionParentAccordionCard}>
                              <TouchableOpacity
                                activeOpacity={0.85}
                                style={styles.sampleCollectionParentAccordionHeader}
                                onPress={() =>
                                  toggleParentTestExpansion(parentExpansionKey)
                                }>
                                <View style={styles.sampleCollectionParentAccordionTextWrap}>
                                  <Text
                                    style={styles.sampleCollectionParentAccordionTitle}>
                                    {parentGroup.parentName}
                                  </Text>
                                  <Text
                                    style={styles.sampleCollectionParentAccordionMeta}>
                                    {parentSelectedCount}/{parentGroup.tests.length}{' '}
                                    test{parentGroup.tests.length === 1 ? '' : 's'} selected
                                  </Text>
                                </View>
                                <Ionicons
                                  name={isParentExpanded ? 'chevron-up' : 'chevron-down'}
                                  size={17}
                                  style={styles.sampleCollectionSpecimenChevron}
                                />
                              </TouchableOpacity>

                              {isParentExpanded ? (
                                <View style={styles.sampleCollectionParentAccordionBody}>
                                  {parentGroup.tests.map(test => {
                                    const isTestSelected = Boolean(
                                      selectedDisplayMap[test.key],
                                    );
                                    const parentChain = Array.isArray(
                                      test.parentDescriptions,
                                    )
                                      ? test.parentDescriptions.filter(Boolean)
                                      : test.parentDescription
                                      ? [test.parentDescription]
                                      : [];
                                    const hierarchyLevel = Math.min(
                                      Number(test.level || 0),
                                      3,
                                    );

                                    return (
                                      <View
                                        key={test.key}
                                        style={[
                                          styles.sampleCollectionSelectedCard,
                                          test.isProfileContext &&
                                            styles.sampleCollectionSelectedParentCard,
                                          test.level > 0 &&
                                            styles.sampleCollectionSelectedChildCard,
                                          hierarchyLevel === 1 &&
                                            styles.sampleCollectionSelectedLevelOne,
                                          hierarchyLevel === 2 &&
                                            styles.sampleCollectionSelectedLevelTwo,
                                          hierarchyLevel >= 3 &&
                                            styles.sampleCollectionSelectedLevelThree,
                                          isUndefinedSpecimen &&
                                            styles.sampleCollectionUndefinedTestCard,
                                        ]}>
                                        {isUndefinedSpecimen ? (
                                          <View
                                            style={[
                                              styles.sampleCollectionTestInfoIconWrap,
                                            ]}>
                                            <Ionicons
                                              name="information-circle-outline"
                                              size={17}
                                              style={
                                                styles.sampleCollectionSpecimenInfoIcon
                                              }
                                            />
                                          </View>
                                        ) : (
                                          <TouchableOpacity
                                            activeOpacity={0.85}
                                            style={
                                              styles.sampleCollectionTestCheckButton
                                            }
                                            onPress={() =>
                                              toggleSpecimenTestSelection(test)
                                            }>
                                            <View
                                              style={[
                                                styles.sampleCollectionSpecimenCheck,
                                                !isTestSelected &&
                                                  styles.sampleCollectionSpecimenCheckUnchecked,
                                              ]}>
                                              {isTestSelected ? (
                                                <Ionicons
                                                  name="checkmark"
                                                  size={13}
                                                  style={
                                                    styles.sampleCollectionSpecimenCheckIcon
                                                  }
                                                />
                                              ) : null}
                                            </View>
                                          </TouchableOpacity>
                                        )}
                                        <View
                                          style={styles.sampleCollectionSelectedTextWrap}>
                                          {test.isProfileContext ? (
                                            <Text
                                              style={
                                                styles.sampleCollectionSelectedHierarchy
                                              }>
                                              Parent level {Number(test.level || 0) + 1}
                                            </Text>
                                          ) : parentChain.length ? (
                                            <Text
                                              style={[
                                                styles.sampleCollectionSelectedHierarchy,
                                                styles.sampleCollectionSelectedLeafBadge,
                                              ]}>
                                              Test
                                            </Text>
                                          ) : null}
                                          <Text
                                            style={styles.sampleCollectionSelectedTitle}>
                                            {test.description}
                                          </Text>
                                          {isUndefinedSpecimen ? (
                                            <Text
                                              style={styles.sampleCollectionSelectedMeta}>
                                              Sample tube is not defined for this test.
                                            </Text>
                                          ) : null}
                                          {parentChain.length ? (
                                            <Text
                                              style={styles.sampleCollectionSelectedMeta}>
                                              test in {parentChain.join(' > ')}
                                            </Text>
                                          ) : null}
                                        </View>
                                      </View>
                                    );
                                  })}
                                </View>
                              ) : null}
                            </View>
                          );
                        })}
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </View>
          ) : (
            <Text style={styles.sectionText}>
              No selected tests available yet. Add tests from panel company chips first.
            </Text>
          )}

          <TouchableOpacity
            activeOpacity={0.88}
            style={[
              styles.sampleCollectionCollectButton,
              !canCollectSample && styles.sampleCollectionCollectButtonDisabled,
            ]}
            onPress={handleCollectSample}
            disabled={!canCollectSample}>
            <Ionicons
              name="checkmark-done-outline"
              size={18}
              style={styles.sampleCollectionCollectButtonIcon}
            />
            <Text style={styles.sampleCollectionCollectButtonText}>
              Collect Sample
            </Text>
            <View style={styles.sampleCollectionCollectCountBadge}>
              <Text style={styles.sampleCollectionCollectCountText}>
                {selectedSampleTestCount}
                {selectedAdditionalTubes.length
                  ? `+${selectedAdditionalTubes.length}`
                  : ''}
              </Text>
            </View>
          </TouchableOpacity>
        </View>
      </View>
      <AppAlertModal
        alert={appAlert}
        styles={styles}
        onClose={() => setAppAlert(null)}
      />
    </>
  );
}

export default React.memo(SampleCollectionScreen);
