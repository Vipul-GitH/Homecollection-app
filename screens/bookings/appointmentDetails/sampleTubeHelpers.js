import {normalizeFormText} from './helpers';

const getSampleTubeTestCode = test =>
  normalizeFormText(
    test?.testcode1 || test?.booked_code || test?.test_code || test?.code,
  ) || 'N/A';

const getSampleTubeDedupeKey = test =>
  normalizeFormText(
    test?.dedupe_key ||
      test?.booked_code ||
      test?.testcode1 ||
      test?.test_code ||
      test?.code,
  ).toUpperCase();

export const dedupeSampleTubeSelectedTests = tests => {
  const dedupedMap = new Map();

  (Array.isArray(tests) ? tests : []).forEach((test, index) => {
    const dedupeKey = getSampleTubeDedupeKey(test) || `index-${index}`;
    if (!dedupedMap.has(dedupeKey)) {
      dedupedMap.set(dedupeKey, test);
    }
  });

  return Array.from(dedupedMap.values());
};

const isFullSampleCatalogCode = code =>
  /^G[^|]+S[^|]+T[^|]+$/i.test(normalizeFormText(code));

const parseSampleCatalogKey = catalogKey => {
  const [compCatId = '', gcode = '', scode = '', bookedCode = ''] =
    normalizeFormText(catalogKey).split('|');
  return {compCatId, gcode, scode, bookedCode};
};

const parseFullSampleCatalogCode = code => {
  const match = normalizeFormText(code)
    .toUpperCase()
    .match(/^(G[^S]+)(S[^T]+)T.+$/);

  return {
    gcode: match?.[1] || '',
    scode: match?.[2] || '',
  };
};

const getResolvedSampleRootCode = test => {
  const rawCode = getSampleTubeTestCode(test);
  const catalogContext = parseSampleCatalogKey(test?.catalog_key);
  const catalogCode = normalizeFormText(catalogContext.bookedCode);

  if (isFullSampleCatalogCode(rawCode)) {
    return rawCode;
  }

  return catalogCode || rawCode;
};

export const normalizeTestsForSampleTubeMapping = tests =>
  dedupeSampleTubeSelectedTests(tests).map(test => {
    const rootCode = getResolvedSampleRootCode(test);
    return {
      ...test,
      testcode1: rootCode,
      booked_code: rootCode,
    };
  });

export const mergeSampleTubeMaps = (fallbackMaps, nativeMaps) => {
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

export const buildSampleTubeRootTests = normalizedTests =>
  normalizedTests
    .map(test => {
      const catalogContext = parseSampleCatalogKey(test?.catalog_key);
      const codeContext = parseFullSampleCatalogCode(
        getResolvedSampleRootCode(test),
      );
      return {
        code: getResolvedSampleRootCode(test),
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

export const getSampleTubeMappingCacheKey = rootTests =>
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

export const areSampleTubeListsEqual = (leftTubes = [], rightTubes = []) =>
  leftTubes.length === rightTubes.length &&
  leftTubes.every((tube, index) => tube === rightTubes[index]);
