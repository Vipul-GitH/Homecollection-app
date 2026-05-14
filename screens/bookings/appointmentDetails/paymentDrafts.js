import {normalizeFormText} from './helpers';

export const COMPLETE_PAYMENT_MODE_OPTIONS = ['Cash', 'UPI', 'Online'];

export const createCompletePaymentEntry = (overrides = {}) => ({
  id: `payment-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  patientOptionId: '',
  patientId: '',
  patientName: '',
  mode: COMPLETE_PAYMENT_MODE_OPTIONS[0],
  amount: '',
  proofDocuments: [],
  ...overrides,
});

export const normalizeCompletePaymentDrafts = payments => {
  const normalizedPayments = (Array.isArray(payments) ? payments : [])
    .map((payment, index) => ({
      id:
        normalizeFormText(payment?.id) ||
        `payment-draft-${Date.now()}-${index}`,
      mode: normalizeFormText(payment?.mode) || COMPLETE_PAYMENT_MODE_OPTIONS[0],
      patientOptionId: normalizeFormText(
        payment?.patientOptionId || payment?.patient_option_id,
      ),
      patientId: normalizeFormText(
        payment?.patientId ||
          payment?.patient_id ||
          payment?.bookingPatientId ||
          payment?.booking_patient_id,
      ),
      patientName: normalizeFormText(
        payment?.patientName || payment?.patient_name,
      ),
      amount:
        payment?.amount === null || payment?.amount === undefined
          ? ''
          : String(payment.amount),
      proofDocuments: Array.isArray(payment?.proofDocuments)
        ? payment.proofDocuments
        : [],
    }))
    .filter(payment => payment.id);

  return normalizedPayments.length
    ? normalizedPayments
    : [createCompletePaymentEntry()];
};
