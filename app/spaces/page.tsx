import { redirect } from "next/navigation";

// Spaces are now "Planets".
export default function SpacesRedirect() {
  redirect("/planets");
}
