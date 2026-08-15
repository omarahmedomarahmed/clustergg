// Convert on upload. Rule 1 of the WebP notes.
//
// The card renderer decodes PNG and JPEG. It does not decode WebP, and it
// never will — and WebP is what a modern browser gives you when somebody
// right-clicks and saves an image, so it is the single most likely thing a
// brand uploads.
//
// The rule is not "reject WebP". It is **accept whatever the uploader gives
// and store something the renderer can read**, because a brand who is told
// their logo is the wrong format will send it anyway, in an email, on a
// Friday.

import { isRenderableImageType, RENDERABLE_IMAGE_TYPES } from "./render.ts";

export type StoredImage = {
  bytes: Uint8Array;
  contentType: (typeof RENDERABLE_IMAGE_TYPES)[number];
  /** True when the source needed converting, for the log and the admin view. */
  converted: boolean;
  sourceType: string;
};

export class UploadRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UploadRefused";
  }
}

/**
 * Take an upload and return something the renderer can definitely decode.
 *
 * `convert` is injected rather than imported so this module has no opinion
 * about which image library is installed, and so the rule can be tested
 * without one. The rule is what matters: **nothing that is not PNG or JPEG
 * reaches storage.**
 */
export async function acceptImage(
  input: { bytes: Uint8Array; contentType: string | null; filename?: string },
  convert?: (bytes: Uint8Array) => Promise<{ bytes: Uint8Array; contentType: "image/png" }>,
): Promise<StoredImage> {
  const sourceType = (input.contentType ?? "").split(";")[0].trim().toLowerCase();

  if (isRenderableImageType(sourceType)) {
    return {
      bytes: input.bytes,
      contentType: sourceType as StoredImage["contentType"],
      converted: false,
      sourceType,
    };
  }

  if (!convert) {
    throw new UploadRefused(
      `${sourceType || "That file"} cannot be drawn on a card, and no converter ` +
        `is configured. The card renderer decodes PNG and JPEG only.`,
    );
  }

  const converted = await convert(input.bytes);
  if (!isRenderableImageType(converted.contentType)) {
    // A converter that returns something undecodable has done nothing, and
    // trusting it would put the original problem back with extra steps.
    throw new UploadRefused(
      `The converter returned ${converted.contentType}, which the card renderer ` +
        `still cannot decode.`,
    );
  }
  return {
    bytes: converted.bytes,
    contentType: converted.contentType,
    converted: true,
    sourceType,
  };
}
