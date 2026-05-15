const MAX_SAMPLE_TUBE_CACHE_ENTRIES = 80;
const MAX_SAMPLE_TUBE_REQUEST_ENTRIES = 40;
const MAX_BOOKING_TEST_PRICE_CACHE_ENTRIES = 60;
const MAX_BOOKING_TEST_PRICE_REQUEST_ENTRIES = 30;

class BoundedMap extends Map {
  constructor(maxEntries) {
    super();
    this.maxEntries = Math.max(1, Number(maxEntries) || 1);
  }

  get(key) {
    if (!super.has(key)) {
      return undefined;
    }

    const value = super.get(key);
    super.delete(key);
    super.set(key, value);
    return value;
  }

  set(key, value) {
    if (super.has(key)) {
      super.delete(key);
    }

    super.set(key, value);

    while (this.size > this.maxEntries) {
      const oldestKey = this.keys().next().value;
      if (oldestKey === undefined) {
        break;
      }
      super.delete(oldestKey);
    }

    return this;
  }
}

export const sampleTubeMappingCache = new BoundedMap(
  MAX_SAMPLE_TUBE_CACHE_ENTRIES,
);
export const sampleTubeMappingRequests = new BoundedMap(
  MAX_SAMPLE_TUBE_REQUEST_ENTRIES,
);
export const bookingTestPriceCache = new BoundedMap(
  MAX_BOOKING_TEST_PRICE_CACHE_ENTRIES,
);
export const bookingTestPriceRequests = new BoundedMap(
  MAX_BOOKING_TEST_PRICE_REQUEST_ENTRIES,
);

const toStableValue = value =>
  value === null || value === undefined ? '' : String(value).trim();

export const getBookingTestPriceCacheKey = requests =>
  JSON.stringify(
    (Array.isArray(requests) ? requests : [])
      .map(request => ({
        patient_id: toStableValue(request?.patient_id || request?.patientId),
        panel_company: toStableValue(
          request?.panel_company || request?.panelCompany,
        ),
        comp_cat_id: toStableValue(request?.comp_cat_id || request?.compCatId),
        center_id: toStableValue(request?.center_id || request?.centerId),
        atype: toStableValue(request?.atype),
        panel_code: toStableValue(request?.panel_code || request?.panelCode),
        panel_abarid: toStableValue(
          request?.panel_abarid || request?.panelAbarid,
        ),
        tests: (Array.isArray(request?.tests) ? request.tests : [])
          .map(test => ({
            code: toStableValue(test?.code || test?.booked_code),
            description: toStableValue(
              test?.description || test?.name || test?.test_name,
            ),
            comp_cat_id: toStableValue(
              test?.comp_cat_id || test?.compCatId,
            ),
            center_id: toStableValue(test?.center_id || test?.centerId),
            atype: toStableValue(test?.atype),
            panel_code: toStableValue(test?.panel_code || test?.panelCode),
            panel_abarid: toStableValue(
              test?.panel_abarid || test?.panelAbarid,
            ),
          }))
          .sort((leftItem, rightItem) =>
            `${leftItem.code}|${leftItem.description}|${leftItem.comp_cat_id}`.localeCompare(
              `${rightItem.code}|${rightItem.description}|${rightItem.comp_cat_id}`,
            ),
          ),
      }))
      .sort((leftItem, rightItem) =>
        `${leftItem.patient_id}|${leftItem.comp_cat_id}|${leftItem.panel_company}`.localeCompare(
          `${rightItem.patient_id}|${rightItem.comp_cat_id}|${rightItem.panel_company}`,
        ),
      ),
  );
