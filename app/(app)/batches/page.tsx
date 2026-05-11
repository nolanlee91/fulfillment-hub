import { requirePageRole } from "@/lib/auth/current-user";
import BatchesClient from "./batches-client";

export default async function BatchesPage() {
  await requirePageRole(["SUPER_ADMIN", "STAFF"]);
  return <BatchesClient />;
}
