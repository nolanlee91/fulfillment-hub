import { redirect } from "next/navigation";
import { requirePageRole, customerHome } from "@/lib/auth/current-user";
import MyStorageClient from "./my-storage-client";

export default async function MyStoragePage() {
  const user = await requirePageRole(["CUSTOMER"]);
  if (!user.storageEnabled) redirect(customerHome(user));
  return <MyStorageClient />;
}
