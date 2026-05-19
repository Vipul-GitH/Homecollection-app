import React, {useMemo} from 'react';
import {Text, TouchableOpacity, View} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';

const getPaymentDueText = booking => {
  const amount = String(booking.payment?.amount || '').trim();

  if (!amount || amount === 'N/A') {
    return '';
  }

  return amount.toLowerCase().includes('due') ? amount : `${amount} due`;
};

const getBookingTags = booking => {
  const tags = Array.isArray(booking.tags) ? booking.tags : [];

  return tags;
};

const getStatusTone = status => {
  const normalizedStatus = String(status || '').trim().toLowerCase();

  if (normalizedStatus.includes('complete')) {
    return 'completed';
  }

  if (normalizedStatus.includes('cancel')) {
    return 'cancelled';
  }

  if (normalizedStatus.includes('start')) {
    return 'started';
  }

  if (normalizedStatus.includes('assign')) {
    return 'assigned';
  }

  return 'default';
};

const isStartedBooking = booking =>
  Number(booking?.bookingStatusCode) === 2 ||
  String(booking?.status || '').trim().toLowerCase().includes('start');

const getPatientDisplayNames = booking => {
  const directNames = String(booking?.patientNames || '').trim();
  if (directNames) {
    return directNames;
  }

  const patients = Array.isArray(booking?.patients) ? booking.patients : [];
  const derivedNames = patients
    .map(patient =>
      String(
        patient?.name || patient?.fullName || patient?.full_name || '',
      ).trim(),
    )
    .filter(Boolean)
    .join(', ');

  return derivedNames;
};

const getQueueBadgeStyle = (styles, status) => {
  const tone = getStatusTone(status);

  return [
    styles.assignedQueueBadge,
    tone === 'assigned' && styles.assignedQueueBadgeAssigned,
    tone === 'started' && styles.assignedQueueBadgeStarted,
    tone === 'completed' && styles.assignedQueueBadgeCompleted,
    tone === 'cancelled' && styles.assignedQueueBadgeCancelled,
  ];
};

const getQueueBadgeTextStyle = (styles, status) => {
  const tone = getStatusTone(status);

  return [
    styles.assignedQueueBadgeText,
    tone === 'assigned' && styles.assignedQueueBadgeTextAssigned,
    tone === 'started' && styles.assignedQueueBadgeTextStarted,
    tone === 'completed' && styles.assignedQueueBadgeTextCompleted,
    tone === 'cancelled' && styles.assignedQueueBadgeTextCancelled,
  ];
};

const getActiveStatusChipStyle = (styles, status) => {
  const tone = getStatusTone(status);

  return [
    styles.assignedActiveStatusChip,
    tone === 'assigned' && styles.assignedActiveStatusChipAssigned,
    tone === 'started' && styles.assignedActiveStatusChipStarted,
    tone === 'completed' && styles.assignedActiveStatusChipCompleted,
    tone === 'cancelled' && styles.assignedActiveStatusChipCancelled,
  ];
};

const getActiveStatusTextStyle = (styles, status) => {
  const tone = getStatusTone(status);

  return [
    styles.assignedActiveStatusText,
    tone === 'assigned' && styles.assignedActiveStatusTextAssigned,
    tone === 'started' && styles.assignedActiveStatusTextStarted,
    tone === 'completed' && styles.assignedActiveStatusTextCompleted,
    tone === 'cancelled' && styles.assignedActiveStatusTextCancelled,
  ];
};

function QueueMetaRow({
  styles,
  icon,
  label,
  value,
  active = false,
  highlight = false,
}) {
  return (
    <View style={styles.assignedQueueMetaRow}>
      <Ionicons
        name={icon}
        size={14}
        style={[
          styles.assignedQueueMetaIcon,
          active && styles.assignedQueueMetaIconActive,
          highlight && styles.assignedQueueMetaIconHighlight,
          active && highlight && styles.assignedQueueMetaIconHighlightActive,
        ]}
      />
      <Text
        style={[
          styles.assignedQueueMetaText,
          active && styles.assignedQueueMetaTextActive,
          highlight && styles.assignedQueueMetaTextHighlight,
          active && highlight && styles.assignedQueueMetaTextHighlightActive,
        ]}>
        {label ? (
          <Text
            style={[
              styles.assignedQueueMetaLabel,
              active && styles.assignedQueueMetaLabelActive,
              highlight && styles.assignedQueueMetaLabelHighlight,
              active && highlight && styles.assignedQueueMetaLabelHighlightActive,
            ]}>
            {label}:{' '}
          </Text>
        ) : null}
        <Text
          style={[
            styles.assignedQueueMetaValue,
            active && styles.assignedQueueMetaValueActive,
            highlight && styles.assignedQueueMetaValueHighlight,
            active && highlight && styles.assignedQueueMetaValueHighlightActive,
          ]}>
          {value}
        </Text>
      </Text>
    </View>
  );
}

function QueueBadge({styles, label}) {
  return (
    <View style={getQueueBadgeStyle(styles, label)}>
      <Text style={getQueueBadgeTextStyle(styles, label)}>{label}</Text>
    </View>
  );
}

function AssignedAppointmentsScreen({
  styles,
  isLoadingAssignedAppointments,
  assignedAppointmentsError,
  assignedAppointments,
  onAssignedRetry,
  onAssignedViewTests,
  loadingAssignedBookingId,
  loadingText = 'Assigned appointments are loading...',
  emptyText = 'No assigned appointments are available at the moment.',
  showActiveCard = true,
}) {
  const {activeBooking, queuedBookings} = useMemo(
    () => {
      const activeStartedBooking = showActiveCard
        ? assignedAppointments.find(isStartedBooking) || null
        : null;

      return {
        activeBooking: activeStartedBooking,
        queuedBookings: activeStartedBooking
          ? assignedAppointments.filter(
              booking => String(booking.id) !== String(activeStartedBooking.id),
            )
          : assignedAppointments,
      };
    },
    [assignedAppointments, showActiveCard],
  );
  const hasAssignedAppointments = assignedAppointments.length > 0;

  return (
    <>
      {isLoadingAssignedAppointments && !hasAssignedAppointments ? (
        <View style={styles.sectionCard}>
          <Text style={styles.sectionText}>{loadingText}</Text>
        </View>
      ) : null}

      {!isLoadingAssignedAppointments &&
      !hasAssignedAppointments &&
      assignedAppointmentsError ? (
        <View style={styles.sectionCard}>
          <Text style={styles.sectionText}>{assignedAppointmentsError}</Text>
          <TouchableOpacity
            activeOpacity={0.85}
            style={[styles.loginButton, styles.retryButtonSpacing]}
            onPress={onAssignedRetry}>
            <View style={styles.loginButtonGradient}>
              <Text style={styles.loginButtonText}>Retry</Text>
            </View>
          </TouchableOpacity>
        </View>
      ) : null}

      {!isLoadingAssignedAppointments &&
      !assignedAppointmentsError &&
      !hasAssignedAppointments ? (
        <View style={styles.sectionCard}>
          <Text style={styles.sectionText}>{emptyText}</Text>
        </View>
      ) : null}

      {!assignedAppointmentsError && hasAssignedAppointments ? (
        <View style={styles.assignedQueueShell}>
          {activeBooking ? (
            <TouchableOpacity
              activeOpacity={0.9}
              style={styles.assignedActiveCard}
              onPress={() => onAssignedViewTests(activeBooking)}
              disabled={loadingAssignedBookingId === activeBooking.id}>
              <View style={styles.assignedActiveBadge}>
                <Ionicons
                  name="radio-button-on"
                  size={10}
                  style={styles.assignedActiveBadgeIcon}
                />
                <Text style={styles.assignedActiveBadgeText}>ACTIVE NOW</Text>
              </View>
              <Text style={styles.assignedActiveCode}>
                {activeBooking.bookingCode}
              </Text>
              <View style={styles.assignedActiveMetaStack}>
                {getPatientDisplayNames(activeBooking) ? (
                  <QueueMetaRow
                    styles={styles}
                    icon="person-outline"
                    label="Patient Name"
                    value={getPatientDisplayNames(activeBooking)}
                    active
                    highlight
                  />
                ) : null}
                <QueueMetaRow
                  styles={styles}
                  icon="people-outline"
                  label="Patient Count"
                  value={activeBooking.patientCount || activeBooking.patients?.length || 1}
                  active
                />
                <QueueMetaRow
                  styles={styles}
                  icon="calendar-outline"
                  label="Visit Date"
                  value={activeBooking.preferredVisitDate}
                  active
                />
                <QueueMetaRow
                  styles={styles}
                  icon="time-outline"
                  label="Time Slot"
                  value={activeBooking.timeSlot}
                  active
                />
              </View>
              <View style={getActiveStatusChipStyle(styles, activeBooking.status)}>
                <Text style={getActiveStatusTextStyle(styles, activeBooking.status)}>
                  {activeBooking.status}
                </Text>
              </View>
              <View style={styles.assignedActiveButtonRow}>
                <View style={styles.assignedActiveButton}>
                  <Text style={styles.assignedActiveButtonText}>
                    {loadingAssignedBookingId === activeBooking.id
                      ? 'LOADING...'
                      : 'OPEN'}
                  </Text>
                </View>
              </View>
            </TouchableOpacity>
          ) : null}

          <View style={styles.assignedQueueSectionHeader}>
            <Text style={styles.assignedQueueSectionTitle}>
              My Queue - Assigned
            </Text>
          </View>

          {queuedBookings.length ? (
            queuedBookings.map((booking, index) => {
              const tags = getBookingTags(booking);
              const dueText = getPaymentDueText(booking);

              return (
                <View
                  key={`assigned-${booking.id || 'na'}-${booking.bookingCode || 'na'}-${index}`}
                  style={styles.assignedQueueCard}>
                  <View style={styles.assignedQueueCardMain}>
                    <View style={styles.assignedQueueCardHeader}>
                      <View style={styles.assignedQueueCardText}>
                        <Text style={styles.assignedQueueCode}>
                          {booking.bookingCode}
                        </Text>
                        {getPatientDisplayNames(booking) ? (
                          <QueueMetaRow
                            styles={styles}
                            icon="person-outline"
                            label="Patient Name"
                            value={getPatientDisplayNames(booking)}
                            highlight
                          />
                        ) : null}
                        <QueueMetaRow
                          styles={styles}
                          icon="people-outline"
                          label="Patient Count"
                          value={booking.patientCount || booking.patients?.length || 1}
                        />
                        <QueueMetaRow
                          styles={styles}
                          icon="calendar-outline"
                          label="Visit Date"
                          value={booking.preferredVisitDate}
                        />
                        <QueueMetaRow
                          styles={styles}
                          icon="time-outline"
                          label="Time Slot"
                          value={booking.timeSlot}
                        />
                      </View>
                      <QueueBadge styles={styles} label={booking.status} />
                    </View>

                    {tags.length ? (
                      <View style={styles.assignedQueueTagRow}>
                        {tags.map(tag => (
                          <View key={tag} style={styles.assignedQueueTag}>
                            <Text style={styles.assignedQueueTagText}>{tag}</Text>
                          </View>
                        ))}
                      </View>
                    ) : null}

                    {dueText ? (
                      <Text style={styles.assignedQueueDueText}>{dueText}</Text>
                    ) : null}

                    <View style={styles.assignedQueueActionRow}>
                      <TouchableOpacity
                        activeOpacity={0.85}
                        style={styles.assignedQueueOpenButton}
                        onPress={() => onAssignedViewTests(booking)}
                        disabled={loadingAssignedBookingId === booking.id}>
                        <Text style={styles.assignedQueueOpenButtonText}>
                          {loadingAssignedBookingId === booking.id
                            ? 'OPENING...'
                            : 'OPEN'}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              );
            })
          ) : (
            <View style={styles.assignedQueueEmptyCard}>
              <Text style={styles.assignedQueueEmptyText}>
                Finish active booking first
              </Text>
            </View>
          )}
        </View>
      ) : null}
    </>
  );
}

export default React.memo(AssignedAppointmentsScreen);
