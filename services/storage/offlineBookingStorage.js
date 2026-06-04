import AsyncStorage from '@react-native-async-storage/async-storage';

const CACHED_ASSIGNED_BOOKINGS_KEY = 'cached_assigned_bookings';
const CACHED_COMPLETED_BOOKINGS_KEY = 'cached_completed_bookings';
const CACHED_BOOKING_DETAILS_KEY = 'cached_booking_details';
const PENDING_BOOKING_ACTIONS_KEY = 'pending_booking_actions';
const PENDING_PATIENT_ACTIONS_KEY = 'pending_patient_actions';
const PENDING_LOCAL_ACTIONS_KEY = 'pending_local_actions';
const APPOINTMENT_DETAIL_STATE_KEY = 'cached_appointment_detail_state';
const APPOINTMENT_DETAIL_DRAFTS_KEY = 'cached_appointment_detail_drafts';
const HANDOVER_STATE_KEY = 'cached_handover_state';

const safelyParseJson = (value, fallbackValue) => {
  if (!value) {
    return fallbackValue;
  }

  try {
    return JSON.parse(value);
  } catch (error) {
    return fallbackValue;
  }
};

const toJsonString = value => JSON.stringify(value);

const writeJsonIfChanged = async (storageKey, nextValue) => {
  const nextSerializedValue = toJsonString(nextValue);
  const previousSerializedValue = await AsyncStorage.getItem(storageKey);

  if (previousSerializedValue === nextSerializedValue) {
    return false;
  }

  await AsyncStorage.setItem(storageKey, nextSerializedValue);
  return true;
};

export const getCachedAssignedBookings = async () => {
  const value = await AsyncStorage.getItem(CACHED_ASSIGNED_BOOKINGS_KEY);
  const parsedValue = safelyParseJson(value, []);
  return Array.isArray(parsedValue) ? parsedValue : [];
};

export const persistAssignedBookings = async bookings => {
  await writeJsonIfChanged(
    CACHED_ASSIGNED_BOOKINGS_KEY,
    Array.isArray(bookings) ? bookings : [],
  );
};

export const removeCachedAssignedBooking = async bookingId => {
  if (!bookingId) {
    return;
  }

  const normalizedBookingId = String(bookingId);
  const cachedBookings = await getCachedAssignedBookings();
  const nextCachedBookings = cachedBookings.filter(
    booking => String(booking?.id) !== normalizedBookingId,
  );

  await persistAssignedBookings(nextCachedBookings);
};

export const getCachedCompletedBookings = async () => {
  const value = await AsyncStorage.getItem(CACHED_COMPLETED_BOOKINGS_KEY);
  const parsedValue = safelyParseJson(value, []);
  return Array.isArray(parsedValue) ? parsedValue : [];
};

export const persistCompletedBookings = async bookings => {
  await writeJsonIfChanged(
    CACHED_COMPLETED_BOOKINGS_KEY,
    Array.isArray(bookings) ? bookings : [],
  );
};

export const getCachedBookingDetailsMap = async () => {
  const value = await AsyncStorage.getItem(CACHED_BOOKING_DETAILS_KEY);
  const parsedValue = safelyParseJson(value, {});
  return parsedValue && typeof parsedValue === 'object' ? parsedValue : {};
};

const toStableValue = value =>
  value === null || value === undefined ? '' : String(value).trim();

const buildCachedBookingDetailKey = booking => {
  const bookingId = toStableValue(
    typeof booking === 'object' ? booking?.id || booking?.bookingId || booking?.booking_id : booking,
  );
  const appointmentId = toStableValue(
    typeof booking === 'object' ? booking?.appointmentId || booking?.appointment_id : '',
  );
  const sourceTypeRaw = toStableValue(
    typeof booking === 'object' ? booking?.sourceType || booking?.source_type : '',
  ).toUpperCase();
  const sourceType = sourceTypeRaw || (appointmentId ? 'APPOINTMENT' : 'BOOKING');

  if (!bookingId) {
    return '';
  }

  return [bookingId, sourceType, appointmentId || 'booking'].join('|');
};

export const getCachedBookingDetail = async booking => {
  const cacheKey = buildCachedBookingDetailKey(booking);
  if (!cacheKey) {
    return null;
  }

  const detailsMap = await getCachedBookingDetailsMap();
  return detailsMap[cacheKey] || null;
};

export const persistBookingDetail = async (bookingDetail, bookingMeta = null) => {
  const bookingId = bookingDetail?.id;

  if (!bookingId) {
    return;
  }

  const detailsMap = await getCachedBookingDetailsMap();
  const detailCacheKey = buildCachedBookingDetailKey(bookingDetail);
  const metaCacheKey = buildCachedBookingDetailKey(bookingMeta);
  const cacheKeysToUpdate = Array.from(
    new Set(
      [
        detailCacheKey,
        metaCacheKey,
      ].filter(Boolean),
    ),
  );
  if (!cacheKeysToUpdate.length) {
    return;
  }
  if (
    cacheKeysToUpdate.every(
      key => toJsonString(detailsMap[key] || null) === toJsonString(bookingDetail),
    )
  ) {
    return;
  }

  cacheKeysToUpdate.forEach(key => {
    detailsMap[key] = bookingDetail;
  });

  await writeJsonIfChanged(CACHED_BOOKING_DETAILS_KEY, detailsMap);
};

export const removeCachedBookingDetail = async booking => {
  const cacheKey = buildCachedBookingDetailKey(booking);
  const normalizedBookingId = toStableValue(
    typeof booking === 'object'
      ? booking?.id || booking?.bookingId || booking?.booking_id
      : booking,
  );

  if (!cacheKey && !normalizedBookingId) {
    return;
  }

  const detailsMap = await getCachedBookingDetailsMap();
  const nextDetailsMap = {...detailsMap};
  let didRemoveDetail = false;

  Object.keys(nextDetailsMap).forEach(key => {
    if (
      (cacheKey && key === cacheKey) ||
      (normalizedBookingId && key.startsWith(`${normalizedBookingId}|`))
    ) {
      delete nextDetailsMap[key];
      didRemoveDetail = true;
    }
  });

  if (!didRemoveDetail) {
    return;
  }

  await writeJsonIfChanged(CACHED_BOOKING_DETAILS_KEY, nextDetailsMap);
};

export const updateCachedBookingStatus = async (
  bookingId,
  status,
  bookingStatusCode,
) => {
  if (!bookingId || !status) {
    return;
  }

  const normalizedBookingId = String(bookingId);
  const cachedBookings = await getCachedAssignedBookings();
  const nextCachedBookings = cachedBookings.map(booking =>
    String(booking?.id) === normalizedBookingId
      ? {
          ...booking,
          status,
          ...(bookingStatusCode ? {bookingStatusCode} : {}),
        }
      : booking,
  );

  await persistAssignedBookings(nextCachedBookings);

  const detailsMap = await getCachedBookingDetailsMap();
  let hasUpdatedDetail = false;

  Object.keys(detailsMap).forEach(key => {
    const cachedDetail = detailsMap[key];
    if (String(cachedDetail?.id) === normalizedBookingId) {
      detailsMap[key] = {
        ...cachedDetail,
        status,
        ...(bookingStatusCode ? {bookingStatusCode} : {}),
      };
      hasUpdatedDetail = true;
    }
  });

  if (hasUpdatedDetail) {
    await writeJsonIfChanged(CACHED_BOOKING_DETAILS_KEY, detailsMap);
  }
};

export const updateCachedBookingPatients = async ({
  bookingId,
  patientCount,
  patients,
}) => {
  if (!bookingId) {
    return;
  }

  const normalizedBookingId = String(bookingId);
  const cachedBookings = await getCachedAssignedBookings();
  const nextCachedBookings = cachedBookings.map(booking =>
    String(booking?.id) === normalizedBookingId
      ? {
          ...booking,
          ...(patientCount ? {patientCount} : {}),
          ...(Array.isArray(patients) ? {patients} : {}),
        }
      : booking,
  );

  await persistAssignedBookings(nextCachedBookings);

  const detailsMap = await getCachedBookingDetailsMap();
  let hasUpdatedDetail = false;

  Object.keys(detailsMap).forEach(key => {
    const cachedDetail = detailsMap[key];
    if (String(cachedDetail?.id) === normalizedBookingId) {
      detailsMap[key] = {
        ...cachedDetail,
        ...(patientCount ? {patientCount} : {}),
        ...(Array.isArray(patients) ? {patients} : {}),
      };
      hasUpdatedDetail = true;
    }
  });

  if (hasUpdatedDetail) {
    await writeJsonIfChanged(CACHED_BOOKING_DETAILS_KEY, detailsMap);
  }
};

export const getPendingBookingActions = async () => {
  const value = await AsyncStorage.getItem(PENDING_BOOKING_ACTIONS_KEY);
  const parsedValue = safelyParseJson(value, []);
  return Array.isArray(parsedValue) ? parsedValue : [];
};

const normalizePendingBookingActionIdentity = ({
  bookingId,
  action,
  appointmentId,
  sourceType,
}) => {
  const normalizedBookingId = String(bookingId || '').trim();
  const normalizedAction = String(action || '').trim().toLowerCase();
  const normalizedSourceType = String(sourceType || '')
    .trim()
    .toUpperCase();
  const normalizedAppointmentId = String(appointmentId || '').trim();

  return [
    normalizedBookingId,
    normalizedAction,
    normalizedSourceType || 'BOOKING',
    normalizedSourceType === 'APPOINTMENT' && normalizedAppointmentId
      ? normalizedAppointmentId
      : 'booking',
  ].join('|');
};

export const queuePendingBookingAction = async ({
  bookingId,
  action,
  appointmentId,
  sourceType,
  statusPayload,
}) => {
  const normalizedSourceType = String(sourceType || '')
    .trim()
    .toUpperCase();
  const normalizedAppointmentId = String(appointmentId || '').trim();
  const identity = normalizePendingBookingActionIdentity({
    bookingId,
    action,
    appointmentId,
    sourceType,
  });

  const pendingActions = await getPendingBookingActions();
  const existingAction = pendingActions.find(
    pendingAction =>
      normalizePendingBookingActionIdentity(pendingAction) === identity,
  );
  const queuedAction = {
    id: existingAction?.id || `${bookingId}-${action}-${Date.now()}`,
    bookingId: String(bookingId),
    action,
    sourceType: normalizedSourceType || 'BOOKING',
    ...(normalizedSourceType === 'APPOINTMENT' && normalizedAppointmentId
      ? {
          appointmentId: Number.isFinite(Number(normalizedAppointmentId))
            ? Number(normalizedAppointmentId)
            : normalizedAppointmentId,
        }
      : {}),
    ...(statusPayload && Object.keys(statusPayload).length
      ? {statusPayload}
      : {}),
    queuedAt: existingAction?.queuedAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const nextPendingActions = existingAction
    ? pendingActions.map(pendingAction =>
        pendingAction.id === existingAction.id ? queuedAction : pendingAction,
      )
    : [...pendingActions, queuedAction];

  await AsyncStorage.setItem(
    PENDING_BOOKING_ACTIONS_KEY,
    JSON.stringify(nextPendingActions),
  );

  return queuedAction;
};

export const removePendingBookingAction = async actionId => {
  if (!actionId) {
    return;
  }

  const pendingActions = await getPendingBookingActions();
  const nextPendingActions = pendingActions.filter(
    pendingAction => pendingAction.id !== actionId,
  );

  await AsyncStorage.setItem(
    PENDING_BOOKING_ACTIONS_KEY,
    JSON.stringify(nextPendingActions),
  );
};

export const removeMatchingPendingBookingActions = async ({
  bookingId,
  action,
  appointmentId,
  sourceType,
}) => {
  const identity = normalizePendingBookingActionIdentity({
    bookingId,
    action,
    appointmentId,
    sourceType,
  });
  const pendingActions = await getPendingBookingActions();
  const nextPendingActions = pendingActions.filter(
    pendingAction =>
      normalizePendingBookingActionIdentity(pendingAction) !== identity,
  );

  await AsyncStorage.setItem(
    PENDING_BOOKING_ACTIONS_KEY,
    JSON.stringify(nextPendingActions),
  );
};

export const updatePendingBookingAction = async (actionId, updates = {}) => {
  if (!actionId) {
    return null;
  }

  const pendingActions = await getPendingBookingActions();
  let updatedAction = null;
  const nextPendingActions = pendingActions.map(pendingAction => {
    if (pendingAction.id !== actionId) {
      return pendingAction;
    }

    updatedAction = {
      ...pendingAction,
      ...updates,
    };
    return updatedAction;
  });

  await AsyncStorage.setItem(
    PENDING_BOOKING_ACTIONS_KEY,
    JSON.stringify(nextPendingActions),
  );

  return updatedAction;
};

export const getPendingPatientActions = async () => {
  const value = await AsyncStorage.getItem(PENDING_PATIENT_ACTIONS_KEY);
  const parsedValue = safelyParseJson(value, []);
  return Array.isArray(parsedValue) ? parsedValue : [];
};

export const queuePendingPatientAction = async ({
  bookingId,
  type,
  patientId,
  patient,
  localPatientId,
  cancelPayload,
}) => {
  const normalizedBookingId = String(bookingId);
  const normalizedPatientId = patientId ? String(patientId) : '';
  const normalizedLocalPatientId = localPatientId
    ? String(localPatientId)
    : normalizedPatientId;
  const pendingActions = await getPendingPatientActions();

  if (type === 'update' && normalizedLocalPatientId) {
    const pendingAddAction = pendingActions.find(
      pendingAction =>
        pendingAction.type === 'add' &&
        pendingAction.bookingId === normalizedBookingId &&
        pendingAction.localPatientId === normalizedLocalPatientId,
    );

    if (pendingAddAction) {
      pendingAddAction.patient = patient;
      pendingAddAction.updatedAt = new Date().toISOString();

      await AsyncStorage.setItem(
        PENDING_PATIENT_ACTIONS_KEY,
        JSON.stringify(pendingActions),
      );

      return pendingAddAction;
    }

    const pendingUpdateAction = pendingActions.find(
      pendingAction =>
        pendingAction.type === 'update' &&
        pendingAction.bookingId === normalizedBookingId &&
        pendingAction.patientId === normalizedPatientId,
    );

    if (pendingUpdateAction) {
      pendingUpdateAction.patient = patient;
      pendingUpdateAction.updatedAt = new Date().toISOString();

      await AsyncStorage.setItem(
        PENDING_PATIENT_ACTIONS_KEY,
        JSON.stringify(pendingActions),
      );

      return pendingUpdateAction;
    }
  }

  if (type === 'cancel' && normalizedLocalPatientId) {
    const pendingAddAction = pendingActions.find(
      pendingAction =>
        pendingAction.type === 'add' &&
        pendingAction.bookingId === normalizedBookingId &&
        pendingAction.localPatientId === normalizedLocalPatientId,
    );

    if (pendingAddAction) {
      const nextPendingActions = pendingActions.filter(
        pendingAction => pendingAction.id !== pendingAddAction.id,
      );

      await AsyncStorage.setItem(
        PENDING_PATIENT_ACTIONS_KEY,
        JSON.stringify(nextPendingActions),
      );

      return {...pendingAddAction, type: 'cancel-local-add'};
    }

    const nextPendingActions = pendingActions.filter(
      pendingAction =>
        !(
          pendingAction.type === 'update' &&
          pendingAction.bookingId === normalizedBookingId &&
          pendingAction.patientId === normalizedPatientId
        ),
    );

    if (nextPendingActions.length !== pendingActions.length) {
      pendingActions.splice(0, pendingActions.length, ...nextPendingActions);
    }
  }

  const queuedAction = {
    id: `${normalizedBookingId}-${type}-${normalizedPatientId || 'new'}-${Date.now()}`,
    bookingId: normalizedBookingId,
    type,
    patientId: normalizedPatientId,
    localPatientId: normalizedLocalPatientId,
    patient,
    ...(cancelPayload ? {cancelPayload} : {}),
    queuedAt: new Date().toISOString(),
  };

  pendingActions.push(queuedAction);

  await AsyncStorage.setItem(
    PENDING_PATIENT_ACTIONS_KEY,
    JSON.stringify(pendingActions),
  );

  return queuedAction;
};

export const removePendingPatientAction = async actionId => {
  if (!actionId) {
    return;
  }

  const pendingActions = await getPendingPatientActions();
  const nextPendingActions = pendingActions.filter(
    pendingAction => pendingAction.id !== actionId,
  );

  await AsyncStorage.setItem(
    PENDING_PATIENT_ACTIONS_KEY,
    JSON.stringify(nextPendingActions),
  );
};

export const updatePendingPatientAction = async (actionId, updates = {}) => {
  if (!actionId) {
    return null;
  }

  const pendingActions = await getPendingPatientActions();
  let updatedAction = null;
  const nextPendingActions = pendingActions.map(pendingAction => {
    if (pendingAction.id !== actionId) {
      return pendingAction;
    }

    updatedAction = {
      ...pendingAction,
      ...updates,
    };
    return updatedAction;
  });

  await AsyncStorage.setItem(
    PENDING_PATIENT_ACTIONS_KEY,
    JSON.stringify(nextPendingActions),
  );

  return updatedAction;
};

export const getPendingLocalActions = async () => {
  const value = await AsyncStorage.getItem(PENDING_LOCAL_ACTIONS_KEY);
  const parsedValue = safelyParseJson(value, []);
  return Array.isArray(parsedValue) ? parsedValue : [];
};

export const queuePendingLocalAction = async ({
  type,
  bookingId,
  patientId,
  payload,
}) => {
  const normalizedType = String(type || '').trim();

  if (!normalizedType) {
    return null;
  }

  const queuedAction = {
    id: `${normalizedType}-${bookingId || 'booking'}-${
      patientId || 'patient'
    }-${Date.now()}`,
    type: normalizedType,
    bookingId: bookingId ? String(bookingId) : '',
    patientId: patientId ? String(patientId) : '',
    payload: payload || {},
    queuedAt: new Date().toISOString(),
  };

  const pendingActions = await getPendingLocalActions();
  pendingActions.push(queuedAction);

  await AsyncStorage.setItem(
    PENDING_LOCAL_ACTIONS_KEY,
    JSON.stringify(pendingActions),
  );

  return queuedAction;
};

export const persistAppointmentDetailState = async state => {
  await writeJsonIfChanged(
    APPOINTMENT_DETAIL_STATE_KEY,
    state && typeof state === 'object' ? state : {},
  );
};

export const getCachedAppointmentDetailState = async () => {
  const value = await AsyncStorage.getItem(APPOINTMENT_DETAIL_STATE_KEY);
  const parsedValue = safelyParseJson(value, {});
  return parsedValue && typeof parsedValue === 'object' ? parsedValue : {};
};

export const persistAppointmentDetailDrafts = async drafts => {
  await writeJsonIfChanged(
    APPOINTMENT_DETAIL_DRAFTS_KEY,
    drafts && typeof drafts === 'object' ? drafts : {},
  );
};

export const getCachedAppointmentDetailDrafts = async () => {
  const value = await AsyncStorage.getItem(APPOINTMENT_DETAIL_DRAFTS_KEY);
  const parsedValue = safelyParseJson(value, {});
  return parsedValue && typeof parsedValue === 'object' ? parsedValue : {};
};

export const clearAppointmentDetailDraft = async bookingId => {
  const normalizedBookingId = String(bookingId || '').trim();
  if (!normalizedBookingId) {
    return;
  }

  const drafts = await getCachedAppointmentDetailDrafts();
  if (!Object.prototype.hasOwnProperty.call(drafts, normalizedBookingId)) {
    return;
  }

  delete drafts[normalizedBookingId];
  await persistAppointmentDetailDrafts(drafts);
};

export const clearOfflineBookingStorage = async () => {
  await AsyncStorage.multiRemove([
    CACHED_ASSIGNED_BOOKINGS_KEY,
    CACHED_COMPLETED_BOOKINGS_KEY,
    CACHED_BOOKING_DETAILS_KEY,
    PENDING_BOOKING_ACTIONS_KEY,
    PENDING_PATIENT_ACTIONS_KEY,
    PENDING_LOCAL_ACTIONS_KEY,
    APPOINTMENT_DETAIL_STATE_KEY,
    APPOINTMENT_DETAIL_DRAFTS_KEY,
    HANDOVER_STATE_KEY,
  ]);
};

export const clearOfflineBookingViewCache = async () => {
  await AsyncStorage.multiRemove([
    CACHED_ASSIGNED_BOOKINGS_KEY,
    CACHED_COMPLETED_BOOKINGS_KEY,
    CACHED_BOOKING_DETAILS_KEY,
    APPOINTMENT_DETAIL_STATE_KEY,
    APPOINTMENT_DETAIL_DRAFTS_KEY,
    HANDOVER_STATE_KEY,
  ]);
};

export const getPendingOfflineActionCount = async () => {
  const [bookingActions, patientActions, localActions] = await Promise.all([
    getPendingBookingActions(),
    getPendingPatientActions(),
    getPendingLocalActions(),
  ]);

  return bookingActions.length + patientActions.length + localActions.length;
};
