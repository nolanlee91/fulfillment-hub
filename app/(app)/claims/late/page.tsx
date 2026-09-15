import { requirePageRole } from "@/lib/auth/current-user";
import LateClaimsClient from "./late-client";

export default async function LateClaimsPage() {
  await requirePageRole(["SUPER_ADMIN", "STAFF"]);
  return <LateClaimsClient />;
}
