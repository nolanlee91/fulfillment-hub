import { requirePageRole } from "@/lib/auth/current-user";
import ReconciliationLookupClient from "./reconciliation-lookup-client";

export default async function ReconciliationLookupPage() {
  await requirePageRole(["SUPER_ADMIN", "STAFF"]);
  return <ReconciliationLookupClient />;
}
