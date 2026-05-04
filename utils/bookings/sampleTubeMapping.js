const toStableValue = value =>
  value === null || value === undefined ? '' : String(value).trim();

const normalizeCode = value => toStableValue(value).toUpperCase();

const getTestCode = test =>
  normalizeCode(
    test?.testcode1 || test?.booked_code || test?.test_code || test?.code,
  );

const getSpecimenName = test =>
  toStableValue(test?.specimen_name || test?.specimenName);

const getChildTests = test =>
  Array.isArray(test?.childTests)
    ? test.childTests
    : Array.isArray(test?.child_tests)
    ? test.child_tests
    : [];

const getMapEntry = (testsMap, code) => {
  if (!testsMap || !code) {
    return null;
  }

  return testsMap[code] || testsMap[normalizeCode(code)] || null;
};

const getMapChildren = (childrenMap, code) => {
  if (!childrenMap || !code) {
    return [];
  }

  const children = childrenMap[code] || childrenMap[normalizeCode(code)];
  return Array.isArray(children) ? children : [];
};

export const buildSampleTubeMapsFromTests = selectedTests => {
  const testsMap = {};
  const childrenMap = {};

  const walk = test => {
    const code = getTestCode(test);
    if (!code) {
      return;
    }

    if (!testsMap[code]) {
      testsMap[code] = {
        specimen_name: getSpecimenName(test),
        description: toStableValue(test?.description || test?.name),
        testcode1: code,
        test_code: toStableValue(test?.test_code),
      };
    }

    const childCodes = [];
    getChildTests(test).forEach(child => {
      const childCode = getTestCode(child);
      if (childCode) {
        childCodes.push(childCode);
      }
      walk(child);
    });
    childrenMap[code] = childCodes;
  };

  (Array.isArray(selectedTests) ? selectedTests : []).forEach(walk);
  return {testsMap, childrenMap};
};

export const collectTubesForSelectedTest = (
  test,
  providedTestsMap = null,
  providedChildrenMap = null,
) => {
  const visitedCodes = new Set();
  const seenTubes = new Set();
  const tubes = [];
  const fallbackMaps = buildSampleTubeMapsFromTests([test]);
  const testsMap = providedTestsMap || fallbackMaps.testsMap;
  const childrenMap = providedChildrenMap || fallbackMaps.childrenMap;

  const dfs = codeValue => {
    const code = normalizeCode(codeValue);

    if (!code || visitedCodes.has(code)) {
      return;
    }

    visitedCodes.add(code);

    const tube = getSpecimenName(getMapEntry(testsMap, code));
    const tubeKey = tube.toLowerCase();

    if (tube && !seenTubes.has(tubeKey)) {
      seenTubes.add(tubeKey);
      tubes.push(tube);
    }

    getMapChildren(childrenMap, code).forEach(childCode => {
      const normalizedChildCode = normalizeCode(childCode);
      const childEntry = getMapEntry(testsMap, normalizedChildCode);
      dfs(childEntry?.testcode1 || normalizedChildCode);
    });
  };

  dfs(getTestCode(test));
  return tubes;
};

export const collectUniqueTubesForSelectedTests = (
  selectedTests,
  providedTestsMap = null,
  providedChildrenMap = null,
) => {
  const seenTubes = new Set();
  const tubes = [];
  const fallbackMaps =
    providedTestsMap && providedChildrenMap
      ? null
      : buildSampleTubeMapsFromTests(selectedTests);
  const testsMap = providedTestsMap || fallbackMaps.testsMap;
  const childrenMap = providedChildrenMap || fallbackMaps.childrenMap;

  (Array.isArray(selectedTests) ? selectedTests : []).forEach(test => {
    collectTubesForSelectedTest(test, testsMap, childrenMap).forEach(tube => {
      const tubeKey = tube.toLowerCase();

      if (!seenTubes.has(tubeKey)) {
        seenTubes.add(tubeKey);
        tubes.push(tube);
      }
    });
  });

  return tubes;
};

export const collectTubeNodesForSelectedTest = (
  test,
  providedTestsMap = null,
  providedChildrenMap = null,
) => {
  const visitedCodes = new Set();
  const seenNodes = new Set();
  const nodes = [];
  const fallbackMaps =
    providedTestsMap && providedChildrenMap
      ? null
      : buildSampleTubeMapsFromTests([test]);
  const testsMap = providedTestsMap || fallbackMaps.testsMap;
  const childrenMap = providedChildrenMap || fallbackMaps.childrenMap;

  const dfs = (codeValue, level = 0, parentDescription = '') => {
    const code = normalizeCode(codeValue);
    if (!code || visitedCodes.has(code)) {
      return;
    }

    visitedCodes.add(code);
    const entry = getMapEntry(testsMap, code);
    const mapCode = normalizeCode(entry?.testcode1 || code);
    const specimenName = getSpecimenName(entry) || '-';
    const nodeKey = `${getTestCode(test)}|${mapCode}|${level}|${parentDescription}`;

    if (!seenNodes.has(nodeKey)) {
      seenNodes.add(nodeKey);
      nodes.push({
        key: nodeKey,
        booked_code: mapCode,
        description:
          toStableValue(entry?.description || entry?.name) || mapCode || 'Unnamed Test',
        specimenName,
        level,
        isChildTest: level > 0,
        parentDescription,
      });
    }

    const parentName =
      toStableValue(entry?.description || entry?.name) || mapCode || parentDescription;
    getMapChildren(childrenMap, mapCode).forEach(childCode =>
      dfs(childCode, level + 1, parentName),
    );
  };

  dfs(getTestCode(test));
  return nodes;
};
