/**
 * Event image processing for mobile — matches web's `resizeImageTo4x5`.
 *
 * Web source: apps/web/app/lib/utils/image-upload.client.ts
 *
 * Rules (identical to web):
 * - Center-cover crop to 4:5 if the source is not already near-4:5. Source
 *   wider than 4:5 → crop sides. Source taller than 4:5 → crop top/bottom.
 * - Final normalization resize to exactly TARGET_WIDTH × TARGET_HEIGHT
 *   (1080×1350). Every stored poster has identical dimensions — matches
 *   web's canvas-based `resizeImageTo4x5` and means display containers,
 *   analytics, and CDN caches see uniform assets.
 * - Always output JPEG @ 0.8 compression so FormData `type: "image/jpeg"`
 *   matches the actual bytes regardless of the source format (HEIC, PNG, WEBP).
 *
 * Event posters are always 4:5 (Instagram portrait), so we skip the native
 * image-picker crop step (`allowsEditing: false`) — on iOS `allowsEditing`
 * ignores the `aspect` prop and forces a square crop, which chopped posters
 * that were already 4:5. See APRIL_2026_FIXES.md.
 */
import * as ImageManipulator from "expo-image-manipulator";

export const TARGET_WIDTH = 1080;
export const TARGET_HEIGHT = 1350;
const TARGET_ASPECT = TARGET_WIDTH / TARGET_HEIGHT; // 0.8

export interface PickedAssetMeta {
  uri: string;
  width?: number | null;
  height?: number | null;
  fileName?: string | null;
  mimeType?: string | null;
}

export interface ProcessedImage {
  uri: string;
  mime: "image/jpeg";
  ext: "jpg";
}

/**
 * Center-cover crop + resize to 4:5 (max 1080×1350) and encode as JPEG.
 *
 * Fail-fast invariants (both required — every upload produces a 4:5 poster):
 * 1. `asset.uri` must be a non-empty string.
 * 2. `asset.width` and `asset.height` must both be positive numbers. The
 *    crop math needs real dimensions to compute a 4:5 crop box — without
 *    them we'd have to either upload a non-4:5 image (breaks the invariant)
 *    or probe the file via `manipulateAsync` with no actions (extra native
 *    round-trip on every upload for a case that never fires in practice
 *    because `expo-image-picker` always populates dimensions).
 *
 * `expo-image-picker` returns populated dimensions for every supported
 * image format; missing dimensions would mean a picker regression or an
 * unusual asset source, both of which are worth surfacing loudly rather
 * than silently uploading a wrongly-shaped image.
 */
export async function processEventImageTo4x5(
  asset: PickedAssetMeta
): Promise<ProcessedImage> {
  if (typeof asset.uri !== "string" || asset.uri.trim().length === 0) {
    throw new Error(
      "processEventImageTo4x5: invalid or missing asset.uri — cannot process image without a source URI."
    );
  }

  const srcW = asset.width ?? 0;
  const srcH = asset.height ?? 0;

  if (srcW <= 0 || srcH <= 0) {
    throw new Error(
      `processEventImageTo4x5: missing source dimensions (width=${asset.width}, height=${asset.height}) for asset ${asset.uri}. Cannot enforce 4:5 poster invariant without real dimensions.`
    );
  }

  const actions: ImageManipulator.Action[] = [];

  const srcAspect = srcW / srcH;
  // Allow ~0.2% slack so perfectly-sized posters (e.g. 1080×1350) skip crop.
  // The final normalization resize below handles any tolerance/rounding
  // drift by forcing exact TARGET dimensions.
  const needsCrop = Math.abs(srcAspect - TARGET_ASPECT) > 0.002;

  if (needsCrop) {
    let cropW: number;
    let cropH: number;
    let originX: number;
    let originY: number;
    if (srcAspect > TARGET_ASPECT) {
      cropH = srcH;
      cropW = Math.round(srcH * TARGET_ASPECT);
      originX = Math.round((srcW - cropW) / 2);
      originY = 0;
    } else {
      cropW = srcW;
      cropH = Math.round(srcW / TARGET_ASPECT);
      originX = 0;
      originY = Math.round((srcH - cropH) / 2);
    }
    actions.push({
      crop: { originX, originY, width: cropW, height: cropH },
    });
  }

  // Final normalization: always produce exactly TARGET_WIDTH × TARGET_HEIGHT.
  //
  // Subsumes the previous "conditional width resize + height cap" pair in
  // one two-axis resize. Why this is the right shape:
  //   - Matches web's `resizeImageTo4x5` (canvas fixed at 1080×1350,
  //     source is drawn/rescaled into it regardless of size). Every
  //     stored poster has identical dimensions — predictable for display
  //     containers, analytics, and CDN caching, and small sources get
  //     upscaled to the target rather than staying at their original
  //     dimensions (previous bug: 800×1000 source stayed 800×1000).
  //   - Simpler than single-axis-resize + height-cap. That approach left
  //     small sources untouched and required extra math to catch rounding
  //     overshoots (finalH of 1351–1353 after resize).
  //   - After the aspect crop above, the image is within the 0.2%
  //     tolerance of 4:5, so a two-axis resize introduces at most a
  //     sub-pixel stretch — well below the ~2% just-noticeable-difference
  //     threshold for aspect distortion.
  //   - Exact 1080×1350 sources (recommended design-tool export) pass
  //     through as an identity resize inside the same manipulateAsync
  //     call that handles the JPEG re-encode, so there's no extra cost
  //     for the happy path.
  actions.push({
    resize: { width: TARGET_WIDTH, height: TARGET_HEIGHT },
  });

  // All actions (crop + resize + JPEG encode) run in a single
  // manipulateAsync call to avoid three native-bridge round-trips and three
  // URI decodes. If the call fails, re-throw with enough context (step
  // summary + source URI + original message) for production logs to
  // reproduce without needing a repro asset. Splitting into per-step calls
  // for finer-grained error attribution was considered and deferred — see
  // NITPICKS_TODOS.md "April 2026 PR Review — Image Pipeline".
  const stepSummary = actions
    .map((action) => {
      if ("crop" in action) return "crop";
      if ("resize" in action) return "resize";
      return "other";
    })
    .concat(["jpeg-encode"])
    .join("+");

  try {
    const manipulated = await ImageManipulator.manipulateAsync(
      asset.uri,
      actions,
      {
        compress: 0.8,
        format: ImageManipulator.SaveFormat.JPEG,
      }
    );
    return { uri: manipulated.uri, mime: "image/jpeg", ext: "jpg" };
  } catch (err) {
    const originalMessage = err instanceof Error ? err.message : String(err);
    // `cause` (ES2022) gives structured access to the original error for
    // runtimes and tooling that understand it (Hermes, Node, Sentry's
    // default serializer). The manual stack merge below is the visual /
    // string-logger fallback for older tooling that only prints `stack`.
    const wrapped = new Error(
      `processEventImageTo4x5 failed during [${stepSummary}] for asset ${asset.uri}: ${originalMessage}`,
      err instanceof Error ? { cause: err } : undefined
    );
    if (err instanceof Error && err.stack) {
      // Preserve BOTH pieces of context: the wrapper context (step summary
      // + asset URI — already in wrapped.stack's first line via the Error
      // constructor) AND the original stack frames. Naive
      // `wrapped.stack = err.stack` would overwrite the wrapper's first
      // line so any tool that logs `error.stack` would see only the
      // inner error's name/message, losing the step/URI context we just
      // attached. Format follows Node's "Caused by:" convention used by
      // popular Node/JS libraries (verror, sentry, etc.).
      wrapped.stack = `${wrapped.stack}\nCaused by: ${err.stack}`;
    }
    throw wrapped;
  }
}
