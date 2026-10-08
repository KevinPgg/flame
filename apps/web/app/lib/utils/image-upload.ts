/**
 * @deprecated This file has been split into client and server modules for better separation of concerns.
 *
 * Please use:
 * - `image-upload.client.ts` for browser-based operations (resizeImageTo4x5, validateImageFile, extractStoragePath)
 * - `image-upload.server.ts` for Supabase storage operations (uploadImageToStorage, deleteImageFromStorage)
 *
 * This file will be removed in a future version.
 */

// Re-export client functions
export {
  resizeImageTo4x5,
  validateImageFile,
  extractStoragePath,
} from "./image-upload.client";

// Re-export server functions
export {
  uploadImageToStorage,
  deleteImageFromStorage,
  listImagesInFolder,
} from "./image-upload.server";
