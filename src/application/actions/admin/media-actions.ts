"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { fail, ok, type ActionResult } from "@/application/actions/result";
import {
  attachMedia,
  deleteMediaAsset,
  detachMedia,
  updateMediaAltText,
  uploadMediaAsset,
} from "@/application/use-cases/admin/media";

const altTextSchema = z.object({
  id: z.uuid(),
  locale: z.enum(["en", "ar"]),
  altText: z
    .string()
    .trim()
    .max(300)
    .transform((v) => (v === "" ? null : v))
    .nullable(),
});

const attachSchema = z.object({
  productId: z.uuid(),
  mediaAssetId: z.uuid(),
  role: z.enum([
    "primary",
    "gallery",
    "room_scene",
    "macro_detail",
    "installed",
    "swatch",
  ]),
  sortOrder: z.coerce.number().int().min(0).max(999).default(0),
});

const detachSchema = z.object({
  productId: z.uuid(),
  mediaAssetId: z.uuid(),
  role: z.enum([
    "primary",
    "gallery",
    "room_scene",
    "macro_detail",
    "installed",
    "swatch",
  ]),
});

const deleteSchema = z.object({ id: z.uuid() });

/**
 * Upload takes a `FormData` rather than a parsed object — the file's bytes
 * have to survive the boundary, and Zod has nothing useful to say about a
 * `File`. The real validation (MIME type, size, decodability) happens in
 * `uploadMedia`, where the bytes actually are.
 */
export async function uploadMediaAction(
  formData: FormData,
): Promise<ActionResult<{ id: string; deduplicated: boolean }>> {
  try {
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return { ok: false, error: "No file was submitted" };
    }

    const result = await uploadMediaAsset({
      name: file.name,
      type: file.type,
      bytes: Buffer.from(await file.arrayBuffer()),
    });

    revalidatePath("/admin/media");
    return ok(result);
  } catch (cause) {
    return fail(cause, "failed to upload media");
  }
}

export async function setAltTextAction(
  input: unknown,
): Promise<ActionResult<null>> {
  try {
    const { id, locale, altText } = altTextSchema.parse(input);
    await updateMediaAltText(id, locale, altText);
    revalidatePath("/admin/media");
    return ok(null);
  } catch (cause) {
    return fail(cause, "failed to save alt text");
  }
}

export async function attachMediaAction(
  input: unknown,
): Promise<ActionResult<null>> {
  try {
    const { productId, mediaAssetId, role, sortOrder } = attachSchema.parse(input);
    await attachMedia(productId, mediaAssetId, role, sortOrder);
    revalidatePath(`/admin/products/${productId}`);
    revalidatePath("/[locale]", "layout");
    return ok(null);
  } catch (cause) {
    return fail(cause, "failed to attach image");
  }
}

export async function detachMediaAction(
  input: unknown,
): Promise<ActionResult<null>> {
  try {
    const { productId, mediaAssetId, role } = detachSchema.parse(input);
    await detachMedia(productId, mediaAssetId, role);
    revalidatePath(`/admin/products/${productId}`);
    revalidatePath("/[locale]", "layout");
    return ok(null);
  } catch (cause) {
    return fail(cause, "failed to remove image");
  }
}

export async function deleteMediaAction(
  input: unknown,
): Promise<ActionResult<null>> {
  try {
    const { id } = deleteSchema.parse(input);
    await deleteMediaAsset(id);
    revalidatePath("/admin/media");
    return ok(null);
  } catch (cause) {
    return fail(cause, "failed to delete media");
  }
}
