import { NextResponse } from "next/server";
import { getHubspotRecordId } from "@/lib/metabase";
import { getLocationMeetingUrl, hubspotConfigured } from "@/lib/hubspot";

// The customer's "Check in meeting URL" — lives on the HubSpot Locations custom
// object, which is NOT synced to the warehouse, so it's fetched live per account:
// entity_id → hubspot_stitch.locations.id → HubSpot API. Degrades to {url:null}.
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 20;

const UUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const id = decodeURIComponent(params.id);
  if (!UUID.test(id)) return NextResponse.json({ error: "invalid id" }, { status: 400 });
  if (!hubspotConfigured()) {
    return NextResponse.json({ configured: false, url: null }, { headers: { "Cache-Control": "no-store" } });
  }
  const recordId = await getHubspotRecordId(id).catch(() => null);
  const url = recordId ? await getLocationMeetingUrl(recordId).catch(() => null) : null;
  return NextResponse.json({ configured: true, url }, { headers: { "Cache-Control": "no-store" } });
}
