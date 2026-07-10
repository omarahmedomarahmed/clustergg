// Higgsfield-generated brand assets (cosmic identity pack v2).
// Everything below is also stored in / overridable from the database:
// badges (badges.icon), trophies (trophies.image_url), banners (platform_settings).

const CDN = "https://d8j0ntlcm91z4.cloudfront.net/user_3AxCA7tynxuPEenQCjJiU5h0082";

export const BADGE_ART = {
  b1: `${CDN}/hf_20260710_194133_6be4bf0b-3f07-46b5-b6e6-463e5ba58eaf_min.webp`, // gold star-forge medallion
  b2: `${CDN}/hf_20260710_194137_6d3316ef-3bd4-47fb-8b31-bd67710ad886_min.webp`, // violet constellation ring
  b3: `${CDN}/hf_20260710_194140_8e245348-95a9-4909-8bbd-54539921cb73_min.webp`, // cyan spiral galaxy
  b4: `${CDN}/hf_20260710_194143_f74bb77d-882a-4244-a3b2-e20aaed7f2f4_min.webp`, // golden crown corona
  b5: `${CDN}/hf_20260710_194145_b72ccbb5-73ae-4440-908a-39bc72ce3cc3_min.webp`, // signal beacon
  b6: `${CDN}/hf_20260710_194148_8aaf6620-0210-4eb7-9a51-97383234a9cc_min.webp`, // emerald shield
} as const;

export const TROPHY_ART = {
  gold: `${CDN}/hf_20260710_194201_2e8ab5e5-d7b1-4db6-b136-5a6916fcb289.png`,      // champion cup w/ Cluster emblem
  silver: `${CDN}/hf_20260710_194205_47ae1c8c-aa41-41c4-ab7b-a86f5d1f1589.png`,
  bronze: `${CDN}/hf_20260710_194208_546cd9de-6e59-4bbd-b3d8-6b8a8d98981f.png`,
  legendary: `${CDN}/hf_20260710_194210_f1d9f5a0-ea99-4c70-ba89-38a7267b5622.png`, // crystal supernova
} as const;

export const BANNER_ART = {
  arena: `${CDN}/hf_20260710_194213_6d94eae7-5de1-4256-8826-f241a3ffeb54.png`,       // challenges arena
  games: `${CDN}/hf_20260710_194216_b95a75cc-98bc-404d-886a-39a7bd2c6092.png`,       // gaming worlds collage
  profileDefault: `${CDN}/hf_20260710_194218_8378a101-637e-4c40-ab96-72085790ccf4.png`, // subtle aurora banner
  hero: `${CDN}/hf_20260710_145725_dffb17ff-3d2b-4e24-9f6b-a160a4de4abd.png`,
  ambient: `${CDN}/hf_20260710_145732_1c8e460d-6369-4567-9feb-ba372c49499b.png`,
  logo: `${CDN}/hf_20260710_145728_efccfe24-d221-4768-9426-e3587a9ad6d0.png`,
  og: `${CDN}/hf_20260710_145736_c76f07fb-ec1a-4aa4-9a99-4596e919a55c.png`,
} as const;
