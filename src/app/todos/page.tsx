import TodoListPage from "@/components/todo-list-page";
import { getSession } from "@/lib/auth";

export default async function Page() {
  const session = await getSession();
  return <TodoListPage currentUser={session?.username ?? null} />;
}
