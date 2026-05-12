import AsyncStorage from '@react-native-async-storage/async-storage';

const CACHED_ASSIGNED_BOOKINGS_KEY = 'cached_assigned_bookings';
const CACHED_COMPLETED_BOOKINGS_KEY = 'cached_completed_bookings';
const CACHED_BOOKING_DETAILS_KEY = 'cached_booking_details';
const PENDING_BOOKING_ACTIONS_KEY = 'pending_booking_actions';
const PENDING_PATIENT_ACTIONS_KEY = 'pending_patient_actions';
const PENDING_LOCAL_ACTIONS_KEY = 'pending_local_actions';
const APPOINTMENT_DETAIL_STATE_KEY = 'cached_appointment_detail_state';
const APPOINTMENT_DETAIL_DRAFTS_KEY = 'cached_appointment_detail_drafts';

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

export const getCachedAssignedBookings = async () => {
  const value = await AsyncStorage.getItem(CACHED_ASSIGNED_BOOKINGS_KEY);
  const parsedValue = safelyParseJson(value, []);
  return Array.isArray(parsedValue) ? parsedValue : [];
};

export const persistAssignedBookings = async bookings => {
  await AsyncStorage.setItem(
    CACHED_ASSIGNED_BOOKINGS_KEY,
    JSON.stringify(Array.isArray(bookings) ? bookings : []),
  );
};

export const getCachedCompletedBookings = async () => {
  const value = await AsyncStorage.getItem(CACHED_COMPLETED_BOOKINGS_KEY);
  const parsedValue = safelyParseJson(value, []);
  return Array.isArray(parsedValue) ? parsedValue : [];
};

export const persistCompletedBookings = async bookings => {
  await AsyncStorage.setItem(
    CACHED_COMPLETED_BOOKINGS_KEY,
    JSON.stringify(Array.isArray(bookings) ? bookings : []),
  );
};

export const getCachedBookingDetailsMap = async () => {
  const value = await AsyncStorage.getItem(CACHED_BOOKING_DETAILS_KEY);
  const parsedValue = safelyParseJson(value, {});
  return parsedValue && typeof parsedValue === 'object' ? parsedValue : {};
};

export const getCachedBookingDetail = async bookingId => {
  if (!bookingId) {
    return null;
  }

  const detailsMap = await getCachedBookingDetailsMap();
  return detailsMap[String(bookingId)] || null;
};

export const persistBookingDetail = async bookingDetail => {
  const bookingId = bookingDetail?.id;

  if (!bookingId) {
    return;
  }

  const detailsMap = await getCachedBookingDetailsMap();
  detailsMap[String(bookingId)] = bookingDetail;

  await AsyncStorage.setItem(
    CACHED_BOOKING_DETAILS_KEY,
    JSON.stringify(detailsMap),
  );
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
  const cachedDetail = detailsMap[normalizedBookingId];

  if (cachedDetail) {
    detailsMap[normalizedBookingId] = {
      ...cachedDetail,
      status,
      ...(bookingStatusCode ? {bookingStatusCode} : {}),
    };

    await AsyncStorage.setItem(
      CACHED_BOOKING_DETAILS_KEY,
      JSON.stringify(detailsMap),
    );
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
  const cachedDetail = detailsMap[normalizedBookingId];

  if (cachedDetail) {
    detailsMap[normalizedBookingId] = {
      ...cachedDetail,
      ...(patientCount ? {patientCount} : {}),
      ...(Array.isArray(patients) ? {patients} : {}),
    };

    await AsyncStorage.setItem(
      CACHED_BOOKING_DETAILS_KEY,
      JSON.stringify(detailsMap),
    );
  }
};

export const getPendingBookingActions = async () => {
  const value = await AsyncStorage.getItem(PENDING_BOOKING_ACTIONS_KEY);
  const parsedValue = safelyParseJson(value, []);
  return Array.isArray(parsedValue) ? parsedValue : [];
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

  const queuedAction = {
    id: `${bookingId}-${action}-${Date.now()}`,
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
    queuedAt: new Date().toISOString(),
  };

  const pendingActions = await getPendingBookingActions();
  pendingActions.push(queuedAction);

  await AsyncStorage.setItem(
    PENDING_BOOKING_ACTIONS_KEY,
    JSON.stringify(pendingActions),
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
  await AsyncStorage.setItem(
    APPOINTMENT_DETAIL_STATE_KEY,
    JSON.stringify(state && typeof state === 'object' ? state : {}),
  );
};

export const getCachedAppointmentDetailState = async () => {
  const value = await AsyncStorage.getItem(APPOINTMENT_DETAIL_STATE_KEY);
  const parsedValue = safelyParseJson(value, {});
  return parsedValue && typeof parsedValue === 'object' ? parsedValue : {};
};

export const persistAppointmentDetailDrafts = async drafts => {
  await AsyncStorage.setItem(
    APPOINTMENT_DETAIL_DRAFTS_KEY,
    JSON.stringify(drafts && typeof drafts === 'object' ? drafts : {}),
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
  ]);
};

export const clearOfflineBookingViewCache = async () => {
  await AsyncStorage.multiRemove([
    CACHED_ASSIGNED_BOOKINGS_KEY,
    CACHED_COMPLETED_BOOKINGS_KEY,
    CACHED_BOOKING_DETAILS_KEY,
    APPOINTMENT_DETAIL_STATE_KEY,
    APPOINTMENT_DETAIL_DRAFTS_KEY,
  ]);
};
