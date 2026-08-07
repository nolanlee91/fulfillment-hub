import { redirect } from "next/navigation";
import { requirePageRole, customerHome } from "@/lib/auth/current-user";
import MyInventoryClient from "./my-inventory-client";

export default async function MyInventoryPage() {
  const user = await requirePageRole(["CUSTOMER"]);
  // Trang thuộc dịch vụ fulfillment — khách storage-only không vào được.
  if (!user.fulfillmentEnabled) redirect(customerHome(user));
  return <MyInventoryClient />;
}
