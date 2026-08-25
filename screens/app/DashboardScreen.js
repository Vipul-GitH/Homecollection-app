import React from 'react';
import {Text, TouchableOpacity, View} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import {BRAND} from '../../styles/appStyles';

const getPreviewStatusTone = status => {
  const normalizedStatus = String(status || '').trim().toLowerCase();

  if (normalizedStatus.includes('complete')) {
    return {
      backgroundColor: BRAND.success,
      borderColor: BRAND.successBorder,
      color: BRAND.surface,
    };
  }

  if (normalizedStatus.includes('cancel')) {
    return {
      backgroundColor: BRAND.coral,
      borderColor: '#F2C3B9',
      color: BRAND.surface,
    };
  }

  if (normalizedStatus.includes('start')) {
    return {
      backgroundColor: BRAND.warning,
      borderColor: BRAND.warningBorder,
      color: BRAND.surface,
    };
  }

  if (normalizedStatus.includes('assign')) {
    return {
      backgroundColor: BRAND.info,
      borderColor: BRAND.infoBorder,
      color: BRAND.surface,
    };
  }

  return {
    backgroundColor: BRAND.primarySoft,
    borderColor: BRAND.primary,
    color: BRAND.surface,
  };
};

const isCompletedBooking = booking => {
  const statusCode = Number(booking?.bookingStatusCode || 0);
  const statusText = String(booking?.status || '').trim().toLowerCase();

  return (
    statusCode === 3 ||
    statusCode === 5 ||
    statusText.includes('complete')
  );
};

const isStartedBooking = booking => {
  const statusCode = Number(booking?.bookingStatusCode || 0);
  const statusText = String(booking?.status || '').trim().toLowerCase();

  return statusCode === 2 || statusText.includes('start');
};

function DashboardScreen({
  styles,
  isSmallPhone,
  appointments,
  onAssignedCardPress,
  onStartedCardPress,
  onCompletedCardPress,
  onUpcomingBookingPress,
}) {
  const upcomingBookings = appointments
    .filter(
      booking => !isCompletedBooking(booking) && !isStartedBooking(booking),
    )
    .slice(0, 2);

  const renderPreviewStatusStyle = status => {
    const tone = getPreviewStatusTone(status);

    return [
      styles.dashboardPreviewStatus,
      {
        backgroundColor: tone.backgroundColor,
        borderColor: tone.borderColor,
        color: tone.color,
      },
    ];
  };

  return (
    <>
      <View style={styles.statsSectionHeader}>
        <View style={styles.sectionTitleRow}>
          <View style={styles.sectionIconWrap}>
            <Ionicons name="stats-chart" size={16} style={styles.sectionIcon} />
          </View>
          <Text style={styles.sectionTitle}>Booking Overview</Text>
        </View>
        <Text style={styles.sectionText} numberOfLines={2}>
          Status overview for today&apos;s appointment progress.
        </Text>
      </View>

      <View
        style={[
          styles.statsGrid,
          isSmallPhone && styles.statsGridSingleColumn,
        ]}>
        <TouchableOpacity
          activeOpacity={0.9}
          onPress={onAssignedCardPress}
          style={[
            styles.statCard,
            styles.statCardPrimary,
            isSmallPhone && styles.statCardFullWidth,
          ]}>
          <View style={styles.statCardGlow} />
          <View style={styles.statCardTopRow}>
            <View style={styles.statIconWrap}>
              <Ionicons name="briefcase" size={24} style={styles.statIcon} />
            </View>
            <Text style={styles.statTag}>Today</Text>
          </View>
          <Text style={styles.statLabel}>Assigned</Text>
        </TouchableOpacity>

        <TouchableOpacity
          activeOpacity={0.9}
          onPress={onCompletedCardPress}
          style={[
            styles.statCard,
            styles.statCardDanger,
            isSmallPhone && styles.statCardFullWidth,
          ]}>
          <View style={styles.statCardGlow} />
          <View style={styles.statCardTopRow}>
            <View style={styles.statIconWrap}>
              <Ionicons name="checkmark-done" size={24} style={styles.statIcon} />
            </View>
            <Text style={styles.statTag}>Done</Text>
          </View>
          <Text style={styles.statLabel}>Completed</Text>
        </TouchableOpacity>

        <TouchableOpacity
          activeOpacity={0.9}
          onPress={onStartedCardPress}
          style={[
            styles.statCard,
            styles.statCardSuccess,
            isSmallPhone && styles.statCardFullWidth,
          ]}>
          <View style={styles.statCardGlow} />
          <View style={styles.statCardTopRow}>
            <View style={styles.statIconWrap}>
              <Ionicons name="play" size={24} style={styles.statIcon} />
            </View>
            <Text style={styles.statTag}>Travel</Text>
          </View>
          <Text style={styles.statLabel}>Started</Text>
        </TouchableOpacity>

        <View
          style={[
            styles.statCard,
            styles.statCardWarning,
            isSmallPhone && styles.statCardFullWidth,
          ]}>
          <View style={styles.statCardGlow} />
          <View style={styles.statCardTopRow}>
            <View style={styles.statIconWrap}>
              <Ionicons name="navigate" size={24} style={styles.statIcon} />
            </View>
            <Text style={styles.statTag}>Site</Text>
          </View>
          <Text style={styles.statLabel}>Reached</Text>
        </View>
      </View>

      <View style={styles.sectionCard}>
        <View style={styles.sectionTitleRow}>
          <View style={styles.sectionIconWrap}>
            <Ionicons name="time" size={16} style={styles.sectionIcon} />
          </View>
          <Text style={styles.sectionTitle}>Upcoming Visits</Text>
        </View>
        <Text style={styles.sectionText} numberOfLines={2}>
          Quick preview of the next scheduled bookings.
        </Text>

        {upcomingBookings.length ? (
          upcomingBookings.map((booking, index) => (
            <TouchableOpacity
              key={`upcoming-${booking.id || 'na'}-${booking.bookingCode || 'na'}-${index}`}
              activeOpacity={0.85}
              style={styles.dashboardPreviewCard}
              onPress={() => onUpcomingBookingPress?.(booking)}>
              <View style={styles.dashboardPreviewRow}>
                <Text style={styles.dashboardPreviewTitle} numberOfLines={1}>
                  {booking.bookingCode}
                </Text>
                <Text style={renderPreviewStatusStyle(booking.status)}>
                  {booking.status}
                </Text>
              </View>
              <Text style={styles.dashboardPreviewMeta}>
                {booking.preferredVisitDate || booking.visitDate} |{' '}
                {booking.timeSlot}
              </Text>
              <Text style={styles.dashboardPreviewMeta} numberOfLines={1}>
                {booking.address?.fullAddress || 'Address not available'}
              </Text>
            </TouchableOpacity>
          ))
        ) : (
          <View style={styles.dashboardPreviewCard}>
            <Text style={styles.dashboardPreviewTitle}>No live bookings loaded</Text>
            <Text style={styles.dashboardPreviewMeta}>
              Open the Bookings tab to fetch assigned appointments.
            </Text>
          </View>
        )}
      </View>
    </>
  );
}

export default React.memo(DashboardScreen);
