const toStableValue = value =>
  value === null || value === undefined ? '' : String(value).trim();

const normalizeCode = value => toStableValue(value).toUpperCase();

const getTestCode = test =>
  normalizeCode(
    test?.testcode1 || test?.booked_code || test?.test_code || test?.code,
  );

const getSpecimenName = test =>
  toStableValue(
    test?.specimen_name ||
      test?.specimenName ||
      test?.specimen ||
      test?.tube_name ||
      test?.tubeName,
  );

const tubeDisplayPriority = new Map(
  ['EDTA', 'None', 'Flu-F', 'Flu-PP', 'Plain'].map((tube, index) => [
    tube.toLowerCase(),
    index,
  ]),
);

const orderTubesForDisplay = tubes =>
  tubes
    .map((tube, index) => ({tube, index}))
    .sort((leftItem, rightItem) => {
      const leftPriority = tubeDisplayPriority.get(leftItem.tube.toLowerCase());
      const rightPriority = tubeDisplayPriority.get(rightItem.tube.toLowerCase());

      if (leftPriority !== undefined || rightPriority !== undefined) {
        return (
          (leftPriority ?? Number.MAX_SAFE_INTEGER) -
            (rightPriority ?? Number.MAX_SAFE_INTEGER) ||
          leftItem.index - rightItem.index
        );
      }

      return leftItem.index - rightItem.index;
    })
    .map(item => item.tube);

const isProfileTest = test =>
  Boolean(
    test?.is_profile ||
      test?.isprofile ||
      test?.isProfile ||
      test?.IsProfile ||
      test?.has_children ||
      test?.hasChildren ||
      Number(test?.profile || test?.Profile || 0) === 1,
  );

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
        is_profile: isProfileTest(test),
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
    if (childCodes.length) {
      testsMap[code].has_children = true;
      testsMap[code].is_profile = true;
    }
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

    const entry = getMapEntry(testsMap, code);
    const mapCode = normalizeCode(entry?.testcode1 || code);
    const childCodes = getMapChildren(childrenMap, mapCode);
    const tube = getSpecimenName(entry);
    const tubeKey = tube.toLowerCase();
    const shouldUseOwnTube = !isProfileTest(entry) && !childCodes.length;

    if (shouldUseOwnTube && tube && !seenTubes.has(tubeKey)) {
      seenTubes.add(tubeKey);
      tubes.push(tube);
    }

    childCodes.forEach(childCode => {
      dfs(childCode);
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

  return orderTubesForDisplay(tubes);
};

export const collectTubeNodesForSelectedTest = (
  test,
  providedTestsMap = null,
  providedChildrenMap = null,
) => {
  const seenNodes = new Set();
  const fallbackMaps =
    providedTestsMap && providedChildrenMap
      ? null
      : buildSampleTubeMapsFromTests([test]);
  const testsMap = providedTestsMap || fallbackMaps.testsMap;
  const childrenMap = providedChildrenMap || fallbackMaps.childrenMap;
  const rootCode = getTestCode(test);

  const buildNodes = (
    codeValue,
    level = 0,
    parentDescriptions = [],
    path = [],
  ) => {
    const code = normalizeCode(codeValue);
    if (!code || path.includes(code)) {
      return [];
    }

    const entry = getMapEntry(testsMap, code);
    const mapCode = normalizeCode(entry?.testcode1 || code);
    const description =
      toStableValue(entry?.description || entry?.name) || mapCode || parentDescription;
    const childCodes = getMapChildren(childrenMap, mapCode);
    const specimenName = getSpecimenName(entry);
    const isProfile = isProfileTest(entry);
    const nextPath = [...path, code];
    const parentDescription =
      parentDescriptions[parentDescriptions.length - 1] || '';

    if (childCodes.length) {
      const nextParentDescriptions = [
        ...parentDescriptions,
        description || 'Unnamed Test',
      ];
      const childNodes = childCodes.flatMap(childCode =>
        buildNodes(childCode, level + 1, nextParentDescriptions, nextPath),
      );
      const specimenNames = Array.from(
        new Set(
          childNodes
            .map(node => node.specimenName)
            .filter(childSpecimenName => childSpecimenName),
        ),
      );

      return specimenNames.flatMap(childSpecimenName => {
        const nodeKey = `${rootCode}|${mapCode}|${level}|${parentDescriptions.join(
          '>',
        )}|${childSpecimenName}`;
        const parentNode = {
          key: nodeKey,
          booked_code: mapCode,
          description: description || 'Unnamed Test',
          specimenName: childSpecimenName,
          level,
          isProfileContext: true,
          parentDescription,
          parentDescriptions,
        };
        return [
          parentNode,
          ...childNodes.filter(node => node.specimenName === childSpecimenName),
        ];
      });
    }

    if (!specimenName || isProfile) {
      return [];
    }

    return [
      {
        key: `${rootCode}|${mapCode}|${level}|${parentDescriptions.join('>')}`,
        booked_code: mapCode,
        description: description || 'Unnamed Test',
        specimenName,
        level,
        isChildTest: level > 0,
        parentDescription,
        parentDescriptions,
      },
    ];
  };

  return buildNodes(rootCode).filter(node => {
    if (seenNodes.has(node.key)) {
      return false;
    }
    seenNodes.add(node.key);
    return true;
  });
};
