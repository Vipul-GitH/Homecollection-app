import React from 'react';
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';

import {BRAND} from '../../../styles/appStyles';
import RequiredLabel from './RequiredLabel';

function CancelBookingModal({
  styles,
  visible,
  isNarrowScreen,
  selectedBooking,
  patientCount,
  bookingActionLoading,
  cancellationReasonOptions,
  cancellationReason,
  setCancellationReason,
  cancelRemarks,
  setCancelRemarks,
  isCancelRescheduleRequested,
  setIsCancelRescheduleRequested,
  isCancelKnownSlot,
  setIsCancelKnownSlot,
  cancelNewVisitDate,
  setIsCancelCalendarVisible,
  cancelNewTimeSlot,
  isCancelTimeSlotSelectVisible,
  setIsCancelTimeSlotSelectVisible,
  closeCancelBookingModal,
  confirmCancelBooking,
}) {
  return (
    <Modal
      transparent
      animationType="slide"
      visible={visible}
      onRequestClose={closeCancelBookingModal}>
      <View
        style={[
          styles.addPatientModalOverlay,
          styles.cancelBookingScreenOverlay,
        ]}>
        <View
          style={[
            styles.addPatientModalCard,
            styles.cancelBookingModalCard,
            isNarrowScreen && styles.addPatientModalCardCompact,
          ]}>
          <View style={[styles.addPatientModalHeader, styles.cancelBookingHeader]}>
            <View style={styles.panelCompanyModalHeaderText}>
              <Text style={styles.cancelBookingTitle}>Cancel entire booking</Text>
              <Text style={styles.cancelBookingSubtitle}>
                {selectedBooking?.bookingCode ||
                  selectedBooking?.bookingNumber ||
                  selectedBooking?.id ||
                  'Appointment'}{' '}
                | {patientCount} Patient{patientCount > 1 ? 's' : ''}
              </Text>
            </View>
            <TouchableOpacity
              activeOpacity={0.85}
              style={[
                styles.addPatientModalCloseButton,
                styles.cancelBookingCloseButton,
              ]}
              onPress={closeCancelBookingModal}
              disabled={bookingActionLoading === 'cancel'}>
              <Ionicons
                name="close"
                size={20}
                style={styles.cancelBookingCloseIcon}
              />
            </TouchableOpacity>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={[
              styles.addPatientModalContent,
              styles.cancelBookingContent,
            ]}>
            <View style={styles.cancelBookingSpacer} />

            <View style={styles.cancelFormSection}>
              <View style={styles.cancelFieldGroup}>
                <RequiredLabel styles={styles}>Cancellation Reason</RequiredLabel>
                <View style={styles.cancelReasonChipRow}>
                  {cancellationReasonOptions.map(reason => {
                    const isSelected = cancellationReason === reason;

                    return (
                      <TouchableOpacity
                        key={reason}
                        activeOpacity={0.85}
                        style={[
                          styles.cancelReasonChip,
                          isSelected && styles.cancelReasonChipActive,
                        ]}
                        onPress={() => setCancellationReason(reason)}>
                        <Text
                          style={[
                            styles.cancelReasonChipText,
                            isSelected && styles.cancelReasonChipTextActive,
                          ]}>
                          {reason}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              <TextInput
                value={cancelRemarks}
                onChangeText={setCancelRemarks}
                placeholder="Remarks (optional)"
                placeholderTextColor={BRAND.textMuted}
                style={styles.cancelRemarksInput}
              />

              <TouchableOpacity
                activeOpacity={0.85}
                style={styles.cancelCheckboxRow}
                onPress={() =>
                  setIsCancelRescheduleRequested(previous => !previous)
                }>
                <View
                  style={[
                    styles.cancelCheckbox,
                    isCancelRescheduleRequested && styles.cancelCheckboxActive,
                  ]}>
                  {isCancelRescheduleRequested ? (
                    <Ionicons
                      name="checkmark"
                      size={13}
                      style={styles.cancelCheckboxIcon}
                    />
                  ) : null}
                </View>
                <Text style={styles.cancelCheckboxText}>
                  Reschedule this booking
                </Text>
              </TouchableOpacity>
            </View>

            {isCancelRescheduleRequested ? (
              <View style={styles.cancelFormSection}>
                <Text style={styles.addPatientFieldLabel}>
                  Is new date and slot known?
                </Text>
                <View style={styles.cancelSegmentedRow}>
                  {[true, false].map(value => {
                    const isSelected = isCancelKnownSlot === value;
                    return (
                      <TouchableOpacity
                        key={value ? 'known' : 'unknown'}
                        activeOpacity={0.85}
                        style={[
                          styles.cancelSegmentButton,
                          isSelected && styles.cancelSegmentButtonActive,
                        ]}
                        onPress={() => setIsCancelKnownSlot(value)}>
                        <Text
                          style={[
                            styles.cancelSegmentButtonText,
                            isSelected && styles.cancelSegmentButtonTextActive,
                          ]}>
                          {value ? 'Yes' : 'No'}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {isCancelKnownSlot ? (
                  <View
                    style={[
                      styles.addPatientFieldRow,
                      isNarrowScreen && styles.addPatientFieldRowStacked,
                    ]}>
                    <View style={styles.addPatientFieldHalf}>
                      <RequiredLabel styles={styles}>New Visit Date</RequiredLabel>
                      <TouchableOpacity
                        activeOpacity={0.85}
                        style={styles.cancelSelectButton}
                        onPress={() => setIsCancelCalendarVisible(true)}>
                        <Text
                          style={[
                            styles.cancelSelectButtonText,
                            !cancelNewVisitDate &&
                              styles.addPatientDatePickerPlaceholder,
                          ]}>
                          {cancelNewVisitDate || 'Select date'}
                        </Text>
                        <Ionicons
                          name="calendar-outline"
                          size={18}
                          style={styles.cancelSelectButtonIcon}
                        />
                      </TouchableOpacity>
                    </View>
                    <View style={styles.addPatientFieldHalf}>
                      <RequiredLabel styles={styles}>New Time Slot</RequiredLabel>
                      <TouchableOpacity
                        activeOpacity={0.85}
                        style={styles.cancelSelectButton}
                        onPress={() =>
                          setIsCancelTimeSlotSelectVisible(previous => !previous)
                        }>
                        <Text style={styles.cancelSelectButtonText}>
                          {cancelNewTimeSlot}
                        </Text>
                        <Ionicons
                          name={
                            isCancelTimeSlotSelectVisible
                              ? 'chevron-up'
                              : 'chevron-down'
                          }
                          size={18}
                          style={styles.cancelSelectButtonIcon}
                        />
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : (
                  <View style={styles.cancelInfoBox}>
                    <Text style={styles.cancelInfoText}>
                      Booking will be cancelled and follow-up will be sent to
                      Lead Management.
                    </Text>
                  </View>
                )}
              </View>
            ) : null}

            <Text style={styles.cancelReviewMeta}>
              Reason: {cancellationReason}
              {cancelRemarks ? ` | ${cancelRemarks}` : ''}
            </Text>
          </ScrollView>

          <View style={styles.cancelModalFooter}>
            <TouchableOpacity
              activeOpacity={0.85}
              style={[
                styles.cancelModalPrimaryButton,
                styles.cancelBookingConfirmButton,
                bookingActionLoading === 'cancel' &&
                  styles.addPatientSubmitButtonDisabled,
              ]}
              onPress={confirmCancelBooking}
              disabled={bookingActionLoading === 'cancel'}>
              {bookingActionLoading === 'cancel' ? (
                <ActivityIndicator color={BRAND.surface} />
              ) : (
                <Text style={styles.cancelModalPrimaryButtonText}>
                  CONFIRM CANCELLATION
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

export default React.memo(CancelBookingModal);
