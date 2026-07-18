// Client-safe RBAC constants + pure helpers. Kept free of any server-only imports
// (no next/headers, no DB) so client components can import GRANTABLE_AREAS. The
// server-only guards (requireArea, getStaffGrants) live in lib/permissions.ts.

export const GRANTABLE_AREAS = [
  { key: "ads", label: "Ads & brands", desc: "Brands, campaigns, creatives, placements, ad schedule & analytics — the revenue tools." },
  { key: "storage", label: "Image storage", desc: "See every stored image, its source & size, and re-host art to Blob." },
  { key: "audit", label: "Audit log", desc: "Read the log of every admin/staff action." },
] as const;

export type AreaKey = (typeof GRANTABLE_AREAS)[number]["key"];
export const NEVER_GRANTABLE = ["roles", "settings"] as const;

// Whether a user may see/use an admin area. Admin: everything. Staff: any area
// with no gate (staff-default) or a grantable area that's currently granted.
export function areaAllowed(isAdminUser: boolean, area: string | undefined, grants: string[]): boolean {
  if (isAdminUser) return true;
  if (!area) return true; // staff-default area
  if ((NEVER_GRANTABLE as readonly string[]).includes(area)) return false;
  return grants.includes(area);
}
