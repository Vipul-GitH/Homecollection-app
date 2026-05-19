import React from 'react';
import {Text, TouchableOpacity, useWindowDimensions, View} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';

function BookingCard({
  booking,
  styles,
  showViewDetailsButton = false,
  onViewDetails,
  isViewDetailsLoading = false,
}) {
  const {width} = useWindowDimensions();
  const isNarrowCard = width < 390;
  const patientNames =
    booking.patients.map(patient => patient.name).join(', ') ||
    booking.patientNames ||
    'Patient names not available';
  const resolvedPatientCount = booking.patientCount || booking.patients.length;
  const isAssignedAppointmentCard = showViewDetailsButton;

  return (
    <View style={styles.bookingCard}>
      <View
        style={[
          styles.bookingCardTopRow,
          isNarrowCard && styles.bookingCardTopRowStacked,
        ]}>
        <View style={styles.bookingCodeWrap}>
          {!isAssignedAppointmentCard ? (
            <Text style={styles.bookingCodeLabel}>{booking.bookingCode}</Text>
          ) : null}
          <Text style={styles.bookingPatientSummary}>
            {resolvedPatientCount} patient
            {resolvedPatientCount > 1 ? 's' : ''}
          </Text>
        </View>
        <View
          style={[
            styles.bookingStatusBadge,
            isNarrowCard && styles.bookingStatusBadgeSelfStart,
            booking.status === 'Assigned' && styles.bookingStatusAssigned,
            booking.status === 'Started' && styles.bookingStatusStarted,
            booking.status === 'Partial Complete' &&
              styles.bookingStatusPartialComplete,
            booking.status === 'Completed' && styles.bookingStatusCompleted,
            booking.status === 'Cancelled' && styles.bookingStatusCancelled,
          ]}>
          <Text style={styles.bookingStatusText}>{booking.status}</Text>
        </View>
      </View>

      {!isAssignedAppointmentCard ? (
        <Text style={styles.bookingPrimaryText} numberOfLines={2}>
          {patientNames}
        </Text>
      ) : null}

      {isAssignedAppointmentCard ? (
        <View style={styles.bookingMetaRow}>
          <Ionicons name="person-outline" size={15} style={styles.bookingMetaIcon} />
          <Text style={styles.bookingMetaText} numberOfLines={2}>
            Patient Name: {patientNames}
          </Text>
        </View>
      ) : null}

      {isAssignedAppointmentCard ? (
        <View style={styles.bookingMetaRow}>
          <Ionicons name="people-outline" size={15} style={styles.bookingMetaIcon} />
          <Text style={styles.bookingMetaText}>
            Patient Count: {resolvedPatientCount}
          </Text>
        </View>
      ) : null}

      {isAssignedAppointmentCard ? (
        <View style={styles.bookingMetaRow}>
          <Ionicons name="calendar-outline" size={15} style={styles.bookingMetaIcon} />
          <Text style={styles.bookingMetaText}>
            Visit Date: {booking.preferredVisitDate}
          </Text>
        </View>
      ) : null}

      <View style={styles.bookingMetaRow}>
        <Ionicons name="time-outline" size={15} style={styles.bookingMetaIcon} />
        <Text style={styles.bookingMetaText}>
          {isAssignedAppointmentCard ? 'Time Slot: ' : ''}
          {booking.timeSlot}
        </Text>
      </View>

      {!isAssignedAppointmentCard ? (
        <View style={styles.bookingMetaRow}>
          <Ionicons
            name="location-outline"
            size={15}
            style={styles.bookingMetaIcon}
          />
          <Text style={styles.bookingMetaText} numberOfLines={2}>
            {booking.address.fullAddress}
          </Text>
        </View>
      ) : null}

      {!isAssignedAppointmentCard ? (
        <View style={styles.bookingMetaRow}>
          <Ionicons name="flask-outline" size={15} style={styles.bookingMetaIcon} />
          <Text style={styles.bookingMetaText} numberOfLines={2}>
            {booking.testsSummary}
          </Text>
        </View>
      ) : null}

      {!isAssignedAppointmentCard ? (
        <View style={styles.bookingMetaRow}>
          <Ionicons name="call-outline" size={15} style={styles.bookingMetaIcon} />
          <Text style={styles.bookingMetaText}>{booking.phoneNumber}</Text>
        </View>
      ) : null}

      {showViewDetailsButton ? (
        <TouchableOpacity
          activeOpacity={0.85}
          style={[
            styles.inlineActionButton,
            isNarrowCard && styles.inlineActionButtonFullWidth,
          ]}
          onPress={onViewDetails}
          disabled={isViewDetailsLoading}>
          <Text style={styles.inlineActionButtonText}>
            {isViewDetailsLoading ? 'Loading...' : 'View Details'}
          </Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

export default React.memo(BookingCard);
