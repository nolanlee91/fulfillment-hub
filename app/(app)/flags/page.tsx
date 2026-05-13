import { requirePageRole } from "@/lib/auth/current-user";
import FlagsClient from "./flags-client";

export default async function FlagsPage() {
  const user = await requirePageRole(["SUPER_ADMIN", "STAFF", "CUSTOMER"]);
  return <FlagsClient role={user.role} currentUserId={user.id} />;
}
