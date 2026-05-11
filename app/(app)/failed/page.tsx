import { requirePageRole } from "@/lib/auth/current-user";
import FailedClient from "./failed-client";

export default async function FailedPage() {
  const user = await requirePageRole(["SUPER_ADMIN", "STAFF", "CUSTOMER"]);
  return <FailedClient role={user.role} />;
}
