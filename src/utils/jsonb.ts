/**
 * Safe JSONB parsing utility for Supabase JSONB columns
 * 
 * Supabase JSONB columns can be returned as:
 * - Already parsed objects/arrays (when using .select())
 * - JSON strings (when serialized)
 * - Empty strings "" (edge case but possible)
 * - null or undefined
 * 
 * This utility handles all these cases safely.
 */

/**
 * Safely parse a JSONB value from Supabase
 * @param value - The value to parse (can be string, object, array, null, undefined, or empty string)
 * @param defaultValue - The default value to return if parsing fails or value is null/undefined/empty
 * @returns The parsed value or defaultValue
 */
export function safeParseJSONB<T = any>(value: any, defaultValue: T): T {
  // Already parsed or null/undefined
  if (value === null || value === undefined) {
    return defaultValue;
  }
  
  // Already an array or object - return as-is
  if (Array.isArray(value) || (typeof value === 'object' && value !== null)) {
    return value as T;
  }
  
  // Empty string - return default
  if (typeof value === 'string' && value.trim() === '') {
    return defaultValue;
  }
  
  // Try to parse string
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      // Handle double-encoded JSONB (Supabase can sometimes double-encode)
      if (typeof parsed === 'string') {
        try {
          return JSON.parse(parsed) as T;
        } catch {
          // If second parse fails, return the first parsed value
          return parsed as T;
        }
      }
      return parsed as T;
    } catch (e) {
      console.warn('Failed to parse JSONB:', e, 'Value:', value?.substring?.(0, 100));
      return defaultValue;
    }
  }
  
  // Unknown type - return default
  return defaultValue;
}
