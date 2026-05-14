import React, {useEffect, useMemo, useState} from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';

import {BRAND} from '../../styles/appStyles';
import {
  getCachedBookingDetailsMap,
  getCachedCompletedBookings,
  getCachedHandoverState,
  persistCachedHandoverState,
} from '../../services/storage/offlineBookingStorage';

const toStableValue = value =>
  value === null || value === undefined ? '' : String(value).trim();

const getPatientTubeNames = patient =>
  (Array.isArray(patient?.tubes) ? patient.tubes : [])
    .map(tube =>
      typeof tube === 'string'
        ? toStableValue(tube)
        : toStableValue(tube?.tubeName || tube?.name || tube?.specimenName),
    )
    .filter(Boolean);

const getTubeSelectionKey = ({bookingId, patientId, tubeName}) =>
  [
    toStableValue(bookingId),
    toStableValue(patientId),
    toStableValue(tubeName).toLowerCase(),
  ].join('|');

export default function HandoverScreen({
  styles,
  completedAppointments = [],
  isLoadingCompletedAppointments = false,
  completedAppointmentsError = '',
  onCompletedRetry,
}) {
  const [expandedBookings, setExpandedBookings] = useState({});
  const [cachedDetailsMap, setCachedDetailsMap] = useState({});
  const [cachedCompletedBookings, setCachedCompletedBookings] = useState([]);
  const [handoverState, setHandoverState] = useState({});
  const [selectedTubeKeys, setSelectedTubeKeys] = useState({});
  const [handoverTo, setHandoverTo] = useState('');
  const [riderName, setRiderName] = useState('');

  useEffect(() => {
    let isMounted = true;

    Promise.all([
      getCachedBookingDetailsMap(),
      getCachedCompletedBookings(),
      getCachedHandoverState(),
    ])
      .then(([detailsMap, localCompletedBookings, localHandoverState]) => {
        if (!isMounted) {
          return;
        }

        setCachedDetailsMap(detailsMap || {});
        setCachedCompletedBookings(
          Array.isArray(localCompletedBookings) ? localCompletedBookings : [],
        );
        setHandoverState(
          localHandoverState && typeof localHandoverState === 'object'
            ? localHandoverState
            : {},
        );
      })
      .catch(() => {});

    return () => {
      isMounted = false;
    };
  }, [completedAppointments]);

  const handoverBookings = useMemo(() => {
    const sourceBookings = (
      completedAppointments.length ? completedAppointments : cachedCompletedBookings
    )
      .map(booking => cachedDetailsMap[String(booking?.id)] || booking)
      .filter(booking => [3, 5].includes(Number(booking?.bookingStatusCode || 0)));

    return sourceBookings
      .map(booking => {
        const patients = (Array.isArray(booking?.patients) ? booking.patients : [])
          .map((patient, index) => {
            const patientKey =
              patient?.bookingPatientId || patient?.patientId || patient?.id || index;
            const pendingTubeNames = getPatientTubeNames(patient).filter(tubeName => {
              const selectionKey = getTubeSelectionKey({
                bookingId: booking?.id,
                patientId: patientKey,
                tubeName,
              });

              return !handoverState[selectionKey];
            });

            return {
              ...patient,
              handoverPatientKey: patientKey,
              tubes: pendingTubeNames,
            };
          })
          .filter(patient => Array.isArray(patient?.tubes) && patient.tubes.length);

        return {
          ...booking,
          patients,
        };
      })
      .filter(booking => booking.patients.length);
  }, [
    cachedCompletedBookings,
    cachedDetailsMap,
    completedAppointments,
    handoverState,
  ]);
  const handoverSummary = useMemo(() => {
    const selectedEntries = Object.values(selectedTubeKeys).filter(Boolean);
    const bookingIds = new Set();
    const patientIds = new Set();
    const tubeCountMap = new Map();

    selectedEntries.forEach(item => {
      bookingIds.add(item.bookingId);
      patientIds.add(item.patientKey);
      const tubeName = toStableValue(item.tubeName);
      if (tubeName) {
        tubeCountMap.set(tubeName, (tubeCountMap.get(tubeName) || 0) + 1);
      }
    });

    return {
      selectedBookingCount: bookingIds.size,
      selectedPatientCount: patientIds.size,
      selectedTubeCount: selectedEntries.length,
      selectedTubeBreakdown: Array.from(tubeCountMap.entries())
        .map(([tubeName, count]) => ({tubeName, count}))
        .sort((leftItem, rightItem) =>
          leftItem.tubeName.localeCompare(rightItem.tubeName),
        ),
    };
  }, [selectedTubeKeys]);

  const toggleExpanded = bookingId => {
    setExpandedBookings(previousState => ({
      ...previousState,
      [bookingId]: !previousState[bookingId],
    }));
  };
  const toggleTubeSelection = ({
    bookingId,
    patientId,
    patientName,
    tubeName,
  }) => {
    const selectionKey = getTubeSelectionKey({
      bookingId,
      patientId,
      tubeName,
    });

    setSelectedTubeKeys(previousState => {
      if (previousState[selectionKey]) {
        const nextState = {...previousState};
        delete nextState[selectionKey];
        return nextState;
      }

      return {
        ...previousState,
        [selectionKey]: {
          bookingId: toStableValue(bookingId),
          patientKey: `${toStableValue(bookingId)}|${toStableValue(patientId)}`,
          patientName: toStableValue(patientName),
          tubeName: toStableValue(tubeName),
        },
      };
    });
  };
  const handleSaveHandover = () => {
    if (!handoverSummary.selectedTubeCount) {
      return;
    }

    if (!handoverTo) {
      Alert.alert('Handover To Required', 'Please select handover destination.');
      return;
    }

    if (handoverTo === 'rider' && !toStableValue(riderName)) {
      Alert.alert('Rider Name Required', 'Please enter rider name.');
      return;
    }

    const handoverLabel = handoverTo === 'rider' ? 'Rider' : 'Lab';
    const riderLabel =
      handoverTo === 'rider' ? `\nRider: ${toStableValue(riderName)}` : '';

    Alert.alert(
      'Confirm Handover',
      `Save handover to ${handoverLabel}?${riderLabel}\n\nBookings: ${handoverSummary.selectedBookingCount}\nPatients: ${handoverSummary.selectedPatientCount}\nTubes: ${handoverSummary.selectedTubeCount}`,
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Save',
          onPress: async () => {
            const nextHandoverState = {
              ...handoverState,
            };

            Object.entries(selectedTubeKeys).forEach(([selectionKey, selection]) => {
              nextHandoverState[selectionKey] = {
                ...selection,
                handoverTo,
                riderName: handoverTo === 'rider' ? toStableValue(riderName) : '',
                handedOverAt: new Date().toISOString(),
              };
            });

            setHandoverState(nextHandoverState);
            await persistCachedHandoverState(nextHandoverState);
            setSelectedTubeKeys({});
            setHandoverTo('');
            setRiderName('');
            Alert.alert(
              'Handover Saved',
              'Selected sample tubes have been saved locally and removed from pending handover.',
            );
          },
        },
      ],
    );
  };

  if (
    isLoadingCompletedAppointments &&
    !handoverBookings.length &&
    !cachedCompletedBookings.length
  ) {
    return (
      <View style={styles.comingSoonCard}>
        <ActivityIndicator color={BRAND.primaryStrong} size="small" />
        <Text style={styles.comingSoonTitle}>Loading handover list...</Text>
      </View>
    );
  }

  if (
    completedAppointmentsError &&
    !handoverBookings.length &&
    !cachedCompletedBookings.length
  ) {
    return (
      <View style={styles.comingSoonCard}>
        <View style={styles.comingSoonIconWrap}>
          <Ionicons
            name="alert-circle-outline"
            size={30}
            style={styles.comingSoonIcon}
          />
        </View>
        <Text style={styles.comingSoonTitle}>Unable to load handover</Text>
        <Text style={styles.comingSoonText}>{completedAppointmentsError}</Text>
        <TouchableOpacity
          activeOpacity={0.85}
          style={styles.sampleCollectionSubmitButton}
          onPress={onCompletedRetry}>
          <Text style={styles.sampleCollectionSubmitText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!handoverBookings.length) {
    return (
      <View style={styles.comingSoonCard}>
        <View style={styles.comingSoonIconWrap}>
          <Ionicons name="flask-outline" size={30} style={styles.comingSoonIcon} />
        </View>
        <Text style={styles.comingSoonTitle}>No handover items yet</Text>
        <Text style={styles.comingSoonText}>
          Completed bookings with collected samples will appear here.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={styles.handoverScreenContent}>
      <View style={styles.sectionCard}>
        <View style={styles.sectionTitleRow}>
          <View style={styles.sectionIconWrap}>
            <Ionicons name="cube-outline" size={16} style={styles.sectionIcon} />
          </View>
          <Text style={styles.sectionTitle}>Sample Handover</Text>
        </View>
        <Text style={styles.handoverIntroText}>
          Completed bookings and patient-wise sample tubes ready for handover.
        </Text>
      </View>

      {handoverBookings.map(booking => {
        const isExpanded = Boolean(expandedBookings[booking.id]);
        const patients = Array.isArray(booking?.patients) ? booking.patients : [];

        return (
          <View key={`handover-${booking.id}`} style={styles.handoverBookingCard}>
            <TouchableOpacity
              activeOpacity={0.85}
              style={styles.handoverBookingHeader}
              onPress={() => toggleExpanded(booking.id)}>
              <View style={styles.handoverBookingHeaderText}>
                <Text style={styles.handoverBookingCode}>
                  {booking?.bookingCode || booking?.id || 'Booking'}
                </Text>
                <Text style={styles.handoverBookingMeta}>
                  {toStableValue(booking?.visitDate || booking?.preferredVisitDate) ||
                    'Date N/A'}{' '}
                  | {toStableValue(booking?.timeSlot) || 'Slot N/A'} |{' '}
                  {patients.length} patient{patients.length === 1 ? '' : 's'}
                </Text>
              </View>
              <View style={styles.handoverBookingBadge}>
                <Text style={styles.handoverBookingBadgeText}>
                  {booking?.status || 'Completed'}
                </Text>
              </View>
              <Ionicons
                name={isExpanded ? 'chevron-up' : 'chevron-down'}
                size={18}
                style={styles.sampleCollectionSpecimenChevron}
              />
            </TouchableOpacity>

            {isExpanded ? (
              <View style={styles.handoverPatientList}>
                {patients.map((patient, index) => {
                  const tubeNames = getPatientTubeNames(patient);
                  const patientMeta = [
                    toStableValue(patient?.gender),
                    toStableValue(patient?.age)
                      ? `${toStableValue(patient?.age)} yrs`
                      : '',
                  ]
                    .filter(Boolean)
                    .join(' | ');
                  const patientKey = patient?.handoverPatientKey || index;

                  return (
                    <View
                      key={`handover-patient-${booking.id}-${patient?.id || index}`}
                      style={styles.handoverPatientCard}>
                      <View style={styles.handoverPatientHeader}>
                        <View style={styles.handoverPatientHeaderText}>
                          <Text style={styles.handoverPatientName}>
                            {patient?.name || `Patient ${index + 1}`}
                          </Text>
                          {patientMeta ? (
                            <Text style={styles.handoverPatientMeta}>
                              {patientMeta}
                            </Text>
                          ) : null}
                        </View>
                        <Text style={styles.handoverPatientTubeCount}>
                          {tubeNames.length} tube{tubeNames.length === 1 ? '' : 's'}
                        </Text>
                      </View>
                      {tubeNames.length ? (
                        <View style={styles.handoverTubeRow}>
                          {tubeNames.map(tubeName => {
                            const selectionKey = getTubeSelectionKey({
                              bookingId: booking?.id,
                              patientId: patientKey,
                              tubeName,
                            });
                            const isSelected = Boolean(selectedTubeKeys[selectionKey]);

                            return (
                              <TouchableOpacity
                                key={`${booking.id}-${patient?.id || index}-${tubeName}`}
                                activeOpacity={0.85}
                                style={[
                                  styles.handoverTubeChip,
                                  isSelected && styles.handoverTubeChipActive,
                                ]}
                                onPress={() =>
                                  toggleTubeSelection({
                                    bookingId: booking?.id,
                                    patientId: patientKey,
                                    patientName:
                                      patient?.name || `Patient ${index + 1}`,
                                    tubeName,
                                  })
                                }>
                                <Ionicons
                                  name={
                                    isSelected
                                      ? 'checkmark-circle'
                                      : 'test-tube-outline'
                                  }
                                  size={13}
                                  style={[
                                    styles.handoverTubeChipIcon,
                                    isSelected &&
                                      styles.handoverTubeChipIconActive,
                                  ]}
                                />
                                <Text
                                  style={[
                                    styles.handoverTubeChipText,
                                    isSelected &&
                                      styles.handoverTubeChipTextActive,
                                  ]}>
                                  {tubeName}
                                </Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      ) : (
                        <Text style={styles.handoverEmptyTubeText}>
                          No sample tubes recorded for this patient.
                        </Text>
                      )}
                    </View>
                  );
                })}
              </View>
            ) : null}
          </View>
        );
      })}

      {handoverSummary.selectedTubeCount ? (
        <View style={styles.handoverSummaryCard}>
          <Text style={styles.handoverSummaryTitle}>Final Summary</Text>
          <View style={styles.handoverSummaryRow}>
            <View style={styles.handoverSummaryStat}>
              <Text style={styles.handoverSummaryStatValue}>
                {handoverSummary.selectedBookingCount}
              </Text>
              <Text style={styles.handoverSummaryStatLabel}>Bookings</Text>
            </View>
            <View style={styles.handoverSummaryStat}>
              <Text style={styles.handoverSummaryStatValue}>
                {handoverSummary.selectedPatientCount}
              </Text>
              <Text style={styles.handoverSummaryStatLabel}>Patients</Text>
            </View>
            <View style={styles.handoverSummaryStat}>
              <Text style={styles.handoverSummaryStatValue}>
                {handoverSummary.selectedTubeCount}
              </Text>
              <Text style={styles.handoverSummaryStatLabel}>Tubes</Text>
            </View>
          </View>
          {handoverSummary.selectedTubeBreakdown.length ? (
            <View style={styles.handoverSummaryTubeList}>
              {handoverSummary.selectedTubeBreakdown.map(item => (
                <View
                  key={`handover-summary-${item.tubeName}`}
                  style={styles.handoverSummaryTubeChip}>
                  <Text style={styles.handoverSummaryTubeName}>
                    {item.tubeName}
                  </Text>
                  <Text style={styles.handoverSummaryTubeCount}>
                    x{item.count}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
          <View style={styles.handoverActionCard}>
            <Text style={styles.handoverActionTitle}>Handover To</Text>
            <View style={styles.handoverActionSegment}>
              {[
                {value: 'rider', label: 'Rider'},
                {value: 'lab', label: 'Lab'},
              ].map(option => {
                const isSelected = handoverTo === option.value;

                return (
                  <TouchableOpacity
                    key={`handover-to-${option.value}`}
                    activeOpacity={0.85}
                    style={[
                      styles.cancelSegmentButton,
                      isSelected && styles.cancelSegmentButtonActive,
                    ]}
                    onPress={() => setHandoverTo(option.value)}>
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
            {handoverTo === 'rider' ? (
              <TextInput
                value={riderName}
                onChangeText={setRiderName}
                placeholder="Enter rider name"
                placeholderTextColor="#7B8AA3"
                style={styles.handoverRiderInput}
              />
            ) : null}
            <TouchableOpacity
              activeOpacity={0.85}
              style={[
                styles.handoverSaveButton,
                (!handoverTo ||
                  (handoverTo === 'rider' && !toStableValue(riderName))) &&
                  styles.handoverSaveButtonDisabled,
              ]}
              onPress={handleSaveHandover}>
              <Ionicons
                name="save-outline"
                size={16}
                style={styles.handoverSaveButtonIcon}
              />
              <Text style={styles.handoverSaveButtonText}>Save</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}
    </ScrollView>
  );
}
