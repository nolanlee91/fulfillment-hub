import { redirect } from "next/navigation";
import { requirePageRole, customerHome } from "@/lib/auth/current-user";
import OrdersClient from "./orders-client";

export default async function OrdersPage() {
  const user = await requirePageRole(["SUPER_ADMIN", "STAFF", "CUSTOMER"]);
  // Khách storage-only không có Fulfillment → đẩy về trang chủ của họ.
  if (user.role === "CUSTOMER" && !user.fulfillmentEnabled) redirect(customerHome(user));
  return <OrdersClient role={user.role} />;
}
