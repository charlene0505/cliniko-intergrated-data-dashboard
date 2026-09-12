"use client";

import { useEffect, useState } from 'react';
import type { DashboardPatient } from '@/lib/patient-dashboard';

const tabs = ['Overview', 'Follow-ups', 'EPC', 'AHTR', 'Bookings', 'Tasks'] as const;
type Tab = typeof tabs[number];
const card = 'rounded-2xl border border-black/5 bg-white p-5';
const date = (value?: string | null) => value ? new Date(value).toLocaleDateString('en-AU', { timeZone: 'Australia/Sydney' }) : 'Not recorded';

export default function PatientWorkspace({ showcase }: { showcase: boolean }) {
  const [patients, setPatients] = useState<DashboardPatient[]>([]);
  const [tab, setTab] = useState<Tab>('Overview');
  const [search, setSearch] = useState('');
  const [practice, setPractice] = useState('All practices');
  const [selected, setSelected] = useState<DashboardPatient | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    fetch(showcase ? '/api/showcase/patients' : '/api/patients', { signal: controller.signal })
      .then(async response => { const data = await response.json(); if (!response.ok) throw new Error(data.error); return data; })
      .then(data => { setPatients(data.patients); setLoading(false); })
      .catch(error => { if (!controller.signal.aborted) { setError(error.message); setLoading(false); } });
    return () => controller.abort();
  }, [showcase]);

  const scoped = patients.filter(p => (practice === 'All practices' || p.clinical?.practice === practice)
    && `${p.firstName} ${p.lastName} ${p.doctor}`.toLowerCase().includes(search.toLowerCase()));
  const matchesTab = (p: DashboardPatient) => {
    const c = p.clinical;
    if (tab === 'Follow-ups') return c?.followUp && c.followUp !== 'Up to date';
    if (tab === 'EPC') return c?.funding === 'EPC' && !c.nextAppointment;
    if (tab === 'AHTR') return c && ['WorkCover', 'CTP'].includes(c.funding);
    if (tab === 'Bookings') return !!c?.nextAppointment;
    if (tab === 'Tasks') return !!c?.task;
    return true;
  };
  const visible = scoped.filter(matchesTab);
  const summaries = [
    ['Patients', scoped.length],
    ['Follow-ups due', scoped.filter(p => p.clinical && p.clinical.followUp !== 'Up to date').length],
    ['EPC without booking', scoped.filter(p => p.clinical?.funding === 'EPC' && !p.clinical.nextAppointment).length],
    ['Reception tasks', scoped.filter(p => p.clinical?.task).length],
  ];
  const c = selected?.clinical;
  return <section className="w-full max-w-7xl text-stone-900">
    <header className="mb-5 rounded-3xl bg-[#b3e0f7] p-7">
      <p className="text-xs font-semibold uppercase tracking-widest">SHP · Practice dashboard</p>
      <h1 className="mt-2 text-3xl font-semibold">Hello!</h1>
      <p className="mt-2 text-sm">Follow-ups, care plans and the next appointment, in one place.</p>
    </header>
    <nav aria-label="Patient views" className="mb-5 flex flex-wrap gap-2">{tabs.map(item => <button key={item} aria-pressed={tab === item} onClick={() => setTab(item)} className={`rounded-full px-5 py-2 text-sm ${tab === item ? 'bg-stone-900 text-white' : 'bg-white text-stone-600'}`}>{item}</button>)}</nav>
    <div className="mb-5 flex flex-wrap gap-3">
      <label className="flex flex-1 items-center gap-3 text-sm">Search<input className="min-w-0 flex-1 rounded-xl border border-stone-200 bg-white p-3" placeholder="Patient or referring doctor" value={search} onChange={e => setSearch(e.target.value)} /></label>
      <label className="flex items-center gap-3 text-sm">Practice<select className="rounded-xl border border-stone-200 bg-white p-3" value={practice} onChange={e => setPractice(e.target.value)}>{['All practices', ...new Set(patients.flatMap(p => p.clinical?.practice ? [p.clinical.practice] : []))].map(name => <option key={name}>{name}</option>)}</select></label>
    </div>
    {loading ? <p role="status">Loading patients from MongoDB…</p> : error ? <p role="alert" className="rounded-xl bg-red-50 p-4 text-red-800">{error}</p> : <>
      <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4">{summaries.map(([label, value]) => <div className={card} key={label}><p className="text-sm text-stone-500">{label}</p><p className="mt-3 text-3xl font-semibold">{value}</p><p className="mt-2 text-xs text-stone-500">In the current patient selection</p></div>)}</div>
      {!showcase && patients.some(p => !p.clinical) && <p className="mb-4 rounded-xl bg-amber-50 p-3 text-sm">Appointment and care-plan details are not yet imported for some patients. Only recorded data is shown.</p>}
      <div className={card}>
        <div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-semibold">{tab === 'Overview' ? 'Patient directory' : tab === 'EPC' ? 'EPC plans — no next appointment' : tab === 'AHTR' ? 'WorkCover & CTP · treatment requests' : tab}</h2><span className="text-sm text-stone-500">{visible.length} patients</span></div>
        <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="border-b text-xs uppercase tracking-wide text-stone-500"><tr>{['Patient', 'Practitioner / referrer', tab === 'Tasks' ? 'Task' : 'Care / reason', 'Last visit', 'Next appointment', ''].map((h,i) => <th key={i} className="px-3 py-3">{h}</th>)}</tr></thead><tbody>
          {visible.map(p => <tr key={p._id} className="border-b border-stone-100 hover:bg-stone-50">
            <td className="px-3 py-4"><button onClick={() => setSelected(p)} className="font-semibold text-teal-800 underline decoration-teal-200 underline-offset-4">{p.firstName} {p.lastName}</button><p className="mt-1 text-xs text-stone-500">{p.clinical?.practice ?? 'Practice not recorded'}</p></td>
            <td className="px-3 py-4">{p.clinical?.practitioner ?? 'Not recorded'}<p className="mt-1 text-xs text-stone-500">{p.doctor}</p></td>
            <td className="max-w-xs px-3 py-4">{tab === 'Tasks' ? p.clinical?.task : p.clinical?.reason ?? 'Not recorded'}{p.clinical && <p className="mt-1 text-xs text-teal-700">{p.clinical.funding} · {p.clinical.sessionsUsed}/{p.clinical.sessionsApproved} sessions · {p.clinical.followUp}</p>}</td>
            <td className="whitespace-nowrap px-3 py-4">{date(p.clinical?.lastVisit)}</td><td className="whitespace-nowrap px-3 py-4">{p.clinical ? p.clinical.nextAppointment ? date(p.clinical.nextAppointment) : 'Not booked' : 'Not recorded'}</td>
            <td><button aria-label={`View ${p.firstName} ${p.lastName}`} onClick={() => setSelected(p)} className="rounded-full border px-4 py-2">View</button></td>
          </tr>)}
          {!visible.length && <tr><td colSpan={6} className="py-10 text-center text-stone-500">No patients match this view.</td></tr>}
        </tbody></table></div>
        <p className="mt-4 text-xs text-stone-500">Showing up to 200 most recently registered patients. Select a patient to inspect their record.</p>
      </div>
      {tab === 'Overview' && <div className="mt-5 grid gap-5 md:grid-cols-2"><div className={card}><h2 className="mb-4 font-semibold">Patient funding mix</h2>{['Private', 'EPC', 'WorkCover', 'CTP', 'Not recorded'].map(funding => { const count = scoped.filter(p => (p.clinical?.funding ?? 'Not recorded') === funding).length; return <div key={funding} className="mb-4"><div className="mb-1 flex justify-between text-sm"><span>{funding}</span><span>{count}</span></div><div className="h-2 rounded bg-stone-100"><div className="h-2 rounded bg-teal-600" style={{ width: `${scoped.length ? count / scoped.length * 100 : 0}%` }} /></div></div>; })}</div><div className={card}><h2 className="mb-4 font-semibold">Needs attention</h2>{scoped.filter(p => p.clinical?.task).slice(0,4).map(p => <button key={p._id} onClick={() => setSelected(p)} className="block w-full border-b border-stone-100 py-3 text-left"><span className="text-sm font-semibold">{p.firstName} {p.lastName}</span><p className="mt-1 text-sm text-stone-500">{p.clinical?.task}</p></button>)}</div></div>}
    </>}
    {selected && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setSelected(null)}><section role="dialog" aria-modal="true" aria-labelledby="patient-title" onClick={e => e.stopPropagation()} onKeyDown={e => { if (e.key === 'Escape') setSelected(null); }} className="max-h-[90vh] w-full max-w-xl overflow-auto rounded-3xl bg-white p-7">
      <div className="flex justify-between gap-4"><div><p className="text-xs uppercase tracking-widest text-teal-700">{showcase ? 'Fictional patient' : 'Patient record'}</p><h2 id="patient-title" className="mt-2 text-2xl font-semibold">{selected.firstName} {selected.lastName}</h2></div><button autoFocus aria-label="Close patient details" onClick={() => setSelected(null)} className="self-start rounded-full border px-3 py-2">Close</button></div>
      <dl className="mt-6 grid grid-cols-2 gap-5 text-sm">{Object.entries({ 'Patient ID': selected._id, 'Referring doctor': selected.doctor, 'Registered': date(selected.clinikoCreatedAt), 'Practitioner': c?.practitioner, 'Phone': c?.phone, 'Email': c?.email, 'Funding': c?.funding, 'Sessions': c ? `${c.sessionsUsed} of ${c.sessionsApproved}` : undefined, 'Plan expiry': date(c?.expiry), 'Claim': c?.claim, 'Last visit': date(c?.lastVisit), 'Next appointment': c ? c.nextAppointment ? date(c.nextAppointment) : 'Not booked' : undefined, 'Follow-up': c?.followUp, 'Reception task': c?.task }).map(([key,value]) => <div key={key}><dt className="text-xs text-stone-500">{key}</dt><dd className="mt-1 break-words font-medium">{value || 'Not recorded'}</dd></div>)}</dl>
      <p className="mt-6 rounded-xl bg-stone-50 p-3 text-xs text-stone-500">{showcase ? 'All identities, contact details and care scenarios are invented. This view reads the showcase database.' : 'Read-only view of recorded patient information.'}</p>
    </section></div>}
  </section>;
}
