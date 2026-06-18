export const getGenderFromTitle = title => {
  if (
    title === 'Mr' ||
    title === 'Mr.' ||
    title === 'Master' ||
    title === 'Son Of' ||
    title === 'MST.' ||
    title === 'Mst'
  ) {
    return 'Male';
  }

  if (
    title === 'Mrs' ||
    title === 'Mrs.' ||
    title === 'Ms' ||
    title === 'MS.' ||
    title === 'Miss' ||
    title === 'Dr (Ms)' ||
    title === 'Baby' ||
    title === 'Daughter of'
  ) {
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
  const rawValue = String(value || '').trim();
  if (options.includes(rawValue)) {
    return rawValue;
  }

  const normalizedValue = rawValue.replace(/\.$/, '').trim();
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

export const getFileExtensionFromName = fileName => {
  const normalizedFileName = String(fileName || '').trim();
  const match = normalizedFileName.match(/\.([a-z0-9]+)$/i);
  return match ? `.${match[1].toLowerCase()}` : '';
};

export const getFileExtensionFromMimeType = mimeType => {
  const normalizedMimeType = String(mimeType || '').toLowerCase();

  if (normalizedMimeType.includes('pdf')) {
    return '.pdf';
  }

  if (normalizedMimeType.includes('jpeg') || normalizedMimeType.includes('jpg')) {
    return '.jpg';
  }

  if (normalizedMimeType.includes('png')) {
    return '.png';
  }

  if (normalizedMimeType.includes('webp')) {
    return '.webp';
  }

  return '';
};

export const getUploadFileName = ({
  preferredName,
  originalName,
  mimeType,
  fallbackPrefix = 'document',
  fallbackIndex = 0,
}) => {
  const normalizedPreferredName = normalizeFormText(preferredName);
  const normalizedOriginalName = normalizeFormText(originalName);
  const baseName =
    normalizedPreferredName ||
    normalizedOriginalName ||
    `${fallbackPrefix}-${Date.now()}-${fallbackIndex}`;

  if (getFileExtensionFromName(baseName)) {
    return baseName;
  }

  const extension =
    getFileExtensionFromName(normalizedOriginalName) ||
    getFileExtensionFromMimeType(mimeType);

  return extension ? `${baseName}${extension}` : baseName;
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

export const normalizePanelCompanyItems = (responseData, options = {}) => {
  if (!Array.isArray(responseData?.items)) {
    return [];
  }

  const allowedAtype = normalizeFormText(options.allowedAtype || 'C').toUpperCase();

  return responseData.items
    .map((item, index) => {
      const syncKey = normalizeFormText(item?.sync_key || item?.syncKey);
      const [syncCenterId = '', syncAtype = '', syncCode = '', syncAbarid = ''] =
        syncKey.split('|');
      const atype = normalizeFormText(item?.Atype) || syncAtype;

      return {
        id: `${normalizeFormText(item?.CompCatID) || 'na'}-${
          normalizeFormText(item?.CenterID) || 'na'
        }-${index}`,
        name: normalizeFormText(item?.pname) || 'Unnamed Company',
        details: normalizeFormText(item?.CatDetails),
        compCatId: normalizeFormText(item?.CompCatID),
        centerId: normalizeFormText(item?.CenterID) || syncCenterId,
        atype,
        panelCode: normalizeFormText(item?.code || item?.Code) || syncCode,
        panelAbarid: normalizeFormText(item?.ABARID || item?.abarid) || syncAbarid,
        syncKey,
        billingChargeMode: normalizeFormText(item?.BillingChargeMode),
        showmrp: normalizeFormText(
          item?.showmrp || item?.showMrp || item?.show_mrp || item?.ShowMRP,
        ) === '1'
          ? 1
          : 0,
        searchKey: normalizeFormText(item?.pname).toLowerCase(),
      };
    })
    .filter(
      item =>
        !allowedAtype ||
        normalizeFormText(item?.atype).toUpperCase() === allowedAtype,
    );
};

export const buildApiPanelCompaniesFromPatient = patient => {
  const compCatIds = normalizeFormText(
    patient?.selectedCompCatIds || patient?.selected_comp_cat_ids,
  )
    .split(',')
    .map(value => value.trim());
  const names = normalizeFormText(
    patient?.selectedPanelCompanies || patient?.selected_panel_companies,
  ).split(',');
  const chargeModes = normalizeFormText(
    patient?.selectedChargeModes ||
      patient?.selected_charge_modes ||
      patient?.selectedChargeMode ||
      patient?.selected_charge_mode ||
      patient?.billingChargeMode ||
      patient?.chargeMode,
  ).split(',');

  return compCatIds
    .map((compCatId, index) => {
      if (!compCatId) {
        return null;
      }

      const name =
        normalizeFormText(names[index]) ||
        `Panel ${compCatId}`;
      const billingChargeMode = normalizeFormText(chargeModes[index]);

      return {
        id: `api-${compCatId}-${index}`,
        chipId: `api-${compCatId}-${index}`,
        chipSource: 'API',
        name,
        compCatId,
        billingChargeMode,
        paymentLabel: billingChargeMode,
        searchKey: `${name} ${compCatId}`.toLowerCase(),
      };
    })
    .filter(Boolean);
};

export const findMatchingPanelCompanies = (
  items,
  panelCompanyValue,
  patientContext = null,
) => {
  const normalizedPanelValue = normalizeFormText(panelCompanyValue).toLowerCase();

  if (!normalizedPanelValue) {
    return [];
  }

  const selectedCompCatIds = normalizeFormText(
    patientContext?.selectedCompCatIds || patientContext?.selected_comp_cat_ids,
  )
    .split(',')
    .map(value => value.trim())
    .filter(Boolean);
  const patientCompCatId = normalizeFormText(
    patientContext?.compCatId || patientContext?.comp_cat_id,
  );
  const patientCenterId = normalizeFormText(
    patientContext?.centerId || patientContext?.CenterID,
  );
  const patientAtype = normalizeFormText(
    patientContext?.atype || patientContext?.Atype,
  ).toUpperCase();

  const scoreMatches = matches =>
    [...matches]
      .map(item => {
        let score = 0;
        const itemName = normalizeFormText(item?.name).toLowerCase();
        const itemDetails = normalizeFormText(item?.details).toLowerCase();

        if (itemName === normalizedPanelValue) {
          score += 100;
        }
        if (itemDetails === normalizedPanelValue) {
          score += 80;
        }
        if (patientCompCatId && normalizeFormText(item?.compCatId) === patientCompCatId) {
          score += 40;
        }
        if (patientCenterId && normalizeFormText(item?.centerId) === patientCenterId) {
          score += 30;
        }
        if (patientAtype && normalizeFormText(item?.atype).toUpperCase() === patientAtype) {
          score += 20;
        }

        return {item, score};
      })
      .sort((leftItem, rightItem) => {
        if (rightItem.score !== leftItem.score) {
          return rightItem.score - leftItem.score;
        }

        return (
          Number(rightItem.item?.compCatId || 0) -
          Number(leftItem.item?.compCatId || 0)
        );
      })
      .map(match => match.item);

  if (selectedCompCatIds.length) {
    const itemByCompCatId = new Map(
      items.map(item => [normalizeFormText(item?.compCatId), item]),
    );

    return selectedCompCatIds
      .map(compCatId => itemByCompCatId.get(compCatId))
      .filter(Boolean);
  }

  const pickBestNamedMatches = matches => {
    if (matches.length <= 1) {
      return matches;
    }

    const scoredMatches = scoreMatches(matches);
    if (patientCenterId || patientAtype) {
      return scoredMatches.slice(0, 1);
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

    return scoredMatches
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

  const partialMatches = items.filter(item => {
    const normalizedName = normalizeFormText(item?.name).toLowerCase();
    const normalizedDetails = normalizeFormText(item?.details).toLowerCase();

    return (
      normalizedName.includes(normalizedPanelValue) ||
      normalizedDetails.includes(normalizedPanelValue) ||
      normalizedPanelValue.includes(normalizedName) ||
      normalizedPanelValue.includes(normalizedDetails)
    );
  });

  return scoreMatches(partialMatches);
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

  const leftCompCatId = normalizeFormText(leftCompany?.compCatId);
  const rightCompCatId = normalizeFormText(rightCompany?.compCatId);

  if (
    leftCompCatId &&
    rightCompCatId &&
    leftCompCatId !== '0' &&
    rightCompCatId !== '0' &&
    leftCompCatId === rightCompCatId
  ) {
    return true;
  }

  return (
    normalizeFormText(leftCompany?.centerId) ===
      normalizeFormText(rightCompany?.centerId) &&
    normalizeFormText(leftCompany?.name).toLowerCase() ===
      normalizeFormText(rightCompany?.name).toLowerCase() &&
    normalizeFormText(leftCompany?.details).toLowerCase() ===
      normalizeFormText(rightCompany?.details).toLowerCase()
  );
};
