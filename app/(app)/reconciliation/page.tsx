import { requirePageRole } from "@/lib/auth/current-user";
import ReconciliationClient from "./reconciliation-client";

export default async function ReconciliationPage() {
  await requirePageRole(["CUSTOMER"]);
  return <ReconciliationClient />;
}
