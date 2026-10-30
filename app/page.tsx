// AI-assisted (Claude Code, Opus 5.5) · revisión de Acker: pendiente
//
// La raíz no tiene contenido propio: manda a cada quien a su inicio, o a /login.
import { redirect } from "next/navigation";
import { getSessionUser, HOME_BY_ROLE } from "@/lib/auth";

export default async function Home() {
  const user = await getSessionUser();
  redirect(user ? HOME_BY_ROLE[user.role] : "/login");
}
