import {collectUniqueTubesForSelectedTests} from '../../../utils/bookings/sampleTubeMapping';
import {
  getBillingChargeMode as getPricingBillingChargeMode,
  getStandardDiscountPercent as getPricingStandardDiscountPercent,
  getTestPricing,
} from '../../../utils/bookings/pricing';
import {normalizeFormText} from './helpers';

const hasPriceValue = value =>
  value !== null && value !== undefined && String(value).trim() !== '';
const getRawPriceValue = (...values) => values.find(value => hasPriceValue(value));

const getTestCode = test =>
  normalizeFormText(
    test?.booked_code || test?.code || test?.testcode1 || test?.test_code,
  ).toUpperCase();

const getBackendTestForCode = (patient, test) => {
  const testCode = getTestCode(test);

  if (!testCode) {
    return null;
  }

  return (Array.isArray(patient?.tests) ? patient.tests : []).find(
    patientTest => getTestCode(patientTest) === testCode,
  );
};

const mergeAppointmentBackendPrice = (patient, test, useBackendPrice) => {
  if (!useBackendPrice) {
    return test;
  }

  const backendTest = getBackendTestForCode(patient, test);

  if (!backendTest) {
    return test;
  }

  return {
    ...test,
    mrp: hasPriceValue(backendTest?.mrp)
      ? backendTest.mrp
      : hasPriceValue(backendTest?.MRP)
      ? backendTest.MRP
      : test?.mrp,
    charge: hasPriceValue(backendTest?.charge)
      ? backendTest.charge
      : hasPriceValue(backendTest?.Charge)
      ? backendTest.Charge
      : test?.charge,
    amount: hasPriceValue(backendTest?.amount) ? backendTest.amount : test?.amount,
    percentageonstandard: hasPriceValue(backendTest?.percentageonstandard)
      ? backendTest.percentageonstandard
      : hasPriceValue(backendTest?.percentageOnStandard)
      ? backendTest.percentageOnStandard
      : hasPriceValue(backendTest?.percentage_on_standard)
      ? backendTest.percentage_on_standard
      : hasPriceValue(backendTest?.base_discount_percent)
      ? backendTest.base_discount_percent
      : test?.percentageonstandard,
    max_discount: hasPriceValue(backendTest?.max_discount)
      ? backendTest.max_discount
      : test?.max_discount,
    maxDiscount: hasPriceValue(backendTest?.maxDiscount)
      ? backendTest.maxDiscount
      : test?.maxDiscount,
    panelCompanyName:
      backendTest?.panelCompanyName ||
      backendTest?.panel_company ||
      test?.panelCompanyName,
    panelCompanyId:
      backendTest?.compCatId ||
      backendTest?.comp_cat_id ||
      test?.panelCompanyId,
  };
};

export const getStandardDiscountPercent = test => {
  return getPricingStandardDiscountPercent(test);
};

const getBillingChargeMode = source =>
  getPricingBillingChargeMode(source);

const getDisplayTestBillingMode = ({test, patient, panelCompanies = []}) => {
  const directMode = getBillingChargeMode(test);
  if (directMode) {
    return directMode;
  }

  const testPanelId = normalizeFormText(test?.panelCompanyId || test?.compCatId);
  const testPanelName = normalizeFormText(
    test?.panelCompanyName || test?.panel_company || test?.panelCompany,
  ).toLowerCase();
  const matchedPanelCompany = (Array.isArray(panelCompanies) ? panelCompanies : []).find(
    company => {
      const companyPanelId = normalizeFormText(company?.compCatId || company?.id);
      const companyName = normalizeFormText(
        company?.name || company?.panelCompany,
      ).toLowerCase();

      return (
        (testPanelId && companyPanelId && testPanelId === companyPanelId) ||
        (testPanelName && companyName && testPanelName === companyName)
      );
    },
  );

  return getBillingChargeMode(matchedPanelCompany) || getBillingChargeMode(patient);
};

export const getDisplayTestPrice = (test, options = {}) => {
  const panelCompanies = Array.isArray(options.panelCompanies)
    ? options.panelCompanies
    : [];
  const testPanelId = normalizeFormText(test?.panelCompanyId || test?.compCatId);
  const testPanelName = normalizeFormText(
    test?.panelCompanyName || test?.panel_company || test?.panelCompany,
  ).toLowerCase();
  const matchedPanelCompany = panelCompanies.find(company => {
    const companyPanelId = normalizeFormText(company?.compCatId || company?.id);
    const companyName = normalizeFormText(
      company?.name || company?.panelCompany,
    ).toLowerCase();

    return (
      (testPanelId && companyPanelId && testPanelId === companyPanelId) ||
      (testPanelName && companyName && testPanelName === companyName)
    );
  });
  const billingMode = getDisplayTestBillingMode({
    test,
    patient: options.patient,
    panelCompanies,
  });
  return getTestPricing({
    ...test,
    selected_charge_mode: billingMode,
    showmrp:
      test?.showmrp ??
      test?.showMrp ??
      test?.show_mrp ??
      test?.ShowMRP ??
      matchedPanelCompany?.showmrp ??
      matchedPanelCompany?.showMrp ??
      matchedPanelCompany?.show_mrp ??
      matchedPanelCompany?.ShowMRP ??
      0,
  }).charge;
};

export const getPatientCceTestBookingStatus = patient =>
  normalizeFormText(patient?.testBookingStatus || patient?.test_booking_status);

export const buildPatientDisplayTests = ({
  patient,
  selectedTests,
  selectedTestsSourceReady,
  panelCompanies = [],
  useBackendPrice = false,
}) => {
  if (selectedTestsSourceReady) {
    return (Array.isArray(selectedTests) ? selectedTests : []).map(test => {
      const displayTest = mergeAppointmentBackendPrice(
        patient,
        test,
        useBackendPrice,
      );

      return {
        id: test.key,
        code: displayTest.booked_code || displayTest.code || 'N/A',
        name: displayTest.description || displayTest.name || 'Unnamed Test',
        tat:
          displayTest.tat ||
          displayTest.TAT ||
          displayTest.turnaroundTime ||
          displayTest.turnaround_time ||
          '',
        isAppAdded: true,
        removeKey: test.key,
        panelCompanyName: displayTest.panelCompanyName || '',
        panelCompanySource: displayTest.panelCompanySource || '',
        panelCompanyChipId: displayTest.panelCompanyChipId || '',
        panelCompanyId: displayTest.panelCompanyId || '',
        parentDescription: displayTest.parentDescription || '',
        mrp:
          Number(
            getRawPriceValue(
              displayTest?.mrp,
              displayTest?.MRP,
              displayTest?.amount,
              displayTest?.charge,
            ),
          ) || 0,
        charge: getDisplayTestPrice(displayTest, {
          patient,
          panelCompanies,
          useBackendPrice,
        }),
        percentageonstandard: getStandardDiscountPercent(displayTest),
        chargeMode: getDisplayTestBillingMode({
          test: displayTest,
          patient,
          panelCompanies,
        }),
      };
    });
  }

  return (Array.isArray(patient?.tests) ? patient.tests : []).map((test, index) => ({
    id: `${test.id || 'test'}-${test.code || 'na'}-${index}`,
    code: test.code || 'N/A',
    name: test.name || 'Unnamed Test',
    tat: test.tat || test.TAT || test.turnaroundTime || test.turnaround_time || '',
    isAppAdded: false,
    removeKey: '',
    panelCompanyName: '',
    panelCompanySource: 'API',
    panelCompanyChipId: '',
    panelCompanyId: '',
    parentDescription: '',
    mrp: Number(test?.mrp || test?.charge || test?.amount || 0) || 0,
    charge: getDisplayTestPrice(test, {patient, panelCompanies, useBackendPrice}),
    percentageonstandard: getStandardDiscountPercent(test),
    chargeMode: getDisplayTestBillingMode({test, patient, panelCompanies}),
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
