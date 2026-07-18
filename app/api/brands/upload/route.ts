import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { uploadDataUrlToBlob } from "@/lib/blob";

export const dynamic = "force-dynamic";

const MAX_DATAURL_BYTES = 8 * 1024 * 1024;

// Key-gated creative upload for the unauthenticated brand portal. Validates the
// brand's access key before storing the image, mirroring /api/upload.
export async function POST(req: NextRequest) {
  let brandId = "", key = "", dataUrl = "";
  try {
    const body = await req.json();
    brandId = String(body?.brandId ?? "");
    key = String(body?.key ?? "");
    dataUrl = String(body?.dataUrl ?? "");
  } catch {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }

  const db = await getDb();
  const [brand] = await db.select({ accessKey: schema.brands.accessKey }).from(schema.brands).where(eq(schema.brands.id, brandId)).limit(1);
  if (!brand || !brand.accessKey || brand.accessKey !== key) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (dataUrl.length > MAX_DATAURL_BYTES) {
    return NextResponse.json({ error: "image too large (max ~6MB)" }, { status: 413 });
  }
  if (!dataUrl.startsWith("data:image/")) {
    if (/^https:\/\/[^\s"'<>]{1,2000}$/i.test(dataUrl)) return NextResponse.json({ url: dataUrl, hosted: false });
    return NextResponse.json({ error: "invalid image" }, { status: 400 });
  }
  const hosted = await uploadDataUrlToBlob(dataUrl, "creative");
  return NextResponse.json({ url: hosted ?? dataUrl, hosted: !!hosted });
}
