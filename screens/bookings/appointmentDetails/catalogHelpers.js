import {normalizeFormText} from './helpers';

export const getCatalogGroupId = group =>
  normalizeFormText(group?.group_id || group?.gcode || group?.group_code);

export const getCatalogSubgroupId = subgroup =>
  normalizeFormText(
    subgroup?.subgroup_id || subgroup?.scode || subgroup?.subgroup_code,
  );

const getCatalogTestId = test =>
  normalizeFormText(test?.booked_code || test?.testcode1 || test?.test_code || test?.code);

const compareCatalogIds = (leftId, rightId) =>
  normalizeFormText(leftId).localeCompare(normalizeFormText(rightId), undefined, {
    numeric: true,
    sensitivity: 'base',
  });

const getCatalogCodeSortParts = code => {
  const normalizedCode = normalizeFormText(code).toUpperCase();
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

export const sortCatalogTestsByCode = tests =>
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

export const sortCatalogGroupsById = groups =>
  (Array.isArray(groups) ? groups : [])
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

export const getCatalogDisplayTitle = ({item, isGroupList, isSubgroupList}) => {
  if (isGroupList) {
    const groupId = getCatalogGroupId(item);
    const groupName = item?.group_name || '';
    return groupId ? `${groupId} - ${groupName || 'Unnamed Group'}` : groupName;
  }

  if (isSubgroupList) {
    const subgroupId = getCatalogSubgroupId(item);
    const subgroupName = item?.subgroup_name || '';
    return subgroupId
      ? `${subgroupId} - ${subgroupName || 'Unnamed Subgroup'}`
      : subgroupName;
  }

  return item?.description || item?.booked_code;
};
