import React from 'react';
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';

import {BRAND} from '../../../styles/appStyles';
import RequiredLabel from './RequiredLabel';

function CompleteBookingModal({
  styles,
  visible,
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
  closeCompleteBookingModal,
  confirmCompleteBooking,
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
    <Modal
      transparent
      animationType="slide"
      visible={visible}
      onRequestClose={closeCompleteBookingModal}>
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
              <Text style={styles.cancelBookingTitle}>Complete booking</Text>
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
              onPress={closeCompleteBookingModal}
              disabled={bookingActionLoading === 'completed'}>
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
                      onPress={() =>
                        setIsLinkedAppointmentCalendarVisible(true)
                      }>
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
              {samplePickCount &&
              samplePickCount !== '1' &&
              shouldShowPatientSelect ? (
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
          </ScrollView>

          <View style={styles.cancelModalFooter}>
            <TouchableOpacity
              activeOpacity={0.85}
              style={[
                styles.cancelModalPrimaryButton,
                bookingActionLoading === 'completed' &&
                  styles.addPatientSubmitButtonDisabled,
              ]}
              onPress={confirmCompleteBooking}
              disabled={bookingActionLoading === 'completed'}>
              {bookingActionLoading === 'completed' ? (
                <ActivityIndicator color={BRAND.surface} />
              ) : (
                <Text style={styles.cancelModalPrimaryButtonText}>
                  COMPLETE BOOKING
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

export default React.memo(CompleteBookingModal);
