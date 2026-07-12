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

// Marketing + streaming brand kit (Higgsfield-generated). Grouped for the
// /admin/brand-kit gallery. Every URL is a full-res downloadable PNG.
export type KitAsset = { name: string; url: string; aspect: string; note: string };
export const BRAND_KIT: { group: string; assets: KitAsset[] }[] = [
  {
    group: "Logos — C mark variations",
    assets: [
      { name: "C · 11-Star Constellation (dark)", url: `${CDN}/hf_20260712_213635_4117bb5e-5405-4299-ae2b-e6be0726c24a.png`, aspect: "1/1", note: "Letter C built from 11 stars on solid navy — primary mark" },
      { name: "C · Solid Gradient (white bg)", url: `${CDN}/hf_20260712_213639_92d89762-a458-4eaa-acce-09a8b8861bfa.png`, aspect: "1/1", note: "Solid gradient C on white — for light backgrounds / print" },
    ],
  },
  {
    group: "Social — challenges & results",
    assets: [
      { name: "Challenge Post (IG square)", url: `${CDN}/hf_20260712_213648_cc0391ed-7e5e-4c6b-9b46-b5cb342acbd5.png`, aspect: "1/1", note: "1080×1080 — 'Challenge Live' announcement, empty center for details" },
      { name: "Challenge Story (9:16)", url: `${CDN}/hf_20260712_213651_49c0cd4b-e7b4-493d-9e9c-6cadd40745f2.png`, aspect: "9/16", note: "1080×1920 — 'Join the Challenge' vertical story" },
      { name: "Winner / Champion Card", url: `${CDN}/hf_20260712_213700_5ec9bc9f-82c9-4fbb-88fc-a4b13ec0da0f.png`, aspect: "1/1", note: "Trophy + name plate — post when a challenge ends" },
      { name: "Top 3 Podium Results", url: `${CDN}/hf_20260712_213735_5db2194e-a24e-404e-be23-b684844a4125.png`, aspect: "1/1", note: "Weekly champions podium — leaderboard recap" },
    ],
  },
  {
    group: "Streaming — overlays & screens",
    assets: [
      { name: "Live Overlay Frame", url: `${CDN}/hf_20260712_213703_47ecfb09-5bbc-45ea-89b4-6958d1bd061c.png`, aspect: "16/9", note: "OBS overlay — webcam + chat frame, empty center for gameplay" },
      { name: "Starting Soon Screen", url: `${CDN}/hf_20260712_213712_c554eaae-92ab-421f-8872-d1c3343ea03d.png`, aspect: "16/9", note: "Stream intermission — before you go live" },
      { name: "Be Right Back Screen", url: `${CDN}/hf_20260712_213715_ee611bbf-8b11-4d8b-aed3-def5b1e91f85.png`, aspect: "16/9", note: "Stream intermission — mid-stream break" },
    ],
  },
  {
    group: "Banners",
    assets: [
      { name: "Social Header (Twitter/Discord)", url: `${CDN}/hf_20260712_213730_a39296fe-beeb-4117-a419-93d73728b08c.png`, aspect: "16/9", note: "CLUSTER wordmark banner — social profile headers" },
    ],
  },
  {
    group: "Profile backgrounds",
    assets: [
      { name: "Violet Nebula", url: `${CDN}/hf_20260712_212340_18920f6b-9da8-47f6-8c17-82b17b56abf6.png`, aspect: "16/9", note: "Profile background preset" },
      { name: "Cyber Neon", url: `${CDN}/hf_20260712_212345_26b6fa40-299d-43db-b0f2-077a00be6f60.png`, aspect: "16/9", note: "Profile background preset" },
    ],
  },
];

export const BANNER_ART = {
  arena: `${CDN}/hf_20260710_194213_6d94eae7-5de1-4256-8826-f241a3ffeb54.png`,       // challenges arena
  games: `${CDN}/hf_20260710_194216_b95a75cc-98bc-404d-886a-39a7bd2c6092.png`,       // gaming worlds collage
  profileDefault: `${CDN}/hf_20260710_194218_8378a101-637e-4c40-ab96-72085790ccf4.png`, // subtle aurora banner
  hero: `${CDN}/hf_20260710_145725_dffb17ff-3d2b-4e24-9f6b-a160a4de4abd.png`,
  ambient: `${CDN}/hf_20260710_145732_1c8e460d-6369-4567-9feb-ba372c49499b.png`,
  logo: `${CDN}/hf_20260710_145728_efccfe24-d221-4768-9426-e3587a9ad6d0.png`,
  og: `${CDN}/hf_20260710_145736_c76f07fb-ec1a-4aa4-9a99-4596e919a55c.png`,
} as const;
