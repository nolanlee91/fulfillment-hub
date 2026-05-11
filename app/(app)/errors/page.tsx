import { requirePageRole } from "@/lib/auth/current-user";
import ErrorsClient from "./errors-client";

export default async function ErrorsPage() {
  await requirePageRole(["SUPER_ADMIN", "STAFF"]);
  return <ErrorsClient />;
}
