import {normalizeFormText} from './helpers';

const toCurrencyNumber = value => {
  const normalizedValue = Number(String(value || '').replace(/[^0-9.]/g, ''));
  return Number.isFinite(normalizedValue) ? normalizedValue : 0;
};

export const buildLocalBillingSummary = (
  completeBillingTests,
  patientAdditionalDiscountMap,
) => {
  const safeBillingTests = Array.isArray(completeBillingTests)
    ? completeBillingTests
    : [];
  const safePatientAdditionalDiscountMap = patientAdditionalDiscountMap || {};
  let subtotal = 0;
  let payingSubtotal = 0;
  let creditSubtotal = 0;
  let freeSubtotal = 0;
  let payingBaseDiscount = 0;
  let maxTotalDiscount = 0;
  let payingTestCount = 0;
  let creditTestCount = 0;
  let freeTestCount = 0;
  const patientSummaryMap = new Map();

  safeBillingTests.forEach(test => {
    const testMrp = toCurrencyNumber(test?.mrp);
    const standardDiscountAmount = toCurrencyNumber(
      test?.standard_discount_amount,
    );
    const maxDiscountAmount = Math.max(
      toCurrencyNumber(test?.max_allowed_discount),
      toCurrencyNumber(test?.max_discount),
    );
    const isPayingTest = test.billingBucket === 'paying';

    subtotal += testMrp;

    if (isPayingTest) {
      payingSubtotal += testMrp;
      payingBaseDiscount += standardDiscountAmount;
      maxTotalDiscount += maxDiscountAmount;
      payingTestCount += 1;
    } else if (test.billingBucket === 'credit') {
      creditSubtotal += testMrp;
      creditTestCount += 1;
    } else if (test.billingBucket === 'free') {
      freeSubtotal += testMrp;
      freeTestCount += 1;
    }

    const patientId = normalizeFormText(test?.patientId);
    if (!patientId) {
      return;
    }

    if (!patientSummaryMap.has(patientId)) {
      patientSummaryMap.set(patientId, {
        patientId,
        patientName: normalizeFormText(test?.patientName) || 'Patient',
        subtotal: 0,
        payingSubtotal: 0,
        creditTotal: 0,
        freeTotal: 0,
        baseDiscount: 0,
        maxTotalDiscount: 0,
        requestedAdditional: 0,
        effectiveAdditional: 0,
        maxAdditionalAllowed: 0,
        payingTestCount: 0,
      });
    }

    const entry = patientSummaryMap.get(patientId);
    entry.subtotal += testMrp;

    if (isPayingTest) {
      entry.payingSubtotal += testMrp;
      entry.baseDiscount += standardDiscountAmount;
      entry.maxTotalDiscount += maxDiscountAmount;
      entry.payingTestCount += 1;
    } else if (test.billingBucket === 'credit') {
      entry.creditTotal += testMrp;
    } else if (test.billingBucket === 'free') {
      entry.freeTotal += testMrp;
    }
  });

  const creditTotal = creditSubtotal;
  const freeTotal = freeSubtotal;
  const baseDiscount = payingBaseDiscount;

  const patientBillingRows = Array.from(patientSummaryMap.values())
    .map(entry => {
      const enteredValue = toCurrencyNumber(
        safePatientAdditionalDiscountMap[entry.patientId],
      );
      const maxAdditionalAllowed = Math.max(
        0,
        entry.maxTotalDiscount - entry.baseDiscount,
      );
      const effectiveAdditional = Math.min(enteredValue, maxAdditionalAllowed);

      return {
        ...entry,
        enteredAdditional: normalizeFormText(
          safePatientAdditionalDiscountMap[entry.patientId],
        ),
        requestedAdditional: enteredValue,
        maxAdditionalAllowed,
        effectiveAdditional,
        hasOverflow: enteredValue > maxAdditionalAllowed,
        finalPayingAmount: Math.max(
          0,
          entry.payingSubtotal - entry.baseDiscount - effectiveAdditional,
        ),
        nonPayingTotal: entry.creditTotal + entry.freeTotal,
        finalAmount: Math.max(
          0,
          entry.subtotal -
            entry.baseDiscount -
            effectiveAdditional -
            (entry.creditTotal + entry.freeTotal),
        ),
      };
    });

  const patientAdditionalDiscountRows = patientBillingRows
    .filter(
      entry => entry.payingTestCount > 0 && entry.maxAdditionalAllowed > 0.009,
    )
    .sort((leftItem, rightItem) =>
      leftItem.patientName.localeCompare(rightItem.patientName),
    );

  const maxAdditionalAllowed = patientAdditionalDiscountRows.reduce(
    (total, patient) => total + patient.maxAdditionalAllowed,
    0,
  );
  const requestedAdditional = patientAdditionalDiscountRows.reduce(
    (total, patient) => total + patient.requestedAdditional,
    0,
  );
  const effectiveAdditional = patientAdditionalDiscountRows.reduce(
    (total, patient) => total + patient.effectiveAdditional,
    0,
  );
  const finalDiscount = baseDiscount + effectiveAdditional;
  const nonPayingTotal = creditTotal + freeTotal;
  const finalAmount = Math.max(0, subtotal - finalDiscount - nonPayingTotal);

  return {
    subtotal,
    payingSubtotal,
    creditSubtotal,
    freeSubtotal,
    creditTotal,
    freeTotal,
    nonPayingTotal,
    baseDiscount,
    payingBaseDiscount,
    maxTotalDiscount,
    maxAdditionalAllowed,
    requestedAdditional,
    effectiveAdditional,
    finalDiscount,
    finalAmount,
    patientBillingRows,
    patientAdditionalDiscountRows,
    payingTestCount,
    creditTestCount,
    freeTestCount,
  };
};

export const getPatientSeedAdditionalDiscountTotal = patients =>
  (Array.isArray(patients) ? patients : []).reduce(
    (total, patient) =>
      total +
      toCurrencyNumber(
        patient?.additionalDiscountAmount ||
          patient?.additional_discount_amount ||
          patient?.ad_dis ||
          patient?.Ad_Dis,
      ),
    0,
  );

export const hasBackendPatientLevelAdditionalDiscounts = patients =>
  (Array.isArray(patients) ? patients : []).some(
    patient =>
      toCurrencyNumber(
        patient?.additionalDiscountAmount ||
          patient?.additional_discount_amount ||
          patient?.ad_dis ||
          patient?.Ad_Dis,
      ) > 0,
  );

export const getPreloadedAdditionalDiscount = ({
  bookingAmountFields,
  selectedBooking,
  patientSeedAdditionalDiscountTotal,
  localBaseDiscount,
}) => {
  const explicitPreloadedAdditionalDiscount = toCurrencyNumber(
    bookingAmountFields?.additionalDiscount ||
      selectedBooking?.Ad_Dis ||
      selectedBooking?.ad_dis ||
      selectedBooking?.additional_discount ||
      selectedBooking?.additionalDiscount ||
      selectedBooking?.additional_discount_amount ||
      selectedBooking?.additionalDiscountAmount ||
      selectedBooking?.billing_summary?.Ad_Dis ||
      selectedBooking?.billing_summary?.ad_dis ||
      selectedBooking?.billingSummary?.Ad_Dis ||
      selectedBooking?.billingSummary?.ad_dis ||
      patientSeedAdditionalDiscountTotal,
  );
  const derivedPreloadedAdditionalDiscount = Math.max(
    0,
    toCurrencyNumber(bookingAmountFields?.baseDiscount) - localBaseDiscount,
  );

  return explicitPreloadedAdditionalDiscount > 0
    ? explicitPreloadedAdditionalDiscount
    : derivedPreloadedAdditionalDiscount;
};

export const getCompleteBillingAmounts = ({
  localBillingSummary,
  preloadedAdditionalDiscount,
  hasBackendPatientLevelAdditionalDiscount,
  hasPatientAdditionalDiscountEntry,
}) => {
  const completeBillingTotal = localBillingSummary.subtotal;
  const completeAdditionalDiscountAmount =
    hasBackendPatientLevelAdditionalDiscount
      ? localBillingSummary.effectiveAdditional
      : preloadedAdditionalDiscount > 0 && !hasPatientAdditionalDiscountEntry
      ? preloadedAdditionalDiscount
      : localBillingSummary.effectiveAdditional;
  const completeBaseDiscountAmount = localBillingSummary.baseDiscount;
  const completeDiscountAmount =
    completeBaseDiscountAmount + completeAdditionalDiscountAmount;
  const completeCreditAmount = localBillingSummary.creditTotal;
  const completeNetAmount = Math.max(
    0,
    completeBillingTotal -
      completeDiscountAmount -
      localBillingSummary.nonPayingTotal,
  );

  return {
    completeBillingTotal,
    completeAdditionalDiscountAmount,
    completeBaseDiscountAmount,
    completeDiscountAmount,
    completeCreditAmount,
    completeNetAmount,
  };
};
