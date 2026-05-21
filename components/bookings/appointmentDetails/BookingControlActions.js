import React from 'react';
import {Text, TouchableOpacity, View} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';

function BookingControlActions({
  styles,
  isSmallPhone,
  canUsePatientActions,
  shouldShowProgressActions,
  shouldShowStartOnly,
  bookingActionLoading,
  handleAddPatientPress,
  openCancelBookingModal,
  onBookingAction,
}) {
  return (
    <>
      {canUsePatientActions || shouldShowProgressActions ? (
        <View
          style={[
            styles.bookingDetailQuickActionRow,
            isSmallPhone && styles.bookingDetailQuickActionRowStacked,
          ]}>
          {canUsePatientActions ? (
            <TouchableOpacity
              activeOpacity={0.85}
              style={[
                styles.bookingDetailQuickAction,
                styles.bookingDetailQuickActionPrimary,
              ]}
              onPress={handleAddPatientPress}>
              <Ionicons
                name="person-add-outline"
                size={17}
                style={styles.bookingDetailQuickActionIcon}
              />
              <Text style={styles.bookingDetailQuickActionText}>ADD PATIENT</Text>
            </TouchableOpacity>
          ) : null}
          {shouldShowProgressActions ? (
            <TouchableOpacity
              activeOpacity={0.85}
              style={[
                styles.bookingDetailQuickAction,
                styles.bookingDetailQuickActionDanger,
              ]}
              onPress={openCancelBookingModal}
              disabled={Boolean(bookingActionLoading)}>
              <Ionicons
                name="close-circle-outline"
                size={17}
                style={styles.bookingDetailQuickActionDangerIcon}
              />
              <Text
                style={[
                  styles.bookingDetailQuickActionText,
                  styles.bookingDetailQuickActionDangerText,
                ]}>
                CANCEL
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}

      {shouldShowStartOnly || shouldShowProgressActions ? (
        <View style={styles.bookingDetailSecondaryRow}>
          <Text style={styles.bookingDetailSecondaryText}>Booking control</Text>
          {shouldShowStartOnly ? (
            <TouchableOpacity
              activeOpacity={0.85}
              style={[
                styles.bookingDetailSecondaryButton,
                styles.bookingDetailSecondaryButtonStart,
              ]}
              onPress={() => onBookingAction('start')}
              disabled={Boolean(bookingActionLoading)}>
              <Text
                style={[
                  styles.bookingDetailSecondaryButtonText,
                  styles.bookingDetailSecondaryButtonStartText,
                ]}>
                {bookingActionLoading === 'start' ? 'STARTING...' : 'START'}
              </Text>
            </TouchableOpacity>
          ) : null}
          {shouldShowProgressActions ? (
            <TouchableOpacity
              activeOpacity={0.85}
              style={[
                styles.bookingDetailSecondaryButton,
                styles.bookingDetailSecondaryButtonStop,
              ]}
              onPress={() => onBookingAction('stop')}
              disabled={Boolean(bookingActionLoading)}>
              <Text
                style={[
                  styles.bookingDetailSecondaryButtonText,
                  styles.bookingDetailSecondaryButtonStopText,
                ]}>
                {bookingActionLoading === 'stop' ? 'STOPPING...' : 'STOP'}
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}
    </>
  );
}

export default React.memo(BookingControlActions);
