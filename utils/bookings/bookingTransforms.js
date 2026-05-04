const toDisplayString = value => {
  if (value === null || value === undefined) {
    return '';
  }

  if (typeof value === 'string') {
    return value.trim();
  }

  if (typeof value === 'number') {
    return String(value);
  }

  return '';
};

const firstNonEmptyValue = (...values) => {
  for (const value of values) {
    const normalizedValue = toDisplayString(value);

    if (normalizedValue) {
      return normalizedValue;
    }
  }

  return '';
};

const toCoordinateString = value => {
  if (value === null || value === undefined || value === '') {
    return '';
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }

  if (typeof value === 'string') {
    const trimmedValue = value.trim();

    if (!trimmedValue) {
      return '';
    }

    const numericValue = Number(trimmedValue);
    return Number.isFinite(numericValue) ? trimmedValue : '';
  }

  return '';
};

const toBookingStatusCode = value => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const trimmedValue = value.trim();

    if (!trimmedValue) {
      return 0;
    }

    const numericValue = Number(trimmedValue);
    if (Number.isFinite(numericValue)) {
      return numericValue;
    }

    const normalizedValue = trimmedValue.toLowerCase();

    if (normalizedValue.includes('complete')) {
      return normalizedValue.includes('partial') ? 5 : 3;
    }

    if (normalizedValue.includes('cancel')) {
      return 4;
    }

    if (normalizedValue.includes('start')) {
      return 2;
    }

    if (normalizedValue.includes('assign')) {
      return 1;
    }
  }

  return 0;
};

const getBookingStatusLabel = (statusCode, fallbackStatus = '') => {
  if (statusCode === 1) {
    return 'Assigned';
  }

  if (statusCode === 2) {
    return 'Started';
  }

  if (statusCode === 3) {
    return 'Completed';
  }

  if (statusCode === 4) {
    return 'Cancelled';
  }

  if (statusCode === 5) {
    return 'Partial Complete';
  }

  return toDisplayString(fallbackStatus) || 'Assigned';
};

const getAddressValue = (booking, ...paths) => {
  for (const path of paths) {
    const segments = path.split('.');
    let currentValue = booking;

    for (const segment of segments) {
      currentValue = currentValue?.[segment];
    }

    const normalizedValue = toDisplayString(currentValue);

    if (normalizedValue) {
      return normalizedValue;
    }
  }

  return '';
};

const buildAddressParts = booking => {
  const addressParts = [
    getAddressValue(booking, 'address.address_type', 'address.addressType'),
    getAddressValue(
      booking,
      'address.house_flat_no',
      'address.houseNumber',
      'address.house_number',
      'address.flat_no',
      'address.flatNo',
      'house_number',
    ),
    getAddressValue(booking, 'address.floor', 'floor'),
    getAddressValue(
      booking,
      'address.street_line',
      'address.streetLine',
      'address.address_line_1',
      'address.addressLine1',
      'address.line1',
      'address.street',
    ),
    getAddressValue(
      booking,
      'address.address_line_2',
      'address.addressLine2',
      'address.line2',
    ),
    getAddressValue(booking, 'address.landmark', 'landmark'),
    getAddressValue(
      booking,
      'address.colony_name_snapshot',
      'address.colonyName',
      'address.colony_name',
      'address.locality',
      'address.area',
      'colony_name',
    ),
    getAddressValue(
      booking,
      'address.city',
      'address.district',
      'city',
      'district',
    ),
    getAddressValue(
      booking,
      'address.state',
      'address.state_name',
      'state',
    ),
    getAddressValue(
      booking,
      'address.pincode_snapshot',
      'address.pincode',
      'address.zipcode',
      'address.pin_code',
      'pincode',
    ),
  ];

  return addressParts.filter(value => value && value !== 'N/A');
};

const buildFullAddress = (booking, fallbackFullAddress = '') => {
  const directFullAddress = firstNonEmptyValue(
    getAddressValue(
      booking,
      'address.fullAddress',
      'address.full_address',
      'address.display_address',
      'address.displayAddress',
      'address.complete_address',
      'address.completeAddress',
      'full_address',
      'fullAddress',
      'display_address',
      'displayAddress',
    ),
    typeof booking?.address === 'string' ? booking.address : '',
  );

  if (directFullAddress) {
    return directFullAddress;
  }

  const composedAddress = buildAddressParts(booking).join(', ');
  return composedAddress || fallbackFullAddress || 'Address not available';
};

export const extractAssignedBookings = responseData => {
  if (Array.isArray(responseData)) {
    return responseData;
  }

  if (Array.isArray(responseData?.data)) {
    return responseData.data;
  }

  if (Array.isArray(responseData?.bookings)) {
    return responseData.bookings;
  }

  if (Array.isArray(responseData?.items)) {
    return responseData.items;
  }

  if (Array.isArray(responseData?.results)) {
    return responseData.results;
  }

  return [];
};

export const extractAccessToken = responseData =>
  toDisplayString(
    responseData?.access_token ||
      responseData?.accessToken ||
      responseData?.token ||
      responseData?.data?.access_token ||
      responseData?.data?.accessToken ||
      responseData?.data?.token ||
      responseData?.user?.access_token ||
      responseData?.user?.accessToken ||
      responseData?.user?.token,
  );

const extractTestsList = source => {
  if (Array.isArray(source)) {
    return source
      .map(item =>
        toDisplayString(
          item?.name || item?.test_name || item?.testName || item?.label || item,
        ),
      )
      .filter(Boolean);
  }

  const value = toDisplayString(source);
  return value ? [value] : [];
};

const normalizePatientTests = source => {
  if (!Array.isArray(source)) {
    return [];
  }

  return source
    .map((test, index) => {
      const code = toDisplayString(
        test?.booked_code || test?.bookedCode || test?.code,
      );
      const name = toDisplayString(
        test?.test_name || test?.testName || test?.name || test?.label || test,
      );

      if (!code && !name) {
        return null;
      }

      return {
        id: `${code || 'test'}-${index}`,
        code: code || 'N/A',
        name: name || 'Unnamed Test',
      };
    })
    .filter(Boolean);
};

const normalizeYesNoValue = value => {
  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No';
  }

  const normalizedValue = toDisplayString(value).toLowerCase();

  if (['yes', 'y', 'true', '1'].includes(normalizedValue)) {
    return 'Yes';
  }

  return 'No';
};

export const normalizeAssignedBooking = (booking, index) => {
  const preferredVisitDate = toDisplayString(
    booking?.preferred_visit_date || booking?.preferredVisitDate,
  );
  const preferredTimeSlot = toDisplayString(
    booking?.preferred_time_slot || booking?.preferredTimeSlot,
  );
  const callerMobile = toDisplayString(
    booking?.caller_mobile || booking?.callerMobile || booking?.mobile,
  );
  const patientCount = Number(booking?.patient_count || booking?.patientCount || 0);
  const bookingStatusCode = toBookingStatusCode(
    booking?.booking_status ?? booking?.bookingStatus ?? booking?.status,
  );
  const sourceType = toDisplayString(
    booking?.source_type || booking?.sourceType,
  );

  return {
    id:
      toDisplayString(
        booking?.id || booking?._id || booking?.booking_id || booking?.bookingId,
      ) || `assigned-${index}`,
    bookingCode:
      toDisplayString(
        booking?.bookingCode ||
          booking?.booking_code ||
          booking?.code ||
          booking?.reference_no,
      ) || `Booking #${booking?.id || index + 1}`,
    appointmentId:
      toDisplayString(booking?.appointment_id || booking?.appointmentId) || '',
    sourceType: sourceType || 'BOOKING',
    patients: [],
    patientCount: Number.isNaN(patientCount) || patientCount < 1 ? 1 : patientCount,
    preferredVisitDate: preferredVisitDate || 'Date not available',
    bookingStatusCode,
    status: getBookingStatusLabel(bookingStatusCode, booking?.status),
    timeSlot: preferredTimeSlot || 'Time not available',
    address: {
      fullAddress: buildFullAddress(booking),
    },
    testsSummary: '',
    phoneNumber: callerMobile || '',
  };
};

export const normalizeAssignedBookingDetail = (booking, fallbackBooking) => {
  const bookingStatusCode = toBookingStatusCode(
    booking?.booking_status ??
      booking?.bookingStatus ??
      booking?.status ??
      fallbackBooking?.bookingStatusCode ??
      fallbackBooking?.status,
  );
  const latitude = firstNonEmptyValue(
    toCoordinateString(
      booking?.address?.latitude ??
        booking?.address?.lat ??
        booking?.latitude ??
        booking?.lat,
    ),
    toCoordinateString(
      booking?.address?.geo_location?.latitude ??
        booking?.address?.geo_location?.lat ??
        booking?.geo_location?.latitude ??
        booking?.geo_location?.lat,
    ),
    toCoordinateString(
      booking?.address?.coordinates?.latitude ??
        booking?.address?.coordinates?.lat ??
        booking?.coordinates?.latitude ??
        booking?.coordinates?.lat,
    ),
  );
  const longitude = firstNonEmptyValue(
    toCoordinateString(
      booking?.address?.longitude ??
        booking?.address?.lng ??
        booking?.address?.long ??
        booking?.longitude ??
        booking?.lng ??
        booking?.long,
    ),
    toCoordinateString(
      booking?.address?.geo_location?.longitude ??
        booking?.address?.geo_location?.lng ??
        booking?.address?.geo_location?.long ??
        booking?.geo_location?.longitude ??
        booking?.geo_location?.lng ??
        booking?.geo_location?.long,
    ),
    toCoordinateString(
      booking?.address?.coordinates?.longitude ??
        booking?.address?.coordinates?.lng ??
        booking?.address?.coordinates?.long ??
        booking?.coordinates?.longitude ??
        booking?.coordinates?.lng ??
        booking?.coordinates?.long,
    ),
  );
  const fallbackFullAddress = firstNonEmptyValue(
    fallbackBooking?.address?.fullAddress,
    typeof fallbackBooking?.address === 'string' ? fallbackBooking.address : '',
  );

  const patientsSource = Array.isArray(booking?.patients) ? booking.patients : [];
  const fallbackPatients = Array.isArray(fallbackBooking?.patients)
    ? fallbackBooking.patients
    : [];
  const patientCount = Number(
    booking?.patient_count || booking?.patientCount || fallbackBooking?.patientCount || 0,
  );
  const patients = (patientsSource.length ? patientsSource : fallbackPatients).map(
    (patient, index) => {
      const bookingPatientId = toDisplayString(
        patient?.booking_patient_id ||
          patient?.bookingPatientId ||
          patient?.booking_patient?.id,
      );
      const patientId = toDisplayString(
        patient?.patient_id ||
          patient?.patientId ||
          patient?.patient?.id ||
          patient?.id ||
          patient?._id,
      );

      return {
        id: bookingPatientId || patientId || `patient-${index}`,
        bookingPatientId,
        patientId,
        title: toDisplayString(patient?.title) || 'Mr.',
        name:
          toDisplayString(
            patient?.full_name ||
              patient?.name ||
              [patient?.first_name, patient?.last_name].filter(Boolean).join(' '),
          ) || `Patient ${index + 1}`,
        age: toDisplayString(patient?.age_years || patient?.age) || 'N/A',
        dob: toDisplayString(patient?.dob || patient?.date_of_birth) || 'N/A',
        panelCompany:
          toDisplayString(
            patient?.panelCompany || patient?.panel_company || patient?.panel,
          ) || 'N/A',
        mobileNumber:
          toDisplayString(
            patient?.contact_mobile ||
              patient?.mobileNumber ||
              patient?.mobile_number ||
              patient?.phone,
          ) || 'N/A',
        alternateMobileNumber:
          toDisplayString(patient?.alternate_mobile || patient?.alternateMobile) ||
          'N/A',
        email: toDisplayString(patient?.email) || '',
        labmatePid:
          toDisplayString(
            patient?.labmate_pid ||
              patient?.labmatePid ||
              patient?.pid ||
              patient?.patient_pid,
          ) || '',
        referredBy:
          toDisplayString(
            patient?.referred_by ||
              patient?.referredBy ||
              patient?.refer_by ||
              patient?.referBy ||
              patient?.doctor_name ||
              patient?.doctorName ||
              patient?.referrer,
          ) || 'N/A',
        internalReferencedBy:
          toDisplayString(
            patient?.internal_referenced_by ||
              patient?.internalReferencedBy ||
              patient?.internal_reference_by ||
              patient?.internalReferenceBy ||
              patient?.internal_refer_by ||
              patient?.internalReferBy,
          ) || 'N/A',
        reportCourier: normalizeYesNoValue(
          patient?.report_courier ??
            patient?.reportCourier ??
            patient?.is_report_courier ??
            patient?.isReportCourier ??
            patient?.report_delivery ??
            patient?.reportDelivery,
        ),
        bookingPatientStatusCode: toBookingStatusCode(
          patient?.booking_patient_status ??
            patient?.bookingPatientStatus ??
            patient?.status_code ??
            patient?.statusCode,
        ),
        gender: toDisplayString(patient?.gender) || 'N/A',
        tag: toDisplayString(patient?.tag) || 'N/A',
        tests: normalizePatientTests(
          patient?.tests || patient?.test_list || booking?.tests,
        ),
        tubes: extractTestsList(patient?.tubes || patient?.tube_list),
        documents: extractTestsList(
          patient?.documents || patient?.document_list || patient?.docs,
        ),
      };
    },
  );

  const testsSummary = Array.isArray(booking?.tests)
    ? extractTestsList(booking.tests).join(', ')
    : toDisplayString(
        booking?.testsSummary ||
          booking?.test_summary ||
          booking?.tests ||
          fallbackBooking?.testsSummary,
      );
  const sourceType = toDisplayString(
    booking?.source_type ||
      booking?.sourceType ||
      fallbackBooking?.sourceType ||
      fallbackBooking?.source_type,
  );

  return {
    id:
      toDisplayString(
        booking?.id || booking?._id || booking?.booking_id || booking?.bookingId,
      ) || fallbackBooking?.id || 'assigned-detail',
    bookingCode:
      toDisplayString(
        booking?.bookingCode ||
          booking?.booking_code ||
          booking?.code ||
          booking?.reference_no,
      ) ||
      fallbackBooking?.bookingCode ||
      'Assigned Booking',
    appointmentId:
      toDisplayString(booking?.appointment_id || booking?.appointmentId) ||
      toDisplayString(
        fallbackBooking?.appointmentId || fallbackBooking?.appointment_id,
      ) ||
      '',
    sourceType: sourceType || 'BOOKING',
    visitDate:
      toDisplayString(
        booking?.visitDate || booking?.visit_date || booking?.appointment_date,
      ) || 'Visit date not available',
    timeSlot:
      toDisplayString(
        booking?.timeSlot || booking?.time_slot || booking?.slot || booking?.time,
      ) ||
      fallbackBooking?.timeSlot ||
      'Time not available',
    status:
      getBookingStatusLabel(
        bookingStatusCode,
        booking?.status || fallbackBooking?.status,
      ),
    bookingStatusCode,
    patientCount:
      Number.isNaN(patientCount) || patientCount < 1
        ? patients.length
        : patientCount,
    address: {
      addressType:
        getAddressValue(booking, 'address.address_type', 'address.addressType') ||
        'N/A',
      houseNumber:
        getAddressValue(
          booking,
          'address.house_flat_no',
          'address.houseNumber',
          'address.house_number',
          'address.flat_no',
          'address.flatNo',
          'house_number',
        ) || 'N/A',
      floor: getAddressValue(booking, 'address.floor', 'floor') || 'N/A',
      streetLine:
        getAddressValue(
          booking,
          'address.street_line',
          'address.streetLine',
          'address.address_line_1',
          'address.addressLine1',
          'address.line1',
          'address.street',
        ) || 'N/A',
      landmark: getAddressValue(booking, 'address.landmark', 'landmark') || 'N/A',
      colonyName:
        getAddressValue(
          booking,
          'address.colony_name_snapshot',
          'address.colonyName',
          'address.colony_name',
          'address.locality',
          'address.area',
          'colony_name',
        ) || 'N/A',
      pincode:
        getAddressValue(
          booking,
          'address.pincode_snapshot',
          'address.pincode',
          'address.zipcode',
          'address.pin_code',
          'pincode',
        ) || 'N/A',
      routeNumber: 'N/A',
      city:
        getAddressValue(
          booking,
          'address.city',
          'address.district',
          'city',
          'district',
        ) || 'N/A',
      accessNotes:
        getAddressValue(
          booking,
          'address.access_notes',
          'address.accessNotes',
          'address.instructions',
          'address.delivery_instructions',
        ) || 'N/A',
      fullAddress: buildFullAddress(booking, fallbackFullAddress),
      latitude: latitude || 'N/A',
      longitude: longitude || 'N/A',
    },
    phoneNumber:
      toDisplayString(
        booking?.phoneNumber ||
          booking?.phone_number ||
          booking?.mobile ||
          booking?.mobile_number,
      ) ||
      fallbackBooking?.phoneNumber ||
      'N/A',
    testsSummary: testsSummary || 'Tests not available',
    payment: {
      state:
        toDisplayString(
          booking?.payment?.state || booking?.payment_status || booking?.paymentState,
        ) || 'N/A',
      mode:
        toDisplayString(
          booking?.payment?.mode || booking?.payment_mode || booking?.paymentMode,
        ) || 'N/A',
      amount:
        toDisplayString(
          booking?.payment?.amount || booking?.amount || booking?.payment_amount,
        ) || 'N/A',
    },
    tags: Array.isArray(booking?.tags)
      ? booking.tags.map(tag => toDisplayString(tag)).filter(Boolean)
      : [],
    patients: patients.length
      ? patients
      : [
          {
            id: 'patient-0',
            title: 'Mr.',
            name: fallbackBooking?.patients?.[0]?.name || 'Patient details unavailable',
            age: 'N/A',
            dob: 'N/A',
            panelCompany: 'N/A',
            mobileNumber: 'N/A',
            alternateMobileNumber: 'N/A',
            email: '',
            labmatePid: '',
            bookingPatientStatusCode: 0,
            gender: 'N/A',
            tag: 'N/A',
            reportCourier: 'No',
            tests: normalizePatientTests(booking?.tests),
            tubes: [],
            documents: [],
          },
        ],
  };
};
