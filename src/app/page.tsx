import PracticeOverview from "@/components/practice-overview";
import { getSession } from "@/lib/auth";
import { displayName } from "@/lib/display-name";

export default async function Page() {
  const session = await getSession();
  return (
    <PracticeOverview
      greetingName={session ? displayName(session.username) : null}
      currentUser={session?.username ?? null}
    />
  );
}
