import {collectTubeNodesForSelectedTest} from '../../../utils/bookings/sampleTubeMapping';

const toStableValue = value =>
  value === null || value === undefined ? '' : String(value).trim();

const getTestCode = test =>
  toStableValue(
    test?.testcode1 || test?.booked_code || test?.test_code || test?.code,
  ) || 'N/A';

const toNumberOrValue = value => {
  const normalizedValue = toStableValue(value);
  if (!normalizedValue) {
    return '';
  }

  const numericValue = Number(normalizedValue);
  return Number.isFinite(numericValue) ? numericValue : normalizedValue;
};

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

export const isUndefinedSpecimenName = value => {
  const normalizedValue = String(value || '').trim().toLowerCase();
  return !normalizedValue || normalizedValue === 'none' || normalizedValue === 'n/a';
};

export const groupSpecimenTestsByParent = tests => {
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

export const buildPrecomputedSampleCollectionData = (
  normalizedSelectedTests,
  sampleTubeMaps,
) => {
  const tests = Array.isArray(normalizedSelectedTests)
    ? normalizedSelectedTests
    : [];
  const testsMap = sampleTubeMaps?.testsMap || {};
  const childrenMap = sampleTubeMaps?.childrenMap || {};

  const expandedTests = tests.flatMap(test =>
    collectTubeNodesForSelectedTest(test, testsMap, childrenMap).map(node => ({
      ...node,
      removalKey: test?.key,
      panelCompanyName: test?.panelCompanyName,
      rootBookedCode: getTestCode(test),
      rootTestName: getTestDescription(test),
      rootBookingTestId: getBookingTestId(test),
    })),
  );

  const patientTubeSet = new Set();
  const summaryMap = expandedTests.reduce((accumulator, test) => {
    const specimenName = String(test?.specimenName || 'N/A').trim() || 'N/A';
    if (!isUndefinedSpecimenName(specimenName)) {
      patientTubeSet.add(specimenName);
    }

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

  const selectedSpecimenSummary = Object.values(summaryMap).sort(
    (leftItem, rightItem) =>
      leftItem.specimenName.localeCompare(rightItem.specimenName),
  );

  const parentGroupsBySpecimen = selectedSpecimenSummary.reduce(
    (nextMap, item) => {
      nextMap[item.specimenName] = groupSpecimenTestsByParent(item.tests);
      return nextMap;
    },
    {},
  );

  return {
    allSpecimenTests: expandedTests,
    selectedSpecimenSummary,
    totalSpecimenTestCount: selectedSpecimenSummary.reduce(
      (total, item) => total + item.count,
      0,
    ),
    patientLevelTubes: Array.from(patientTubeSet),
    parentGroupsBySpecimen,
  };
};
