import { requirePageRole } from "@/lib/auth/current-user";
import InventoryClient from "./inventory-client";

export default async function InventoryPage() {
  await requirePageRole(["SUPER_ADMIN", "STAFF"]);
  return <InventoryClient />;
}
