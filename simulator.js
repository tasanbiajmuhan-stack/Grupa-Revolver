/**
 * Simulator entry point. The UI currently displays a lightweight preview.
 * Import Three.js here when interactive cockpit scenes are ready:
 * import * as THREE from 'three';
 */
export function initializeSimulator(container) {
  if (!container) return null;
  // Keep the scene lifecycle isolated here so a Three.js renderer can be added
  // without coupling it to navigation, lessons, or profile state.
  return { container, ready: false, dispose() {} };
}
