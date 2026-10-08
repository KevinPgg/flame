"use server";

import { supabaseAdmin } from "../supabase/server";

/**
 * Server-side image utilities for Supabase storage operations
 * Uses server-side admin client with elevated permissions
 */

// Allowed characters in storage paths (alphanumeric, hyphens, underscores, dots, slashes)
const VALID_PATH_PATTERN = /^[a-zA-Z0-9\-_./]+$/;
const MAX_PATH_LENGTH = 255;

/**
 * Validates and sanitizes a storage path
 * @param path - The storage path to validate
 * @param requirePrefix - Required path prefix (default: "events/")
 * @returns Sanitized path
 * @throws Error if path is invalid
 */
function validateStoragePath(path: string, requirePrefix = "events/"): string {
  // Check for empty path
  if (!path || typeof path !== "string") {
    throw new Error("Storage path is required");
  }

  // Trim whitespace
  const trimmed = path.trim();

  // Check for leading slash
  if (trimmed.startsWith("/")) {
    throw new Error("Storage path cannot start with /");
  }

  // Check for path traversal attempts
  if (trimmed.includes("..")) {
    throw new Error("Storage path cannot contain .. (path traversal attempt)");
  }

  // Normalize: remove repeated slashes
  const normalized = trimmed.replace(/\/+/g, "/");

  // Check length
  if (normalized.length > MAX_PATH_LENGTH) {
    throw new Error(
      `Storage path exceeds maximum length of ${MAX_PATH_LENGTH} characters`
    );
  }

  // Validate allowed characters
  if (!VALID_PATH_PATTERN.test(normalized)) {
    throw new Error("Storage path contains invalid characters");
  }

  // Enforce required prefix
  if (!normalized.startsWith(requirePrefix)) {
    throw new Error(`Storage path must start with ${requirePrefix}`);
  }

  return normalized;
}

/**
 * Upload image to Supabase Storage
 * @param file - The image file to upload
 * @param path - The storage path (e.g., "events/event-slug/image.jpg")
 * @param contentType - Optional content type (defaults to file.type or "image/jpeg")
 * @returns The public URL of the uploaded image
 * @throws Error if path is invalid or upload fails
 */
export async function uploadImageToStorage(
  file: Blob,
  path: string,
  contentType?: string
): Promise<string> {
  if (!supabaseAdmin) {
    throw new Error("Supabase admin client not initialized");
  }

  // Validate and sanitize the path
  const safePath = validateStoragePath(path);

  // Use provided contentType, or fall back to file.type, or default to "image/jpeg"
  const finalContentType = contentType || file.type || "image/jpeg";

  // Upload with upsert: false to prevent accidental overwrites
  const { data, error } = await supabaseAdmin.storage
    .from("event-images")
    .upload(safePath, file, {
      contentType: finalContentType,
      upsert: false, // Prevent overwrites - use unique timestamps or UUIDs in filenames
    });

  if (error) {
    console.error("Error uploading image:", error);

    // Provide more specific error messages
    if (error.message.includes("already exists")) {
      throw new Error(
        "A file with this name already exists. Please try again."
      );
    }

    throw new Error(`Failed to upload image: ${error.message}`);
  }

  // Get the public URL
  const {
    data: { publicUrl },
  } = supabaseAdmin.storage.from("event-images").getPublicUrl(data.path);

  return publicUrl;
}

/**
 * Delete image from Supabase Storage
 * @param path - The storage path to delete (e.g., "events/event-slug/image.jpg")
 * @throws Error if path is invalid or deletion fails
 */
export async function deleteImageFromStorage(path: string): Promise<void> {
  if (!supabaseAdmin) {
    throw new Error("Supabase admin client not initialized");
  }

  // Validate and sanitize the path
  const safePath = validateStoragePath(path);

  const { error } = await supabaseAdmin.storage
    .from("event-images")
    .remove([safePath]);

  if (error) {
    console.error("Error deleting image:", error);
    throw new Error(`Failed to delete image: ${error.message}`);
  }
}

/**
 * List files in a storage folder
 * @param folderPath - The folder path (e.g., "events/event-slug/")
 * @returns Array of file objects
 * @throws Error if path is invalid or listing fails
 */
export async function listImagesInFolder(folderPath: string) {
  if (!supabaseAdmin) {
    throw new Error("Supabase admin client not initialized");
  }

  // Validate path (allow trailing slash for folders)
  const safePath = validateStoragePath(folderPath);

  const { data, error } = await supabaseAdmin.storage
    .from("event-images")
    .list(safePath);

  if (error) {
    console.error("Error listing images:", error);
    throw new Error(`Failed to list images: ${error.message}`);
  }

  return data;
}
