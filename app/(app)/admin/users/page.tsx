import { requirePageRole } from "@/lib/auth/current-user";
import UsersClient from "./users-client";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  const me = await requirePageRole(["SUPER_ADMIN"]);
  return <UsersClient currentUserId={me.id} />;
}
