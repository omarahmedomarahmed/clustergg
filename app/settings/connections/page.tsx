import { redirect } from "next/navigation";

// Connecting game accounts now lives on your profile.
export default function ConnectionsRedirect() {
  redirect("/profile");
}
