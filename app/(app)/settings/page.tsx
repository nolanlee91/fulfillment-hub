import { requirePageRole } from "@/lib/auth/current-user";
import SettingsClient from "./settings-client";

export default async function SettingsPage() {
  await requirePageRole(["SUPER_ADMIN", "STAFF"]);
  return <SettingsClient />;
}
