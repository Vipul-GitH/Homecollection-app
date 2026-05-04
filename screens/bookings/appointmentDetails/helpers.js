export const getGenderFromTitle = title => {
  if (title === 'Mr' || title === 'Master') {
    return 'Male';
  }

  if (title === 'Mrs' || title === 'Ms' || title === 'Baby') {
    return 'Female';
  }

  return 'Other';
};

export const calculateAgeFromDob = dob => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dob)) {
    return '';
  }

  const [year, month, day] = dob.split('-').map(Number);
  const birthDate = new Date(year, month - 1, day);

  if (
    birthDate.getFullYear() !== year ||
    birthDate.getMonth() !== month - 1 ||
    birthDate.getDate() !== day
  ) {
    return '';
  }

  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const hasBirthdayPassed =
    today.getMonth() > birthDate.getMonth() ||
    (today.getMonth() === birthDate.getMonth() &&
      today.getDate() >= birthDate.getDate());

  if (!hasBirthdayPassed) {
    age -= 1;
  }

  return age >= 0 ? String(age) : '';
};

export const toDateInputValue = date => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const getCalendarDays = visibleMonth => {
  const year = visibleMonth.getFullYear();
  const month = visibleMonth.getMonth();
  const firstDayOfMonth = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const leadingBlankDays = firstDayOfMonth.getDay();
  const calendarDays = [];

  for (let index = 0; index < leadingBlankDays; index += 1) {
    calendarDays.push(null);
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    calendarDays.push(new Date(year, month, day));
  }

  return calendarDays;
};

export const normalizeOptionValue = (value, options, fallbackValue) => {
  const normalizedValue = String(value || '').replace(/\.$/, '').trim();
  return options.includes(normalizedValue) ? normalizedValue : fallbackValue;
};

export const normalizeFormText = value => {
  const normalizedValue =
    value === null || value === undefined ? '' : String(value).trim();
  return normalizedValue === 'N/A' ? '' : normalizedValue;
};

export const normalizeMobileValue = value =>
  normalizeFormText(value).replace(/\D/g, '');

export const getMimeTypeFromFileName = fileName => {
  const normalizedFileName = String(fileName || '').toLowerCase();

  if (normalizedFileName.endsWith('.pdf')) {
    return 'application/pdf';
  }

  if (normalizedFileName.endsWith('.jpg') || normalizedFileName.endsWith('.jpeg')) {
    return 'image/jpeg';
  }

  if (normalizedFileName.endsWith('.png')) {
    return 'image/png';
  }

  if (normalizedFileName.endsWith('.webp')) {
    return 'image/webp';
  }

  return 'application/octet-stream';
};

export const getPatientMutationId = patient =>
  normalizeFormText(
    patient?.bookingPatientId ||
      patient?.booking_patient_id ||
      patient?.patientId ||
      patient?.patient_id ||
      patient?.id,
  );

export const getUpdatePatientId = patient =>
  normalizeFormText(patient?.patientId || patient?.patient_id || patient?.id);

export const normalizePanelCompanyItems = responseData => {
  if (!Array.isArray(responseData?.items)) {
    return [];
  }

  return responseData.items.map((item, index) => ({
    id: `${normalizeFormText(item?.CompCatID) || 'na'}-${
      normalizeFormText(item?.CenterID) || 'na'
    }-${index}`,
    name: normalizeFormText(item?.pname) || 'Unnamed Company',
    details: normalizeFormText(item?.CatDetails),
    compCatId: normalizeFormText(item?.CompCatID),
    centerId: normalizeFormText(item?.CenterID),
    billingChargeMode: normalizeFormText(item?.BillingChargeMode),
    searchKey: `${normalizeFormText(item?.pname)} ${normalizeFormText(
      item?.CatDetails,
    )} ${normalizeFormText(item?.CompCatID)}`.toLowerCase(),
  }));
};

export const findMatchingPanelCompanies = (items, panelCompanyValue) => {
  const normalizedPanelValue = normalizeFormText(panelCompanyValue).toLowerCase();

  if (!normalizedPanelValue) {
    return [];
  }

  const pickBestNamedMatches = matches => {
    if (matches.length <= 1) {
      return matches;
    }

    const numericPanelToken = normalizedPanelValue.match(/\b\d+\b/)?.[0] || '';
    if (numericPanelToken) {
      const idMatches = matches.filter(
        item => normalizeFormText(item?.compCatId) === numericPanelToken,
      );

      if (idMatches.length) {
        return idMatches.slice(0, 1);
      }
    }

    return [...matches]
      .sort(
        (leftItem, rightItem) =>
          Number(rightItem?.compCatId || 0) - Number(leftItem?.compCatId || 0),
      )
      .slice(0, 1);
  };

  const exactMatches = items.filter(item => {
    const normalizedName = normalizeFormText(item?.name).toLowerCase();
    const normalizedDetails = normalizeFormText(item?.details).toLowerCase();

    return (
      normalizedName === normalizedPanelValue ||
      normalizedDetails === normalizedPanelValue
    );
  });

  if (exactMatches.length) {
    return pickBestNamedMatches(exactMatches);
  }

  return items.filter(item => {
    const normalizedName = normalizeFormText(item?.name).toLowerCase();
    const normalizedDetails = normalizeFormText(item?.details).toLowerCase();

    return (
      normalizedName.includes(normalizedPanelValue) ||
      normalizedDetails.includes(normalizedPanelValue) ||
      normalizedPanelValue.includes(normalizedName) ||
      normalizedPanelValue.includes(normalizedDetails)
    );
  });
};

export const isSamePanelCompany = (leftCompany, rightCompany) => {
  if (!leftCompany || !rightCompany) {
    return false;
  }

  const leftId = normalizeFormText(leftCompany?.id);
  const rightId = normalizeFormText(rightCompany?.id);

  if (leftId && rightId && leftId === rightId) {
    return true;
  }

  return (
    normalizeFormText(leftCompany?.compCatId) ===
      normalizeFormText(rightCompany?.compCatId) &&
    normalizeFormText(leftCompany?.centerId) ===
      normalizeFormText(rightCompany?.centerId) &&
    normalizeFormText(leftCompany?.name).toLowerCase() ===
      normalizeFormText(rightCompany?.name).toLowerCase() &&
    normalizeFormText(leftCompany?.details).toLowerCase() ===
      normalizeFormText(rightCompany?.details).toLowerCase()
  );
};

export const waitForMs = milliseconds =>
  new Promise(resolve => {
    setTimeout(resolve, milliseconds);
  });
