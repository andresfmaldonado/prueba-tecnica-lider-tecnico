/**
 * Unambiguous composite key: ["a::b","c"] and ["a","b::c"] produce different keys.
 * Concatenating with a separator let two tenants share the same waybill.
 */
export const compositeKey = (...parts: string[]): string => JSON.stringify(parts);
