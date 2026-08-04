import "server-only";

import { createHash } from "node:crypto";

import sharp, { type Metadata, type Sharp } from "sharp";

import { getSupabaseAdmin } from "@/infrastructure/auth/supabase-admin";
import {
  DERIVATIVE_WIDTHS,
  MEDIA_BUCKET,
  derivativePath,
  type DerivativeWidth,
} from "@/infrastructure/media/storage";

/**
 * Upload pipeline — ADR-0013.
 *
 * Derivatives are generated HERE, at upload, not on request. Supabase's
 * image transforms have no `q_auto`, no named presets and no automatic
 * format negotiation, so relying on them per-request would give us the
 * worst of both worlds: weaker output AND a transform on every cold cache.
 * Doing it once costs storage, which is cheap, and buys deterministic
 * output, which is not.
 *
 * Everything is re-encoded to WebP. Format negotiation is `next/image`'s
 * job at render; the stored ladder just needs to be small and consistent.
 */

/** Accepted source types. HEIC is absent deliberately — sharp needs libheif. */
const ACCEPTED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
]);

/** 25 MB. Above this, a supplier has sent us a print master by mistake. */
const MAX_BYTES = 25 * 1024 * 1024;

export interface UploadedMedia {
  readonly publicId: string;
  readonly format: string;
  readonly mimeType: string;
  readonly width: number;
  readonly height: number;
  readonly bytes: number;
  readonly checksumSha256: string;
  readonly dominantColor: string | null;
}

export interface UploadFailure {
  readonly reason: string;
}

/**
 * Store an image and its derivative ladder.
 *
 * Returns a failure rather than throwing for INPUT problems (wrong type,
 * too large, undecodable) — those are things a user did and must be told
 * about precisely. Genuine infrastructure faults still throw.
 */
export async function uploadMedia(
  tenantId: string,
  file: { name: string; type: string; bytes: Buffer },
): Promise<{ ok: true; media: UploadedMedia } | { ok: false; error: string }> {
  if (!ACCEPTED_MIME.has(file.type)) {
    return { ok: false, error: `Unsupported file type: ${file.type}` };
  }
  if (file.bytes.byteLength > MAX_BYTES) {
    return { ok: false, error: "File is larger than 25 MB" };
  }

  // Hashed BEFORE any re-encoding, so the checksum identifies the source
  // the supplier sent us. Re-encoding is not deterministic across sharp
  // versions, so hashing the output would break deduplication on upgrade.
  const checksumSha256 = createHash("sha256").update(file.bytes).digest("hex");

  let image: Sharp;
  let metadata: Metadata;
  try {
    image = sharp(file.bytes, { failOn: "error" });
    metadata = await image.metadata();
  } catch {
    return { ok: false, error: "That file could not be read as an image" };
  }

  const width = metadata.width;
  const height = metadata.height;
  if (!width || !height) {
    return { ok: false, error: "That image has no readable dimensions" };
  }

  // Content-addressed path: the checksum IS the name. Two uploads of the
  // same file resolve to the same object rather than two copies, and no
  // user-supplied filename ever reaches a storage path — which is what
  // removes path traversal and encoding problems as a category.
  const publicId = `${tenantId}/${checksumSha256}.webp`;

  const supabase = getSupabaseAdmin();

  const canonical = await image
    .clone()
    .rotate() // Applies the EXIF orientation, then drops it.
    .webp({ quality: 82 })
    .toBuffer();

  const { error: uploadError } = await supabase.storage
    .from(MEDIA_BUCKET)
    .upload(publicId, canonical, {
      contentType: "image/webp",
      // `upsert` because the path is the checksum: re-uploading the same
      // bytes must be idempotent, not a conflict.
      upsert: true,
      cacheControl: "31536000",
    });

  if (uploadError) {
    throw new Error(`storage upload failed: ${uploadError.message}`);
  }

  await uploadDerivatives(publicId, file.bytes, width);

  return {
    ok: true,
    media: {
      publicId,
      format: "webp",
      mimeType: "image/webp",
      width,
      height,
      bytes: canonical.byteLength,
      checksumSha256,
      dominantColor: await dominantColor(image),
    },
  };
}

/**
 * The ladder. Widths at or above the source are skipped — upscaling
 * invents detail and costs bytes to do it.
 */
async function uploadDerivatives(
  publicId: string,
  source: Buffer,
  sourceWidth: number,
): Promise<void> {
  const supabase = getSupabaseAdmin();
  const widths = DERIVATIVE_WIDTHS.filter((w) => w < sourceWidth);

  await Promise.all(
    widths.map(async (width: DerivativeWidth) => {
      const resized = await sharp(source)
        .rotate()
        .resize({ width, withoutEnlargement: true })
        .webp({ quality: 80 })
        .toBuffer();

      const { error } = await supabase.storage
        .from(MEDIA_BUCKET)
        .upload(derivativePath(publicId, width), resized, {
          contentType: "image/webp",
          upsert: true,
          cacheControl: "31536000",
        });

      if (error)
        throw new Error(`derivative ${String(width)} failed: ${error.message}`);
    }),
  );
}

/**
 * Average colour, as a hex string, for the placeholder shown before load.
 *
 * A 1×1 resize is the cheapest honest way to get it. Failure is
 * non-fatal — a missing placeholder colour is a cosmetic loss, and no
 * upload should be rejected over one.
 */
async function dominantColor(image: Sharp): Promise<string | null> {
  try {
    const { data } = await image
      .clone()
      .resize(1, 1, { fit: "fill" })
      .raw()
      .toBuffer({ resolveWithObject: true });

    const [r, g, b] = [data[0], data[1], data[2]];
    if (r === undefined || g === undefined || b === undefined) return null;

    return `#${[r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
  } catch {
    return null;
  }
}

/** Remove an object and its whole ladder. */
export async function deleteMediaObject(publicId: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  const paths = [
    publicId,
    ...DERIVATIVE_WIDTHS.map((w) => derivativePath(publicId, w)),
  ];
  await supabase.storage.from(MEDIA_BUCKET).remove(paths);
}
