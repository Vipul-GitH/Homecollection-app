import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  Alert,
  NativeModules,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import AppAlertModal from '../../components/common/AppAlertModal';
import LoadingOverlay from '../../components/common/LoadingOverlay';
import {buildSampleTubeMapsFromTests} from '../../utils/bookings/sampleTubeMapping';
import {
  isUndefinedSpecimenName,
  buildPrecomputedSampleCollectionData,
} from './appointmentDetails/sampleCollectionPrecompute';
import {
  sampleTubeMappingCache,
  sampleTubeMappingRequests,
} from '../../utils/bookings/sampleTubeMappingCache';

const {CatalogDatabaseModule, PrinterModule} = NativeModules;
const SAMPLE_TUBE_MAPPING_TIMEOUT_MS = 7000;
const logSampleTubePerf = () => {};
const SAVED_PRINTER_KEY = '@homecollection/default_printer';

const toStableValue = value =>
  value === null || value === undefined ? '' : String(value).trim();

const parseSavedPrinter = value => {
  if (!value) {
    return null;
  }

  try {
    const parsedValue = JSON.parse(value);
    return parsedValue?.address ? parsedValue : null;
  } catch {
    return null;
  }
};

const getPatientName = patient => {
  const title = toStableValue(patient?.title || patient?.patient_title);
  const name =
    toStableValue(
    patient?.name ||
      patient?.full_name ||
      patient?.fullName ||
      patient?.patient_name ||
      patient?.patientName,
    ) || 'Patient';
  const normalizedTitle = title.replace(/\s+/g, ' ');

  if (
    normalizedTitle &&
    !name.toLowerCase().startsWith(normalizedTitle.toLowerCase())
  ) {
    return `${normalizedTitle} ${name}`;
  }

  return name;
};

const calculateAgeYearsFromDate = value => {
  const normalizedDate = toStableValue(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalizedDate)) {
    return '';
  }

  const [year, month, day] = normalizedDate.split('-').map(Number);
  const birthDate = new Date(year, month - 1, day);

  if (
    birthDate.getFullYear() !== year ||
    birthDate.getMonth() !== month - 1 ||
    birthDate.getDate() !== day
  ) {
    return '';
  }

  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const hasBirthdayPassed =
    today.getMonth() > birthDate.getMonth() ||
    (today.getMonth() === birthDate.getMonth() &&
      today.getDate() >= birthDate.getDate());

  if (!hasBirthdayPassed) {
    age -= 1;
  }

  return age >= 0 ? String(age) : '';
};

const getGenderFromPatientTitle = title => {
  const normalizedTitle = toStableValue(title).toLowerCase().replace(/\.$/, '');

  if (['mr', 'master', 'mst', 'son of'].includes(normalizedTitle)) {
    return 'Male';
  }

  if (
    ['mrs', 'ms', 'miss', 'baby', 'daughter of', 'dr (ms)'].includes(
      normalizedTitle,
    )
  ) {
    return 'Female';
  }

  return '';
};

const normalizeGenderText = value => {
  const normalizedValue = toStableValue(value);
  const lowerValue = normalizedValue.toLowerCase();

  if (['m', 'male'].includes(lowerValue)) {
    return 'Male';
  }

  if (['f', 'female'].includes(lowerValue)) {
    return 'Female';
  }

  return normalizedValue === 'N/A' ? '' : normalizedValue;
};

const getPatientAgeGender = patient => {
  const explicitAgeValue = toStableValue(
    patient?.age ||
      patient?.Age ||
      patient?.age_years ||
      patient?.ageYears ||
      patient?.age_year ||
      patient?.patient_age_years ||
      patient?.patient_age ||
      patient?.patientAge,
  );
  const ageValue =
    explicitAgeValue && explicitAgeValue !== 'N/A'
      ? explicitAgeValue
      : calculateAgeYearsFromDate(
          patient?.dob ||
            patient?.date_of_birth ||
            patient?.dateOfBirth ||
            patient?.birth_date,
        );
  const genderValue =
    normalizeGenderText(
      patient?.gender ||
        patient?.Gender ||
        patient?.patient_gender ||
        patient?.sex ||
        patient?.Sex,
    ) || getGenderFromPatientTitle(patient?.title || patient?.patient_title);
  const ageText = ageValue ? `${ageValue} Yrs` : '';
  return [ageText, genderValue].filter(Boolean).join(' ');
};

const getPrintDateText = () => {
  const date = new Date();
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
};

const TUBE_BARCODE_CENTER_ID = '1';

const getFinancialYearShortCode = () => {
  const date = new Date();
  const fiscalYearStart = date.getMonth() >= 3 ? date.getFullYear() : date.getFullYear() - 1;
  return String(fiscalYearStart).slice(-2);
};

const getDigitsOnly = value => toStableValue(value).replace(/\D/g, '');

const getBookingSourceType = booking =>
  toStableValue(booking?.sourceType || booking?.source_type).toUpperCase();

const getBookingAppointmentId = booking =>
  getDigitsOnly(booking?.appointmentId || booking?.appointment_id);

const getBookingId = booking =>
  getDigitsOnly(booking?.id || booking?.bookingId || booking?.booking_id);

const getTubeBarcodePrefix = booking => {
  const appointmentId = getBookingAppointmentId(booking);
  const sourceType = getBookingSourceType(booking);

  if (sourceType === 'APPOINTMENT' && appointmentId) {
    return `0${appointmentId}`;
  }

  return `${getFinancialYearShortCode()}${getBookingId(booking)}`;
};

const getPatientIdentityCandidates = patient =>
  [
    patient?.bookingPatientId,
    patient?.booking_patient_id,
    patient?.booking_patient,
    patient?.patientId,
    patient?.patient_id,
    patient?.labmatePid,
    patient?.labmate_pid,
    patient?.id,
  ]
    .map(value => toStableValue(value))
    .filter(Boolean);

const isSamePatient = (leftPatient, rightPatient) => {
  const leftCandidates = getPatientIdentityCandidates(leftPatient);
  const rightCandidates = new Set(getPatientIdentityCandidates(rightPatient));
  return leftCandidates.some(candidate => rightCandidates.has(candidate));
};

const getPatientSequenceFromBarcode = (booking, barcode) => {
  const prefix = getTubeBarcodePrefix(booking);
  const normalizedBarcode = toStableValue(barcode);

  if (!prefix || !normalizedBarcode.startsWith(`${prefix}${TUBE_BARCODE_CENTER_ID}`)) {
    return '';
  }

  const sequencePart = normalizedBarcode
    .slice(`${prefix}${TUBE_BARCODE_CENTER_ID}`.length)
    .split('-')[0];

  return getDigitsOnly(sequencePart);
};

const getExistingPatientSequenceFromTubeMap = (booking, tubeBarcodeMap) => {
  if (!tubeBarcodeMap || typeof tubeBarcodeMap !== 'object') {
    return '';
  }

  for (const record of Object.values(tubeBarcodeMap)) {
    const sequence = getPatientSequenceFromBarcode(
      booking,
      record?.tubeCode || record?.tube_code || record?.barcode,
    );

    if (sequence) {
      return sequence;
    }
  }

  return '';
};

const getUsedPatientSequences = (booking, patientSampleCollectionMap) => {
  const usedSequences = new Set();

  Object.values(patientSampleCollectionMap || {}).forEach(sampleCollection => {
    const sequence =
      toStableValue(sampleCollection?.patientSequence) ||
      getExistingPatientSequenceFromTubeMap(
        booking,
        sampleCollection?.tubeBarcodeMap,
      );

    if (sequence) {
      usedSequences.add(sequence);
    }
  });

  return usedSequences;
};

const getSavedPatientSequence = (patientSequenceMap, selectedPatient) => {
  if (!patientSequenceMap || typeof patientSequenceMap !== 'object') {
    return '';
  }

  const candidates = getPatientIdentityCandidates(selectedPatient);

  for (const candidate of candidates) {
    const sequence = toStableValue(patientSequenceMap[candidate]);

    if (sequence) {
      return sequence;
    }
  }

  return '';
};

const getNextPatientSequence = usedSequences => {
  let nextSequence = 1;

  while (usedSequences.has(String(nextSequence))) {
    nextSequence += 1;
  }

  return String(nextSequence);
};

const getPatientSequence = (
  booking,
  selectedPatient,
  sampleCollectionDraft,
  patientSampleCollectionMap,
  patientSequenceMap,
) => {
  const existingSequence =
    getSavedPatientSequence(patientSequenceMap, selectedPatient) ||
    toStableValue(sampleCollectionDraft?.patientSequence) ||
    getExistingPatientSequenceFromTubeMap(
      booking,
      sampleCollectionDraft?.tubeBarcodeMap,
    );

  if (existingSequence) {
    return existingSequence;
  }

  const usedSequences = getUsedPatientSequences(booking, patientSampleCollectionMap);
  Object.values(patientSequenceMap || {}).forEach(sequence => {
    const normalizedSequence = toStableValue(sequence);

    if (normalizedSequence) {
      usedSequences.add(normalizedSequence);
    }
  });
  const patients = Array.isArray(booking?.patients) ? booking.patients : [];
  const patientIndex = patients.findIndex(patient =>
    isSamePatient(patient, selectedPatient),
  );
  const listSequence = patientIndex >= 0 ? String(patientIndex + 1) : '';

  if (listSequence && !usedSequences.has(listSequence)) {
    return listSequence;
  }

  return getNextPatientSequence(usedSequences);
};

const getTubePhysicalKey = tube => {
  const tubeName = toStableValue(tube?.tubeName || tube?.specimenName).toLowerCase();
  const sourcePrefix = tube?.isAdditionalTube ? 'additional' : 'specimen';
  return `${sourcePrefix}:${tubeName}`;
};

const getTubeSequenceFromRecord = record => {
  const explicitSequence = Number(record?.tubeSeq || record?.tube_seq || 0);
  if (explicitSequence > 0) {
    return explicitSequence;
  }

  const code = toStableValue(record?.tubeCode || record?.tube_code || record?.barcode);
  const suffixMatch = code.match(/-(\d+)$/);
  return suffixMatch ? Number(suffixMatch[1]) : 0;
};

const buildTubeBarcode = ({
  booking,
  selectedPatient,
  sampleCollectionDraft,
  patientSampleCollectionMap,
  patientSequenceMap,
  tubeSeq,
}) => {
  const prefix = getTubeBarcodePrefix(booking);
  const patientSequence = getPatientSequence(
    booking,
    selectedPatient,
    sampleCollectionDraft,
    patientSampleCollectionMap,
    patientSequenceMap,
  );
  const normalizedTubeSeq = String(Number(tubeSeq || 0) || '');

  if (!prefix || !patientSequence || !normalizedTubeSeq) {
    return '';
  }

  return `${prefix}${TUBE_BARCODE_CENTER_ID}${patientSequence}-${normalizedTubeSeq}`;
};

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

const withPromiseTimeout = (promise, timeoutMs) =>
  new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      const timeoutError = new Error('SAMPLE_TUBE_MAPPING_TIMEOUT');
      timeoutError.code = 'SAMPLE_TUBE_MAPPING_TIMEOUT';
      reject(timeoutError);
    }, timeoutMs);

    promise
      .then(result => {
        clearTimeout(timeoutId);
        resolve(result);
      })
      .catch(error => {
        clearTimeout(timeoutId);
        reject(error);
      });
  });

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
  'Swab',
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
  Swab: {icon: 'eyedrop-outline', tone: '#0F766E'},
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
  patientSampleCollectionMap = {},
  patientSequenceMap = {},
  styles,
  onCollectSample,
  onSampleCollectionDraftChange,
  onLocalDatabaseLoadingChange,
  loggedInUser = '',
}) {
  const [appAlert, setAppAlert] = useState(null);
  const [isPrintingLabels, setIsPrintingLabels] = useState(false);
  const tubeBarcodeMapRef = useRef(sampleCollectionDraft?.tubeBarcodeMap || {});
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
  const [isMappingSampleTubes, setIsMappingSampleTubes] = useState(false);

  useEffect(() => {
    sampleCollectionDraftRef.current = sampleCollectionDraft;
    if (
      sampleCollectionDraft?.tubeBarcodeMap &&
      typeof sampleCollectionDraft.tubeBarcodeMap === 'object'
    ) {
      tubeBarcodeMapRef.current = sampleCollectionDraft.tubeBarcodeMap;
    }
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
    tubeBarcodeMapRef.current = currentDraft?.tubeBarcodeMap || {};
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

  const sampleTubeFallbackMaps = useMemo(
    () => buildSampleTubeMapsFromTests(normalizedSelectedTests),
    [normalizedSelectedTests],
  );

  const sampleTubeRootTests = useMemo(
    () =>
      normalizedSelectedTests
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
        .filter(test => test.code && test.code !== 'N/A'),
    [normalizedSelectedTests],
  );

  const sampleTubeCacheKey = useMemo(
    () => getSampleTubeMappingCacheKey(sampleTubeRootTests),
    [sampleTubeRootTests],
  );
  const selectedTestCount = normalizedSelectedTests.length;
  const rootTestCount = sampleTubeRootTests.length;
  const sampleTubePerfSessionRef = useRef({
    sessionStartedAt: 0,
    nativeRequestStartedAt: 0,
  });
  const precomputedSampleTubeData = useMemo(() => {
    const candidate = sampleCollectionDraft?.precomputedSampleTubeData;
    if (!candidate || typeof candidate !== 'object') {
      return null;
    }

    return candidate.cacheKey === sampleTubeCacheKey ? candidate : null;
  }, [sampleCollectionDraft?.precomputedSampleTubeData, sampleTubeCacheKey]);

  const precomputedDerivedData = useMemo(
    () =>
      precomputedSampleTubeData?.derivedData &&
      typeof precomputedSampleTubeData.derivedData === 'object'
        ? precomputedSampleTubeData.derivedData
        : null,
    [precomputedSampleTubeData],
  );
  const hasRenderableInitialSelection = normalizedSelectedTests.length > 0;
  const {
    allSpecimenTests,
    selectedSpecimenSummary,
    totalSpecimenTestCount,
    patientLevelTubes,
    parentGroupsBySpecimen,
  } = useMemo(() => {
    if (precomputedDerivedData) {
      return {
        allSpecimenTests: Array.isArray(precomputedDerivedData.allSpecimenTests)
          ? precomputedDerivedData.allSpecimenTests
          : [],
        selectedSpecimenSummary: Array.isArray(
          precomputedDerivedData.selectedSpecimenSummary,
        )
          ? precomputedDerivedData.selectedSpecimenSummary
          : [],
        totalSpecimenTestCount: Number(
          precomputedDerivedData.totalSpecimenTestCount || 0,
        ),
        patientLevelTubes: Array.isArray(precomputedDerivedData.patientLevelTubes)
          ? precomputedDerivedData.patientLevelTubes
          : [],
        parentGroupsBySpecimen:
          precomputedDerivedData.parentGroupsBySpecimen &&
          typeof precomputedDerivedData.parentGroupsBySpecimen === 'object'
            ? precomputedDerivedData.parentGroupsBySpecimen
            : {},
      };
    }

    return buildPrecomputedSampleCollectionData(
      normalizedSelectedTests,
      sampleTubeMaps,
    );
  }, [
    normalizedSelectedTests,
    precomputedDerivedData,
    sampleTubeMaps,
  ]);
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
    const mappingSessionStartedAt = Date.now();
    sampleTubePerfSessionRef.current = {
      sessionStartedAt: mappingSessionStartedAt,
      nativeRequestStartedAt: 0,
    };
    const initialMaps =
      precomputedSampleTubeData?.maps &&
      typeof precomputedSampleTubeData.maps === 'object'
        ? precomputedSampleTubeData.maps
        : sampleTubeFallbackMaps;
    if (
      !sampleTubeRootTests.length ||
      !CatalogDatabaseModule?.getSampleTubeMappingForTestCodes
    ) {
      logSampleTubePerf('Skipped Native Mapping', {
        reason: !sampleTubeRootTests.length
          ? 'no-root-tests'
          : 'native-module-missing',
        selectedTestCount,
        rootTestCount,
      });
      onLocalDatabaseLoadingChange?.('');
      setIsMappingSampleTubes(false);
      setSampleTubeMaps(initialMaps);
      return () => {
        isMounted = false;
      };
    }

    if (precomputedSampleTubeData?.source === 'native') {
      logSampleTubePerf('Used Precomputed Native Mapping', {
        selectedTestCount,
        rootTestCount,
        totalElapsedMs: Date.now() - mappingSessionStartedAt,
      });
      onLocalDatabaseLoadingChange?.('');
      setIsMappingSampleTubes(false);
      setSampleTubeMaps(initialMaps);
      return () => {
        isMounted = false;
      };
    }

    const cachedMaps = sampleTubeMappingCache.get(sampleTubeCacheKey);

    if (cachedMaps) {
      logSampleTubePerf('Used Cached Native Mapping', {
        selectedTestCount,
        rootTestCount,
        totalElapsedMs: Date.now() - mappingSessionStartedAt,
      });
      onLocalDatabaseLoadingChange?.('');
      setIsMappingSampleTubes(false);
      setSampleTubeMaps(mergeSampleTubeMaps(sampleTubeFallbackMaps, cachedMaps));
      return () => {
        isMounted = false;
      };
    }

    setIsMappingSampleTubes(true);
    setSampleTubeMaps(initialMaps);
    logSampleTubePerf('Started Mapping Session', {
      selectedTestCount,
      rootTestCount,
      cacheKeyLength: sampleTubeCacheKey.length,
      hasRenderableInitialSelection,
      hasPrecomputedData: Boolean(precomputedSampleTubeData),
    });

    const mappingRequest =
      sampleTubeMappingRequests.get(sampleTubeCacheKey) ||
      (() => {
        sampleTubePerfSessionRef.current.nativeRequestStartedAt = Date.now();
        return withPromiseTimeout(
          CatalogDatabaseModule.getSampleTubeMappingForTestCodes(
            JSON.stringify(sampleTubeRootTests),
          ),
          SAMPLE_TUBE_MAPPING_TIMEOUT_MS,
        );
      })()
        .then(response => {
          const parsedResponse =
            typeof response === 'string' ? JSON.parse(response) : response;
          sampleTubeMappingCache.set(sampleTubeCacheKey, parsedResponse);
          sampleTubeMappingRequests.delete(sampleTubeCacheKey);
          return parsedResponse;
        })
        .catch(error => {
          sampleTubeMappingRequests.delete(sampleTubeCacheKey);
          throw error;
        });

    sampleTubeMappingRequests.set(sampleTubeCacheKey, mappingRequest);

    mappingRequest
      .then(response => {
        if (!isMounted) {
          return;
        }
        const nativeElapsedMs =
          sampleTubePerfSessionRef.current.nativeRequestStartedAt > 0
            ? Date.now() - sampleTubePerfSessionRef.current.nativeRequestStartedAt
            : null;
        logSampleTubePerf('Completed Native Mapping', {
          selectedTestCount,
          rootTestCount,
          nativeElapsedMs,
          nativeDurationMs: Number(response?.duration_ms || 0) || null,
          visitedNodeCount: Number(response?.visited_count || 0) || null,
          testsMapCount: Number(response?.tests_map_count || 0) || null,
          childrenMapCount: Number(response?.children_map_count || 0) || null,
          totalElapsedMs: Date.now() - mappingSessionStartedAt,
        });
        setSampleTubeMaps(mergeSampleTubeMaps(sampleTubeFallbackMaps, response));
        setIsMappingSampleTubes(false);
        onLocalDatabaseLoadingChange?.('');
      })
      .catch(error => {
        if (isMounted) {
          logSampleTubePerf('Native Mapping Failed', {
            selectedTestCount,
            rootTestCount,
            nativeElapsedMs:
              sampleTubePerfSessionRef.current.nativeRequestStartedAt > 0
                ? Date.now() - sampleTubePerfSessionRef.current.nativeRequestStartedAt
                : null,
            totalElapsedMs: Date.now() - mappingSessionStartedAt,
            message: error?.message || 'unknown-error',
          });
          setSampleTubeMaps(sampleTubeFallbackMaps);
          setIsMappingSampleTubes(false);
          onLocalDatabaseLoadingChange?.('');
        }
      });

    return () => {
      isMounted = false;
      setIsMappingSampleTubes(false);
      onLocalDatabaseLoadingChange?.('');
    };
  }, [
    hasRenderableInitialSelection,
    onLocalDatabaseLoadingChange,
    precomputedSampleTubeData,
    sampleTubeCacheKey,
    sampleTubeFallbackMaps,
    sampleTubeRootTests,
    rootTestCount,
    selectedTestCount,
  ]);

  useEffect(() => {
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

  const getRootKeyFromTestKey = useCallback(
    testKey => toStableValue(testKey).split('|')[0],
    [],
  );

  const parentBookedCodeLookup = useMemo(() => {
    const nextLookup = {};

    allSpecimenTests.forEach(test => {
      const rootKey = getRootKeyFromTestKey(test?.key);
      const description = toStableValue(test?.description);
      const level = Number(test?.level || 0);

      if (!rootKey || !description) {
        return;
      }

      nextLookup[`${rootKey}|${description}|${level}`] = test?.booked_code;
    });

    return nextLookup;
  }, [allSpecimenTests, getRootKeyFromTestKey]);

  const getParentBookedCode = useCallback(
    childTest => {
      const parentDescription = toStableValue(childTest?.parentDescription);
      const rootKey = getRootKeyFromTestKey(childTest?.key);
      const childLevel = Number(childTest?.level || 0);

      if (!parentDescription || !rootKey) {
        return childTest?.rootBookedCode || rootKey;
      }

      return (
        parentBookedCodeLookup[`${rootKey}|${parentDescription}|${childLevel - 1}`] ||
        childTest?.rootBookedCode ||
        rootKey
      );
    },
    [getRootKeyFromTestKey, parentBookedCodeLookup],
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
    () => {
      const existingBarcodeMap = tubeBarcodeMapRef.current || {};
      const currentDraft = sampleCollectionDraftRef.current || {};
      const nextBarcodeMap = {...existingBarcodeMap};
      const maxExistingTubeSeq = Object.values(existingBarcodeMap).reduce(
        (maxSequence, record) =>
          Math.max(maxSequence, getTubeSequenceFromRecord(record)),
        0,
      );
      let nextTubeSeq = maxExistingTubeSeq + 1;

      const selectedTubeRows = tubeSelectionSummary
        .map((item, index) => ({
          tubeName: item.tubeName,
          totalCount: item.totalCount,
          selectedCount: item.selectedCount,
          pendingCount: item.pendingCount,
          isAdditionalTube: Boolean(item.isAdditionalTube),
          reservedTubeSeq: index + 1,
        }))
        .filter(item => Number(item.selectedCount || 0) > 0);

      const rowsWithBarcodes = selectedTubeRows.map(item => {
        const tubeKey = getTubePhysicalKey(item);
        const existingRecord = nextBarcodeMap[tubeKey];
        const reservedTubeSeq = Number(item.reservedTubeSeq || 0);
        const tubeSeq =
          getTubeSequenceFromRecord(existingRecord) ||
          (reservedTubeSeq > 0 ? reservedTubeSeq : nextTubeSeq++);
        nextTubeSeq = Math.max(nextTubeSeq, tubeSeq + 1);
        const tubeCode =
          toStableValue(
            existingRecord?.tubeCode ||
              existingRecord?.tube_code ||
              existingRecord?.barcode,
          ) ||
          buildTubeBarcode({
            booking: selectedBooking,
            selectedPatient,
            sampleCollectionDraft: currentDraft,
            patientSampleCollectionMap,
            patientSequenceMap,
            tubeSeq,
          });
        const patientSequence = getPatientSequence(
          selectedBooking,
          selectedPatient,
          currentDraft,
          patientSampleCollectionMap,
          patientSequenceMap,
        );
        const record = {
          tubeCode,
          tubeSeq,
          patientSequence,
          tubeName: item.tubeName,
          isAdditionalTube: Boolean(item.isAdditionalTube),
        };

        nextBarcodeMap[tubeKey] = record;

        return {
          ...item,
          ...record,
        };
      });

      tubeBarcodeMapRef.current = nextBarcodeMap;
      return rowsWithBarcodes;
    },
    [
      patientSampleCollectionMap,
      patientSequenceMap,
      selectedBooking,
      selectedPatient,
      tubeSelectionSummary,
    ],
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
    const appointmentId = toNumberOrValue(
      selectedBooking?.appointmentId || selectedBooking?.appointment_id,
    );
    const sourceType = toStableValue(
      selectedBooking?.sourceType || selectedBooking?.source_type,
    ).toUpperCase();
    const bookingPatientId = getBookingPatientId(selectedPatient);
    const patientId = getPatientApiId(selectedPatient);
    const pendingGroupMap = new Map();

    selectedSpecimenSummary.forEach(item => {
      if (isUndefinedSpecimenName(item.specimenName)) {
        return;
      }

      item.tests.forEach(test => {
        const isPendingCollectableTest =
          !test.isProfileContext && !selectedSpecimenTests[test.key];

        if (!isPendingCollectableTest) {
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
          description: test.description || getTestDescription(test),
        };
        const existingGroup = pendingGroupMap.get(groupKey);

        if (existingGroup) {
          existingGroup.pending.push(pendingTest);
          existingGroup.pending_child_tests.push(pendingTest);
          return;
        }

        pendingGroupMap.set(groupKey, {
          booking_id: bookingId,
          ...(sourceType === 'APPOINTMENT' && appointmentId
            ? {
                appointment_id: appointmentId,
                source_type: sourceType,
              }
            : {}),
          booking_patient_id: bookingPatientId,
          patient_id: patientId,
          booking_test_id: test.rootBookingTestId || '',
          root_booked_code: rootBookedCode,
          root_test_name: test.rootTestName || rootBookedCode,
          tube_name: item.specimenName || test.specimenName || 'N/A',
          pending: [pendingTest],
          pending_child_tests: [pendingTest],
        });
      });
    });

    return Array.from(pendingGroupMap.values());
  }, [
    getParentBookedCode,
    getRootKeyFromTestKey,
    selectedBooking?.appointmentId,
    selectedBooking?.appointment_id,
    selectedBooking?.id,
    selectedBooking?.sourceType,
    selectedBooking?.source_type,
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
      patientSequence: getPatientSequence(
        selectedBooking,
        selectedPatient,
        sampleCollectionDraftRef.current || {},
        patientSampleCollectionMap,
        patientSequenceMap,
      ),
      tubeBarcodeMap: tubeBarcodeMapRef.current,
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
    patientSampleCollectionMap,
    patientSequenceMap,
    pendingChildTestsPayload,
    sampleCollectionDraft?.collected,
    selectedBooking,
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
  const handlePrintTubeLabels = async () => {
    if (isPrintingLabels) {
      return;
    }

    try {
      setIsPrintingLabels(true);
      if (!PrinterModule?.printTubeLabels) {
        Alert.alert(
          'Printer Unavailable',
          'Printer module is not available in this APK build.',
        );
        return;
      }

      const savedPrinter = parseSavedPrinter(
        await AsyncStorage.getItem(SAVED_PRINTER_KEY),
      );

      if (!savedPrinter?.address) {
        Alert.alert(
          'Printer Not Selected',
          'Please select a default printer from Profile > Printer first.',
        );
        return;
      }

      if (!selectedTubes.length) {
        Alert.alert(
          'No Tubes Selected',
          'Select at least one tube before printing labels.',
        );
        return;
      }

      if (selectedTubes.some(tube => !toStableValue(tube?.tubeCode))) {
        Alert.alert(
          'Tube Code Missing',
          'Unable to generate a tube barcode for one or more selected tubes.',
        );
        return;
      }

      const patientName = getPatientName(selectedPatient);
      const ageGender = getPatientAgeGender(selectedPatient);
      const dateText = getPrintDateText();
      const labels = selectedTubes.map(tube => ({
        patientName,
        ageGender,
        tubeName: tube.tubeName,
        tubeCode: tube.tubeCode,
        barcode: tube.tubeCode,
        dateText,
        phleboName: toStableValue(loggedInUser),
      }));

      await PrinterModule.printTubeLabels(
        savedPrinter.address,
        savedPrinter.transport || '',
        labels,
      );

      onSampleCollectionDraftChange?.({
        collected: Boolean(sampleCollectionDraft?.collected),
        selectedCount: selectedSampleTestCount,
        selectedSpecimens,
        selectedSpecimenTests,
        selectedAdditionalTubes,
        patientSequence: getPatientSequence(
          selectedBooking,
          selectedPatient,
          sampleCollectionDraftRef.current || {},
          patientSampleCollectionMap,
          patientSequenceMap,
        ),
        tubeBarcodeMap: tubeBarcodeMapRef.current,
        tubeSelectionSummary,
        selectedTubes,
        unselectedTubes,
        unselectedTests,
        pendingChildTests: pendingChildTestsPayload,
        updatedAt: new Date().toISOString(),
      });

      Alert.alert('Labels Printed', `${labels.length} tube label(s) printed.`);
    } catch (error) {
      Alert.alert(
        'Print Failed',
        error?.message || 'Unable to print tube labels.',
      );
    } finally {
      setIsPrintingLabels(false);
    }
  };
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
        patientSequence: getPatientSequence(
          selectedBooking,
          selectedPatient,
          sampleCollectionDraftRef.current || {},
          patientSampleCollectionMap,
          patientSequenceMap,
        ),
        tubeBarcodeMap: tubeBarcodeMapRef.current,
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
                        {(parentGroupsBySpecimen[item.specimenName] || []).map(parentGroup => {
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
              (!selectedTubes.length || isPrintingLabels) &&
                styles.sampleCollectionCollectButtonDisabled,
            ]}
            onPress={handlePrintTubeLabels}
            disabled={!selectedTubes.length || isPrintingLabels}>
            <Ionicons
              name="barcode-outline"
              size={18}
              style={styles.sampleCollectionCollectButtonIcon}
            />
            <Text style={styles.sampleCollectionCollectButtonText}>
              {isPrintingLabels ? 'Printing Tube Labels...' : 'Print Tube Labels'}
            </Text>
            <View style={styles.sampleCollectionCollectCountBadge}>
              <Text style={styles.sampleCollectionCollectCountText}>
                {selectedTubes.length}
              </Text>
            </View>
          </TouchableOpacity>

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

        {isMappingSampleTubes ? (
          <LoadingOverlay
            styles={styles}
            visible={isMappingSampleTubes}
            title="Mapping Sample Tubes"
            message="Preparing specimen and tube mapping for this patient..."
          />
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

export default React.memo(SampleCollectionScreen);
