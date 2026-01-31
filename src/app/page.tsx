"use client";

import { useEffect, useState } from "react";

interface DoctorData {
  name: string;
  value: number;
}

interface DebugStats {
  contactFetchSuccess: number;
  contactFetchFailed: number;
  contactCacheHits: number;
}

interface ReferralData {
  success: boolean;
  totalPatients: number;
  patientsWithKnownDoctor: number;
  referringDoctors: DoctorData[];
  debug?: DebugStats;
}

interface Progress {
  phase: "fetching" | "processing" | "complete" | "error";
  message?: string;
  current: number;
  total: number;
  contactLookups?: number;
}

export default function Dashboard() {
  const [data, setData] = useState<ReferralData | null>(null);
  const [progress, setProgress] = useState<Progress>({ phase: "fetching", current: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const eventSource = new EventSource("/api/cliniko/referrals");

    eventSource.onmessage = (event) => {
      try {
        if (!event.data || event.data.trim() === "") return;

        const parsed = JSON.parse(event.data);

        if (parsed.phase === "complete") {
          setData(parsed);
          setProgress({ phase: "complete", current: parsed.totalPatients, total: parsed.totalPatients });
          eventSource.close();
        } else if (parsed.phase === "error") {
          setError(parsed.error);
          eventSource.close();
        } else {
          setProgress(parsed);
        }
      } catch (e) {
        console.error("Failed to parse SSE data:", e, event.data);
      }
    };

    eventSource.onerror = () => {
      setError("Connection lost. Please refresh the page.");
      eventSource.close();
    };

    return () => eventSource.close();
  }, []);

  const percentage = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;

  if (error) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="bg-red-50 text-red-600 p-6 rounded-lg">
          <h2 className="font-semibold">Error loading data</h2>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="bg-white rounded-lg shadow-lg p-8 w-full max-w-md">
          <h2 className="text-xl font-semibold text-gray-800 mb-4">Loading Referral Data</h2>

          <div className="mb-4">
            <div className="flex justify-between text-sm text-gray-600 mb-1">
              <span>{progress.message || "Loading..."}</span>
              <span>{percentage}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-3">
              <div
                className="bg-blue-600 h-3 rounded-full transition-all duration-300"
                style={{ width: percentage + "%" }}
              />
            </div>
          </div>

          <div className="space-y-2 text-sm text-gray-500">
            <p>
              Progress:{" "}
              <span className="font-medium text-gray-700">
                {progress.current.toLocaleString()} / {progress.total.toLocaleString()}
              </span>
            </p>
            {progress.contactLookups !== undefined && (
              <p>
                Contact lookups:{" "}
                <span className="font-medium text-gray-700">{progress.contactLookups.toLocaleString()}</span>
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 p-8 flex flex-col gap-5 justify-center items-center ">
      <div className="flex-col text-center">
        <h1 className="text-5xl font-extrabold text-cyan-600">
          Referral Dashboard For SHP
        </h1>
        <p className="text-gray-600">
          Total Patients: {data.totalPatients.toLocaleString()}
        </p>
      </div>
      <div className="flex justify-center">
        <div className="bg-white rounded-xl border-gray-50 border w-full max-w-2xl">
          <div className="overflow-y-auto max-h-[600px]">
            <table className="w-full ">
              <thead className="sticky top-0  bg-gray-200">
                <tr className="border-b p-2">
                  <th className="text-left p-2 text-gray-600 font-bold rounded-tl-xl">
                    #
                  </th>
                  <th className="text-left p-2 text-gray-600 font-bold">
                    Doctor
                  </th>
                  <th className="text-right font-bold p-2 text-gray-600 rounded-tr-xl">
                    Patients Number
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.referringDoctors.map((doctor, index) => (
                  <tr
                    key={doctor.name}
                    className="border-b border-gray-100 hover:bg-gray-50"
                  >
                    <td className="px-3 py-1 text-gray-500">{index + 1}</td>
                    <td className="px-3 py-1 text-gray-800">{doctor.name}</td>
                    <td className="px-5 py-1 text-center font-bold text-black">
                      {doctor.value.toLocaleString()}
                    </td>
                  </tr>
                ))}
                {data.referringDoctors.length === 0 && (
                  <tr>
                    <td colSpan={3} className="py-4 text-center text-gray-500">
                      No referring doctors found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      <div className="flex flex-col items-center gap-1">
        <p className="text-gray-600">
          Patients with Known Referring Doctor:{" "}
          {data.patientsWithKnownDoctor.toLocaleString()}
        </p>
      </div>

      {data.debug && (
        <div className="bg-gray-900 text-green-400 p-4 rounded-lg font-mono text-sm max-w-2xl w-full">
          <p className="text-white font-bold mb-2">Debug Stats:</p>
          <p>Contact Fetch Success: {data.debug.contactFetchSuccess}</p>
          <p className={data.debug.contactFetchFailed > 0 ? "text-red-400" : ""}>
            Contact Fetch Failed: {data.debug.contactFetchFailed}
          </p>
          <p>Contact Cache Hits: {data.debug.contactCacheHits}</p>
        </div>
      )}
    </div>
  );
}
