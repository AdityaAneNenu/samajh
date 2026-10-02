import {
  IMAGE_MAX_EDGE,
  IMAGE_MEDIA_TYPES,
  MAX_IMAGE_BASE64_CHARS,
} from "@/lib/constants";

/**
 * Prepare a photograph for the model — in the browser, before anything moves.
 *
 * A phone camera produces 3–12 MB. Sending that would be slow for the reader,
 * expensive for whoever pays for inference, and would exceed the request
 * ceiling. Downscaling locally first is also the privacy-friendlier order of
 * operations: the full-resolution original never leaves the device.
 *
 * Everything here is browser-only. The pure helpers are exported separately so
 * they can be tested without a DOM.
 */

export type ImageMediaType = (typeof IMAGE_MEDIA_TYPES)[number];

export interface PreparedImage {
  mediaType: ImageMediaType;
  /** Base64 only — no `data:` prefix. */
  dataBase64: string;
  /** Rough decoded size, so the interface can say what is being sent. */
  bytes: number;
}

export type PrepareImageResult =
  | { ok: true; image: PreparedImage }
  | { ok: false; message: string };

/** Structural type, so this needs no DOM to test. */
export function isAcceptedImage(file: { type: string }): boolean {
  return (IMAGE_MEDIA_TYPES as readonly string[]).includes(file.type);
}

/** Base64 length → decoded byte count, without allocating anything. */
export function base64Bytes(dataBase64: string): number {
  const padding = dataBase64.endsWith("==")
    ? 2
    : dataBase64.endsWith("=")
      ? 1
      : 0;
  return Math.floor((dataBase64.length * 3) / 4) - padding;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("could not read the file"));
    reader.readAsDataURL(file);
  });
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("could not decode the image"));
    image.src = dataUrl;
  });
}

function splitDataUrl(dataUrl: string): { mediaType: string; base64: string } | null {
  const match = /^data:([^;,]+);base64,(.*)$/s.exec(dataUrl);
  if (!match) return null;
  return { mediaType: match[1], base64: match[2] };
}

/** Longest edge, in pixels. */
function longestEdge(image: HTMLImageElement): number {
  return Math.max(image.naturalWidth, image.naturalHeight);
}

/**
 * Downscale and re-encode through a canvas.
 *
 * Contentious detail: a scanned letter photographed on a phone is usually
 * legible at 1600px and much smaller as JPEG. Screenshots and PNGs that are
 * already small are passed through untouched, so text stays crisp.
 */
function downscaleToJpeg(
  image: HTMLImageElement,
  maxEdge: number,
  quality = 0.85,
): string | null {
  const scale = maxEdge / longestEdge(image);
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  if (!context) return null;

  // White background: JPEG has no alpha, and transparent PNGs would otherwise
  // come out with black text on black.
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);

  const out = canvas.toDataURL("image/jpeg", quality);
  return splitDataUrl(out)?.base64 ?? null;
}

export async function prepareImage(file: File): Promise<PrepareImageResult> {
  if (!isAcceptedImage(file)) {
    return {
      ok: false,
      message: "That file is not a photo we can read. Try a JPEG, PNG or WebP.",
    };
  }

  let original: { mediaType: string; base64: string } | null = null;

  try {
    const dataUrl = await readAsDataUrl(file);
    original = splitDataUrl(dataUrl);
    if (!original) {
      return { ok: false, message: "That file could not be opened as a photo." };
    }

    const image = await loadImage(dataUrl);
    const needsShrinking =
      longestEdge(image) > IMAGE_MAX_EDGE ||
      original.base64.length > MAX_IMAGE_BASE64_CHARS;

    if (!needsShrinking) {
      return {
        ok: true,
        image: {
          mediaType: original.mediaType as ImageMediaType,
          dataBase64: original.base64,
          bytes: base64Bytes(original.base64),
        },
      };
    }

    const shrunk = downscaleToJpeg(image, IMAGE_MAX_EDGE);
    if (shrunk && shrunk.length <= MAX_IMAGE_BASE64_CHARS) {
      return {
        ok: true,
        image: {
          mediaType: "image/jpeg",
          dataBase64: shrunk,
          bytes: base64Bytes(shrunk),
        },
      };
    }
  } catch {
    // Fall through to the original-if-it-fits path below.
  }

  // The canvas route is unavailable (old browser, blocked canvas) or was still
  // too large. An unshrunk but small-enough photograph is better than nothing.
  if (original && original.base64.length <= MAX_IMAGE_BASE64_CHARS) {
    return {
      ok: true,
      image: {
        mediaType: original.mediaType as ImageMediaType,
        dataBase64: original.base64,
        bytes: base64Bytes(original.base64),
      },
    };
  }

  return {
    ok: false,
    message:
      "That photo is still too large to send. Try taking it again from a little further back, so the page fills the frame but the file is smaller.",
  };
}