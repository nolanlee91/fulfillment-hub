import { requirePageRole } from "@/lib/auth/current-user";
import OutOfStockClient from "./out-of-stock-client";

export default async function OutOfStockPage() {
  const user = await requirePageRole(["SUPER_ADMIN", "STAFF", "CUSTOMER"]);
  return <OutOfStockClient role={user.role} />;
}
