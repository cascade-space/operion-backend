/**
 * Geofence utilities with GPS accuracy validation and timezone handling
 */

export interface LocationWithAccuracy {
  latitude: number;
  longitude: number;
  accuracy?: number; // GPS accuracy in meters
  timestamp?: Date;
}

export interface GeofenceValidationResult {
  isValid: boolean;
  isWithinGeofence: boolean;
  distance: number; // Distance in meters
  accuracyAcceptable: boolean;
  error?: string;
}

/**
 * Calculate distance between two coordinates using Haversine formula
 * @param lat1 - Latitude of first point
 * @param lon1 - Longitude of first point
 * @param lat2 - Latitude of second point
 * @param lon2 - Longitude of second point
 * @returns Distance in meters
 */
export function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // Earth's radius in kilometers
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c * 1000; // Convert to meters
  return distance;
}

/**
 * Validate GPS accuracy
 * Rejects coordinates with accuracy > 50 meters
 * @param accuracy - GPS accuracy in meters (optional)
 * @returns true if accuracy is acceptable
 */
export function validateGPSAccuracy(accuracy?: number): boolean {
  if (accuracy === undefined || accuracy === null) {
    // If accuracy is not provided, accept it (for backward compatibility)
    // But log a warning
    return true;
  }
  
  // Reject GPS coordinates with accuracy > 50 meters
  const MAX_ACCEPTABLE_ACCURACY = 50; // meters
  return accuracy <= MAX_ACCEPTABLE_ACCURACY;
}

/**
 * Check if location is within geofence with GPS accuracy validation
 * @param location - User's location with optional accuracy
 * @param geofenceLat - Geofence center latitude
 * @param geofenceLon - Geofence center longitude
 * @param geofenceRadius - Geofence radius in meters
 * @returns Validation result
 */
export function validateGeofence(
  location: LocationWithAccuracy,
  geofenceLat: number,
  geofenceLon: number,
  geofenceRadius: number
): GeofenceValidationResult {
  // Validate GPS accuracy first
  const accuracyAcceptable = validateGPSAccuracy(location.accuracy);
  
  if (!accuracyAcceptable && location.accuracy !== undefined) {
    return {
      isValid: false,
      isWithinGeofence: false,
      distance: 0,
      accuracyAcceptable: false,
      error: `GPS accuracy is too low (${location.accuracy}m). Please ensure you have a clear view of the sky.`
    };
  }

  // Validate coordinate ranges
  if (location.latitude < -90 || location.latitude > 90) {
    return {
      isValid: false,
      isWithinGeofence: false,
      distance: 0,
      accuracyAcceptable: true,
      error: 'Invalid latitude value'
    };
  }

  if (location.longitude < -180 || location.longitude > 180) {
    return {
      isValid: false,
      isWithinGeofence: false,
      distance: 0,
      accuracyAcceptable: true,
      error: 'Invalid longitude value'
    };
  }

  // Calculate distance
  const distance = calculateDistance(
    geofenceLat,
    geofenceLon,
    location.latitude,
    location.longitude
  );

  // Check if within geofence
  const isWithinGeofence = distance <= geofenceRadius;

  return {
    isValid: true,
    isWithinGeofence,
    distance,
    accuracyAcceptable: true
  };
}

/**
 * Convert date to timezone-aware timestamp
 * @param date - Date to convert
 * @param timezone - Timezone string (e.g., 'Asia/Kolkata', 'America/New_York')
 * @returns Timezone-aware date string
 */
export function toTimezoneAwareDate(date: Date, timezone?: string): string {
  if (!timezone) {
    // Default to UTC if no timezone specified
    return date.toISOString();
  }

  // For now, return ISO string
  // In production, use a library like date-fns-tz or moment-timezone
  // This is a placeholder - full timezone support requires additional dependencies
  return date.toISOString();
}

/**
 * Get current time in specified timezone
 * @param timezone - Timezone string
 * @returns Date object adjusted for timezone
 */
export function getCurrentTimeInTimezone(timezone?: string): Date {
  // For now, return current UTC time
  // Full timezone support requires date-fns-tz or moment-timezone
  return new Date();
}

