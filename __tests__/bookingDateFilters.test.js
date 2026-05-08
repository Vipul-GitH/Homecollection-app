import {
  filterBookingsForDate,
  getVisitDateKey,
  isBookingForDate,
} from '../utils/bookings/bookingDateFilters';

describe('bookingDateFilters', () => {
  const today = new Date(2026, 4, 7);

  it('normalizes common visit date formats', () => {
    expect(getVisitDateKey('2026-05-07')).toBe('2026-05-07');
    expect(getVisitDateKey('07-05-2026')).toBe('2026-05-07');
    expect(getVisitDateKey('07/05/2026 09:30 AM')).toBe('2026-05-07');
  });

  it('matches bookings whose visit date is today', () => {
    expect(
      isBookingForDate(
        {
          preferredVisitDate: '2026-05-07',
        },
        today,
      ),
    ).toBe(true);

    expect(
      isBookingForDate(
        {
          visit_date: '2026-05-06',
        },
        today,
      ),
    ).toBe(false);
  });

  it('filters assigned and completed booking lists to the requested date', () => {
    const bookings = [
      {id: 'today-preferred', preferredVisitDate: '07-05-2026'},
      {id: 'today-visit', visitDate: '2026-05-07 10:00:00'},
      {id: 'old', preferredVisitDate: '2026-05-06'},
      {id: 'missing', preferredVisitDate: 'Date not available'},
    ];

    expect(filterBookingsForDate(bookings, today).map(booking => booking.id)).toEqual([
      'today-preferred',
      'today-visit',
    ]);
  });
});
