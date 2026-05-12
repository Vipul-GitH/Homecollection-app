import {collectUniqueTubesForSelectedTests} from '../../../utils/bookings/sampleTubeMapping';
import {normalizeFormText} from './helpers';

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
