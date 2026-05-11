import { requirePageRole } from "@/lib/auth/current-user";
import ImportTrackingClient from "./import-tracking-client";

export default async function ImportTrackingPage() {
  await requirePageRole(["SUPER_ADMIN", "STAFF"]);
  return <ImportTrackingClient />;
}
