const toDateKey = date => {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return '';
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const toDisplayString = value => {
  if (value === null || value === undefined) {
    return '';
  }

  return String(value).trim();
};

const parseDateParts = (year, month, day) => {
  const normalizedYear = Number(year);
  const normalizedMonth = Number(month);
  const normalizedDay = Number(day);

  if (
    !Number.isInteger(normalizedYear) ||
    !Number.isInteger(normalizedMonth) ||
    !Number.isInteger(normalizedDay) ||
    normalizedMonth < 1 ||
    normalizedMonth > 12 ||
    normalizedDay < 1 ||
    normalizedDay > 31
  ) {
    return '';
  }

  const date = new Date(normalizedYear, normalizedMonth - 1, normalizedDay);

  if (
    date.getFullYear() !== normalizedYear ||
    date.getMonth() !== normalizedMonth - 1 ||
    date.getDate() !== normalizedDay
  ) {
    return '';
  }

  return toDateKey(date);
};

export const getVisitDateKey = value => {
  const normalizedValue = toDisplayString(value);

  if (!normalizedValue) {
    return '';
  }

  const yearFirstMatch = normalizedValue.match(
    /(\d{4})[-/](\d{1,2})[-/](\d{1,2})/,
  );

  if (yearFirstMatch) {
    return parseDateParts(
      yearFirstMatch[1],
      yearFirstMatch[2],
      yearFirstMatch[3],
    );
  }

  const dayFirstMatch = normalizedValue.match(
    /(\d{1,2})[-/](\d{1,2})[-/](\d{4})/,
  );

  if (dayFirstMatch) {
    const firstPart = Number(dayFirstMatch[1]);
    const secondPart = Number(dayFirstMatch[2]);
    const isMonthFirst = firstPart <= 12 && secondPart > 12;

    return isMonthFirst
      ? parseDateParts(dayFirstMatch[3], dayFirstMatch[1], dayFirstMatch[2])
      : parseDateParts(dayFirstMatch[3], dayFirstMatch[2], dayFirstMatch[1]);
  }

  const parsedDate = new Date(normalizedValue);
  return Number.isNaN(parsedDate.getTime()) ? '' : toDateKey(parsedDate);
};

const getBookingVisitDateKey = booking =>
  [
    booking?.preferredVisitDate,
    booking?.visitDate,
    booking?.preferred_visit_date,
    booking?.visit_date,
    booking?.appointment_date,
  ]
    .map(getVisitDateKey)
    .find(Boolean) || '';

export const isBookingForDate = (booking, date = new Date()) => {
  const todayKey = toDateKey(date);
  const bookingDateKey = getBookingVisitDateKey(booking);

  return Boolean(todayKey && bookingDateKey && bookingDateKey === todayKey);
};

export const filterBookingsForDate = (bookings, date = new Date()) =>
  (Array.isArray(bookings) ? bookings : []).filter(booking =>
    isBookingForDate(booking, date),
  );

export const filterBookingsForToday = bookings =>
  filterBookingsForDate(bookings, new Date());
