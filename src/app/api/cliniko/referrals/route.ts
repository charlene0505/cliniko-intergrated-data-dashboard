import { clinikoFetch } from "@/lib/cliniko";

// Delay between API requests to avoid rate limiting (200 req/min = ~300ms between requests)
const REQUEST_DELAY_MS = 50;

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

interface Patient {
  id: number;
  first_name?: string;
  last_name?: string;
  referring_doctor?: {
    links?: {
      self?: string;
    };
  };
  referral_source?: string;
}

interface Contact {
  first_name?: string;
  last_name?: string;
  company_name?: string;
}

interface PatientsResponse {
  patients: Patient[];
  total_entries: number;
  links: { next?: string };
}


function formatDoctorName(contact: Contact): string | null {
  const nameParts: string[] = [];

  if (contact.first_name || contact.last_name) {
    const fullName = [contact.first_name, contact.last_name].filter(Boolean).join(" ");
    nameParts.push(fullName);
  }

  if (contact.company_name) {
    if (nameParts.length > 0) {
      nameParts.push("(" + contact.company_name + ")");
    } else {
      nameParts.push(contact.company_name);
    }
  }

  // Return null if no valid name (will be filtered out)
  return nameParts.length > 0 ? nameParts.join(" ") : null;
}

export async function GET() {
  // Create cache inside request scope to prevent race conditions between concurrent requests
  const contactCache = new Map<string, Contact>();

  // Debug counters
  let contactFetchSuccess = 0;
  let contactFetchFailed = 0;
  let contactCacheHits = 0;

  async function fetchContact(url: string): Promise<Contact | null> {
    if (contactCache.has(url)) {
      contactCacheHits++;
      return contactCache.get(url)!;
    }
    try {
      await sleep(REQUEST_DELAY_MS); // Rate limit protection
      const endpoint = url.replace(/https:\/\/api\.[^/]+\.cliniko\.com\/v1/, "");
      const contact = (await clinikoFetch(endpoint)) as Contact;
      contactCache.set(url, contact);
      contactFetchSuccess++;
      return contact;
    } catch (error) {
      contactFetchFailed++;
      console.error("Contact fetch failed:", url, error);
      return null;
    }
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const sendProgress = (data: object) => {
        controller.enqueue(encoder.encode("data: " + JSON.stringify(data) + "\n\n"));
      };

      try {
        // Phase 1: Fetch all patients
        const allPatients: Patient[] = [];
        let page = 1;
        let hasMore = true;
        let totalEntries = 0;

        sendProgress({ phase: "fetching", message: "Fetching patients...", current: 0, total: 0 });

        while (hasMore) {
          await sleep(REQUEST_DELAY_MS); // Rate limit protection
          const data = (await clinikoFetch("/patients?page=" + page + "&per_page=100")) as PatientsResponse;
          allPatients.push(...data.patients);
          totalEntries = data.total_entries;

          sendProgress({
            phase: "fetching",
            message: "Fetching patients...",
            current: allPatients.length,
            total: totalEntries
          });

          hasMore = !!data.links?.next;
          page++;
          if (page > 200) break;
        }

        // Phase 2: Process patients for referring doctors (only from referring_doctor field)
        const referringDoctorCounts: Record<string, number> = {};
        let processed = 0;
        let contactLookups = 0;
        let patientsWithKnownDoctor = 0;

        sendProgress({
          phase: "processing",
          message: "Processing referring doctors...",
          current: 0,
          total: allPatients.length,
          contactLookups: 0
        });

        for (const patient of allPatients) {
          const doctorLink = patient.referring_doctor?.links?.self;

          // Only process patients with a referring_doctor link
          if (doctorLink) {
            contactLookups++;
            const contact = await fetchContact(doctorLink);
            if (contact) {
              const doctorName = formatDoctorName(contact);
              if (doctorName) {
                referringDoctorCounts[doctorName] = (referringDoctorCounts[doctorName] || 0) + 1;
                patientsWithKnownDoctor++;
              }
            }
          }

          processed++;

          // Send progress every 50 patients
          if (processed % 50 === 0 || processed === allPatients.length) {
            sendProgress({
              phase: "processing",
              message: "Processing referring doctors...",
              current: processed,
              total: allPatients.length,
              contactLookups
            });
          }
        }

        // Get top 20 referring doctors, sorted by count
        const referringDoctors = Object.entries(referringDoctorCounts)
          .map(([name, value]) => ({ name, value }))
          .sort((a, b) => b.value - a.value)
          .slice(0, 20);

        sendProgress({
          phase: "complete",
          success: true,
          totalPatients: allPatients.length,
          patientsWithKnownDoctor,
          referringDoctors,
          debug: {
            contactFetchSuccess,
            contactFetchFailed,
            contactCacheHits,
          }
        });

      } catch (error) {
        sendProgress({
          phase: "error",
          success: false,
          error: error instanceof Error ? error.message : "Unknown error"
        });
      }

      controller.close();
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
}
