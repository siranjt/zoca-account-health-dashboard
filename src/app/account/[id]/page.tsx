import { notFound } from "next/navigation";
import { getAccountsPayload } from "@/lib/data";
import CaveNav from "@/components/CaveNav";
import AccountDossier from "@/components/AccountDossier";
import type { HealthColor } from "@/lib/types";

// Per-account detail — replicates the Retool "Customer Dashboard" layout:
// an account picker + identity header + tabbed sections by data domain.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export interface PickerItem {
  entityId: string;
  name: string;
  color: HealthColor;
  am: string | null;
}

export default async function AccountPage({ params }: { params: { id: string } }) {
  const id = decodeURIComponent(params.id);
  const payload = await getAccountsPayload();
  const account = payload.accounts.find((a) => a.entityId === id);
  if (!account) notFound();

  const picker: PickerItem[] = payload.accounts
    .map((a) => ({ entityId: a.entityId, name: a.name, color: a.health.color, am: a.accountManager }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <>
      <CaveNav />
      <AccountDossier account={account} picker={picker} initialWindow={payload.windowDays} />
    </>
  );
}
