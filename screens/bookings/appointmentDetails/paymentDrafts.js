import {normalizeFormText} from './helpers';

export const COMPLETE_PAYMENT_MODE_OPTIONS = ['Cash', 'UPI', 'Online', 'At Lab'];

export const createCompletePaymentEntry = () => ({
  id: `payment-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  mode: COMPLETE_PAYMENT_MODE_OPTIONS[0],
  amount: '',
});

export const normalizeCompletePaymentDrafts = payments => {
  const normalizedPayments = (Array.isArray(payments) ? payments : [])
    .map((payment, index) => ({
      id:
        normalizeFormText(payment?.id) ||
        `payment-draft-${Date.now()}-${index}`,
      mode: normalizeFormText(payment?.mode) || COMPLETE_PAYMENT_MODE_OPTIONS[0],
      amount:
        payment?.amount === null || payment?.amount === undefined
          ? ''
          : String(payment.amount),
    }))
    .filter(payment => payment.id);

  return normalizedPayments.length
    ? normalizedPayments
    : [createCompletePaymentEntry()];
};
