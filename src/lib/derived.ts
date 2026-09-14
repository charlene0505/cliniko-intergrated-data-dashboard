import type { AnyBulkWriteOperation, Db, Filter } from "mongodb";

// Brings a derived collection (`daily_stats`, `visits`) in line with a freshly computed set of
// documents, writing only the rows that actually changed. Each sync recomputes the full set, but an
// incremental sync typically moves a handful of rows — rewriting every document would turn a no-op
// sync into thousands of writes. Documents must be flat (primitive fields only) for the comparison.
export async function replaceDerived<T extends { _id: string }>(
  db: Db,
  name: string,
  scope: Filter<T>,
  docs: T[],
): Promise<number> {
  const collection = db.collection<T>(name);
  const existing = new Map(
    (await collection.find(scope).toArray()).map((d) => [d._id as string, d as unknown as Record<string, unknown>]),
  );

  const ops: AnyBulkWriteOperation<T>[] = [];
  for (const doc of docs) {
    const prev = existing.get(doc._id);
    existing.delete(doc._id);
    const next = doc as unknown as Record<string, unknown>;
    const keys = Object.keys(next);
    if (prev && Object.keys(prev).length === keys.length && keys.every((k) => prev[k] === next[k])) continue;
    ops.push({ replaceOne: { filter: { _id: doc._id } as never, replacement: doc, upsert: true } });
  }
  for (const id of existing.keys()) ops.push({ deleteOne: { filter: { _id: id } as never } });

  for (let offset = 0; offset < ops.length; offset += 1000) {
    await collection.bulkWrite(ops.slice(offset, offset + 1000), { ordered: false });
  }
  return ops.length;
}
