/**
 * Haptics are reserved for commits, not taps. Buzzing on every button press
 * (which is what the old global touchstart listener did) trains people to
 * ignore the buzz, so nothing is left to mark the moment that matters.
 *
 * Fire these on the actual causal event — the punch landing, the save failing —
 * so the feel matches what happened.
 */
const PATTERNS = {
  success: [12, 40, 24],
  error: [40, 70, 40],
  warning: [24, 50],
};

export function haptic(kind = 'success') {
  if (typeof navigator === 'undefined' || !navigator.vibrate) return;
  try {
    navigator.vibrate(PATTERNS[kind] ?? PATTERNS.success);
  } catch {
    // Some browsers throw when the page is not user-activated. Never let
    // feedback break the action it is reporting on.
  }
}
