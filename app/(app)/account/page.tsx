import { requireUser } from "@/lib/auth/current-user";
import AccountClient from "./account-client";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const me = await requireUser();
  return (
    <AccountClient
      username={me.username}
      name={me.name}
      role={me.role}
    />
  );
}
