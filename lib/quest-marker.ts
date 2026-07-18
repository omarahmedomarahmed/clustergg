// Client-safe constants for the gamified astronaut quest-map marker. Kept free of
// any server imports so the client QuestMapHero can import it directly. One
// consistent figure in four poses (background-removed, transparent) — the marker
// faces the way it's travelling toward the next milestone.
export const QUEST_ASTRONAUT = {
  front: "https://d8j0ntlcm91z4.cloudfront.net/user_3AxCA7tynxuPEenQCjJiU5h0082/hf_20260718_155414_f0fa69a2-5889-449b-9eb0-b242a5b07aa2.png",
  left: "https://d8j0ntlcm91z4.cloudfront.net/user_3AxCA7tynxuPEenQCjJiU5h0082/hf_20260718_160245_a37623dc-1afa-4be5-959d-024783ea12cc.png",
  right: "https://d8j0ntlcm91z4.cloudfront.net/user_3AxCA7tynxuPEenQCjJiU5h0082/hf_20260718_162543_ddcab2ca-0347-4f0b-84d7-920d967eab7a.png",
  back: "https://d8j0ntlcm91z4.cloudfront.net/user_3AxCA7tynxuPEenQCjJiU5h0082/hf_20260718_162547_f9ac9fc5-26d0-431a-8e59-969d53b3fe65.png",
} as const;
