// The client-safe half of the data room's types.
//
// `lib/dataroom/index.ts` pulls in the database, so a client component can't
// import from it — but the milestone ladder is computed on the server and
// rendered on the client, so its shape has to live somewhere both can reach.
export type MilestoneLadder = {
  current: number;
  targets: { value: number; reached: boolean; isNext: boolean; pct: number }[];
  next: number | null;
  toNext: number;
  pctToNext: number;
};
