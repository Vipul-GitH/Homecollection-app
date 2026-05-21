import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
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
import LoadingOverlay from '../../components/common/LoadingOverlay';
import {
  deleteLocalPendingHandoverRowsResponse,
  getLocalPendingHandoverRowsResponse,
} from '../../services/local/panelCatalogLocal';
import {
  fetchAssignedBookingHandoverHistoryApi,
  fetchRiderSuggestionsApi,
  saveAssignedBookingHandoverBatchApi,
} from '../../services/api/bookingApi';

const toStableValue = value =>
  value === null || value === undefined ? '' : String(value).trim();

const getHistoryTubeNames = patient =>
  (
    Array.isArray(patient?.tubes)
      ? patient.tubes
      : Array.isArray(patient?.tube_names)
      ? patient.tube_names
      : []
  )
    .map(tube =>
      typeof tube === 'string'
        ? toStableValue(tube)
        : toStableValue(tube?.tube_name || tube?.tubeName || tube?.name),
    )
    .filter(Boolean);

const getTubeSelectionKey = ({rowKey, bookingId, appointmentId, patientId, tubeName}) =>
  toStableValue(rowKey) ||
  [
    toStableValue(bookingId),
    toStableValue(appointmentId) || 'booking',
    toStableValue(patientId),
    toStableValue(tubeName).toLowerCase(),
  ].join('|');

const toPayloadId = value => {
  const stableValue = toStableValue(value);
  const numericValue = Number(stableValue);

  if (stableValue && Number.isFinite(numericValue)) {
    return numericValue;
  }

  return stableValue;
};

const buildTubeSelection = ({
  bookingId,
  bookingCode,
  appointmentId,
  patientId,
  bookingPatientId,
  patientName,
  tubeName,
  rowKey,
}) => ({
  rowKey: toStableValue(rowKey),
  bookingId: toStableValue(bookingId),
  bookingCode: toStableValue(bookingCode),
  appointmentId: toStableValue(appointmentId),
  patientId: toStableValue(patientId),
  bookingPatientId: toStableValue(bookingPatientId),
  patientKey: `${toStableValue(bookingId)}|${
    toStableValue(appointmentId) || 'booking'
  }|${toStableValue(bookingPatientId || patientId)}`,
  patientName: toStableValue(patientName),
  tubeName: toStableValue(tubeName),
});

const buildHandoverBatchPayload = ({
  selectedTubeKeys,
  handoverTo,
  riderName,
  handedOverAt,
}) => {
  const bookingMap = new Map();
  const selectedEntries = Object.values(selectedTubeKeys).filter(Boolean);

  selectedEntries.forEach(selection => {
    const bookingId = toStableValue(selection?.bookingId);
    const appointmentId = toStableValue(selection?.appointmentId);
    const bookingKey = `${bookingId}|${appointmentId || 'booking'}`;
    const patientKey =
      toStableValue(selection?.bookingPatientId) ||
      toStableValue(selection?.patientId) ||
      toStableValue(selection?.patientKey);
    const tubeName = toStableValue(selection?.tubeName);

    if (!bookingId || !patientKey || !tubeName) {
      return;
    }

    if (!bookingMap.has(bookingKey)) {
      bookingMap.set(bookingKey, {
        booking_id: toPayloadId(selection?.bookingId),
        booking_code: toStableValue(selection?.bookingCode),
        ...(appointmentId ? {appointment_id: toPayloadId(appointmentId)} : {}),
        patientsMap: new Map(),
      });
    }

    const bookingPayload = bookingMap.get(bookingKey);

    if (!bookingPayload.patientsMap.has(patientKey)) {
      bookingPayload.patientsMap.set(patientKey, {
        patient_id: toPayloadId(selection?.patientId),
        booking_patient_id: toPayloadId(selection?.bookingPatientId),
        patient_name: toStableValue(selection?.patientName),
        tubes: [],
      });
    }

    bookingPayload.patientsMap.get(patientKey).tubes.push({
      tube_name: tubeName,
    });
  });

  const bookings = Array.from(bookingMap.values()).map(booking => ({
    booking_id: booking.booking_id,
    ...(booking.appointment_id ? {appointment_id: booking.appointment_id} : {}),
    booking_code: booking.booking_code,
    patients: Array.from(booking.patientsMap.values()),
  }));

  return {
    batch: {
      handover_to: toStableValue(handoverTo),
      rider_name:
        toStableValue(handoverTo) === 'rider' ? toStableValue(riderName) : '',
      handed_over_at: handedOverAt,
      booking_count: bookings.length,
      patient_count: bookings.reduce(
        (total, booking) => total + booking.patients.length,
        0,
      ),
      tube_count: selectedEntries.length,
    },
    bookings,
  };
};

const formatHandoverDate = value => {
  const stableValue = toStableValue(value);

  if (!stableValue) {
    return 'Time N/A';
  }

  const date = new Date(stableValue);

  if (Number.isNaN(date.getTime())) {
    return stableValue;
  }

  return date.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const groupPendingHandoverRows = rows => {
  const bookingMap = new Map();

  (Array.isArray(rows) ? rows : []).forEach(row => {
    const bookingId = toStableValue(row?.booking_id || row?.bookingId);
    const appointmentId = toStableValue(row?.appointment_id || row?.appointmentId);
    const bookingCode = toStableValue(
      row?.booking_code || row?.bookingCode || bookingId,
    );
    const bookingPatientId = toStableValue(
      row?.booking_patient_id || row?.bookingPatientId || row?.patient_id || row?.patientId,
    );
    const patientId = toStableValue(row?.patient_id || row?.patientId || bookingPatientId);
    const patientName = toStableValue(row?.patient_name || row?.patientName);
    const tubeName = toStableValue(row?.tube_name || row?.tubeName);
    const rowKey = toStableValue(row?.row_key || row?.rowKey);
    const completedAt = toStableValue(row?.completed_at || row?.completedAt);

    if (!bookingId || !bookingPatientId || !tubeName || !rowKey) {
      return;
    }

    const bookingKey = `${bookingId}|${appointmentId || 'booking'}`;

    if (!bookingMap.has(bookingKey)) {
      bookingMap.set(bookingKey, {
        id: bookingKey,
        bookingId,
        appointmentId,
        bookingCode,
        displayCode: appointmentId
          ? `${bookingCode || bookingId} / Appointment ${appointmentId}`
          : bookingCode,
        status: 'Completed',
        bookingStatusCode: 3,
        completedAt,
        patientsMap: new Map(),
      });
    }

    const booking = bookingMap.get(bookingKey);

    if (!booking.patientsMap.has(bookingPatientId)) {
      booking.patientsMap.set(bookingPatientId, {
        id: patientId || bookingPatientId,
        patientId,
        bookingPatientId,
        handoverPatientKey: bookingPatientId,
        name: patientName,
        tubes: [],
      });
    }

    booking.patientsMap.get(bookingPatientId).tubes.push({
      tubeName,
      rowKey,
      appointmentId,
    });
  });

  return Array.from(bookingMap.values())
    .map(booking => ({
      ...booking,
      patients: Array.from(booking.patientsMap.values()),
    }))
    .sort((leftItem, rightItem) =>
      toStableValue(rightItem.completedAt).localeCompare(
        toStableValue(leftItem.completedAt),
      ),
    );
};

export default function HandoverScreen({
  styles,
  accessToken = '',
  loggedInUser = '',
}) {
  const [activeHandoverTab, setActiveHandoverTab] = useState('pending');
  const [expandedBookings, setExpandedBookings] = useState({});
  const [expandedHistoryBatches, setExpandedHistoryBatches] = useState({});
  const [pendingHandoverRows, setPendingHandoverRows] = useState([]);
  const [isLoadingPendingHandoverRows, setIsLoadingPendingHandoverRows] =
    useState(true);
  const [selectedTubeKeys, setSelectedTubeKeys] = useState({});
  const [handoverTo, setHandoverTo] = useState('');
  const [riderName, setRiderName] = useState('');
  const [riderSuggestions, setRiderSuggestions] = useState([]);
  const [isLoadingRiderSuggestions, setIsLoadingRiderSuggestions] =
    useState(false);
  const [isSavingHandover, setIsSavingHandover] = useState(false);
  const [handoverHistory, setHandoverHistory] = useState([]);
  const [isLoadingHandoverHistory, setIsLoadingHandoverHistory] =
    useState(false);
  const [handoverHistoryError, setHandoverHistoryError] = useState('');
  const initializedSelectionSignatureRef = useRef('');
  const handoverUserKey = useMemo(
    () => toStableValue(loggedInUser),
    [loggedInUser],
  );

  const loadPendingHandoverRows = useCallback(async () => {
    if (!handoverUserKey) {
      setPendingHandoverRows([]);
      setIsLoadingPendingHandoverRows(false);
      return;
    }

    try {
      setIsLoadingPendingHandoverRows(true);
      const response = await getLocalPendingHandoverRowsResponse(handoverUserKey);
      setPendingHandoverRows(Array.isArray(response?.items) ? response.items : []);
    } catch (error) {
      setPendingHandoverRows([]);
    } finally {
      setIsLoadingPendingHandoverRows(false);
    }
  }, [handoverUserKey]);

  const loadHandoverHistory = useCallback(async () => {
    if (!toStableValue(accessToken)) {
      setHandoverHistory([]);
      return;
    }

    try {
      setIsLoadingHandoverHistory(true);
      setHandoverHistoryError('');
      const historyItems = await fetchAssignedBookingHandoverHistoryApi({
        accessToken,
        limit: 50,
        offset: 0,
      });
      setHandoverHistory(Array.isArray(historyItems) ? historyItems : []);
    } catch (error) {
      setHandoverHistoryError(
        error?.message || 'Unable to load handover history right now.',
      );
    } finally {
      setIsLoadingHandoverHistory(false);
    }
  }, [accessToken]);

  useEffect(() => {
    loadPendingHandoverRows();
  }, [loadPendingHandoverRows]);

  useEffect(() => {
    if (activeHandoverTab === 'done') {
      loadHandoverHistory();
    }
  }, [activeHandoverTab, loadHandoverHistory]);

  useEffect(() => {
    const query = toStableValue(riderName);

    if (handoverTo !== 'rider' || query.length < 2 || !toStableValue(accessToken)) {
      setRiderSuggestions([]);
      setIsLoadingRiderSuggestions(false);
      return undefined;
    }

    let isActive = true;
    const timeoutId = setTimeout(async () => {
      try {
        setIsLoadingRiderSuggestions(true);
        const suggestions = await fetchRiderSuggestionsApi({
          accessToken,
          query,
          limit: 8,
        });

        if (!isActive) {
          return;
        }

        setRiderSuggestions(
          suggestions.filter(
            suggestion =>
              toStableValue(suggestion?.name).toLowerCase() !==
              query.toLowerCase(),
          ),
        );
      } catch (error) {
        if (isActive) {
          setRiderSuggestions([]);
        }
      } finally {
        if (isActive) {
          setIsLoadingRiderSuggestions(false);
        }
      }
    }, 300);

    return () => {
      isActive = false;
      clearTimeout(timeoutId);
    };
  }, [accessToken, handoverTo, riderName]);

  const handoverBookings = useMemo(
    () => groupPendingHandoverRows(pendingHandoverRows),
    [pendingHandoverRows],
  );

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

  const handoverLoadingOverlayVisible =
    isSavingHandover ||
    (activeHandoverTab === 'pending' &&
      isLoadingPendingHandoverRows &&
      !handoverBookings.length) ||
    (activeHandoverTab === 'done' &&
      isLoadingHandoverHistory &&
      !handoverHistory.length);
  const handoverLoadingOverlayCopy = isSavingHandover
    ? {
        title: 'Saving Handover',
        message: 'Sending the selected tubes and finalizing this handover...',
      }
    : activeHandoverTab === 'done'
    ? {
        title: 'Loading Handover Done',
        message: 'Fetching the completed handover history...',
      }
    : {
        title: 'Loading Pending Handover',
        message: 'Preparing the pending handover tubes from local data...',
      };

  const handoverSelectionSignature = useMemo(
    () =>
      handoverBookings
        .map(booking =>
          [
            toStableValue(booking?.id),
            toStableValue(booking?.bookingId),
            toStableValue(booking?.appointmentId),
            ...(Array.isArray(booking?.patients) ? booking.patients : []).flatMap(
              patient =>
                (Array.isArray(patient?.tubes) ? patient.tubes : []).map(tube =>
                  getTubeSelectionKey({
                    rowKey: tube?.rowKey,
                    bookingId: booking?.bookingId || booking?.id,
                    appointmentId: booking?.appointmentId,
                    patientId: patient?.handoverPatientKey,
                    tubeName: tube?.tubeName,
                  }),
                ),
            ),
          ].join('|'),
        )
        .join('||'),
    [handoverBookings],
  );

  useEffect(() => {
    if (!handoverSelectionSignature) {
      initializedSelectionSignatureRef.current = '';
      setSelectedTubeKeys({});
      return;
    }

    if (initializedSelectionSignatureRef.current === handoverSelectionSignature) {
      return;
    }

    const nextSelectedTubeKeys = {};

    handoverBookings.forEach(booking => {
      (Array.isArray(booking?.patients) ? booking.patients : []).forEach(patient => {
        (Array.isArray(patient?.tubes) ? patient.tubes : []).forEach(tube => {
          const selectionKey = getTubeSelectionKey({
            rowKey: tube?.rowKey,
            bookingId: booking?.bookingId || booking?.id,
            appointmentId: booking?.appointmentId,
            patientId: patient?.handoverPatientKey,
            tubeName: tube?.tubeName,
          });

          nextSelectedTubeKeys[selectionKey] = buildTubeSelection({
            bookingId: booking?.bookingId || booking?.id,
            bookingCode: booking?.bookingCode,
            appointmentId: booking?.appointmentId,
            patientId: patient?.patientId,
            bookingPatientId: patient?.bookingPatientId,
            patientName: patient?.name,
            tubeName: tube?.tubeName,
            rowKey: tube?.rowKey,
          });
        });
      });
    });

    initializedSelectionSignatureRef.current = handoverSelectionSignature;
    setSelectedTubeKeys(nextSelectedTubeKeys);
  }, [handoverBookings, handoverSelectionSignature]);

  const toggleExpanded = bookingId => {
    setExpandedBookings(previousState => ({
      ...previousState,
      [bookingId]: !previousState[bookingId],
    }));
  };

  const toggleHistoryExpanded = historyId => {
    setExpandedHistoryBatches(previousState => ({
      ...previousState,
      [historyId]: !previousState[historyId],
    }));
  };

  const handleSelectRiderSuggestion = suggestion => {
    setRiderName(toStableValue(suggestion?.name));
    setRiderSuggestions([]);
  };

  const toggleTubeSelection = ({
    bookingId,
    bookingCode,
    appointmentId,
    patientId,
    bookingPatientId,
    patientName,
    tubeName,
    rowKey,
  }) => {
    const selectionKey = getTubeSelectionKey({
      rowKey,
      bookingId,
      appointmentId,
      patientId: bookingPatientId || patientId,
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
        [selectionKey]: buildTubeSelection({
          bookingId,
          bookingCode,
          appointmentId,
          patientId,
          bookingPatientId,
          patientName,
          tubeName,
          rowKey,
        }),
      };
    });
  };

  const handleSaveHandover = () => {
    if (isSavingHandover || !handoverSummary.selectedTubeCount) {
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

    if (!toStableValue(accessToken)) {
      Alert.alert('Session Required', 'Please login again before saving handover.');
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
            const handedOverAt = new Date().toISOString();
            const handoverPayload = buildHandoverBatchPayload({
              selectedTubeKeys,
              handoverTo,
              riderName,
              handedOverAt,
            });
            const selectedRowKeys = Object.values(selectedTubeKeys)
              .map(selection => toStableValue(selection?.rowKey))
              .filter(Boolean);

            try {
              setIsSavingHandover(true);
              await saveAssignedBookingHandoverBatchApi({
                accessToken,
                payload: handoverPayload,
              });
              await deleteLocalPendingHandoverRowsResponse(selectedRowKeys);
              setPendingHandoverRows(previousRows =>
                previousRows.filter(row => {
                  const rowKey = toStableValue(row?.row_key || row?.rowKey);
                  return !selectedRowKeys.includes(rowKey);
                }),
              );
              setSelectedTubeKeys({});
              setHandoverTo('');
              setRiderName('');
              setActiveHandoverTab('done');
              loadHandoverHistory();
              Alert.alert(
                'Handover Saved',
                'Selected sample tubes have been saved and removed from pending handover.',
              );
            } catch (error) {
              Alert.alert(
                'Handover Save Failed',
                error?.message || 'Unable to save handover right now.',
              );
            } finally {
              setIsSavingHandover(false);
            }
          },
        },
      ],
    );
  };

  const renderTabs = () => (
    <View style={styles.handoverTabBar}>
      {[
        {key: 'pending', label: 'Pending Handover'},
        {key: 'done', label: 'Handover Done'},
      ].map(tab => {
        const isActive = activeHandoverTab === tab.key;

        return (
          <TouchableOpacity
            key={`handover-tab-${tab.key}`}
            activeOpacity={0.85}
            style={[
              styles.handoverTabButton,
              isActive && styles.handoverTabButtonActive,
            ]}
            onPress={() => setActiveHandoverTab(tab.key)}>
            <Text
              style={[
                styles.handoverTabButtonText,
                isActive && styles.handoverTabButtonTextActive,
              ]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );

  const renderPendingContent = () => {
    if (isLoadingPendingHandoverRows && !handoverBookings.length) {
      return (
        <View style={styles.comingSoonCard}>
          <ActivityIndicator color={BRAND.primaryStrong} size="small" />
          <Text style={styles.comingSoonTitle}>Loading handover list...</Text>
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
      <>
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
                    <Text style={styles.handoverSummaryTubeCount}>x{item.count}</Text>
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
                <View style={styles.handoverRiderInputWrap}>
                  <TextInput
                    value={riderName}
                    onChangeText={setRiderName}
                    placeholder="Enter rider name"
                    placeholderTextColor="#7B8AA3"
                    style={styles.handoverRiderInput}
                  />
                  {isLoadingRiderSuggestions ? (
                    <View style={styles.handoverRiderSuggestionStatus}>
                      <ActivityIndicator color={BRAND.primaryStrong} size="small" />
                      <Text style={styles.handoverRiderSuggestionStatusText}>
                        Searching riders...
                      </Text>
                    </View>
                  ) : null}
                  {riderSuggestions.length ? (
                    <View style={styles.handoverRiderSuggestionList}>
                      {riderSuggestions.map((suggestion, index) => (
                        <TouchableOpacity
                          key={`rider-${suggestion.id || suggestion.name}-${index}`}
                          activeOpacity={0.85}
                          style={styles.handoverRiderSuggestionItem}
                          onPress={() => handleSelectRiderSuggestion(suggestion)}>
                          <Ionicons
                            name="bicycle-outline"
                            size={14}
                            style={styles.handoverRiderSuggestionIcon}
                          />
                          <Text style={styles.handoverRiderSuggestionName}>
                            {suggestion.name}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  ) : null}
                </View>
              ) : null}
              <TouchableOpacity
                activeOpacity={0.85}
                style={[
                  styles.handoverSaveButton,
                  (!handoverTo ||
                    isSavingHandover ||
                    (handoverTo === 'rider' && !toStableValue(riderName))) &&
                    styles.handoverSaveButtonDisabled,
                ]}
                disabled={isSavingHandover}
                onPress={handleSaveHandover}>
                {isSavingHandover ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Ionicons
                    name="save-outline"
                    size={16}
                    style={styles.handoverSaveButtonIcon}
                  />
                )}
                <Text style={styles.handoverSaveButtonText}>
                  {isSavingHandover ? 'Saving...' : 'Save'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}

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
                    {booking?.displayCode || booking?.bookingCode || booking?.bookingId || 'Booking'}
                  </Text>
                  <Text style={styles.handoverBookingMeta}>
                    {formatHandoverDate(booking?.completedAt)} | {patients.length}{' '}
                    patient{patients.length === 1 ? '' : 's'}
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
                    const patientTubes = Array.isArray(patient?.tubes) ? patient.tubes : [];
                    const patientKey = patient?.handoverPatientKey || index;

                    return (
                      <View
                        key={`handover-patient-${booking.id}-${patient?.bookingPatientId || index}`}
                        style={styles.handoverPatientCard}>
                        <View style={styles.handoverPatientHeader}>
                          <View style={styles.handoverPatientHeaderText}>
                            <Text style={styles.handoverPatientName}>
                              {patient?.name || `Patient ${index + 1}`}
                            </Text>
                          </View>
                          <Text style={styles.handoverPatientTubeCount}>
                            {patientTubes.length} tube{patientTubes.length === 1 ? '' : 's'}
                          </Text>
                        </View>
                        {patientTubes.length ? (
                          <View style={styles.handoverTubeRow}>
                            {patientTubes.map(tube => {
                              const tubeName = toStableValue(tube?.tubeName);
                              const selectionKey = getTubeSelectionKey({
                                rowKey: tube?.rowKey,
                                bookingId: booking?.bookingId || booking?.id,
                                appointmentId: booking?.appointmentId,
                                patientId: patientKey,
                                tubeName,
                              });
                              const isSelected = Boolean(selectedTubeKeys[selectionKey]);

                              return (
                                <TouchableOpacity
                                  key={`${selectionKey}`}
                                  activeOpacity={0.85}
                                  style={[
                                    styles.handoverTubeChip,
                                    isSelected && styles.handoverTubeChipActive,
                                  ]}
                                  onPress={() =>
                                    toggleTubeSelection({
                                      bookingId: booking?.bookingId || booking?.id,
                                      bookingCode: booking?.bookingCode,
                                      appointmentId: booking?.appointmentId,
                                      patientId: patient?.patientId,
                                      bookingPatientId: patient?.bookingPatientId,
                                      patientName:
                                        patient?.name || `Patient ${index + 1}`,
                                      tubeName,
                                      rowKey: tube?.rowKey,
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
      </>
    );
  };

  const renderDoneContent = () => {
    if (isLoadingHandoverHistory && !handoverHistory.length) {
      return (
        <View style={styles.comingSoonCard}>
          <ActivityIndicator color={BRAND.primaryStrong} size="small" />
          <Text style={styles.comingSoonTitle}>Loading handover history...</Text>
        </View>
      );
    }

    if (handoverHistoryError && !handoverHistory.length) {
      return (
        <View style={styles.comingSoonCard}>
          <View style={styles.comingSoonIconWrap}>
            <Ionicons
              name="alert-circle-outline"
              size={30}
              style={styles.comingSoonIcon}
            />
          </View>
          <Text style={styles.comingSoonTitle}>Unable to load history</Text>
          <Text style={styles.comingSoonText}>{handoverHistoryError}</Text>
          <TouchableOpacity
            activeOpacity={0.85}
            style={styles.sampleCollectionSubmitButton}
            onPress={loadHandoverHistory}>
            <Text style={styles.sampleCollectionSubmitText}>Retry</Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (!handoverHistory.length) {
      return (
        <View style={styles.comingSoonCard}>
          <View style={styles.comingSoonIconWrap}>
            <Ionicons
              name="checkmark-done-outline"
              size={30}
              style={styles.comingSoonIcon}
            />
          </View>
          <Text style={styles.comingSoonTitle}>No handover done yet</Text>
          <Text style={styles.comingSoonText}>
            Saved handover batches will appear here.
          </Text>
        </View>
      );
    }

    return (
      <>
        {isLoadingHandoverHistory ? (
          <View style={styles.handoverHistoryRefreshRow}>
            <ActivityIndicator color={BRAND.primaryStrong} size="small" />
            <Text style={styles.handoverHistoryRefreshText}>Refreshing...</Text>
          </View>
        ) : null}
        {handoverHistory.map((item, index) => {
          const historyId = toStableValue(item?.id || index);
          const batchId = toStableValue(
            item?.id || item?.batch_id || item?.batchId,
          );
          const isExpanded = Boolean(expandedHistoryBatches[historyId]);
          const handoverToLabel =
            toStableValue(item?.handoverTo).toLowerCase() === 'rider'
              ? 'Rider'
              : 'Lab';
          const groupedBookings = Array.isArray(item?.bookings) && item.bookings.length
            ? item.bookings
            : (() => {
                const bookingMap = new Map();
                const patients = Array.isArray(item?.patients) ? item.patients : [];
                const tubes = Array.isArray(item?.tubes) ? item.tubes : [];

                patients.forEach(patient => {
                  const bookingId = toStableValue(patient?.booking_id || patient?.bookingId);
                  if (!bookingId) {
                    return;
                  }

                  if (!bookingMap.has(bookingId)) {
                    bookingMap.set(bookingId, {
                      booking_id: bookingId,
                      booking_code:
                        toStableValue(patient?.booking_code || patient?.bookingCode) ||
                        bookingId,
                      patientsMap: new Map(),
                    });
                  }

                  const booking = bookingMap.get(bookingId);
                  const patientKey = toStableValue(
                    patient?.booking_patient_id ||
                      patient?.bookingPatientId ||
                      patient?.patient_id ||
                      patient?.patientId,
                  );

                  if (!patientKey) {
                    return;
                  }

                  if (!booking.patientsMap.has(patientKey)) {
                    booking.patientsMap.set(patientKey, {
                      patient_id: patient?.patient_id || patient?.patientId,
                      booking_patient_id:
                        patient?.booking_patient_id || patient?.bookingPatientId,
                      patient_name:
                        patient?.patient_name || patient?.patientName || '',
                      tube_names: [],
                    });
                  }
                });

                tubes.forEach(tube => {
                  const bookingId = toStableValue(tube?.booking_id || tube?.bookingId);
                  const patientKey = toStableValue(
                    tube?.booking_patient_id ||
                      tube?.bookingPatientId ||
                      tube?.patient_id ||
                      tube?.patientId,
                  );
                  const tubeName = toStableValue(tube?.tube_name || tube?.tubeName);

                  if (!bookingId || !patientKey || !tubeName) {
                    return;
                  }

                  if (!bookingMap.has(bookingId)) {
                    bookingMap.set(bookingId, {
                      booking_id: bookingId,
                      booking_code:
                        toStableValue(tube?.booking_code || tube?.bookingCode) ||
                        bookingId,
                      patientsMap: new Map(),
                    });
                  }

                  const booking = bookingMap.get(bookingId);
                  if (!booking.patientsMap.has(patientKey)) {
                    booking.patientsMap.set(patientKey, {
                      patient_id: tube?.patient_id || tube?.patientId,
                      booking_patient_id:
                        tube?.booking_patient_id || tube?.bookingPatientId,
                      patient_name:
                        tube?.patient_name || tube?.patientName || '',
                      tube_names: [],
                    });
                  }

                  booking.patientsMap.get(patientKey).tube_names.push(tubeName);
                });

                return Array.from(bookingMap.values()).map(booking => ({
                  booking_id: booking.booking_id,
                  booking_code: booking.booking_code,
                  patients: Array.from(booking.patientsMap.values()),
                }));
              })();
          const derivedPatientCount = groupedBookings.reduce(
            (total, booking) =>
              total + (Array.isArray(booking?.patients) ? booking.patients.length : 0),
            0,
          );
          const derivedBookingCount =
            item?.bookingCount ||
            (Array.isArray(item?.bookingIds) ? item.bookingIds.length : 0) ||
            groupedBookings.length ||
            0;

          return (
            <View
              key={`handover-history-${historyId}`}
              style={styles.handoverHistoryCard}>
              <TouchableOpacity
                activeOpacity={0.85}
                style={styles.handoverBookingHeader}
                onPress={() => toggleHistoryExpanded(historyId)}>
                <View style={styles.handoverBookingHeaderText}>
                  <Text style={styles.handoverBookingCode}>
                    {handoverToLabel}
                    {item?.riderName ? ` - ${item.riderName}` : ''}
                  </Text>
                  <Text style={styles.handoverBookingMeta}>
                    {batchId ? `batch-${batchId} | ` : ''}
                    {formatHandoverDate(item?.handedOverAt)}
                  </Text>
                </View>
                <View style={styles.handoverHistoryCountRow}>
                  <Text style={styles.handoverHistoryCountText}>
                    {item?.tubeCount || 0} tubes
                  </Text>
                </View>
                <Ionicons
                  name={isExpanded ? 'chevron-up' : 'chevron-down'}
                  size={18}
                  style={styles.sampleCollectionSpecimenChevron}
                />
              </TouchableOpacity>

              <View style={styles.handoverHistoryStatsRow}>
                <View style={styles.handoverHistoryStatPill}>
                  <Text style={styles.handoverHistoryStatText}>
                    {derivedBookingCount} bookings
                  </Text>
                </View>
                <View style={styles.handoverHistoryStatPill}>
                  <Text style={styles.handoverHistoryStatText}>
                    {item?.patientCount || derivedPatientCount || 0} patients
                  </Text>
                </View>
              </View>

              {isExpanded ? (
                <View style={styles.handoverPatientList}>
                  {groupedBookings.length ? (
                    groupedBookings.map((booking, bookingIndex) => (
                      <View
                        key={`history-booking-${historyId}-${bookingIndex}`}
                        style={styles.handoverHistoryBookingBlock}>
                        <Text style={styles.handoverPatientName}>
                          {booking?.booking_code ||
                            booking?.bookingCode ||
                            booking?.booking_id ||
                            `Booking ${bookingIndex + 1}`}
                        </Text>
                        {(Array.isArray(booking?.patients) ? booking.patients : []).map(
                          (patient, patientIndex) => {
                            const tubeNames = getHistoryTubeNames(patient);

                            return (
                              <View
                                key={`history-patient-${historyId}-${bookingIndex}-${patientIndex}`}
                                style={styles.handoverHistoryPatientRow}>
                                <Text style={styles.handoverPatientMeta}>
                                  {patient?.patient_name ||
                                    patient?.patientName ||
                                    `Patient ${patientIndex + 1}`}
                                </Text>
                                {tubeNames.length ? (
                                  <View style={styles.handoverTubeRow}>
                                    {tubeNames.map(tubeName => (
                                      <View
                                        key={`history-tube-${historyId}-${bookingIndex}-${patientIndex}-${tubeName}`}
                                        style={styles.handoverHistoryTubeChip}>
                                        <Text style={styles.handoverTubeChipText}>
                                          {tubeName}
                                        </Text>
                                      </View>
                                    ))}
                                  </View>
                                ) : null}
                              </View>
                            );
                          },
                        )}
                      </View>
                    ))
                  ) : (
                    <Text style={styles.handoverEmptyTubeText}>
                      No booking details available for this handover.
                    </Text>
                  )}
                </View>
              ) : null}
            </View>
          );
        })}
      </>
    );
  };

  return (
    <>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.handoverScreenContent}>
        {renderTabs()}
        {activeHandoverTab === 'pending'
          ? renderPendingContent()
          : renderDoneContent()}
      </ScrollView>
      <LoadingOverlay
        styles={styles}
        visible={handoverLoadingOverlayVisible}
        title={handoverLoadingOverlayCopy.title}
        message={handoverLoadingOverlayCopy.message}
      />
    </>
  );
}
