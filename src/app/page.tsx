import PracticeOverview from "@/components/practice-overview";
import { getSession } from "@/lib/auth";
import { displayName } from "@/lib/display-name";
import { defaultPracticeFor } from "@/lib/default-practice";

export default async function Page() {
  const session = await getSession();
  const initialPractice = await defaultPracticeFor(session?.username ?? null);
  return (
    <PracticeOverview
      greetingName={session ? displayName(session.username) : null}
      currentUser={session?.username ?? null}
      initialPractice={initialPractice}
    />
  );
}
