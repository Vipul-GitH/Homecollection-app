import {getPatientMutationId} from './helpers';
import {
  DEFAULT_TEST_BOOKING_STATUS,
  isManualHcSlipSelected,
  isPatientTerminalForCompletion,
  isTestBookingStatusMissing,
} from './completeBookingHelpers';

export const getAppointmentDetailsBillingValidationError = ({
  patients,
  patientTestBookingStatusMap,
  patientCghsDocumentsMap,
  patientManualSlipDocumentsMap,
  patientSampleCollectionMap,
  patientCompletionDocumentsMap,
  patientReportCourierMap,
  doesPatientRequireIdentityDocuments,
  doesPatientNeedPaymentProof,
  normalizeReportDeliveryValues,
}) => {
  const safePatients = Array.isArray(patients) ? patients : [];
  const activePatients = safePatients.filter(
    patient => !isPatientTerminalForCompletion(patient),
  );
  const getPatientTestBookingStatus = patient => {
    const patientId = getPatientMutationId(patient);
    return patientTestBookingStatusMap?.[patientId] || DEFAULT_TEST_BOOKING_STATUS;
  };
  const manualSlipPatients = activePatients.filter(patient =>
    isManualHcSlipSelected(getPatientTestBookingStatus(patient)),
  );
  const isAllActivePatientsManualSlip =
    activePatients.length > 0 &&
    manualSlipPatients.length === activePatients.length;

  const pendingTestBookingStatusPatients = safePatients.filter(patient => {
    if (isPatientTerminalForCompletion(patient)) {
      return false;
    }

    const patientId = getPatientMutationId(patient);
    if (!patientId) {
      return false;
    }

    return isTestBookingStatusMissing(patientTestBookingStatusMap?.[patientId]);
  });

  if (pendingTestBookingStatusPatients.length) {
    return {
      title: 'Test Booking Status Required',
      message: `Please select test booking status for: ${pendingTestBookingStatusPatients
        .map(patient => patient?.name || 'Patient')
        .join(', ')}.`,
    };
  }

  const pendingManualSlipPatients = safePatients.filter(patient => {
    if (isPatientTerminalForCompletion(patient)) {
      return false;
    }

    const patientId = getPatientMutationId(patient);
    const testBookingStatus =
      patientTestBookingStatusMap?.[patientId] || DEFAULT_TEST_BOOKING_STATUS;

    if (!isManualHcSlipSelected(testBookingStatus)) {
      return false;
    }

    const uploadedDocuments = patientId
      ? patientManualSlipDocumentsMap?.[patientId] || []
      : [];
    return !uploadedDocuments.length;
  });

  if (pendingManualSlipPatients.length) {
    return {
      title: 'Manual Slip Required',
      message: `Please upload manual HC slip for: ${pendingManualSlipPatients
        .map(patient => patient?.name || 'Patient')
        .join(', ')}.`,
    };
  }

  if (isAllActivePatientsManualSlip) {
    return null;
  }

  const pendingIdentityDocumentsPatients = safePatients
    .filter(patient => {
      if (isPatientTerminalForCompletion(patient)) {
        return false;
      }

      return doesPatientRequireIdentityDocuments?.(patient);
    })
    .map(patient => {
      const patientId = getPatientMutationId(patient);
      const cghsDocuments = patientId
        ? patientCghsDocumentsMap?.[patientId] || {}
        : {};
      const missingDocuments = [];

      if (
        !Array.isArray(cghsDocuments.patientPhotos) ||
        !cghsDocuments.patientPhotos.length
      ) {
        missingDocuments.push('patient photo');
      }
      if (
        !Array.isArray(cghsDocuments.cghsCard) ||
        !cghsDocuments.cghsCard.length
      ) {
        missingDocuments.push('CGHS card');
      }

      return missingDocuments.length
        ? {
            patientName: patient?.name || 'Patient',
            missingDocuments,
          }
        : null;
    })
    .filter(Boolean);

  if (pendingIdentityDocumentsPatients.length) {
    return {
      title: 'CAPF / NHA Documents Required',
      message: pendingIdentityDocumentsPatients
        .map(
          item => `${item.patientName}: ${item.missingDocuments.join(' and ')}`,
        )
        .join('\n'),
    };
  }

  const pendingSamplePatients = safePatients.filter(patient => {
    if (isPatientTerminalForCompletion(patient)) {
      return false;
    }

    const patientId = getPatientMutationId(patient);
    return !patientSampleCollectionMap?.[patientId]?.collected;
  });

  if (pendingSamplePatients.length) {
    return {
      title: 'Sample Collection Pending',
      message: `Please collect sample or cancel patient booking for: ${pendingSamplePatients
        .map(patient => patient?.name || 'Patient')
        .join(', ')}.`,
    };
  }

  const pendingProofPatients = safePatients.filter(patient => {
    if (isPatientTerminalForCompletion(patient)) {
      return false;
    }

    const patientId = getPatientMutationId(patient);
    if (!doesPatientNeedPaymentProof?.(patient)) {
      return false;
    }

    const uploadedDocuments = patientId
      ? patientCompletionDocumentsMap?.[patientId] || []
      : [];
    return !uploadedDocuments.length;
  });

  if (pendingProofPatients.length) {
    return {
      title: 'Prescription Required',
      message: `Please upload prescription for: ${pendingProofPatients
        .map(patient => patient?.name || 'Patient')
        .join(', ')}.`,
    };
  }

  const pendingReportDeliveryPatients = safePatients.filter(patient => {
    if (isPatientTerminalForCompletion(patient)) {
      return false;
    }

    const patientId = getPatientMutationId(patient);
    if (!patientId) {
      return false;
    }

    return !normalizeReportDeliveryValues?.(patientReportCourierMap?.[patientId])
      .length;
  });

  if (pendingReportDeliveryPatients.length) {
    return {
      title: 'Report Delivery Required',
      message: `Please select report delivery for: ${pendingReportDeliveryPatients
        .map(patient => patient?.name || 'Patient')
        .join(', ')}.`,
    };
  }

  return null;
};
