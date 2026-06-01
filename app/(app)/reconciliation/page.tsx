import { requirePageRole } from "@/lib/auth/current-user";
import ReconciliationClient from "./reconciliation-client";

export default async function ReconciliationPage() {
  const user = await requirePageRole(["CUSTOMER", "STAFF", "SUPER_ADMIN"]);
  return <ReconciliationClient role={user.role} customerId={user.customerId} />;
}
