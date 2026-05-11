import { requirePageRole } from "@/lib/auth/current-user";
import OrdersClient from "./orders-client";

export default async function OrdersPage() {
  const user = await requirePageRole(["SUPER_ADMIN", "STAFF", "CUSTOMER"]);
  return <OrdersClient role={user.role} />;
}
