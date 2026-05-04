import React, {useEffect, useMemo, useState} from 'react';
import {Alert, NativeModules, Text, TouchableOpacity, View} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import {
  buildSampleTubeMapsFromTests,
  collectTubeNodesForSelectedTest,
  collectUniqueTubesForSelectedTests,
} from '../../utils/bookings/sampleTubeMapping';

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

const getResolvedRootCode = test => {
  const rawCode = getTestCode(test);
  const catalogContext = parseCatalogKey(test?.catalog_key);
  const catalogCode = toStableValue(catalogContext.bookedCode);

  if (isFullCatalogCode(rawCode)) {
    return rawCode;
  }

  return catalogCode || rawCode;
};

export default function SampleCollectionScreen({
  selectedPatient,
  selectedTests,
  styles,
  onCollectSample,
}) {
  const [expandedSpecimens, setExpandedSpecimens] = useState({});
  const [selectedSpecimens, setSelectedSpecimens] = useState({});
  const [selectedSpecimenTests, setSelectedSpecimenTests] = useState({});
  const [sampleTubeMaps, setSampleTubeMaps] = useState(() =>
    buildSampleTubeMapsFromTests([]),
  );

  useEffect(() => {
    setExpandedSpecimens({});
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
      })),
    );

    const summaryMap = expandedTests.reduce((accumulator, test) => {
      const specimenName = String(test?.specimenName || 'N/A').trim() || 'N/A';

      if (!accumulator[specimenName]) {
        accumulator[specimenName] = {
          specimenName,
          count: 0,
          childCount: 0,
          tests: [],
        };
      }

      accumulator[specimenName].count += 1;
      if (test.isChildTest || test.level > 0) {
        accumulator[specimenName].childCount += 1;
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
      ),
    [normalizedSelectedTests, sampleTubeMaps.childrenMap, sampleTubeMaps.testsMap],
  );

  useEffect(() => {
    let isMounted = true;
    const fallbackMaps = buildSampleTubeMapsFromTests(normalizedSelectedTests);
    const rootTests = normalizedSelectedTests
      .map(test => {
        const catalogContext = parseCatalogKey(test?.catalog_key);
        return {
          code: getResolvedRootCode(test),
          catalogKey: test?.catalog_key || '',
          gcode: test?.gcode || catalogContext.gcode || '',
          scode: test?.scode || catalogContext.scode || '',
          testCode: test?.test_code || '',
        };
      })
      .filter(test => test.code && test.code !== 'N/A');

    if (!rootTests.length || !CatalogDatabaseModule?.getSampleTubeMappingForTestCodes) {
      setSampleTubeMaps(fallbackMaps);
      return () => {
        isMounted = false;
      };
    }

    CatalogDatabaseModule.getSampleTubeMappingForTestCodes(JSON.stringify(rootTests))
      .then(response => {
        if (!isMounted) {
          return;
        }

        const parsedResponse =
          typeof response === 'string' ? JSON.parse(response) : response;
        setSampleTubeMaps(mergeSampleTubeMaps(fallbackMaps, parsedResponse));
      })
      .catch(() => {
        if (isMounted) {
          setSampleTubeMaps(fallbackMaps);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [normalizedSelectedTests]);

  useEffect(() => {
    setSelectedSpecimens(previousState => {
      const nextState = {};
      selectedSpecimenSummary.forEach(item => {
        nextState[item.specimenName] =
          previousState[item.specimenName] !== undefined
            ? previousState[item.specimenName]
            : true;
      });
      return nextState;
    });

    setSelectedSpecimenTests(previousState => {
      const nextState = {};
      selectedSpecimenSummary.forEach(item => {
        item.tests.forEach(test => {
          nextState[test.key] =
            previousState[test.key] !== undefined ? previousState[test.key] : true;
        });
      });
      return nextState;
    });
  }, [selectedSpecimenSummary]);

  const toggleSpecimenExpansion = specimenName => {
    setExpandedSpecimens(previousState => ({
      ...previousState,
      [specimenName]: !previousState[specimenName],
    }));
  };

  const toggleSpecimenSelection = item => {
    const nextSelected = !selectedSpecimens[item.specimenName];
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

  const toggleSpecimenTestSelection = (item, testKey) => {
    setSelectedSpecimens(previousState => ({
      ...previousState,
      [item.specimenName]: false,
    }));
    setSelectedSpecimenTests(previousState => ({
      ...previousState,
      [testKey]: !previousState[testKey],
    }));
  };

  const getSelectedSpecimenTestCount = item => {
    if (selectedSpecimens[item.specimenName]) {
      return item.count;
    }

    return item.tests.filter(test => selectedSpecimenTests[test.key]).length;
  };
  const selectedSampleTestCount = selectedSpecimenSummary.reduce(
    (total, item) => total + getSelectedSpecimenTestCount(item),
    0,
  );
  const canCollectSample = selectedSampleTestCount > 0;
  const handleCollectSample = () => {
    if (!canCollectSample) {
      return;
    }

    if (onCollectSample) {
      onCollectSample({
        patient: selectedPatient,
        selectedCount: selectedSampleTestCount,
      });
      return;
    }

    Alert.alert(
      'Sample Collection',
      `${selectedSampleTestCount} test${
        selectedSampleTestCount > 1 ? 's' : ''
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
                {patientLevelTubes.length ? patientLevelTubes.join(', ') : '-'}
              </Text>
            </View>
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
                const isSpecimenSelected = Boolean(
                  selectedSpecimens[item.specimenName],
                );
                const selectedCount = getSelectedSpecimenTestCount(item);

                return (
                  <View
                    key={item.specimenName}
                    style={styles.sampleCollectionSpecimenBlock}>
                    <View
                      style={[
                        styles.sampleCollectionSpecimenCard,
                        isExpanded && styles.sampleCollectionSpecimenCardActive,
                      ]}>
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
                      <TouchableOpacity
                        activeOpacity={0.85}
                        style={styles.sampleCollectionSpecimenHeaderContent}
                        onPress={() => toggleSpecimenExpansion(item.specimenName)}>
                        <View style={styles.sampleCollectionSpecimenTextWrap}>
                          <Text style={styles.sampleCollectionSpecimenTitle}>
                            {item.specimenName}
                          </Text>
                          <Text style={styles.sampleCollectionSpecimenMeta}>
                            {selectedCount}/{item.count} tests selected
                            {item.childCount
                              ? ` | ${item.childCount} child test${
                                  item.childCount > 1 ? 's' : ''
                                }`
                              : ''}
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
                        {item.tests.map(test => {
                          const isTestSelected =
                            isSpecimenSelected ||
                            Boolean(selectedSpecimenTests[test.key]);

                          return (
                            <View
                              key={test.key}
                              style={[
                                styles.sampleCollectionSelectedCard,
                                test.level > 0 &&
                                  styles.sampleCollectionSelectedChildCard,
                              ]}>
                              <TouchableOpacity
                                activeOpacity={0.85}
                                style={styles.sampleCollectionTestCheckButton}
                                onPress={() =>
                                  toggleSpecimenTestSelection(item, test.key)
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
                                      style={styles.sampleCollectionSpecimenCheckIcon}
                                    />
                                  ) : null}
                                </View>
                              </TouchableOpacity>
                              <View style={styles.sampleCollectionSelectedTextWrap}>
                                {test.level > 0 ? (
                                  <Text
                                    style={styles.sampleCollectionSelectedHierarchy}>
                                    Child test
                                    {test.level > 1 ? ` level ${test.level}` : ''}
                                  </Text>
                                ) : null}
                                <Text style={styles.sampleCollectionSelectedTitle}>
                                  {test.description}
                                </Text>
                                <Text style={styles.sampleCollectionSelectedMeta}>
                                  {test.booked_code}
                                  {test.level > 0 && test.parentDescription
                                    ? ` | Child of ${test.parentDescription}`
                                    : ''}
                                </Text>
                                <Text style={styles.sampleCollectionSelectedMeta}>
                                  {test.panelCompanyName}
                                </Text>
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
              </Text>
            </View>
          </TouchableOpacity>
        </View>
      </View>
    </>
  );
}
