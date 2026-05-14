import {collectUniqueTubesForSelectedTests} from '../../../utils/bookings/sampleTubeMapping';
import {normalizeFormText} from './helpers';

const toPriceNumber = value => {
  const numericValue = Number(String(value || '').replace(/[^0-9.]/g, ''));
  return Number.isFinite(numericValue) ? numericValue : 0;
};

export const getStandardDiscountPercent = test =>
  toPriceNumber(
    test?.percentageonstandard ||
      test?.percentageOnStandard ||
      test?.percentage_on_standard ||
      test?.PercentageOnStandard ||
      test?.percentagestandard ||
      test?.percentageStandard ||
      test?.percentage_standard ||
      test?.PercentageStandard,
  );

export const getDisplayTestPrice = test => {
  const mrp = toPriceNumber(test?.mrp || test?.MRP || test?.amount);
  const charge = toPriceNumber(test?.charge || test?.Charge);
  const baseMrp = mrp || charge;
  const discountPercent = Math.min(
    100,
    Math.max(0, getStandardDiscountPercent(test)),
  );
  if (discountPercent > 0 && baseMrp > 0) {
    return Math.max(0, baseMrp - (baseMrp * discountPercent) / 100);
  }
  return charge || baseMrp;
};

export const getPatientCceTestBookingStatus = patient =>
  normalizeFormText(patient?.testBookingStatus || patient?.test_booking_status);

export const buildPatientDisplayTests = ({
  patient,
  selectedTests,
  selectedTestsSourceReady,
}) => {
  if (selectedTestsSourceReady) {
    return (Array.isArray(selectedTests) ? selectedTests : []).map(test => ({
      id: test.key,
      code: test.booked_code || 'N/A',
      name: test.description || 'Unnamed Test',
      tat: test.tat || test.TAT || test.turnaroundTime || test.turnaround_time || '',
      isAppAdded: true,
      removeKey: test.key,
      panelCompanyName: test.panelCompanyName || '',
      panelCompanySource: test.panelCompanySource || '',
      panelCompanyChipId: test.panelCompanyChipId || '',
      panelCompanyId: test.panelCompanyId || '',
      parentDescription: test.parentDescription || '',
      mrp: Number(test?.mrp || test?.charge || 0) || 0,
      charge: getDisplayTestPrice(test),
      percentageonstandard: getStandardDiscountPercent(test),
    }));
  }

  return (Array.isArray(patient?.tests) ? patient.tests : []).map((test, index) => ({
    id: `${test.id || 'test'}-${test.code || 'na'}-${index}`,
    code: test.code || 'N/A',
    name: test.name || 'Unnamed Test',
    tat: test.tat || test.TAT || test.turnaroundTime || test.turnaround_time || '',
    isAppAdded: false,
    removeKey: '',
    panelCompanyName: patient?.panelCompany || '',
    panelCompanySource: 'API',
    panelCompanyChipId: '',
    panelCompanyId: patient?.compCatId || patient?.comp_cat_id || '',
    parentDescription: '',
    mrp: Number(test?.mrp || test?.charge || test?.amount || 0) || 0,
    charge: getDisplayTestPrice(test),
    percentageonstandard: getStandardDiscountPercent(test),
  }));
};

export const getPatientDisplayTubes = ({
  patient,
  selectedTests,
  selectedTestsSourceReady,
  precomputedTubes,
}) => {
  if (Array.isArray(precomputedTubes) && precomputedTubes.length) {
    return precomputedTubes;
  }

  const selectedTestTubes = collectUniqueTubesForSelectedTests(selectedTests);

  if (selectedTestsSourceReady) {
    return selectedTestTubes;
  }

  return Array.isArray(patient?.tubes) ? patient.tubes : selectedTestTubes;
};
