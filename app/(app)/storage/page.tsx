import { requirePageRole } from "@/lib/auth/current-user";
import StorageClient from "./storage-client";

export default async function StoragePage() {
  await requirePageRole(["SUPER_ADMIN", "STAFF"]);
  return <StorageClient />;
}
