import { requirePageRole } from "@/lib/auth/current-user";
import DeliveredClient from "./delivered-client";

export default async function DeliveredPage() {
  const user = await requirePageRole(["SUPER_ADMIN", "STAFF", "CUSTOMER"]);
  return <DeliveredClient role={user.role} />;
}
