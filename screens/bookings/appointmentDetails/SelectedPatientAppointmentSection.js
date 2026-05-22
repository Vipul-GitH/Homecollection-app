import React, {useMemo} from 'react';

import PatientDetailCard from '../../../components/bookings/PatientDetailCard';
import PatientSampleCollectionSection from '../../../components/bookings/appointmentDetails/PatientSampleCollectionSection';
import PatientTestsAccordion from '../../../components/bookings/patient/PatientTestsAccordion';
import {
  buildPatientDisplayTests,
  getPatientCceTestBookingStatus,
  getPatientDisplayTubes,
} from './patientDisplay';
import {getPatientMutationId} from './helpers';

const EMPTY_ARRAY = [];
const EMPTY_OBJECT = {};

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
  useBackendTestPrices = false,
}) {
  const {patient = null, index = 0} = selectedPatientItem || EMPTY_OBJECT;
  const patientStatusCode = Number(patient?.bookingPatientStatusCode || 0);
  const isThisPatientCancelled = patientStatusCode === 4;
  const isThisPatientCompleteOrCancelled =
    patientStatusCode === 3 || patientStatusCode === 4;
  const shouldShowSampleCollectionSection = !(
    isBookingCompleteOrCancelled && isThisPatientCompleteOrCancelled
  );
  const canUseThisPatientActions =
    canUsePatientActions && !isThisPatientCancelled;
  const canUseThisPatientTestActions =
    canUsePatientActions && !isThisPatientCancelled;
  const patientId = getPatientMutationId(patient);
  const activePanelCompanyId = patientId
    ? activePatientPanelCompanyMap[patientId] || ''
    : '';
  const selectedTests = useMemo(
    () =>
      patientId
        ? patientSelectedTestsMap[patientId] || EMPTY_ARRAY
        : EMPTY_ARRAY,
    [patientId, patientSelectedTestsMap],
  );
  const hasSelectedTestsOverride =
    patientId &&
    Object.prototype.hasOwnProperty.call(patientSelectedTestsMap, patientId);
  const companyChips = useMemo(
    () => (patient ? getPatientPanelCompanies(patient) : EMPTY_ARRAY),
    [getPatientPanelCompanies, patient],
  );
  const sampleCollected =
    Boolean(patientId && patientSampleCollectionMap[patientId]?.collected) ||
    patientStatusCode === 3;
  const testBookingStatus = patientId
    ? patientTestBookingStatusMap[patientId] || defaultTestBookingStatus
    : defaultTestBookingStatus;
  const isManualHcSlipPatient = isManualHcSlipSelected(testBookingStatus);
  const shouldShowSampleCollectionForPatient =
    shouldShowSampleCollectionSection;
  const displayTests = useMemo(
    () =>
      buildPatientDisplayTests({
        patient,
        selectedTests,
        selectedTestsSourceReady: Boolean(hasSelectedTestsOverride),
        panelCompanies: companyChips,
        useBackendPrice: useBackendTestPrices,
      }),
    [
      companyChips,
      hasSelectedTestsOverride,
      patient,
      selectedTests,
      useBackendTestPrices,
    ],
  );
  const testsSubtotal = useMemo(
    () => displayTests.reduce((total, test) => total + Number(test?.charge || 0), 0),
    [displayTests],
  );
  const precomputedTubes = useMemo(
    () =>
      patientId
        ? patientPrecomputedSampleTubesMap[patientId] || EMPTY_ARRAY
        : EMPTY_ARRAY,
    [patientId, patientPrecomputedSampleTubesMap],
  );
  const displayTubes = useMemo(
    () =>
      getPatientDisplayTubes({
        patient,
        selectedTests,
        selectedTestsSourceReady: Boolean(hasSelectedTestsOverride),
        precomputedTubes,
      }),
    [hasSelectedTestsOverride, patient, precomputedTubes, selectedTests],
  );
  const activePanelCompany = useMemo(
    () =>
      companyChips.find(
        company =>
          String(activePanelCompanyId) === String(company.chipId || company.id),
      ) ||
      companyChips[0] ||
      null,
    [activePanelCompanyId, companyChips],
  );
  const sampleCollection = patientId
    ? patientSampleCollectionMap[patientId] || null
    : null;

  if (!patient) {
    return null;
  }

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
        testBookingStatusFromCce={getPatientCceTestBookingStatus(patient)}
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
          !isManualHcSlipPatient && doesPatientNeedPaymentProof(patient)
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
      >
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
          testBookingStatusValue={testBookingStatus}
          onTestBookingStatusChange={
            canUseThisPatientActions ? handleTestBookingStatusChange : undefined
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
          showAlert={showAppAlert}
        />
      </PatientDetailCard>
      {onOpenSampleCollection && shouldShowSampleCollectionForPatient ? (
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
