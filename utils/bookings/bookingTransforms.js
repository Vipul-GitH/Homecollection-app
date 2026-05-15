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

const toNumberValue = value => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  const normalizedValue = Number(String(value ?? '').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(normalizedValue) ? normalizedValue : 0;
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
      'pincode_snapshot',
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

export const extractAccessToken = responseData => {
  const rawToken = toDisplayString(
    responseData?.access_token ||
      responseData?.accessToken ||
      responseData?.token ||
      responseData?.jwt ||
      responseData?.data?.access_token ||
      responseData?.data?.accessToken ||
      responseData?.data?.token ||
      responseData?.data?.jwt ||
      responseData?.user?.access_token ||
      responseData?.user?.accessToken ||
      responseData?.user?.token,
  );

  return rawToken.replace(/^Bearer\s+/i, '').trim();
};

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
        bookingTestId: toDisplayString(
          test?.booking_test_id ||
            test?.bookingTestId ||
            test?.bookingTestID ||
            test?.booking_test ||
            test?.id,
        ),
        code: code || 'N/A',
        name: name || 'Unnamed Test',
        compCatId: toDisplayString(
          test?.compCatId ||
            test?.comp_cat_id ||
            test?.CompCatID ||
            test?.company_category_id,
        ),
        panelCompanyName: toDisplayString(
          test?.panelCompanyName || test?.panel_company || test?.panel,
        ),
        cat_details: toDisplayString(test?.cat_details || test?.catDetails),
        selected_charge_mode: toDisplayString(
          test?.selected_charge_mode || test?.selectedChargeMode,
        ),
        centerId: toDisplayString(test?.centerId || test?.CenterID),
        atype: toDisplayString(test?.atype || test?.Atype),
        catalog_key: toDisplayString(test?.catalog_key || test?.catalogKey),
        gcode: toDisplayString(test?.gcode || test?.GCode || test?.Gcode),
        scode: toDisplayString(test?.scode || test?.SCode || test?.Scode),
        test_code: toDisplayString(
          test?.test_code || test?.testCode || test?.TestCode,
        ),
        mrp: toNumberValue(test?.mrp || test?.MRP || test?.amount),
        charge: toNumberValue(test?.charge || test?.Charge || test?.mrp || test?.MRP),
        percentageonstandard: toNumberValue(
          test?.percentageonstandard ||
            test?.percentageOnStandard ||
            test?.percentage_on_standard ||
            test?.PercentageOnStandard ||
            test?.percentagestandard ||
            test?.percentageStandard ||
            test?.percentage_standard ||
            test?.PercentageStandard,
        ),
        max_discount: toNumberValue(
          test?.max_discount || test?.maxDiscount || test?.MaxDiscount,
        ),
        max_allowed_discount: toNumberValue(
          test?.max_allowed_discount ||
            test?.maxAllowedDiscount ||
            test?.MaximumpercentageAllowed ||
            test?.maximumpercentage_allowed,
        ),
      };
    })
    .filter(Boolean);
};

const normalizeLinkedPatients = source =>
  (Array.isArray(source) ? source : [])
    .map((patient, index) => ({
      id:
        toDisplayString(patient?.id || patient?.patient_id || patient?.patientId) ||
        `linked-${index}`,
      patientId: toDisplayString(patient?.id || patient?.patient_id || patient?.patientId),
      patientCode: toDisplayString(patient?.patient_code || patient?.patientCode),
      title: toDisplayString(patient?.title) || 'Mr',
      name:
        toDisplayString(
          patient?.full_name ||
            patient?.name ||
            [patient?.first_name, patient?.last_name].filter(Boolean).join(' '),
        ) || `Linked Patient ${index + 1}`,
      gender: toDisplayString(patient?.gender) || 'N/A',
      age: toDisplayString(patient?.age_years || patient?.age) || 'N/A',
      dob: toDisplayString(patient?.date_of_birth || patient?.dob) || 'N/A',
      mobileNumber:
        toDisplayString(
          patient?.contact_mobile ||
            patient?.mobileNumber ||
            patient?.mobile_number ||
            patient?.phone,
        ) || 'N/A',
      alternateMobileNumber:
        toDisplayString(patient?.alternate_mobile || patient?.alternateMobile) ||
        '',
      panelCompany:
        toDisplayString(patient?.panel_company || patient?.panelCompany) || 'N/A',
      tag: toDisplayString(patient?.tag) || 'N/A',
    }))
    .filter(Boolean);

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

const normalizeUrlList = value => {
  if (Array.isArray(value)) {
    return value.map(item => toDisplayString(item)).filter(Boolean);
  }

  const normalizedValue = toDisplayString(value);

  if (!normalizedValue) {
    return [];
  }

  try {
    const parsedValue = JSON.parse(normalizedValue);
    if (Array.isArray(parsedValue)) {
      return parsedValue.map(item => toDisplayString(item)).filter(Boolean);
    }
  } catch (error) {
    // Fall back to separator parsing below.
  }

  return normalizedValue
    .split(/[,\n|]+/)
    .map(item => item.trim())
    .filter(Boolean);
};

export const normalizeAssignedBooking = (booking, index) => {
  const preferredVisitDate = firstNonEmptyValue(
    booking?.preferred_visit_date,
    booking?.preferredVisitDate,
    booking?.visitDate,
    booking?.visit_date,
    booking?.appointment_date,
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
  const patientNamesText = toDisplayString(
    booking?.patient_names || booking?.patientNames,
  );
  const patientNames = patientNamesText
    ? patientNamesText
        .split(',')
        .map(name => toDisplayString(name))
        .filter(Boolean)
    : [];

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
    patients: patientNames.map((name, patientIndex) => ({
      id: `assigned-patient-${index}-${patientIndex}`,
      name,
    })),
    patientNames: patientNamesText,
    patientCount:
      Number.isNaN(patientCount) || patientCount < 1
        ? Math.max(1, patientNames.length || 1)
        : patientCount,
    preferredVisitDate: preferredVisitDate || 'Date not available',
    visitDate: preferredVisitDate || 'Date not available',
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
  const billingSummary =
    booking?.billing_summary ||
    booking?.billingSummary ||
    booking?.billing ||
    booking?.amountFields ||
    {};
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
      const selectedCompCatIds = toDisplayString(
        patient?.selected_comp_cat_ids || patient?.selectedCompCatIds,
      );
      const primarySelectedCompCatId =
        selectedCompCatIds
          .split(',')
          .map(value => value.trim())
          .find(Boolean) || '';

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
        cardNo:
          toDisplayString(
            patient?.card_no ||
              patient?.cardNo ||
              patient?.cghs_card_no ||
              patient?.cghsCardNo,
          ) || '',
        panelCode: toDisplayString(
          patient?.panelCode || patient?.panel_code || patient?.code,
        ),
        panelAbarid: toDisplayString(
          patient?.panelAbarid || patient?.panel_abarid || patient?.ABARID,
        ),
        compCatId: toDisplayString(
          primarySelectedCompCatId ||
            patient?.compCatId ||
            patient?.comp_cat_id ||
            patient?.CompCatID,
        ),
        selectedCompCatIds,
        selectedChargeModes: toDisplayString(
          patient?.selected_charge_modes || patient?.selectedChargeModes,
        ),
        selectedPanelCompanies: toDisplayString(
          patient?.selected_panel_companies || patient?.selectedPanelCompanies,
        ),
        centerId: toDisplayString(
          patient?.centerId || patient?.center_id || patient?.CenterID,
        ),
        atype: toDisplayString(patient?.atype || patient?.Atype),
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
              patient?.referrer ||
              booking?.referred_by ||
              booking?.referredBy ||
              booking?.refer_by ||
              booking?.referBy ||
              booking?.doctor_name ||
              booking?.doctorName ||
              booking?.referrer ||
              fallbackBooking?.referred_by ||
              fallbackBooking?.referredBy,
          ) || 'N/A',
        internalReferencedBy:
          toDisplayString(
            patient?.internal_referenced_by ||
              patient?.internalReferencedBy ||
              patient?.internal_reference_by ||
              patient?.internalReferenceBy ||
              patient?.internal_refer_by ||
              patient?.internalReferBy ||
              patient?.intrnl_rfrncd_by ||
              booking?.internal_referenced_by ||
              booking?.internalReferencedBy ||
              booking?.internal_reference_by ||
              booking?.internalReferenceBy ||
              booking?.internal_refer_by ||
              booking?.internalReferBy ||
              booking?.intrnl_rfrncd_by ||
              fallbackBooking?.internal_referenced_by ||
              fallbackBooking?.internalReferencedBy ||
              fallbackBooking?.intrnl_rfrncd_by,
          ) || 'N/A',
        reportCourier: normalizeYesNoValue(
          patient?.report_courier ??
            patient?.reportCourier ??
            patient?.is_report_courier ??
            patient?.isReportCourier ??
            patient?.report_delivery ??
            patient?.reportDelivery,
        ),
        testBookingStatus: toDisplayString(
          patient?.test_booking_status ||
            patient?.testBookingStatus ||
            patient?.test_booking_status_label ||
            patient?.testBookingStatusLabel,
        ),
        bookingPatientStatusCode: toBookingStatusCode(
          patient?.booking_patient_status ??
            patient?.bookingPatientStatus ??
            patient?.status_code ??
            patient?.statusCode,
        ),
        gender: toDisplayString(patient?.gender) || 'N/A',
        tag: toDisplayString(patient?.tag) || 'N/A',
        additionalDiscountAmount: toNumberValue(
          firstNonEmptyValue(
            patient?.additional_discount_amount,
            patient?.additionalDiscountAmount,
            patient?.ad_dis,
            patient?.Ad_Dis,
          ),
        ),
        tests: normalizePatientTests(
          patient?.tests || patient?.test_list || booking?.tests,
        ),
        tubes: extractTestsList(patient?.tubes || patient?.tube_list),
        documents: extractTestsList(
          patient?.documents || patient?.document_list || patient?.docs,
        ),
        patientDocumentUrls: normalizeUrlList(
          patient?.patient_document_urls ||
            patient?.patientDocumentUrls ||
            patient?.patient_document_url ||
            patient?.patientDocumentUrl,
        ),
        prescriptionUrls: normalizeUrlList(
          patient?.prescription_urls ||
            patient?.prescriptionUrls ||
            patient?.prescription_url ||
            patient?.prescriptionUrl,
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
    amountFields: {
      subtotal: toNumberValue(
        firstNonEmptyValue(
          booking?.F_Apt_Am,
          booking?.f_apt_am,
          booking?.subtotal,
          booking?.sub_total,
          billingSummary?.F_Apt_Am,
          billingSummary?.f_apt_am,
          billingSummary?.subtotal,
          billingSummary?.sub_total,
        ),
      ),
      baseDiscount: toNumberValue(
        firstNonEmptyValue(
          booking?.F_dis,
          booking?.f_dis,
          booking?.base_discount,
          booking?.baseDiscount,
          billingSummary?.F_dis,
          billingSummary?.f_dis,
          billingSummary?.base_discount,
          billingSummary?.baseDiscount,
        ),
      ),
      additionalDiscount: toNumberValue(
        firstNonEmptyValue(
          booking?.Ad_Dis,
          booking?.ad_dis,
          booking?.additional_discount,
          booking?.additionalDiscount,
          booking?.additionalDiscountAmount,
          booking?.additional_discount_amount,
          billingSummary?.Ad_Dis,
          billingSummary?.ad_dis,
          billingSummary?.additional_discount,
          billingSummary?.additionalDiscount,
          billingSummary?.additionalDiscountAmount,
          billingSummary?.additional_discount_amount,
        ),
      ),
      totalAmount: toNumberValue(
        firstNonEmptyValue(
          booking?.total_amount,
          booking?.totalAmount,
          booking?.final_amount,
          booking?.finalAmount,
          billingSummary?.total_amount,
          billingSummary?.totalAmount,
          billingSummary?.final_amount,
          billingSummary?.finalAmount,
        ),
      ),
      amountReceived: toNumberValue(
        firstNonEmptyValue(
          booking?.amount_received,
          booking?.amountReceived,
          booking?.received_amount,
          booking?.receivedAmount,
          booking?.payment?.amount,
          billingSummary?.amount_received,
          billingSummary?.amountReceived,
          billingSummary?.received_amount,
          billingSummary?.receivedAmount,
        ),
      ),
      paymentMode: firstNonEmptyValue(
        booking?.payment_mode,
        booking?.paymentMode,
        booking?.payment?.mode,
        billingSummary?.payment_mode,
        billingSummary?.paymentMode,
      ),
    },
    patientCount:
      Number.isNaN(patientCount) || patientCount < 1
        ? patients.length
        : patientCount,
    address: {
      addressId: firstNonEmptyValue(
        getAddressValue(booking, 'address.address_id', 'address.addressId'),
        booking?.address_id,
        booking?.addressId,
      ),
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
          'pincode_snapshot',
          'pincode',
        ) || 'N/A',
      routeNumber:
        getAddressValue(
          booking,
          'address.route_no',
          'address.routeNumber',
          'address.route_number',
          'route_no',
          'routeNumber',
        ) || 'N/A',
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
      locationUrl: firstNonEmptyValue(
        booking?.location_url,
        booking?.locationUrl,
        booking?.location,
        getAddressValue(
          booking,
          'address.location_url',
          'address.locationUrl',
          'address.map_url',
          'address.mapUrl',
        ),
      ),
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
    linkedPatients: normalizeLinkedPatients(
      booking?.linked_patients ||
        booking?.linkedPatients ||
        fallbackBooking?.linkedPatients,
    ),
  };
};
