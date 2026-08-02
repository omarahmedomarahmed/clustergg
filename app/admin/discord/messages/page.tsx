import { redirect } from "next/navigation";

// The server-owner inbox moved into the unified one at /admin/messages, which
// carries brand threads beside it. Kept as a redirect rather than deleted:
// staff bookmark admin pages, and a 404 on a queue is how a queue stops being
// worked.
export default function LegacyServerMessages() {
  redirect("/admin/messages?kind=server");
}
