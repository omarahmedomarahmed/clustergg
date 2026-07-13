import { redirect } from "next/navigation";

// Games are now explored as "Planets".
export default function GamesRedirect() {
  redirect("/planets");
}
