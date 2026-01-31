import { clinikoFetch } from "@/lib/cliniko";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    // Fetch contacts (limited to 1)
    const data = await clinikoFetch("/contacts?per_page=1");
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Unknown error"
    }, { status: 500 });
  }
}
