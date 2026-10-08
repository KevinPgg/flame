"use client";

/**
 * Client-side image utilities for browser-based operations
 * Uses browser APIs like canvas and document
 */

/**
 * Resize image to 4:5 aspect ratio (1080x1350px) and convert to JPEG.
 * 4:5 matches the Instagram portrait export so users who already have
 * Instagram-ready posters upload without any crop. Non-4:5 sources are
 * center-cover-cropped to fill the canvas.
 */
export const resizeImageTo4x5 = (file: File): Promise<Blob> => {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    if (!ctx) {
      reject(new Error("Failed to get 2D canvas context"));
      return;
    }

    const img = new window.Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);

      const targetWidth = 1080;
      const targetHeight = 1350;
      canvas.width = targetWidth;
      canvas.height = targetHeight;

      // Cover-fit: scale the source so it fully covers the 4:5 canvas, then center-crop.
      const imgAspect = img.width / img.height;
      const targetAspect = targetWidth / targetHeight;

      let drawWidth,
        drawHeight,
        offsetX = 0,
        offsetY = 0;

      if (imgAspect > targetAspect) {
        // Source is wider than 4:5 → fill the height, overflow the width, crop sides.
        drawHeight = targetHeight;
        drawWidth = drawHeight * imgAspect;
        offsetX = (targetWidth - drawWidth) / 2;
      } else {
        // Source is taller than 4:5 → fill the width, overflow the height, crop top/bottom.
        drawWidth = targetWidth;
        drawHeight = drawWidth / imgAspect;
        offsetY = (targetHeight - drawHeight) / 2;
      }

      // With cover-fit the canvas is always fully covered; the fill only matters
      // in the degenerate case where the image fails to load a pixel at the edge.
      ctx.fillStyle = "#000000";
      ctx.fillRect(0, 0, targetWidth, targetHeight);

      ctx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight);

      // Convert to blob with JPEG compression
      canvas.toBlob(
        blob => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error("Failed to create image blob"));
          }
        },
        "image/jpeg",
        0.8
      );
    };

    img.onerror = () => {
      // Clean up the object URL and reject the promise
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Failed to load image"));
    };

    img.src = objectUrl;
  });
};

/**
 * Validate image file
 * @param file - The file to validate
 * @param maxSizeBytes - Maximum file size in bytes (default 4.5MB, matches Vercel serverless body limit)
 */
export const validateImageFile = (
  file: File,
  maxSizeBytes: number = 4.5 * 1024 * 1024 // 4.5MB
): { valid: boolean; error?: string } => {
  if (!file.type.startsWith("image/")) {
    return { valid: false, error: "Please select a valid image file" };
  }

  if (file.size > maxSizeBytes) {
    const maxSizeMB = maxSizeBytes / (1024 * 1024);
    return {
      valid: false,
      error: `Image size must be less than ${maxSizeMB}MB`,
    };
  }

  return { valid: true };
};

/**
 * Extract storage path from Supabase Storage URL
 * @param url - The full Supabase Storage URL
 * @returns The path within the bucket, or null if not a valid storage URL
 */
export const extractStoragePath = (url: string): string | null => {
  if (!url) return null;

  // Match Supabase storage URL pattern
  const match = url.match(/\/storage\/v1\/object\/public\/event-images\/(.+)/);
  return match ? match[1] : null;
};
