/**
 * Maps common Postgres error codes to user-friendly messages.
 * @param pgCode  - Postgres error code (e.g. "23505")
 * @param fallback - Message to return when no mapping exists
 */
export function friendlyError(pgCode: string | undefined | null, fallback = 'An unexpected error occurred. Please try again.'): string {
  if (!pgCode) return fallback;
  switch (pgCode) {
    // Integrity constraint violations
    case '23505': return 'A record with that value already exists.';
    case '23503': return 'This record is referenced by other data and cannot be removed.';
    case '23502': return 'A required field is missing.';
    case '23514': return 'The value does not meet the required conditions.';
    // Auth / permission errors
    case '28000': return 'Authentication failed. Please sign in again.';
    case '28P01': return 'Invalid credentials.';
    case '42501': return 'You do not have permission to perform this action.';
    // Data errors
    case '22001': return 'The value is too long for this field.';
    case '22003': return 'The numeric value is out of the allowed range.';
    case '22P02': return 'Invalid input — please check the field values.';
    // Connection / server
    case '08000':
    case '08006':
    case '08001':
      return 'Could not connect to the server. Please check your connection.';
    case '53300': return 'The server is at capacity. Please try again shortly.';
    case '57014': return 'The request timed out. Please try again.';
    default:      return fallback;
  }
}
