import { getCurrentUser, isAdmin, isStaff, type CurrentUser } from "@/lib/auth";
import { getContent, setContent } from "@/lib/cms";
import { GRANTABLE_AREAS, type AreaKey } from "@/lib/areas";

// Server-only RBAC guards. Client-safe constants + pure helpers (GRANTABLE_AREAS,
// areaAllowed, …) live in lib/areas.ts so client components can import them
// without dragging next/headers into the browser bundle.
export { GRANTABLE_AREAS, NEVER_GRANTABLE, areaAllowed, type AreaKey } from "@/lib/areas";

const STAFF_ACCESS_KEY = "staff.access"; // CMS: comma-separated granted area keys

export async function getStaffGrants(): Promise<string[]> {
  const { [STAFF_ACCESS_KEY]: raw } = await getContent([STAFF_ACCESS_KEY]);
  return raw ? raw.split(",").map((s) => s.trim()).filter(Boolean) : [];
}

export async function setStaffGrants(areas: string[]): Promise<void> {
  const allowed = new Set(GRANTABLE_AREAS.map((a) => a.key as string));
  const clean = [...new Set(areas.filter((a) => allowed.has(a)))];
  await setContent(STAFF_ACCESS_KEY, clean.join(","));
}

// Server-action guard for a grantable area. Admins always pass; staff pass only
// when the area is granted. Throws FORBIDDEN otherwise (same shape as requireAdmin).
export async function requireArea(area: AreaKey): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new Error("FORBIDDEN");
  if (isAdmin(user)) return user;
  if (isStaff(user)) {
    const grants = await getStaffGrants();
    if (grants.includes(area)) return user;
  }
  throw new Error("FORBIDDEN");
}
