import { clinikoFetch } from "@/lib/cliniko";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    // Test connection by fetching patients (limited to 1)
    const data = await clinikoFetch("/patients?per_page=1");
    return NextResponse.json({
      success: true,
      message: "Connected to Cliniko successfully!",
      totalPatients: data.total_entries,
      samplePatient: data.patients?.[0] ? "Found" : "No patients"
    });
  } catch (error) {
    return NextResponse.json({ 
      success: false, 
      error: error instanceof Error ? error.message : "Unknown error" 
    }, { status: 500 });
  }
}
