import {useCallback, useEffect, useRef, useState} from 'react';
import {Alert, AppState} from 'react-native';
import GetLocation from 'react-native-get-location';
import {
  addAssignedBookingPatientApi,
  cancelAssignedBookingPatientApi,
  fetchAssignedBookingDetailApi,
  fetchAssignedBookingHistoryDetailApi,
  fetchAssignedBookingHistoryApi,
  fetchAssignedBookingsApi,
  fetchPanelCatalogByCompanyApi,
  fetchMatchedPanelCompaniesForPatientApi,
  updateAssignedBookingAddressApi,
  updateAssignedBookingPatientApi,
  updateAssignedBookingStatusApi,
} from '../services/api/bookingApi';
import {
  clearOfflineBookingViewCache,
  getCachedAssignedBookings,
  getCachedBookingDetail,
  getCachedCompletedBookings,
  getPendingBookingActions,
  getPendingOfflineActionCount,
  getPendingPatientActions,
  persistAssignedBookings,
  persistBookingDetail,
  persistCompletedBookings,
  removeCachedBookingDetail,
  removeCachedAssignedBooking,
  queuePendingBookingAction,
  queuePendingPatientAction,
  removeMatchingPendingBookingActions,
  removePendingBookingAction,
  removePendingPatientAction,
  updatePendingBookingAction,
  updatePendingPatientAction,
  updateCachedBookingPatients,
  updateCachedBookingStatus,
} from '../services/storage/offlineBookingStorage';
import {
  getStatusCodeFromAction,
  getStatusFromAction,
  isLikelyOfflineError,
} from '../utils/app/runtimeHelpers';
import {logDebug, warnDebug} from '../utils/app/logger';
import {showPlatformMessage} from '../utils/ui/notifications';
import {
  getLocalMatchedPanelCompaniesResponse,
  getLocalPanelCatalogByCompanyResponse,
} from '../services/local/panelCatalogLocal';
import {
  getLastKnownGeoCapture,
  persistLastKnownGeoCapture,
} from '../utils/location/lastKnownGeoCapture';

const formatStatusActionTime = (date = new Date()) => {
  let hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const suffix = hours >= 12 ? 'pm' : 'am';
  hours %= 12;
  if (hours === 0) {
    hours = 12;
  }

  return `${hours}:${minutes} ${suffix}`;
};

const formatStatusActionLocation = location => {
  const latitude = Number(location?.latitude);
  const longitude = Number(location?.longitude);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return '';
  }

  return `${latitude}, ${longitude}`;
};

const STATUS_ACTION_LOCATION_WAIT_MS = 3000;
const FOREGROUND_LOCATION_REFRESH_COOLDOWN_MS = 15 * 60 * 1000;

const getStatusActionFieldPrefix = action => {
  const normalizedAction = String(action || '').trim().toLowerCase();

  if (
    normalizedAction !== 'start' &&
    normalizedAction !== 'stop' &&
    normalizedAction !== 'cancel' &&
    normalizedAction !== 'cancelled' &&
    normalizedAction !== 'complete' &&
    normalizedAction !== 'completed'
  ) {
    return '';
  }
  return normalizedAction === 'cancel' ||
    normalizedAction === 'cancelled' ||
    normalizedAction === 'complete' ||
    normalizedAction === 'completed'
    ? 'complete'
    : normalizedAction;
};

const buildStatusActionMetaPayload = action => {
  const fieldPrefix = getStatusActionFieldPrefix(action);

  if (!fieldPrefix) {
    return {};
  }

  return {
    [`${fieldPrefix}_time`]: formatStatusActionTime(),
  };
};

const buildStatusActionLocationPayload = async action => {
  const fieldPrefix = getStatusActionFieldPrefix(action);

  if (!fieldPrefix) {
    return {};
  }

  try {
    const location = await GetLocation.getCurrentPosition({
      enableHighAccuracy: true,
    });
    const locationText = formatStatusActionLocation(location);

    if (locationText) {
      await persistLastKnownGeoCapture({
        latitude: location.latitude,
        longitude: location.longitude,
      });
      return {
        [`${fieldPrefix}_location`]: locationText,
      };
    }
  } catch (error) {
    warnDebug('Booking status location capture warning:', error);
  }

  return {};
};

const buildLastKnownStatusActionLocationPayload = async action => {
  const fieldPrefix = getStatusActionFieldPrefix(action);

  if (!fieldPrefix) {
    return {};
  }

  try {
    const lastKnownGeoCapture = await getLastKnownGeoCapture();
    const locationText = formatStatusActionLocation(lastKnownGeoCapture);

    if (locationText) {
      return {
        [`${fieldPrefix}_location`]: locationText,
      };
    }
  } catch (error) {
    warnDebug('Booking status last known location fallback warning:', error);
  }

  return {};
};

const refreshLastKnownLocationSnapshot = async () => {
  const location = await GetLocation.getCurrentPosition({
    enableHighAccuracy: true,
  });

  await persistLastKnownGeoCapture({
    latitude: location?.latitude,
    longitude: location?.longitude,
  });
};

const resolveStatusActionMetaPayload = async action => {
  const startedAt = Date.now();
  const payload = buildStatusActionMetaPayload(action);
  const fieldPrefix = getStatusActionFieldPrefix(action);

  if (!fieldPrefix) {
    return payload;
  }

  try {
    const locationPayload = await Promise.race([
      buildStatusActionLocationPayload(action),
      new Promise(resolve => {
        setTimeout(() => resolve(null), STATUS_ACTION_LOCATION_WAIT_MS);
      }),
    ]);

    if (!locationPayload || !Object.keys(locationPayload).length) {
      const fallbackLocationPayload =
        await buildLastKnownStatusActionLocationPayload(action);

      return fallbackLocationPayload && Object.keys(fallbackLocationPayload).length
        ? {
            ...payload,
            ...fallbackLocationPayload,
          }
        : payload;
    }

    return locationPayload
      ? {
          ...payload,
          ...locationPayload,
        }
      : payload;
  } catch (error) {
    warnDebug('Booking status meta payload resolution warning:', error);
    return payload;
  }
};

const toDisplayValue = value => {
  if (value === null || value === undefined) {
    return '';
  }

  return String(value).trim();
};

const toPatientAge = value => {
  const normalizedValue = toDisplayValue(value);
  return normalizedValue || 'N/A';
};

const toPatientStatusCode = value => {
  const normalizedValue = Number(value);
  return Number.isFinite(normalizedValue) ? normalizedValue : 0;
};

const buildLocalPatientFromPayload = ({
  patient,
  existingPatient,
  patientId,
  isOfflinePending,
}) => {
  const linkedPatient = patient?.linked_patient || patient?.linkedPatient || {};

  return {
    ...existingPatient,
    id: existingPatient?.id || toDisplayValue(patientId),
    bookingPatientId:
      existingPatient?.bookingPatientId || toDisplayValue(patientId) || '',
    patientId:
      toDisplayValue(patient?.existing_patient_id || linkedPatient?.id) ||
      existingPatient?.patientId ||
      '',
    title:
      toDisplayValue(patient?.title || linkedPatient?.title) ||
      existingPatient?.title ||
      'Mr',
    name:
      toDisplayValue(patient?.full_name || linkedPatient?.name) ||
      existingPatient?.name ||
      'Unsynced Patient',
    age: toPatientAge(patient?.age_years ?? linkedPatient?.age ?? existingPatient?.age),
    dob:
      toDisplayValue(patient?.date_of_birth || linkedPatient?.dob) ||
      existingPatient?.dob ||
      'N/A',
    panelCompany:
      toDisplayValue(patient?.panel_company || linkedPatient?.panelCompany) ||
      existingPatient?.panelCompany ||
      'N/A',
    selectedCompCatIds:
      toDisplayValue(patient?.selected_comp_cat_ids) ||
      existingPatient?.selectedCompCatIds ||
      '',
    selectedChargeModes:
      toDisplayValue(patient?.selected_charge_modes) ||
      existingPatient?.selectedChargeModes ||
      '',
    selectedPanelCompanies:
      toDisplayValue(patient?.selected_panel_companies) ||
      existingPatient?.selectedPanelCompanies ||
      '',
    compCatId:
      toDisplayValue(patient?.selected_comp_cat_ids)
        .split(',')
        .map(value => value.trim())
        .find(Boolean) ||
      toDisplayValue(patient?.comp_cat_id || patient?.compCatId) ||
      existingPatient?.compCatId ||
      existingPatient?.comp_cat_id ||
      '',
    mobileNumber:
      toDisplayValue(
        patient?.contact_mobile ||
          patient?.primary_mobile ||
          linkedPatient?.mobileNumber,
      ) ||
      existingPatient?.mobileNumber ||
      'N/A',
    alternateMobileNumber:
      toDisplayValue(
        patient?.alternate_mobile || linkedPatient?.alternateMobileNumber,
      ) ||
      existingPatient?.alternateMobileNumber ||
      'N/A',
    email: toDisplayValue(patient?.email) || existingPatient?.email || '',
    labmatePid:
      toDisplayValue(patient?.labmate_pid || linkedPatient?.patientCode) ||
      existingPatient?.labmatePid ||
      '',
    reportCourier:
      patient?.report_courier === true ||
      String(patient?.report_courier || '').trim().toLowerCase() === 'yes'
        ? 'Yes'
        : 'No',
    bookingPatientStatusCode: toPatientStatusCode(
      existingPatient?.bookingPatientStatusCode ?? 1,
    ),
    gender:
      toDisplayValue(patient?.gender || linkedPatient?.gender) ||
      existingPatient?.gender ||
      'N/A',
    tag:
      toDisplayValue(patient?.tag || linkedPatient?.tag) ||
      existingPatient?.tag ||
      'N/A',
    tests: existingPatient?.tests || [],
    tubes: existingPatient?.tubes || [],
    documents: existingPatient?.documents || [],
    isOfflinePending: Boolean(isOfflinePending),
  };
};

const getPatientMutationId = patient =>
  toDisplayValue(
    patient?.bookingPatientId ||
      patient?.booking_patient_id ||
      patient?.patientId ||
      patient?.patient_id ||
      patient?.id,
  );

const doesPatientMatchId = (patient, patientId) => {
  const normalizedPatientId = toDisplayValue(patientId);

  if (!normalizedPatientId) {
    return false;
  }

  return [
    patient?.bookingPatientId,
    patient?.booking_patient_id,
    patient?.patientId,
    patient?.patient_id,
    patient?.id,
  ]
    .map(toDisplayValue)
    .filter(Boolean)
    .includes(normalizedPatientId);
};

const resolveBookingRoutingMeta = booking => {
  const appointmentId =
    booking?.appointmentId || booking?.appointment_id || '';
  const sourceTypeRaw = booking?.sourceType || booking?.source_type || '';
  const normalizedSourceType = String(sourceTypeRaw).trim().toUpperCase();

  return {
    appointmentId,
    sourceType: normalizedSourceType || (appointmentId ? 'APPOINTMENT' : 'BOOKING'),
  };
};

const isStartedBooking = booking =>
  Number(booking?.bookingStatusCode) === 2 ||
  String(booking?.status || '').trim().toLowerCase() === 'started';

const isSameBooking = (leftBooking, rightBooking) =>
  String(leftBooking?.id || '') === String(rightBooking?.id || '');

const getBookingDisplayCode = booking =>
  toDisplayValue(booking?.bookingCode || booking?.booking_code || booking?.id) ||
  'the active booking';

const isReloginRequiredError = error => {
  const message = String(error?.message || '')
    .trim()
    .toLowerCase();

  return (
    message.includes('token is invalidated') ||
    message.includes('invalid authentication credentials') ||
    message.includes('invalid or expired token') ||
    message.includes('session has expired') ||
    message.includes('please login again') ||
    message.includes('please log in again') ||
    message.includes('unauthorized')
  );
};

const isAssignedBookingNotFoundError = error =>
  String(error?.message || '')
    .trim()
    .toLowerCase()
    .includes('not found');

const isTerminalBookingAction = action =>
  ['complete', 'completed', 'cancel', 'cancelled'].includes(
    String(action || '').trim().toLowerCase(),
  );

const isPermanentPendingBookingActionError = error => {
  const status = Number(error?.status || error?.responseStatus || 0);

  return status === 400 || status === 404 || status === 409;
};

const MAX_ASSIGNED_BOOKING_DETAIL_WARM_CACHE = 1;

const selectBookingsForWarmCache = bookings => {
  const sourceBookings = Array.isArray(bookings) ? bookings : [];
  const prioritizedBookings = [];
  const seenBookingIds = new Set();

  const appendBooking = booking => {
    const bookingId = String(booking?.id || '').trim();

    if (!bookingId || seenBookingIds.has(bookingId)) {
      return;
    }

    seenBookingIds.add(bookingId);
    prioritizedBookings.push(booking);
  };

  sourceBookings.filter(isStartedBooking).forEach(appendBooking);

  return prioritizedBookings.slice(0, MAX_ASSIGNED_BOOKING_DETAIL_WARM_CACHE);
};

export const useAssignedBookings = ({
  accessToken,
  loggedInUser,
  onSessionExpired,
}) => {
  const [assignedAppointments, setAssignedAppointments] = useState([]);
  const [isLoadingAssignedAppointments, setIsLoadingAssignedAppointments] =
    useState(false);
  const [assignedAppointmentsError, setAssignedAppointmentsError] =
    useState('');
  const [completedAppointments, setCompletedAppointments] = useState([]);
  const [isLoadingCompletedAppointments, setIsLoadingCompletedAppointments] =
    useState(false);
  const [completedAppointmentsError, setCompletedAppointmentsError] =
    useState('');
  const [loadingAssignedBookingId, setLoadingAssignedBookingId] = useState('');
  const [bookingActionLoading, setBookingActionLoading] = useState('');
  const [bookingActionProgressLabel, setBookingActionProgressLabel] = useState('');
  const [isAddingPatient, setIsAddingPatient] = useState(false);
  const [isUpdatingPatient, setIsUpdatingPatient] = useState(false);
  const [cancellingPatientId, setCancellingPatientId] = useState('');
  const [addingTestPatientId, setAddingTestPatientId] = useState('');
  const panelCompanyCatalogCacheRef = useRef(new Map());
  const matchedPanelCompanyCacheRef = useRef(new Map());
  const isPendingOfflineSyncRunningRef = useRef(false);
  const inFlightBookingActionKeysRef = useRef(new Set());
  const inFlightBookingDetailRequestsRef = useRef(new Map());
  const isHandlingSessionExpiryRef = useRef(false);
  const lastForegroundLocationRefreshAtRef = useRef(0);
  const isForegroundLocationRefreshRunningRef = useRef(false);

  const handleSessionExpired = useCallback(
    error => {
      if (!isReloginRequiredError(error)) {
        return false;
      }

      if (isHandlingSessionExpiryRef.current) {
        return true;
      }

      isHandlingSessionExpiryRef.current = true;
      Alert.alert(
        'Session Expired',
        'Your session has expired. Please log in again.',
        [
          {
            text: 'OK',
            onPress: () => {
              Promise.resolve(onSessionExpired?.())
                .catch(resetError => {
                  warnDebug('Session reset after expiry failed:', resetError);
                })
                .finally(() => {
                  isHandlingSessionExpiryRef.current = false;
                });
            },
          },
        ],
        {cancelable: false},
      );
      return true;
    },
    [onSessionExpired],
  );

  const getPanelCompanyCatalogCacheKey = useCallback(
    ({
      compCatId,
      panelCompany,
      catalogLevel = 'full',
      gcode = '',
      scode = '',
      query = '',
      patientGender = '',
    }) =>
      [
        toDisplayValue(panelCompany?.panelCode || panelCompany?.code),
        toDisplayValue(panelCompany?.panelAbarid || panelCompany?.ABARID).toUpperCase(),
        toDisplayValue(panelCompany?.centerId || panelCompany?.CenterID),
        toDisplayValue(panelCompany?.atype || panelCompany?.Atype).toUpperCase(),
        toDisplayValue(compCatId || panelCompany?.compCatId),
        toDisplayValue(panelCompany?.name).toLowerCase(),
        toDisplayValue(catalogLevel).toLowerCase(),
        toDisplayValue(gcode).toUpperCase(),
        toDisplayValue(scode).toUpperCase(),
        toDisplayValue(query).toLowerCase(),
        toDisplayValue(patientGender).toLowerCase(),
      ].join('|'),
    [],
  );
  const getMatchedPanelCompanyCacheKey = useCallback(
    patient =>
      [
        toDisplayValue(
          patient?.bookingPatientId ||
            patient?.booking_patient_id ||
            patient?.id,
        ),
        toDisplayValue(patient?.patientId || patient?.patient_id),
        toDisplayValue(patient?.panelCompany).toLowerCase(),
        toDisplayValue(patient?.mobileNumber || patient?.mobile_number),
      ].join('|'),
    [],
  );

  useEffect(() => {
    const loadCachedAssignedAppointments = async () => {
      try {
        const cachedBookings = await getCachedAssignedBookings();

        if (cachedBookings.length) {
          setAssignedAppointments(cachedBookings);
        }
      } catch (error) {
        warnDebug('Assigned appointments cache restore error:', error);
      }
    };

    loadCachedAssignedAppointments();
  }, []);

  const applyBookingStatusLocally = useCallback(async (bookingId, action) => {
    const nextStatus = getStatusFromAction(action);
    const nextStatusCode = getStatusCodeFromAction(action);
    const shouldRemoveFromAssigned = isTerminalBookingAction(action);

    setAssignedAppointments(previousAppointments =>
      shouldRemoveFromAssigned
        ? previousAppointments.filter(
            booking => String(booking?.id) !== String(bookingId),
          )
        : previousAppointments.map(booking =>
            String(booking.id) === String(bookingId)
              ? {
                  ...booking,
                  status: nextStatus,
                  bookingStatusCode: nextStatusCode,
                }
              : booking,
          ),
    );

    try {
      if (shouldRemoveFromAssigned) {
        await removeCachedAssignedBooking(bookingId);
      } else {
        await updateCachedBookingStatus(bookingId, nextStatus, nextStatusCode);
      }
    } catch (error) {
      warnDebug('Local booking status cache update error:', error);
    }
  }, []);

  const persistLocalCompletedBooking = useCallback(
    async bookingDetail => {
      if (!bookingDetail?.id) {
        return;
      }

      setCompletedAppointments(previousAppointments => {
        const nextAppointments = [
          bookingDetail,
          ...previousAppointments.filter(
            appointment => String(appointment?.id) !== String(bookingDetail.id),
          ),
        ];

        persistCompletedBookings(nextAppointments).catch(error => {
          warnDebug('Completed bookings cache update error:', error);
        });

        return nextAppointments;
      });

      try {
        await persistBookingDetail(bookingDetail, bookingDetail);
      } catch (error) {
        warnDebug('Completed booking detail cache update error:', error);
      }
    },
    [],
  );

  const persistUpdatedBookingDetail = useCallback(
    async ({bookingId, updatedBookingDetail}) => {
      if (!bookingId || !updatedBookingDetail) {
        return;
      }

      await persistBookingDetail(updatedBookingDetail, updatedBookingDetail);
      await updateCachedBookingPatients({
        bookingId,
        patientCount:
          updatedBookingDetail.patientCount ||
          updatedBookingDetail.patients?.length,
        patients: updatedBookingDetail.patients,
      });

      setAssignedAppointments(previousAppointments =>
        previousAppointments.map(appointment =>
          String(appointment.id) === String(bookingId)
            ? {
                ...appointment,
                patientCount:
                  updatedBookingDetail.patientCount ||
                  updatedBookingDetail.patients?.length ||
                  appointment.patientCount,
                patients: updatedBookingDetail.patients || appointment.patients,
              }
            : appointment,
        ),
      );
    },
    [],
  );

  const applyPatientMutationLocally = useCallback(
    async ({booking, updater}) => {
      const bookingId = booking?.id;

      if (!bookingId || typeof updater !== 'function') {
        return null;
      }

      const previousPatients = Array.isArray(booking?.patients)
        ? booking.patients
        : [];
      const nextPatients = updater(previousPatients);
      const patients = Array.isArray(nextPatients) ? nextPatients : previousPatients;
      const updatedBookingDetail = {
        ...booking,
        patients,
        patientCount: patients.length || booking.patientCount,
      };

      try {
        await persistUpdatedBookingDetail({bookingId, updatedBookingDetail});
      } catch (error) {
        warnDebug('Local patient cache update error:', error);
      }

      return updatedBookingDetail;
    },
    [persistUpdatedBookingDetail],
  );

  const syncPendingBookingActions = useCallback(async () => {
    if (!accessToken) {
      return;
    }

    const pendingActions = await getPendingBookingActions();

    if (!pendingActions.length) {
      return;
    }

    for (const pendingAction of pendingActions) {
      try {
        await updateAssignedBookingStatusApi({
          accessToken,
          bookingId: pendingAction.bookingId,
          action: pendingAction.action,
          appointmentId: pendingAction.appointmentId,
          sourceType: pendingAction.sourceType,
          statusPayload: pendingAction.statusPayload,
        });

        await removeMatchingPendingBookingActions({
          bookingId: pendingAction.bookingId,
          action: pendingAction.action,
          appointmentId: pendingAction.appointmentId,
          sourceType: pendingAction.sourceType,
        });
        if (isTerminalBookingAction(pendingAction.action)) {
          await removeCachedAssignedBooking(pendingAction.bookingId);
        } else {
          await updateCachedBookingStatus(
            pendingAction.bookingId,
            getStatusFromAction(pendingAction.action),
            getStatusCodeFromAction(pendingAction.action),
          );
        }
      } catch (error) {
        if (handleSessionExpired(error)) {
          return;
        }
        if (isPermanentPendingBookingActionError(error)) {
          await removePendingBookingAction(pendingAction.id);
          if (Number(error?.status || error?.responseStatus || 0) === 404) {
            await removeCachedAssignedBooking(pendingAction.bookingId);
            await removeCachedBookingDetail({
              id: pendingAction.bookingId,
              appointmentId: pendingAction.appointmentId,
              sourceType: pendingAction.sourceType,
            });
          }
          warnDebug('Dropped permanent pending booking action:', {
            bookingId: pendingAction.bookingId,
            action: pendingAction.action,
            status: error?.status || error?.responseStatus,
            message: error?.message,
          });
          continue;
        }
        await updatePendingBookingAction(pendingAction.id, {
          lastError: error?.message || 'Sync failed',
          lastTriedAt: new Date().toISOString(),
          retryCount: Number(pendingAction?.retryCount || 0) + 1,
        });
      }
    }
  }, [accessToken, handleSessionExpired]);

  const syncPendingPatientActions = useCallback(async () => {
    if (!accessToken) {
      return;
    }

    const pendingActions = await getPendingPatientActions();

    if (!pendingActions.length) {
      return;
    }

    const bookingIdsToRefresh = new Set();

    for (const pendingAction of pendingActions) {
      if (pendingAction.type === 'add') {
        await removePendingPatientAction(pendingAction.id);
        warnDebug('Removed legacy offline patient-add action:', {
          actionId: pendingAction.id,
          bookingId: pendingAction.bookingId,
        });
        continue;
      }

      try {
        if (pendingAction.type === 'update') {
          await updateAssignedBookingPatientApi({
            accessToken,
            bookingId: pendingAction.bookingId,
            patientId: pendingAction.patientId,
            patient: pendingAction.patient,
          });
        } else if (pendingAction.type === 'cancel') {
          await cancelAssignedBookingPatientApi({
            accessToken,
            bookingId: pendingAction.bookingId,
            bookingPatientId: pendingAction.patientId,
            cancelPayload: pendingAction.cancelPayload,
          });
        }

        await removePendingPatientAction(pendingAction.id);
        bookingIdsToRefresh.add(pendingAction.bookingId);
      } catch (error) {
        if (handleSessionExpired(error)) {
          return;
        }
        await updatePendingPatientAction(pendingAction.id, {
          lastError: error?.message || 'Sync failed',
          lastTriedAt: new Date().toISOString(),
          retryCount: Number(pendingAction?.retryCount || 0) + 1,
        });
      }
    }

    for (const bookingId of bookingIdsToRefresh) {
      try {
        const updatedBookingDetail = await fetchAssignedBookingDetailApi({
          accessToken,
          booking: {id: bookingId},
        });

        await persistUpdatedBookingDetail({bookingId, updatedBookingDetail});
      } catch (error) {
        warnDebug('Synced patient detail refresh skipped:', error);
      }
    }
  }, [accessToken, handleSessionExpired, persistUpdatedBookingDetail]);

  const syncPendingOfflineWork = useCallback(async (options = {}) => {
    const {force = false} = options;

    if (isPendingOfflineSyncRunningRef.current) {
      return;
    }

    if (!force) {
      const pendingOfflineActionCount = await getPendingOfflineActionCount();
      if (!pendingOfflineActionCount) {
        return;
      }
    }

    isPendingOfflineSyncRunningRef.current = true;

    try {
      await syncPendingBookingActions();
      await syncPendingPatientActions();
    } finally {
      isPendingOfflineSyncRunningRef.current = false;
    }
  }, [syncPendingBookingActions, syncPendingPatientActions]);

  const refreshLastKnownLocationIfNeeded = useCallback(
    async (reason = 'foreground') => {
      if (!accessToken || isForegroundLocationRefreshRunningRef.current) {
        return;
      }

      const now = Date.now();
      if (
        now - lastForegroundLocationRefreshAtRef.current <
        FOREGROUND_LOCATION_REFRESH_COOLDOWN_MS
      ) {
        return;
      }

      isForegroundLocationRefreshRunningRef.current = true;
      try {
        await refreshLastKnownLocationSnapshot();
        lastForegroundLocationRefreshAtRef.current = Date.now();
      } catch (error) {
        warnDebug(`Foreground location refresh skipped (${reason}):`, error);
      } finally {
        isForegroundLocationRefreshRunningRef.current = false;
      }
    },
    [accessToken],
  );

  const warmAssignedBookingDetailsCache = useCallback(
    async bookings => {
      const startedAt = Date.now();
      const bookingsToWarm = selectBookingsForWarmCache(bookings);

      if (!accessToken || !bookingsToWarm.length) {
        return;
      }

      for (const booking of bookingsToWarm) {
        const bookingId = booking?.id;

        if (!bookingId) {
          continue;
        }

        try {
          const cachedDetail = await getCachedBookingDetail(booking);

          if (cachedDetail) {
            continue;
          }

          const bookingDetail = await fetchAssignedBookingDetailApi({
            accessToken,
            booking,
          });
          await persistBookingDetail(bookingDetail, booking);
        } catch (error) {
          warnDebug('Assigned booking detail background cache skipped:', error);
        }
      }
    },
    [accessToken],
  );

  useEffect(() => {
    if (!accessToken) {
      return undefined;
    }

    syncPendingOfflineWork().catch(error => {
      warnDebug('Pending offline sync error:', error);
    });
    refreshLastKnownLocationIfNeeded('login').catch(() => {});
    return undefined;
  }, [accessToken, refreshLastKnownLocationIfNeeded, syncPendingOfflineWork]);

  useEffect(() => {
    if (!accessToken) {
      return undefined;
    }

    const syncPendingWork = () => {
      syncPendingOfflineWork().catch(error => {
        warnDebug('Pending offline background sync error:', error);
      });
    };

    const intervalId = setInterval(syncPendingWork, 30000);
    const appStateSubscription = AppState.addEventListener('change', nextState => {
      if (nextState === 'active') {
        syncPendingWork();
        refreshLastKnownLocationIfNeeded('app-active').catch(() => {});
      }
    });

    return () => {
      clearInterval(intervalId);
      appStateSubscription?.remove?.();
    };
  }, [accessToken, refreshLastKnownLocationIfNeeded, syncPendingOfflineWork]);

  useEffect(() => {
    if (accessToken) {
      return;
    }

    panelCompanyCatalogCacheRef.current.clear();
  }, [accessToken]);

  const fetchAssignedAppointments = useCallback(async () => {
    const cachedBookings = await getCachedAssignedBookings();
    const hasCachedBookings = cachedBookings.length > 0;

    try {
      if (hasCachedBookings) {
        setAssignedAppointments(cachedBookings);
        setAssignedAppointmentsError('');
        setIsLoadingAssignedAppointments(false);
      } else {
        setIsLoadingAssignedAppointments(true);
      }

      setAssignedAppointmentsError('');
      const normalizedBookings = await fetchAssignedBookingsApi({
        accessToken,
        loggedInUser,
      });
      setAssignedAppointments(normalizedBookings);
      await persistAssignedBookings(normalizedBookings);
      syncPendingOfflineWork({force: true}).catch(error => {
        warnDebug('Assigned appointments background sync error:', error);
      });
      warmAssignedBookingDetailsCache(normalizedBookings).catch(error => {
        warnDebug('Assigned booking detail background cache error:', error);
      });
    } catch (error) {
      logDebug('[Assigned] Network or fetch error', {
        message: error?.message,
        name: error?.name,
      });
      warnDebug('Assigned appointments error:', error);

      if (handleSessionExpired(error)) {
        setAssignedAppointments([]);
        setAssignedAppointmentsError('Your session has expired. Please log in again.');
        return;
      }

      if (hasCachedBookings) {
        setAssignedAppointments(cachedBookings);
        setAssignedAppointmentsError('');
        showPlatformMessage(
          'Offline Mode',
          'Showing saved assigned appointments in offline mode.',
        );
      } else {
        setAssignedAppointments([]);
        setAssignedAppointmentsError(
          error?.message ||
            'Unable to reach the assigned appointments API. Please check the server and network.',
        );
      }
    } finally {
      setIsLoadingAssignedAppointments(false);
    }
  }, [
    accessToken,
    handleSessionExpired,
    loggedInUser,
    syncPendingOfflineWork,
    warmAssignedBookingDetailsCache,
  ]);

  const fetchCompletedAppointments = useCallback(async () => {
    try {
      setIsLoadingCompletedAppointments(true);
      setCompletedAppointmentsError('');
      const normalizedBookings = await fetchAssignedBookingHistoryApi({
        accessToken,
      });
      setCompletedAppointments(normalizedBookings);
      await persistCompletedBookings(normalizedBookings);
    } catch (error) {
      logDebug('[Assigned History] Network or fetch error', {
        message: error?.message,
        name: error?.name,
      });
      warnDebug('Completed appointments error:', error);

      if (handleSessionExpired(error)) {
        setCompletedAppointments([]);
        setCompletedAppointmentsError('Your session has expired. Please log in again.');
        return;
      }

      const cachedBookings = await getCachedCompletedBookings();

      if (cachedBookings.length) {
        setCompletedAppointments(cachedBookings);
        setCompletedAppointmentsError('');
        showPlatformMessage(
          'Offline Mode',
          'Showing saved completed appointments in offline mode.',
        );
      } else {
        setCompletedAppointments([]);
        setCompletedAppointmentsError(
          error?.message ||
            'Unable to reach the completed appointments API. Please check the server and network.',
        );
      }
    } finally {
      setIsLoadingCompletedAppointments(false);
    }
  }, [accessToken, handleSessionExpired]);

  const openAssignedBooking = useCallback(
    async (booking, {onFreshBookingDetail, useHistoryDetail = false} = {}) => {
      const bookingId = booking?.id;

      if (!bookingId) {
        Alert.alert(
          'Missing Booking',
          'The selected appointment does not include a booking ID.',
        );
        return null;
      }

      const normalizedBookingId = String(bookingId);
      const routingMeta = resolveBookingRoutingMeta(booking);
      const bookingDetailRequestKey = [
        normalizedBookingId,
        routingMeta.sourceType,
        routingMeta.appointmentId || 'booking',
      ].join('|');
      const fetchBookingDetail = () =>
        useHistoryDetail
          ? fetchAssignedBookingHistoryDetailApi({
              accessToken,
              booking,
            })
          : fetchAssignedBookingDetailApi({
              accessToken,
              booking,
            });
      const refreshBookingDetailInBackground = () => {
        if (inFlightBookingDetailRequestsRef.current.has(bookingDetailRequestKey)) {
          return;
        }

        const refreshPromise = (async () => {
          try {
            await syncPendingOfflineWork({force: true});
            const bookingDetail = await fetchBookingDetail();
            await persistBookingDetail(bookingDetail, booking);
            if (typeof onFreshBookingDetail === 'function') {
              onFreshBookingDetail(bookingDetail);
            }
          } catch (error) {
            if (isAssignedBookingNotFoundError(error)) {
              removeCachedBookingDetail(booking).catch(cacheError => {
                warnDebug('Assigned booking detail stale cache cleanup skipped:', cacheError);
              });
            }
            warnDebug('Assigned booking detail background refresh skipped:', error);
          } finally {
            inFlightBookingDetailRequestsRef.current.delete(bookingDetailRequestKey);
          }
        })();

        inFlightBookingDetailRequestsRef.current.set(
          bookingDetailRequestKey,
          refreshPromise,
        );
      };

      try {
        const cachedBookingDetail = useHistoryDetail
          ? null
          : await getCachedBookingDetail(booking);

        if (cachedBookingDetail) {
          refreshBookingDetailInBackground();
          return cachedBookingDetail;
        }

        setLoadingAssignedBookingId(normalizedBookingId);
        await syncPendingOfflineWork({force: true});
        const bookingDetail = await fetchBookingDetail();
        await persistBookingDetail(bookingDetail, booking);
        return bookingDetail;
      } catch (error) {
        warnDebug('Assigned booking detail error:', error);
        if (handleSessionExpired(error)) {
          return null;
        }
        const isNotFoundError = isAssignedBookingNotFoundError(error);

        if (isNotFoundError) {
          await removeCachedBookingDetail(booking).catch(cacheError => {
            warnDebug('Assigned booking detail stale cache cleanup error:', cacheError);
          });
        }

        const cachedBookingDetail = await getCachedBookingDetail(booking);

        if (cachedBookingDetail && !isNotFoundError) {
          showPlatformMessage(
            'Offline Mode',
            'Showing saved booking details while offline.',
          );
          return cachedBookingDetail;
        }

        Alert.alert(
          'Unable to Load Details',
          error?.message || 'Unable to reach the assigned booking details API.',
        );
        return null;
      } finally {
        setLoadingAssignedBookingId(previousLoadingBookingId =>
          previousLoadingBookingId === normalizedBookingId
            ? ''
            : previousLoadingBookingId,
        );
      }
    },
    [accessToken, handleSessionExpired, syncPendingOfflineWork],
  );

  const submitBookingAction = useCallback(
    async ({
      booking,
      action,
      statusPayload = {},
      onLocalBookingUpdate,
      localCompletedBooking = null,
    }) => {
      const bookingId = booking?.id;

      if (!bookingId) {
        Alert.alert(
          'Missing Booking',
          'The selected appointment does not include a booking ID.',
        );
        return false;
      }

      if (!accessToken) {
        Alert.alert(
          'Missing Session',
          'A valid login token is required before updating booking status.',
        );
        return false;
      }

      const actionKey = `${String(bookingId)}|${String(action || '').trim().toLowerCase()}`;
      const isCompletionAction =
        String(action || '').trim().toLowerCase() === 'completed';
      if (inFlightBookingActionKeysRef.current.has(actionKey)) {
        return false;
      }
      if (
        isCompletionAction &&
        bookingActionLoading === 'completed'
      ) {
        return false;
      }

      if (action === 'start') {
        const activeStartedBooking = assignedAppointments.find(
          appointment =>
            isStartedBooking(appointment) && !isSameBooking(appointment, booking),
        );

        if (activeStartedBooking) {
          Alert.alert(
            'Booking Already Started',
            `${getBookingDisplayCode(
              activeStartedBooking,
            )} is already started. Please stop or complete it before starting another appointment.`,
          );
          return false;
        }
      }

      let nextStatusPayload = statusPayload;

      try {
        inFlightBookingActionKeysRef.current.add(actionKey);
        setBookingActionLoading(action);
        const {appointmentId, sourceType} = resolveBookingRoutingMeta(booking);
        const statusActionMetaPayload = await resolveStatusActionMetaPayload(action);
        nextStatusPayload = {
          ...statusPayload,
          ...statusActionMetaPayload,
        };
        await updateAssignedBookingStatusApi({
          accessToken,
          bookingId,
          action,
          appointmentId,
          sourceType,
          statusPayload: nextStatusPayload,
          bookingDetail: action === 'completed' ? booking : null,
          onProgress:
            action === 'completed'
              ? ({message}) => {
                  setBookingActionProgressLabel(String(message || '').trim());
                }
              : undefined,
        });
        await applyBookingStatusLocally(bookingId, action);
        onLocalBookingUpdate({
          status: getStatusFromAction(action),
          bookingStatusCode: getStatusCodeFromAction(action),
        });

        if (action === 'completed' && localCompletedBooking) {
          await persistLocalCompletedBooking(localCompletedBooking);
        }

        const successMessage =
          action === 'start'
            ? 'Booking started successfully.'
            : action === 'cancel'
            ? 'Booking cancelled successfully.'
            : action === 'stop'
            ? 'Booking stopped successfully.'
            : 'Booking completed successfully.';

        showPlatformMessage('Success', successMessage);
        return true;
      } catch (error) {
        if (handleSessionExpired(error)) {
          return false;
        }
        if (isLikelyOfflineError(error)) {
          const {appointmentId, sourceType} = resolveBookingRoutingMeta(booking);
          await queuePendingBookingAction({
            bookingId,
            action,
            appointmentId,
            sourceType,
            statusPayload: nextStatusPayload,
          });
          await applyBookingStatusLocally(bookingId, action);
          onLocalBookingUpdate({
            status: getStatusFromAction(action),
            bookingStatusCode: getStatusCodeFromAction(action),
          });
          if (action === 'completed' && localCompletedBooking) {
            await persistLocalCompletedBooking(localCompletedBooking);
          }
          showPlatformMessage(
            'Saved Offline',
            'No internet connection. The booking action has been saved and will sync automatically.',
          );
          return true;
        }

        Alert.alert(
          'Status Update Failed',
          error?.message || 'Unable to update booking status.',
        );
        return false;
      } finally {
        inFlightBookingActionKeysRef.current.delete(actionKey);
        setBookingActionLoading('');
        setBookingActionProgressLabel('');
      }
    },
    [
      accessToken,
      applyBookingStatusLocally,
      assignedAppointments,
      bookingActionLoading,
      handleSessionExpired,
      persistLocalCompletedBooking,
    ],
  );

  const submitAssignedBookingPatient = useCallback(
    async ({booking, patient}) => {
      const bookingId = booking?.id;

      if (!bookingId) {
        Alert.alert(
          'Missing Booking',
          'The selected appointment does not include a booking ID.',
        );
        return null;
      }

      const bookingStatusCode = Number(
        booking?.bookingStatusCode ??
          booking?.booking_status ??
          booking?.bookingStatus ??
          0,
      );
      const bookingStatusLabel = String(booking?.status || '')
        .trim()
        .toLowerCase();
      const hasKnownAllowedStatus =
        bookingStatusCode === 1 ||
        bookingStatusCode === 2 ||
        bookingStatusLabel === 'assigned' ||
        bookingStatusLabel === 'started';
      const hasKnownBlockedStatus =
        bookingStatusCode > 0 || Boolean(bookingStatusLabel);

      if (hasKnownBlockedStatus && !hasKnownAllowedStatus) {
        Alert.alert(
          'Unable to Add Patient',
          'Patient can be added only when booking is Assigned or Started.',
        );
        return null;
      }

      if (!accessToken) {
        Alert.alert(
          'Missing Session',
          'A valid login token is required before adding a patient.',
        );
        return null;
      }

      const requestId = `${String(bookingId)}-add-patient-${Date.now()}`;

      try {
        setIsAddingPatient(true);
        await addAssignedBookingPatientApi({
          accessToken,
          bookingId,
          patient,
          requestId,
        });

      } catch (error) {
        setIsAddingPatient(false);
        if (handleSessionExpired(error)) {
          return null;
        }
        if (isLikelyOfflineError(error)) {
          Alert.alert(
            'Internet Required',
            'Patient can be added only while the app is online. Please check your connection and try again.',
          );
          return null;
        }

        Alert.alert(
          'Unable to Add Patient',
          error?.message || 'Unable to add the patient right now.',
        );
        return null;
      }

      let updatedBookingDetail = null;
      try {
        updatedBookingDetail = await fetchAssignedBookingDetailApi({
          accessToken,
          booking,
        });
        await persistUpdatedBookingDetail({bookingId, updatedBookingDetail});
      } catch (refreshError) {
        warnDebug('Patient added, but booking detail refresh failed:', refreshError);
        updatedBookingDetail = await applyPatientMutationLocally({
          booking,
          updater: previousPatients => [
            ...previousPatients,
            buildLocalPatientFromPayload({
              patient,
              patientId: `added-patient-${Date.now()}`,
              isOfflinePending: false,
            }),
          ],
        });
      } finally {
        setIsAddingPatient(false);
      }

      showPlatformMessage('Success', 'Patient added successfully.');
      return updatedBookingDetail || booking;
    },
    [
      accessToken,
      applyPatientMutationLocally,
      handleSessionExpired,
      persistUpdatedBookingDetail,
    ],
  );

  const updateAssignedBookingPatient = useCallback(
    async ({booking, patientId, patient}) => {
      const bookingId = booking?.id;

      if (!bookingId || !patientId) {
        Alert.alert(
          'Missing Patient',
          'The selected patient does not include a valid patient ID.',
        );
        return null;
      }

      if (!accessToken) {
        Alert.alert(
          'Missing Session',
          'A valid login token is required before updating a patient.',
        );
        return null;
      }

      try {
        setIsUpdatingPatient(true);
        await updateAssignedBookingPatientApi({
          accessToken,
          bookingId,
          patientId,
          patient,
        });

        const updatedBookingDetail = await fetchAssignedBookingDetailApi({
          accessToken,
          booking,
        });
        const patchedBookingDetail = {
          ...updatedBookingDetail,
          patients: (Array.isArray(updatedBookingDetail?.patients)
            ? updatedBookingDetail.patients
            : []
          ).map(previousPatient =>
            doesPatientMatchId(previousPatient, patientId)
              ? buildLocalPatientFromPayload({
                  patient,
                  existingPatient: previousPatient,
                  patientId,
                  isOfflinePending: false,
                })
              : previousPatient,
          ),
        };
        patchedBookingDetail.patientCount =
          patchedBookingDetail.patients?.length ||
          updatedBookingDetail?.patientCount ||
          booking.patientCount;
        await persistUpdatedBookingDetail({
          bookingId,
          updatedBookingDetail: patchedBookingDetail,
        });

        showPlatformMessage('Success', 'Patient updated successfully.');
        return patchedBookingDetail;
      } catch (error) {
        if (handleSessionExpired(error)) {
          return null;
        }
        if (isLikelyOfflineError(error)) {
          await queuePendingPatientAction({
            bookingId,
            type: 'update',
            patientId,
            localPatientId: patientId,
            patient,
          });

          const localBookingDetail = await applyPatientMutationLocally({
            booking,
            updater: previousPatients =>
              previousPatients.map(previousPatient =>
                String(previousPatient.id) === String(patientId)
                  ? buildLocalPatientFromPayload({
                      patient,
                      existingPatient: previousPatient,
                      patientId,
                      isOfflinePending: true,
                    })
                  : previousPatient,
              ),
          });

          showPlatformMessage(
            'Saved Offline',
            'Patient updates have been saved and will sync automatically.',
          );
          return localBookingDetail;
        }

        Alert.alert(
          'Unable to Update Patient',
          error?.message || 'Unable to update the patient right now.',
        );
        return null;
      } finally {
        setIsUpdatingPatient(false);
      }
    },
    [
      accessToken,
      applyPatientMutationLocally,
      handleSessionExpired,
      persistUpdatedBookingDetail,
    ],
  );

  const cancelAssignedBookingPatient = useCallback(
    async ({booking, patient, cancelPayload = {}}) => {
      const bookingId = booking?.id;
      const bookingPatientId = getPatientMutationId(patient);

      if (!bookingId || !bookingPatientId) {
        Alert.alert(
          'Missing Patient',
          'The selected patient does not include a valid booking patient ID.',
        );
        return null;
      }

      if (!accessToken) {
        Alert.alert(
          'Missing Session',
          'A valid login token is required before cancelling a patient.',
        );
        return null;
      }

      try {
        setCancellingPatientId(String(bookingPatientId));
        await cancelAssignedBookingPatientApi({
          accessToken,
          bookingId,
          bookingPatientId,
          cancelPayload,
        });

        const updatedBookingDetail = await fetchAssignedBookingDetailApi({
          accessToken,
          booking,
        });
        await persistUpdatedBookingDetail({bookingId, updatedBookingDetail});

        showPlatformMessage('Success', 'Patient cancelled successfully.');
        return updatedBookingDetail;
      } catch (error) {
        if (handleSessionExpired(error)) {
          return null;
        }
        if (isLikelyOfflineError(error)) {
          const queuedAction = await queuePendingPatientAction({
            bookingId,
            type: 'cancel',
            patientId: bookingPatientId,
            localPatientId: bookingPatientId,
            cancelPayload,
          });
          const shouldRemoveLocalPatient =
            queuedAction?.type === 'cancel-local-add';

          const localBookingDetail = await applyPatientMutationLocally({
            booking,
            updater: previousPatients =>
              shouldRemoveLocalPatient
                ? previousPatients.filter(
                    previousPatient =>
                      String(previousPatient.id) !== String(bookingPatientId),
                  )
                : previousPatients.map(previousPatient =>
                    String(previousPatient.id) === String(bookingPatientId)
                      ? {
                          ...previousPatient,
                          bookingPatientStatusCode: 4,
                          isOfflinePending: true,
                        }
                      : previousPatient,
                  ),
          });

          showPlatformMessage(
            'Saved Offline',
            'Patient cancellation has been saved and will sync automatically.',
          );
          return localBookingDetail;
        }

        Alert.alert(
          'Unable to Cancel Patient',
          error?.message || 'Unable to cancel the patient right now.',
        );
        return null;
      } finally {
        setCancellingPatientId('');
      }
    },
    [
      accessToken,
      applyPatientMutationLocally,
      handleSessionExpired,
      persistUpdatedBookingDetail,
    ],
  );

  const updateAssignedBookingAddress = useCallback(
    async ({booking, addressPayload}) => {
      const bookingId = booking?.id;

      if (!bookingId) {
        Alert.alert(
          'Missing Booking',
          'The selected appointment does not include a booking ID.',
        );
        return null;
      }

      if (!accessToken) {
        Alert.alert(
          'Missing Session',
          'A valid login token is required before updating address.',
        );
        return null;
      }

      try {
        const {appointmentId, sourceType} = resolveBookingRoutingMeta(booking);
        await updateAssignedBookingAddressApi({
          accessToken,
          bookingId,
          appointmentId,
          sourceType,
          addressPayload,
        });

        const updatedBookingDetail = await fetchAssignedBookingDetailApi({
          accessToken,
          booking,
        });
        await persistUpdatedBookingDetail({bookingId, updatedBookingDetail});

        showPlatformMessage('Success', 'Address updated successfully.');
        return updatedBookingDetail;
      } catch (error) {
        if (handleSessionExpired(error)) {
          return null;
        }
        Alert.alert(
          'Unable to Update Address',
          error?.message || 'Unable to update address right now.',
        );
        return null;
      }
    },
    [accessToken, handleSessionExpired, persistUpdatedBookingDetail],
  );

  const addTestForPatient = useCallback(
    async ({booking, patient}) => {
      const bookingId = booking?.id;
      const bookingPatientId = getPatientMutationId(patient);

      if (!bookingId || !bookingPatientId) {
        Alert.alert(
          'Missing Patient',
          'The selected patient does not include a valid booking patient ID.',
        );
        return null;
      }

      if (!accessToken) {
        Alert.alert(
          'Missing Session',
          'A valid login token is required before adding a test.',
        );
        return null;
      }

      const cacheKey = getMatchedPanelCompanyCacheKey(patient);
      const cachedResponse = matchedPanelCompanyCacheRef.current.get(cacheKey);
      if (cachedResponse) {
        return cachedResponse;
      }

      try {
        setAddingTestPatientId(String(bookingPatientId));
        const localResponse = await getLocalMatchedPanelCompaniesResponse(patient);
        if (localResponse?.items?.length) {
          matchedPanelCompanyCacheRef.current.set(cacheKey, localResponse);
          return localResponse;
        }

        const responseData = await fetchMatchedPanelCompaniesForPatientApi({
          patient,
        });
        if (responseData) {
          matchedPanelCompanyCacheRef.current.set(cacheKey, responseData);
        }
        return responseData;
      } catch (error) {
        if (handleSessionExpired(error)) {
          return null;
        }
        Alert.alert(
          'Unable to Add Test',
          error?.message || 'Unable to fetch test catalog right now.',
        );
        return null;
      } finally {
        setAddingTestPatientId('');
      }
    },
    [accessToken, getMatchedPanelCompanyCacheKey, handleSessionExpired],
  );

  const fetchPanelCatalogForCompany = useCallback(
    async ({
      booking,
      patient,
      compCatId,
      panelCompany,
      catalogLevel = 'full',
      gcode = '',
      scode = '',
      query = '',
    }) => {
      const bookingId = booking?.id;
      const bookingPatientId = getPatientMutationId(patient);
      const normalizedCompCatId = toDisplayValue(
        compCatId || panelCompany?.compCatId,
      );
      const patientGender = toDisplayValue(patient?.gender || patient?.Gender);

      if (!bookingId || !bookingPatientId) {
        Alert.alert(
          'Missing Patient',
          'The selected patient does not include a valid booking patient ID.',
        );
        return null;
      }

      if (!normalizedCompCatId) {
        Alert.alert(
          'Missing Company',
          'The selected panel company does not include a valid CompCatID.',
        );
        return null;
      }

      if (!accessToken) {
        Alert.alert(
          'Missing Session',
          'A valid login token is required before loading panel catalog.',
        );
        return null;
      }

      const cacheKey = getPanelCompanyCatalogCacheKey({
        compCatId: normalizedCompCatId,
        panelCompany,
        catalogLevel,
        gcode,
        scode,
        query,
        patientGender,
      });
      const cachedResponse = panelCompanyCatalogCacheRef.current.get(cacheKey);
      if (cachedResponse) {
        return cachedResponse;
      }

      try {
        setAddingTestPatientId(String(bookingPatientId));
        const localResponse =
          catalogLevel === 'full'
            ? await getLocalPanelCatalogByCompanyResponse(panelCompany)
            : null;
        if (catalogLevel === 'full' && localResponse?.groups?.length) {
          panelCompanyCatalogCacheRef.current.set(cacheKey, localResponse);
          return localResponse;
        }

        const responseData = await fetchPanelCatalogByCompanyApi({
          accessToken,
          compCatId: normalizedCompCatId,
          panelCompany,
          catalogLevel,
          gcode,
          scode,
          query,
          patientGender,
        });
        panelCompanyCatalogCacheRef.current.set(cacheKey, responseData);
        return responseData;
      } catch (error) {
        if (handleSessionExpired(error)) {
          return null;
        }
        Alert.alert(
          'Unable to Load Catalog',
          error?.message || 'Unable to fetch panel catalog right now.',
        );
        return null;
      } finally {
        setAddingTestPatientId('');
      }
    },
    [accessToken, getPanelCompanyCatalogCacheKey, handleSessionExpired],
  );

  const clearAssignedState = useCallback(async () => {
    setAssignedAppointments([]);
    setAssignedAppointmentsError('');
    setCompletedAppointments([]);
    setCompletedAppointmentsError('');
    setLoadingAssignedBookingId('');
    setBookingActionLoading('');
    setIsAddingPatient(false);
    setIsUpdatingPatient(false);
    setCancellingPatientId('');
    setAddingTestPatientId('');
    panelCompanyCatalogCacheRef.current.clear();
    matchedPanelCompanyCacheRef.current.clear();

    try {
      await clearOfflineBookingViewCache();
    } catch (error) {
      warnDebug('Offline booking storage clear error:', error);
    }
  }, []);

  return {
    assignedAppointments,
    isLoadingAssignedAppointments,
    assignedAppointmentsError,
    completedAppointments,
    isLoadingCompletedAppointments,
    completedAppointmentsError,
    loadingAssignedBookingId,
    bookingActionLoading,
    bookingActionProgressLabel,
    isBookingActionNavigationLocked: bookingActionLoading === 'completed',
    isAddingPatient,
    isUpdatingPatient,
    cancellingPatientId,
    addingTestPatientId,
    setAssignedAppointments,
    setAssignedAppointmentsError,
    setCompletedAppointmentsError,
    fetchAssignedAppointments,
    fetchCompletedAppointments,
    openAssignedBooking,
    submitBookingAction,
    submitAssignedBookingPatient,
    updateAssignedBookingPatient,
    cancelAssignedBookingPatient,
    updateAssignedBookingAddress,
    addTestForPatient,
    fetchPanelCatalogForCompany,
    clearAssignedState,
  };
};

