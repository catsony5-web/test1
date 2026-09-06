// Only add schedules checked against an issuer/underwriter's official notice.
// Each entry needs sourceId, company, sourceName, sourceUrl (HTTPS), and sources
// [{ name, url, checkedDate: "YYYY-MM-DD" }]. Use ISO dates; leave unknowns empty.
// Keep preliminary offerPrice at 0. Use offerPriceLow/offerPriceHigh for a verified
// price band. A differing official value becomes a conflict, never a silent override.
export const officialIpoSupplements = [];
