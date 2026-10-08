/**
 * Extended MediaStream API Types
 * 
 * These types extend the standard MediaStream API to include additional
 * constraints and capabilities that are not yet in the standard TypeScript
 * definitions but are supported by modern browsers (especially mobile).
 * 
 * **Browser Support Notes:**
 * - `torch`: Available on Chromium/Android, **NOT available on iOS Safari**
 * - `zoom`: Supported on Safari 17+, Chromium (desktop & mobile)
 * - `focusMode` & `focusDistance`: Inconsistent support, varies by device
 * - `exposureMode` & `whiteBalanceMode`: Limited to newer Android devices
 * 
 * **Important:** Always use runtime feature detection via `track.getCapabilities()`
 * before applying constraints, as support is device and browser-version dependent.
 * 
 * @example
 * ```typescript
 * const track = stream.getVideoTracks()[0];
 * const capabilities = track.getCapabilities() as ExtendedMediaTrackCapabilities;
 * 
 * if (capabilities.torch) {
 *   await track.applyConstraints({ advanced: [{ torch: true }] } as ExtendedMediaTrackConstraints);
 * }
 * ```
 */

// Extended capabilities that a video track may support
export interface ExtendedMediaTrackCapabilities extends MediaTrackCapabilities {
  torch?: boolean;
  focusMode?: string[];
  focusDistance?: {
    max: number;
    min: number;
    step: number;
  };
  zoom?: {
    max: number;
    min: number;
    step: number;
  };
  exposureMode?: string[];
  whiteBalanceMode?: string[];
}

// Extended constraint set for advanced constraints
export interface ExtendedMediaTrackConstraintSet extends MediaTrackConstraintSet {
  torch?: boolean;
  focusMode?: string;
  focusDistance?: number;
  zoom?: number;
  exposureMode?: string;
  whiteBalanceMode?: string;
}

// Extended constraints for configuring video tracks
export interface ExtendedMediaTrackConstraints extends MediaTrackConstraints {
  torch?: ConstrainBoolean;
  focusMode?: ConstrainDOMString;
  focusDistance?: ConstrainDouble;
  zoom?: ConstrainDouble;
  exposureMode?: ConstrainDOMString;
  whiteBalanceMode?: ConstrainDOMString;
  advanced?: ExtendedMediaTrackConstraintSet[];
}

// Extended supported constraints
export interface ExtendedSupportedConstraints extends MediaTrackSupportedConstraints {
  torch?: boolean;
  focusMode?: boolean;
  focusDistance?: boolean;
  zoom?: boolean;
  exposureMode?: boolean;
  whiteBalanceMode?: boolean;
}

// Helper type for MediaStreamTrack with extended methods
export interface ExtendedMediaStreamTrack extends MediaStreamTrack {
  getCapabilities(): ExtendedMediaTrackCapabilities;
  applyConstraints(constraints?: ExtendedMediaTrackConstraints): Promise<void>;
}
