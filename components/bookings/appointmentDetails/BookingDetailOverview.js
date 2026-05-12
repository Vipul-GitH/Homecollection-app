import React from 'react';
import {Text, TouchableOpacity, View} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';

import BookingControlActions from './BookingControlActions';
import BookingLocationCard from './BookingLocationCard';
import TerminalStatusCard from './TerminalStatusCard';

function BookingDetailOverview({
  styles,
  selectedBooking,
  patientCount,
  isSmallPhone,
  canUseActiveBookingControls,
  canUsePatientActions,
  shouldShowProgressActions,
  shouldShowStartOnly,
  bookingActionLoading,
  resolvedAddress,
  latitude,
  longitude,
  isTerminalBooking,
  isCompletedBooking,
  isCancelledBooking,
  terminalBookingMessage,
  canCallBookingPhone,
  handleCallBookingPhone,
  handleOpenLocation,
  handleAddPatientPress,
  openCancelBookingModal,
  onBookingAction,
}) {
  return (
    <View style={styles.bookingDetailShell}>
      <View style={styles.bookingDetailHero}>
        <View style={styles.bookingDetailHeroTopRow}>
          <View style={styles.bookingDetailHeroText}>
            <Text style={styles.bookingDetailHeroCode}>
              {selectedBooking.bookingCode || selectedBooking.id}
            </Text>
            <Text style={styles.bookingDetailHeroMeta}>
              {patientCount} Patient{patientCount > 1 ? 's' : ''} |{' '}
              {selectedBooking.timeSlot}
            </Text>
          </View>
          <View style={styles.bookingDetailHeroIconRow}>
            <TouchableOpacity
              activeOpacity={0.85}
              style={styles.bookingDetailHeroIconButton}
              onPress={handleCallBookingPhone}
              disabled={!canCallBookingPhone}>
              <Ionicons
                name="call-outline"
                size={18}
                style={styles.bookingDetailHeroIcon}
              />
            </TouchableOpacity>
            {canUseActiveBookingControls ? (
              <TouchableOpacity
                activeOpacity={0.85}
                style={styles.bookingDetailHeroIconButton}
                onPress={handleOpenLocation}>
                <Ionicons
                  name="map-outline"
                  size={18}
                  style={styles.bookingDetailHeroIcon}
                />
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
        <View style={styles.bookingDetailHeroStatusRow}>
          <View style={styles.bookingDetailHeroStatusChip}>
            <Text style={styles.bookingDetailHeroStatusText}>
              {selectedBooking.status}
            </Text>
          </View>
          <Text style={styles.bookingDetailHeroDate}>
            {selectedBooking.preferredVisitDate}
          </Text>
        </View>
      </View>

      <BookingControlActions
        styles={styles}
        isSmallPhone={isSmallPhone}
        canUsePatientActions={canUsePatientActions}
        shouldShowProgressActions={shouldShowProgressActions}
        shouldShowStartOnly={shouldShowStartOnly}
        bookingActionLoading={bookingActionLoading}
        handleAddPatientPress={handleAddPatientPress}
        openCancelBookingModal={openCancelBookingModal}
        onBookingAction={onBookingAction}
      />

      <BookingLocationCard
        styles={styles}
        address={resolvedAddress}
        accessNotes={selectedBooking.address.accessNotes}
        disabled={!resolvedAddress && (!latitude || !longitude)}
        onOpenLocation={handleOpenLocation}
      />

      {isTerminalBooking ? (
        <TerminalStatusCard
          styles={styles}
          isCompleted={isCompletedBooking}
          isCancelled={isCancelledBooking}
          message={terminalBookingMessage}
        />
      ) : null}
    </View>
  );
}

export default React.memo(BookingDetailOverview);
