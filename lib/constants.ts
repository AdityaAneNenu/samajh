/**
 * Every limit in the app, in one place.
 *
 * Deliberately dependency-free so both the server (validation) and the browser
 * (form hints, image preparation) can import it without pulling Zod — or any
 * other runtime — into the client bundle.
 */

/** Fewer characters than this and there is not enough to read. */
export const MIN_TEXT_LENGTH = 40;

/** More characters than this and it is a book, not a letter. */
export const MAX_TEXT_CHARS = 200_000;

/**
 * Largest request body we will even look at. Sized for a prepared photograph:
 * the browser downsizes images before sending, so this is a ceiling on
 * something already reduced, not on a raw 12-megapixel camera file.
 */
export const MAX_REQUEST_BYTES = 8 * 1024 * 1024;

/** A text file we read locally. Bigger than this and it is a book, not a letter. */
export const MAX_TEXT_FILE_BYTES = 400_000;

/** Media types the reader will accept for a photo of a document. */
export const IMAGE_MEDIA_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

/** Base64 characters, not bytes: ~3.7 MB of actual image. */
export const MAX_IMAGE_BASE64_CHARS = 5_000_000;

/** Longest edge, in pixels, that the browser downsizes an image to. */
export const IMAGE_MAX_EDGE = 1600;