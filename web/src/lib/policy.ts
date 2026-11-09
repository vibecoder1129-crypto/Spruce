/** The cancellation windows an owner can choose (slice 6b). 0 means until the start. */
export const CANCEL_WINDOWS = [0, 2, 6, 12, 24, 48] as const;

/** One sentence a customer reads before booking and on their bookings. */
export function policyText(hours: number): string {
  if (hours === 0) return "Cancel or change online any time until the appointment starts.";
  return `Cancel or change online up to ${hours} hours before the start. After that, contact the venue.`;
}
