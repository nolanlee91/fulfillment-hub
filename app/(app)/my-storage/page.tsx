import { requirePageRole } from "@/lib/auth/current-user";
import MyStorageClient from "./my-storage-client";

export default async function MyStoragePage() {
  await requirePageRole(["CUSTOMER"]);
  return <MyStorageClient />;
}
