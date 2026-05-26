import {normalizeFormText} from './helpers';

const toCurrencyNumber = value => {
  const normalizedValue = Number(String(value || '').replace(/[^0-9.]/g, ''));
  return Number.isFinite(normalizedValue) ? normalizedValue : 0;
};

export const buildLocalBillingSummary = (
  completeBillingTests,
  patientAdditionalDiscountMap,
  patients = [],
) => {
  const safeBillingTests = Array.isArray(completeBillingTests)
    ? completeBillingTests
    : [];
  const safePatientAdditionalDiscountMap = patientAdditionalDiscountMap || {};
  const patientSeedAdditionalDiscountMap = (Array.isArray(patients)
    ? patients
    : []
  ).reduce((accumulator, patient) => {
    const patientId = normalizeFormText(
      patient?.bookingPatientId ||
        patient?.booking_patient_id ||
        patient?.patientId ||
        patient?.patient_id ||
        patient?.id,
    );
    const additionalDiscount = toCurrencyNumber(
      patient?.additionalDiscountAmount ||
        patient?.additional_discount_amount ||
        patient?.ad_dis ||
        patient?.Ad_Dis,
    );

    if (patientId && additionalDiscount > 0) {
      accumulator[patientId] = additionalDiscount;
    }

    return accumulator;
  }, {});
  const patientPaymentAdjustmentMap = (Array.isArray(patients) ? patients : []).reduce(
    (accumulator, patient) => {
      const patientId = normalizeFormText(
        patient?.bookingPatientId ||
          patient?.booking_patient_id ||
          patient?.patientId ||
          patient?.patient_id ||
          patient?.id,
      );

      if (!patientId) {
        return accumulator;
      }

      accumulator[patientId] = {
        dueAmount: toCurrencyNumber(
          patient?.bookingDueAmount ||
            patient?.booking_due_amount ||
            patient?.dueAmount ||
            patient?.due_amount,
        ),
        extraAmount: toCurrencyNumber(
          patient?.bookingExtraAmount ||
            patient?.booking_extra_amount ||
            patient?.extraAmount ||
            patient?.extra_amount,
        ),
        paymentMode: normalizeFormText(
          patient?.bookingPaymentMode || patient?.booking_payment_mode,
        ),
        patientName: normalizeFormText(patient?.name || patient?.full_name),
      };

      return accumulator;
    },
    {},
  );
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
      const hasEnteredAdditional = Object.prototype.hasOwnProperty.call(
        safePatientAdditionalDiscountMap,
        entry.patientId,
      );
      const enteredValue = toCurrencyNumber(
        safePatientAdditionalDiscountMap[entry.patientId],
      );
      const backendAdditionalDiscount = toCurrencyNumber(
        patientSeedAdditionalDiscountMap[entry.patientId],
      );
      const requestedAdditional = hasEnteredAdditional
        ? enteredValue
        : backendAdditionalDiscount;
      const maxAdditionalAllowed = Math.max(
        0,
        entry.maxTotalDiscount - entry.baseDiscount,
      );
      const effectiveAdditional = Math.min(
        requestedAdditional,
        maxAdditionalAllowed,
      );
      const paymentAdjustment = patientPaymentAdjustmentMap[entry.patientId] || {};
      const dueAmount = toCurrencyNumber(paymentAdjustment.dueAmount);
      const extraAmount = toCurrencyNumber(paymentAdjustment.extraAmount);
      const finalPayingAmount = Math.max(
        0,
        entry.payingSubtotal - entry.baseDiscount - effectiveAdditional,
      );
      const nonPayingTotal = entry.creditTotal + entry.freeTotal;
      const finalAmountBeforeAdjustment = Math.max(
        0,
        entry.subtotal -
          entry.baseDiscount -
          effectiveAdditional -
          nonPayingTotal,
      );

      return {
        ...entry,
        enteredAdditional: normalizeFormText(
          safePatientAdditionalDiscountMap[entry.patientId],
        ),
        hasEnteredAdditional,
        requestedAdditional,
        seededAdditionalDiscount: backendAdditionalDiscount,
        backendAdditionalDiscount,
        maxAdditionalAllowed,
        effectiveAdditional,
        hasOverflow: requestedAdditional > maxAdditionalAllowed,
        dueAmount,
        extraAmount,
        paymentMode: paymentAdjustment.paymentMode || '',
        finalPayingAmount: Math.max(0, finalPayingAmount + dueAmount - extraAmount),
        nonPayingTotal,
        finalAmountBeforeAdjustment,
        finalAmount: Math.max(
          0,
          finalAmountBeforeAdjustment + dueAmount - extraAmount,
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
  const dueAmount = patientBillingRows.reduce(
    (total, patient) => total + toCurrencyNumber(patient.dueAmount),
    0,
  );
  const extraAmount = patientBillingRows.reduce(
    (total, patient) => total + toCurrencyNumber(patient.extraAmount),
    0,
  );
  const finalAmountBeforeAdjustment = Math.max(
    0,
    subtotal - finalDiscount - nonPayingTotal,
  );
  const finalAmount = Math.max(
    0,
    finalAmountBeforeAdjustment + dueAmount - extraAmount,
  );

  return {
    subtotal,
    payingSubtotal,
    creditSubtotal,
    freeSubtotal,
    creditTotal,
    freeTotal,
    nonPayingTotal,
    dueAmount,
    extraAmount,
    baseDiscount,
    payingBaseDiscount,
    maxTotalDiscount,
    maxAdditionalAllowed,
    requestedAdditional,
    effectiveAdditional,
    finalDiscount,
    finalAmountBeforeAdjustment,
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
  const rawAdditionalDiscountAmount =
    preloadedAdditionalDiscount > 0 && !hasPatientAdditionalDiscountEntry
      ? preloadedAdditionalDiscount
      : hasBackendPatientLevelAdditionalDiscount
      ? localBillingSummary.effectiveAdditional
      : localBillingSummary.effectiveAdditional;
  const completeAdditionalDiscountAmount =
    preloadedAdditionalDiscount > 0 && !hasPatientAdditionalDiscountEntry
      ? rawAdditionalDiscountAmount
      : Math.min(rawAdditionalDiscountAmount, localBillingSummary.maxAdditionalAllowed);
  const completeBaseDiscountAmount = localBillingSummary.baseDiscount;
  const completeDiscountAmount =
    completeBaseDiscountAmount + completeAdditionalDiscountAmount;
  const completeCreditAmount = localBillingSummary.creditTotal;
  const completeNetAmount = Math.max(
    0,
    completeBillingTotal -
      completeDiscountAmount -
      localBillingSummary.nonPayingTotal +
      toCurrencyNumber(localBillingSummary.dueAmount) -
      toCurrencyNumber(localBillingSummary.extraAmount),
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
