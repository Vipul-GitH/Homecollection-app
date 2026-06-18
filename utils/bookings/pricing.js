const toNumber = value => {
  const numericValue = Number(String(value || '').replace(/[^0-9.]/g, ''));
  return Number.isFinite(numericValue) ? numericValue : 0;
};

export const roundChargeAmount = value => {
  const amount = toNumber(value);
  return amount > 0 ? Math.round(amount) : 0;
};

export const getBillingChargeMode = source =>
  String(
    source?.billingChargeMode ||
      source?.BillingChargeMode ||
      source?.billing_charge_mode ||
      source?.chargeMode ||
      source?.charge_mode ||
      source?.selectedChargeMode ||
      source?.selected_charge_mode ||
      source?.selectedChargeModes ||
      source?.selected_charge_modes ||
      '',
  )
    .trim()
    .toUpperCase();

export const isShowMrpEnabled = source => {
  const value =
    source?.showmrp ??
    source?.showMrp ??
    source?.show_mrp ??
    source?.ShowMRP ??
    source?.showMRP;
  const normalizedValue = String(value ?? '').trim().toLowerCase();

  return (
    value === true ||
    normalizedValue === '1' ||
    normalizedValue === 'true' ||
    normalizedValue === 'yes'
  );
};

export const getStandardDiscountPercent = test => {
  if (
    isShowMrpEnabled(test) &&
    getBillingChargeMode(test).includes('P') &&
    !getBillingChargeMode(test).includes('C') &&
    !getBillingChargeMode(test).includes('F')
  ) {
    return 0;
  }

  const directPercent = toNumber(
    test?.percentageonstandard ||
      test?.percentageOnStandard ||
      test?.percentage_on_standard ||
      test?.PercentageOnStandard ||
      test?.percentagestandard ||
      test?.percentageStandard ||
      test?.percentage_standard ||
      test?.base_discount_percent ||
      test?.baseDiscountPercent ||
      test?.PercentageStandard,
  );
  if (directPercent > 0) {
    return directPercent;
  }

  const mrp = toNumber(test?.mrp || test?.MRP || test?.amount);
  const maxDiscount = toNumber(test?.max_discount || test?.maxDiscount);
  return mrp > 0 && maxDiscount > 0 ? (maxDiscount / mrp) * 100 : 0;
};

export const getTestPricing = (test, options = {}) => {
  const billingMode = getBillingChargeMode({
    ...test,
    ...(options.billingMode ? {billingChargeMode: options.billingMode} : null),
  });
  const mrp = toNumber(
    test?.mrp || test?.MRP || test?.amount || test?.charge || test?.Charge,
  );
  const charge = toNumber(test?.charge || test?.Charge);
  const baseMrp = mrp || charge;
  const showMrp =
    isShowMrpEnabled(test) &&
    billingMode.includes('P') &&
    !billingMode.includes('C') &&
    !billingMode.includes('F');
  const discountPercent = Math.min(
    100,
    Math.max(0, getStandardDiscountPercent({...test, billingChargeMode: billingMode})),
  );
  const baseDiscount = showMrp
    ? 0
    : baseMrp > 0 && discountPercent > 0
    ? (baseMrp * discountPercent) / 100
    : 0;
  const maxAllowedDiscount = toNumber(
    test?.max_allowed_discount || test?.maxAllowedDiscount,
  );
  const defaultMaxDiscount = toNumber(test?.max_discount || test?.maxDiscount);

  let finalCharge = roundChargeAmount(baseMrp || charge);
  if (billingMode.includes('F')) {
    finalCharge = 0;
  } else if (billingMode.includes('C')) {
    finalCharge = roundChargeAmount(baseMrp || charge);
  } else if (showMrp) {
    finalCharge = roundChargeAmount(baseMrp || charge);
  } else if (baseDiscount > 0) {
    finalCharge = roundChargeAmount(Math.max(0, baseMrp - baseDiscount));
  }

  return {
    mrp: baseMrp,
    charge: finalCharge,
    baseDiscount,
    standardDiscountAmount: showMrp ? 0 : Math.max(0, baseMrp - finalCharge),
    standardDiscountPercent: showMrp ? 0 : discountPercent,
    maxDiscount: showMrp ? 0 : defaultMaxDiscount || Math.max(0, baseMrp - finalCharge),
    maxAllowedDiscount,
    additionalAllowed: Math.max(0, maxAllowedDiscount - (showMrp ? 0 : baseDiscount)),
    showMrp,
    billingMode,
  };
};
