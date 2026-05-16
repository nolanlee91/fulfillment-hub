import { redirect } from "next/navigation";
import { Sidebar } from "@/components/sidebar";
import { PageTransition } from "@/components/page-transition";
import { getCurrentUser } from "@/lib/auth/current-user";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  return (
    <>
      <Sidebar user={user} />
      <main className="ml-60 min-h-screen p-8">
        <PageTransition>{children}</PageTransition>
      </main>
    </>
  );
}
