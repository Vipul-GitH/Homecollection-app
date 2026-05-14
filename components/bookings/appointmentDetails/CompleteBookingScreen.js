import React from 'react';
import {
  ActivityIndicator,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';

import {BRAND} from '../../../styles/appStyles';
import PaymentSummarySection from './PaymentSummarySection';
import RequiredLabel from './RequiredLabel';

function CompleteBookingScreen({
  styles,
  isNarrowScreen,
  selectedBooking,
  patientCount,
  bookingActionLoading,
  patientOptions = [],
  isLinkedAppointmentSelected,
  onLinkedAppointmentChange,
  linkedAppointmentDate,
  setIsLinkedAppointmentCalendarVisible,
  linkedAppointmentTimeSlot,
  isLinkedAppointmentTimeSlotSelectVisible,
  setIsLinkedAppointmentTimeSlotSelectVisible,
  samplePickCount,
  samplePickPatientIds = [],
  sampleCollectionEasyTough,
  sampleCollectionEasyToughPatientIds = [],
  onSamplePickCountChange,
  onSamplePickPatientToggle,
  onSampleCollectionEasyToughChange,
  onSampleCollectionEasyToughPatientToggle,
  closeCompleteBookingScreen,
  confirmCompleteBooking,
  completeBillingTotal,
  completeBaseDiscountAmount,
  completeAdditionalDiscountAmount,
  completeCreditAmount,
  completeNetAmount,
  localBillingSummary,
  isAdditionalDiscountEnabled,
  completeAdditionalDiscountMode,
  completeAdditionalDiscount,
  completePayments,
  completePaymentModeOptions,
  paymentPatientOptions = [],
  pendingPaymentAmount = 0,
  extraPaymentAmount = 0,
  pendingPaymentPatientId = '',
  shouldCollectPendingPaymentPatient = false,
  handlePendingPaymentPatientSelect,
  handleAdditionalDiscountToggle,
  setCompleteAdditionalDiscountMode,
  setCompleteAdditionalDiscount,
  handleApplyAdditionalDiscount,
  handleCompletePaymentChange,
  handleRemoveCompletePayment,
  handleAddCompletePayment,
  handlePickCompletePaymentProof,
  handleRemoveCompletePaymentProof,
}) {
  const linkedAppointmentValue = isLinkedAppointmentSelected ? 'Yes' : 'No';
  const shouldShowPatientSelect = patientOptions.length > 1;

  const renderQuestionLabel = text => (
    <Text style={[styles.addPatientFieldLabel, styles.completeBookingQuestionLabel]}>
      {text}
      <Text style={styles.requiredFieldAsterisk}> *</Text>
    </Text>
  );

  const renderPatientMultiSelect = (selectedIds, onToggle) => (
    <View style={styles.completeBookingPatientChipRow}>
      {patientOptions.map(patient => {
        const isSelected = selectedIds.includes(patient.id);

        return (
          <TouchableOpacity
            key={patient.id}
            activeOpacity={0.85}
            style={[
              styles.cancelReasonChip,
              styles.completeBookingPatientChip,
              isSelected && styles.cancelReasonChipActive,
            ]}
            onPress={() => onToggle(patient.id)}>
            <Text
              style={[
                styles.cancelReasonChipText,
                isSelected && styles.cancelReasonChipTextActive,
              ]}>
              {patient.name}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );

  return (
    <View style={styles.completeBookingScreenShell}>
      <View style={styles.completeBookingScreenHeader}>
        <TouchableOpacity
          activeOpacity={0.85}
          style={styles.completeBookingScreenBackButton}
          onPress={closeCompleteBookingScreen}
          disabled={bookingActionLoading === 'completed'}>
          <Ionicons
            name="arrow-back"
            size={18}
            style={styles.completeBookingScreenBackIcon}
          />
        </TouchableOpacity>
        <View style={styles.completeBookingScreenHeaderText}>
          <Text style={styles.completeBookingScreenTitle}>Billing Summary</Text>
          <Text style={styles.completeBookingScreenSubtitle}>
            {selectedBooking?.bookingCode ||
              selectedBooking?.bookingNumber ||
              selectedBooking?.id ||
              'Appointment'}{' '}
            | {patientCount} Patient{patientCount > 1 ? 's' : ''}
          </Text>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.completeBookingScreenContent}>
        <PaymentSummarySection
          styles={styles}
          patientCount={patientCount}
          completeBillingTotal={completeBillingTotal}
          completeBaseDiscountAmount={completeBaseDiscountAmount}
          completeAdditionalDiscountAmount={completeAdditionalDiscountAmount}
          completeCreditAmount={completeCreditAmount}
          completeNetAmount={completeNetAmount}
          localBillingSummary={localBillingSummary}
          isAdditionalDiscountEnabled={isAdditionalDiscountEnabled}
          completeAdditionalDiscountMode={completeAdditionalDiscountMode}
          completeAdditionalDiscount={completeAdditionalDiscount}
          completePayments={completePayments}
          completePaymentModeOptions={completePaymentModeOptions}
          paymentPatientOptions={paymentPatientOptions}
          pendingPaymentAmount={pendingPaymentAmount}
          extraPaymentAmount={extraPaymentAmount}
          pendingPaymentPatientId={pendingPaymentPatientId}
          shouldCollectPendingPaymentPatient={shouldCollectPendingPaymentPatient}
          handlePendingPaymentPatientSelect={handlePendingPaymentPatientSelect}
          bookingActionLoading={bookingActionLoading}
          shouldShowProgressActions={false}
          handleAdditionalDiscountToggle={handleAdditionalDiscountToggle}
          setCompleteAdditionalDiscountMode={setCompleteAdditionalDiscountMode}
          setCompleteAdditionalDiscount={setCompleteAdditionalDiscount}
          handleApplyAdditionalDiscount={handleApplyAdditionalDiscount}
          handleCompletePaymentChange={handleCompletePaymentChange}
          handleRemoveCompletePayment={handleRemoveCompletePayment}
          handleAddCompletePayment={handleAddCompletePayment}
          handlePickCompletePaymentProof={handlePickCompletePaymentProof}
          handleRemoveCompletePaymentProof={handleRemoveCompletePaymentProof}
          confirmCompleteBooking={confirmCompleteBooking}
        />

        <View style={styles.completeBookingQuestionCard}>
          <View style={styles.completeBookingQuestionHeader}>
            <Text style={styles.completeBookingQuestionTitle}>
              Completion Details
            </Text>
            <Text style={styles.completeBookingQuestionHint}>
              Finish the remaining booking checkpoints.
            </Text>
          </View>

          <View style={styles.cancelFormSection}>
            {renderQuestionLabel('Linked Appointment')}
            <View style={styles.cancelSegmentedRow}>
              {['Yes', 'No'].map(value => {
                const isSelected = linkedAppointmentValue === value;

                return (
                  <TouchableOpacity
                    key={value}
                    activeOpacity={0.85}
                    style={[
                      styles.cancelSegmentButton,
                      isSelected && styles.cancelSegmentButtonActive,
                    ]}
                    onPress={() => onLinkedAppointmentChange(value === 'Yes')}>
                    <Text
                      style={[
                        styles.cancelSegmentButtonText,
                        isSelected && styles.cancelSegmentButtonTextActive,
                      ]}>
                      {value}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {isLinkedAppointmentSelected ? (
            <View style={styles.cancelFormSection}>
              <View
                style={[
                  styles.addPatientFieldRow,
                  isNarrowScreen && styles.addPatientFieldRowStacked,
                ]}>
                <View style={styles.addPatientFieldHalf}>
                  <RequiredLabel styles={styles}>Date</RequiredLabel>
                  <TouchableOpacity
                    activeOpacity={0.85}
                    style={styles.cancelSelectButton}
                    onPress={() => setIsLinkedAppointmentCalendarVisible(true)}>
                    <Text
                      style={[
                        styles.cancelSelectButtonText,
                        !linkedAppointmentDate &&
                          styles.addPatientDatePickerPlaceholder,
                      ]}>
                      {linkedAppointmentDate || 'Select date'}
                    </Text>
                    <Ionicons
                      name="calendar-outline"
                      size={18}
                      style={styles.cancelSelectButtonIcon}
                    />
                  </TouchableOpacity>
                </View>
                <View style={styles.addPatientFieldHalf}>
                  <RequiredLabel styles={styles}>Time Slot</RequiredLabel>
                  <TouchableOpacity
                    activeOpacity={0.85}
                    style={styles.cancelSelectButton}
                    onPress={() =>
                      setIsLinkedAppointmentTimeSlotSelectVisible(
                        previous => !previous,
                      )
                    }>
                    <Text
                      style={[
                        styles.cancelSelectButtonText,
                        !linkedAppointmentTimeSlot &&
                          styles.addPatientDatePickerPlaceholder,
                      ]}>
                      {linkedAppointmentTimeSlot || 'Select slot'}
                    </Text>
                    <Ionicons
                      name={
                        isLinkedAppointmentTimeSlotSelectVisible
                          ? 'chevron-up'
                          : 'chevron-down'
                      }
                      size={18}
                      style={styles.cancelSelectButtonIcon}
                    />
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          ) : null}

          <View style={styles.cancelFormSection}>
            {renderQuestionLabel('No. of Pricks in Sample Collection')}
            <View style={styles.cancelSegmentedRow}>
              {['1', '2', '>2'].map(value => {
                const isSelected = samplePickCount === value;

                return (
                  <TouchableOpacity
                    key={value}
                    activeOpacity={0.85}
                    style={[
                      styles.cancelSegmentButton,
                      isSelected && styles.cancelSegmentButtonActive,
                    ]}
                    onPress={() => onSamplePickCountChange(value)}>
                    <Text
                      style={[
                        styles.cancelSegmentButtonText,
                        isSelected && styles.cancelSegmentButtonTextActive,
                      ]}>
                      {value}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            {samplePickCount && samplePickCount !== '1' && shouldShowPatientSelect ? (
              <View style={styles.completeBookingPatientSelectWrap}>
                <Text style={styles.addPatientFieldLabel}>Patient Name</Text>
                {renderPatientMultiSelect(
                  samplePickPatientIds,
                  onSamplePickPatientToggle,
                )}
              </View>
            ) : null}
          </View>

          <View style={styles.cancelFormSection}>
            {renderQuestionLabel('Was Sample Collection Easy/Tough?')}
            <View style={styles.cancelSegmentedRow}>
              {[
                {label: 'Easy', value: 'easy'},
                {label: 'Tough', value: 'tough'},
              ].map(option => {
                const isSelected = sampleCollectionEasyTough === option.value;

                return (
                  <TouchableOpacity
                    key={option.value}
                    activeOpacity={0.85}
                    style={[
                      styles.cancelSegmentButton,
                      isSelected && styles.cancelSegmentButtonActive,
                    ]}
                    onPress={() =>
                      onSampleCollectionEasyToughChange(option.value)
                    }>
                    <Text
                      style={[
                        styles.cancelSegmentButtonText,
                        isSelected && styles.cancelSegmentButtonTextActive,
                      ]}>
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            {sampleCollectionEasyTough === 'tough' &&
            shouldShowPatientSelect ? (
              <View style={styles.completeBookingPatientSelectWrap}>
                <Text style={styles.addPatientFieldLabel}>Patient Name</Text>
                {renderPatientMultiSelect(
                  sampleCollectionEasyToughPatientIds,
                  onSampleCollectionEasyToughPatientToggle,
                )}
              </View>
            ) : null}
          </View>
        </View>
      </ScrollView>

      <View style={styles.completeBookingScreenFooter}>
        <TouchableOpacity
          activeOpacity={0.85}
          style={[
            styles.completeBookingActionButton,
            bookingActionLoading === 'completed' &&
              styles.completeBookingActionButtonDisabled,
          ]}
          onPress={confirmCompleteBooking}
          disabled={bookingActionLoading === 'completed'}>
          {bookingActionLoading === 'completed' ? (
            <ActivityIndicator color={BRAND.surface} size="small" />
          ) : (
            <Ionicons
              name="checkmark-done-outline"
              size={18}
              style={styles.completeBookingActionButtonIcon}
            />
          )}
          <Text style={styles.completeBookingActionButtonText}>
            {bookingActionLoading === 'completed'
              ? 'Completing...'
              : 'Complete Booking'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default React.memo(CompleteBookingScreen);
