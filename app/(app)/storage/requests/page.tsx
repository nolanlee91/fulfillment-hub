import { requirePageRole } from "@/lib/auth/current-user";
import RequestsClient from "./requests-client";

export default async function StorageRequestsPage() {
  const u = await requirePageRole(["SUPER_ADMIN", "STAFF"]);
  return <RequestsClient isSuperAdmin={u.role === "SUPER_ADMIN"} />;
}
