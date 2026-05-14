import React from 'react';

import PatientDetailCard from '../../../components/bookings/PatientDetailCard';
import PatientSampleCollectionSection from '../../../components/bookings/appointmentDetails/PatientSampleCollectionSection';
import PatientTestsAccordion from '../../../components/bookings/patient/PatientTestsAccordion';
import {
  buildPatientDisplayTests,
  getDisplayTestPrice,
  getPatientCceTestBookingStatus,
  getPatientDisplayTubes,
} from './patientDisplay';
import {getPatientMutationId} from './helpers';

function SelectedPatientAppointmentSection({
  selectedPatientItem,
  styles,
  isSmallPhone,
  canUsePatientActions,
  canCancelPatientForBooking,
  isTerminalBooking,
  isBookingCompleteOrCancelled,
  activePatientPanelCompanyMap,
  patientSelectedTestsMap,
  patientPrecomputedSampleTubesMap,
  patientSampleCollectionMap,
  patientTestBookingStatusMap,
  patientCghsEnabledMap,
  patientCghsIdMap,
  patientCghsDocumentsMap,
  patientManualSlipDocumentsMap,
  patientCompletionDocumentsMap,
  addingTestPatientId,
  cancellingPatientId,
  defaultTestBookingStatus,
  emptyUploadDocuments,
  getPatientPanelCompanies,
  isManualHcSlipSelected,
  doesPatientNeedPaymentProof,
  doesPatientRequireIdentityDocuments,
  handlePrimaryPanelCompanyPress,
  openPanelCompanyTests,
  handleRemovePatientPanelCompany,
  handlePatientCancelBooking,
  handleEditPatientPress,
  handleTestBookingStatusChange,
  handlePatientCghsEnabledChange,
  handlePatientCghsIdChange,
  handlePatientCghsDocumentsChange,
  handlePatientManualSlipDocumentsChange,
  handlePatientPaymentProofDocumentsChange,
  showAppAlert,
  onOpenSampleCollection,
  handleRemoveSelectedTestWithSampleReset,
  handlePatientAddPanelCompany,
}) {
  if (!selectedPatientItem) {
    return null;
  }

  const {patient, index} = selectedPatientItem;
  const patientStatusCode = Number(patient.bookingPatientStatusCode || 0);
  const isThisPatientCancelled = patientStatusCode === 4;
  const isThisPatientCompleteOrCancelled =
    patientStatusCode === 3 || patientStatusCode === 4;
  const shouldShowSampleCollectionSection = !(
    isBookingCompleteOrCancelled && isThisPatientCompleteOrCancelled
  );
  const canUseThisPatientActions =
    canUsePatientActions && !isThisPatientCancelled;
  const canUseThisPatientTestActions =
    !isTerminalBooking && !isThisPatientCancelled;
  const patientId = getPatientMutationId(patient);
  const activePanelCompanyId = patientId
    ? activePatientPanelCompanyMap[patientId] || ''
    : '';
  const selectedTests = patientId ? patientSelectedTestsMap[patientId] || [] : [];
  const hasSelectedTestsOverride =
    patientId &&
    Object.prototype.hasOwnProperty.call(patientSelectedTestsMap, patientId);
  const companyChips = getPatientPanelCompanies(patient);
  const sampleCollected =
    Boolean(patientId && patientSampleCollectionMap[patientId]?.collected) ||
    patientStatusCode === 3;
  const testBookingStatus = patientId
    ? patientTestBookingStatusMap[patientId] || defaultTestBookingStatus
    : defaultTestBookingStatus;
  const displayTests = buildPatientDisplayTests({
    patient,
    selectedTests,
    selectedTestsSourceReady: Boolean(hasSelectedTestsOverride),
  });
  const testsSubtotal = displayTests.reduce(
    (total, test) => total + getDisplayTestPrice(test),
    0,
  );
  const displayTubes = getPatientDisplayTubes({
    patient,
    selectedTests,
    selectedTestsSourceReady: Boolean(hasSelectedTestsOverride),
    precomputedTubes: patientId
      ? patientPrecomputedSampleTubesMap[patientId] || []
      : [],
  });
  const activePanelCompany =
    companyChips.find(
      company =>
        String(activePanelCompanyId) === String(company.chipId || company.id),
    ) ||
    companyChips[0] ||
    null;
  const sampleCollection = patientId
    ? patientSampleCollectionMap[patientId] || null
    : null;

  return (
    <>
      <PatientDetailCard
        key={`patient-${getPatientMutationId(patient) || patient.id || 'na'}-${index}`}
        patient={patient}
        styles={styles}
        onPrimaryPanelCompanyPress={
          canUseThisPatientTestActions ? handlePrimaryPanelCompanyPress : undefined
        }
        panelCompanies={companyChips}
        activePanelCompanyId={activePanelCompanyId}
        onSelectPanelCompany={
          canUseThisPatientTestActions ? openPanelCompanyTests : undefined
        }
        onRemovePanelCompany={
          canUseThisPatientTestActions ? handleRemovePatientPanelCompany : undefined
        }
        onCancelBooking={
          canUseThisPatientActions && canCancelPatientForBooking
            ? handlePatientCancelBooking
            : undefined
        }
        onEditPatient={
          canUseThisPatientActions ? handleEditPatientPress : undefined
        }
        testBookingStatusValue={testBookingStatus}
        testBookingStatusFromCce={getPatientCceTestBookingStatus(patient)}
        onTestBookingStatusChange={
          canUseThisPatientActions ? handleTestBookingStatusChange : undefined
        }
        cghsEnabled={Boolean(patientId && patientCghsEnabledMap[patientId])}
        cghsIdValue={patientId ? patientCghsIdMap[patientId] || '' : ''}
        cghsDocumentsBySection={
          patientId ? patientCghsDocumentsMap[patientId] || {} : {}
        }
        onCghsEnabledChange={
          canUseThisPatientActions ? handlePatientCghsEnabledChange : undefined
        }
        onCghsIdChange={
          canUseThisPatientActions ? handlePatientCghsIdChange : undefined
        }
        onCghsDocumentsChange={
          canUseThisPatientActions ? handlePatientCghsDocumentsChange : undefined
        }
        manualSlipDocuments={
          patientId
            ? patientManualSlipDocumentsMap[patientId] || emptyUploadDocuments
            : emptyUploadDocuments
        }
        onManualSlipDocumentsChange={
          canUseThisPatientActions
            ? handlePatientManualSlipDocumentsChange
            : undefined
        }
        paymentProofDocuments={
          patientId
            ? patientCompletionDocumentsMap[patientId] || emptyUploadDocuments
            : emptyUploadDocuments
        }
        onPaymentProofDocumentsChange={
          canUseThisPatientActions
            ? handlePatientPaymentProofDocumentsChange
            : undefined
        }
        showAlert={showAppAlert}
        requiresPaymentProof={
          !isManualHcSlipSelected(testBookingStatus) &&
          doesPatientNeedPaymentProof(patient)
        }
        requiresIdentityDocuments={doesPatientRequireIdentityDocuments(patient)}
        sampleCollected={sampleCollected}
        onOpenSampleCollection={
          canUseThisPatientTestActions ? onOpenSampleCollection : undefined
        }
        selectedTests={selectedTests}
        selectedTestsSourceReady={Boolean(hasSelectedTestsOverride)}
        onRemoveSelectedTest={
          canUseThisPatientTestActions
            ? handleRemoveSelectedTestWithSampleReset
            : undefined
        }
        isCancelBookingDisabled={Boolean(cancellingPatientId)}
        cancelBookingLabel={
          String(cancellingPatientId) === String(patient.id)
            ? 'Cancelling...'
            : 'Cancel Patient'
        }
      />
      <PatientTestsAccordion
        styles={styles}
        patient={patient}
        tests={displayTests}
        subtotal={testsSubtotal}
        isNarrow={isSmallPhone}
        onRemoveSelectedTest={
          canUseThisPatientTestActions
            ? handleRemoveSelectedTestWithSampleReset
            : undefined
        }
        panelCompanies={companyChips}
        canOpenPanelCompanyTests={canUseThisPatientTestActions}
        onSelectPanelCompany={
          canUseThisPatientTestActions ? openPanelCompanyTests : undefined
        }
        onRemovePanelCompany={
          canUseThisPatientTestActions ? handleRemovePatientPanelCompany : undefined
        }
        onAddPanelCompany={
          canUseThisPatientTestActions ? handlePatientAddPanelCompany : undefined
        }
        addPanelCompanyLabel={
          String(addingTestPatientId) === String(getPatientMutationId(patient))
            ? 'Loading...'
            : 'Add Panel'
        }
        isAddPanelCompanyDisabled={Boolean(addingTestPatientId)}
      />
      {onOpenSampleCollection && shouldShowSampleCollectionSection ? (
        <PatientSampleCollectionSection
          styles={styles}
          patient={patient}
          activePanelCompany={activePanelCompany}
          tubes={displayTubes}
          sampleCollection={sampleCollection}
          canOpenSampleCollection={canUseThisPatientTestActions}
          onOpenSampleCollection={onOpenSampleCollection}
        />
      ) : null}
    </>
  );
}

export default React.memo(SelectedPatientAppointmentSection);
