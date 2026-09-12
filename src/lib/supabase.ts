import { createClient } from '@supabase/supabase-js';

// Hardcode your Supabase credentials here for AI Studio preview:
const supabaseUrl = 'https://hxwlemspibcvusinngas.supabase.co';
const supabaseAnonKey = 'sb_publishable_BwtnXuH0I7fgBE5Jq5xicQ_mxOX-cQM';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export interface DocRef {
  table: string;
  id: string;
}

export interface QueryRef {
  table: string;
  filters: Array<{ field: string; op: string; value: any }>;
}

export function doc(dbOrTable: any, tableOrId?: string, id?: string): DocRef {
  if (typeof dbOrTable === 'string' && tableOrId) {
    return { table: dbOrTable, id: tableOrId };
  }
  if (typeof tableOrId === 'string' && id) {
    return { table: tableOrId, id };
  }
  return { table: typeof dbOrTable === 'string' ? dbOrTable : '', id: tableOrId || '' };
}

export function collection(dbOrTable: any, path?: string): QueryRef {
  const table = typeof dbOrTable === 'string' ? dbOrTable : (path || '');
  return { table, filters: [] };
}

export function where(field: string, op: string, value: any) {
  return { field, op, value };
}

export function query(collectionRef: QueryRef, ...whereClauses: any[]): QueryRef {
  const table = collectionRef?.table || '';
  const filters = [...(collectionRef?.filters || [])];
  for (const clause of whereClauses) {
    if (clause && clause.field) {
      filters.push(clause);
    }
  }
  return { table, filters };
}

export async function getDoc(docRef: DocRef) {
  try {
    if (!docRef || !docRef.table || !docRef.id) {
      return { exists: () => false, data: () => null, id: docRef?.id || '' };
    }
    const { data, error } = await supabase
      .from(docRef.table)
      .select('*')
      .eq('id', docRef.id)
      .maybeSingle();

    return {
      exists: () => !!data && !error,
      data: () => data,
      id: docRef.id,
    };
  } catch (e) {
    return { exists: () => false, data: () => null, id: docRef?.id || '' };
  }
}

export async function getDocs(queryRef: QueryRef) {
  try {
    if (!queryRef || !queryRef.table) {
      return { empty: true, docs: [], forEach: () => {} };
    }
    let q = supabase.from(queryRef.table).select('*');
    if (queryRef.filters && Array.isArray(queryRef.filters)) {
      for (const f of queryRef.filters) {
        if (f.op === '==' || f.op === '=') {
          q = q.eq(f.field, f.value);
        }
      }
    }
    const { data } = await q;
    const docs = (data || []).map((item: any) => ({
      id: item.id || item.uid,
      data: () => item,
      exists: () => true,
    }));
    return {
      empty: docs.length === 0,
      docs,
      forEach: (cb: (doc: any) => void) => docs.forEach(cb),
    };
  } catch (e) {
    return { empty: true, docs: [], forEach: () => {} };
  }
}

export async function setDoc(docRef: DocRef, data: any, _options?: { merge?: boolean }) {
  try {
    if (!docRef || !docRef.table) return;
    const payload = { ...data, id: docRef.id };
    await supabase.from(docRef.table).upsert(payload);
  } catch (e) {
    console.warn(`Supabase setDoc notice (${docRef?.table}):`, e);
  }
}

export async function updateDoc(docRef: DocRef, data: any) {
  try {
    if (!docRef || !docRef.table) return;
    const cleanData = { ...data };
    for (const key of Object.keys(cleanData)) {
      if (cleanData[key] && cleanData[key].__arrayRemove) {
        delete cleanData[key];
      }
    }
    await supabase.from(docRef.table).update(cleanData).eq('id', docRef.id);
  } catch (e) {
    console.warn(`Supabase updateDoc notice (${docRef?.table}):`, e);
  }
}

export async function deleteDoc(docRef: DocRef) {
  try {
    if (!docRef || !docRef.table) return;
    await supabase.from(docRef.table).delete().eq('id', docRef.id);
  } catch (e) {
    console.warn(`Supabase deleteDoc notice (${docRef?.table}):`, e);
  }
}

export function arrayRemove(...items: any[]) {
  return { __arrayRemove: true, items };
}

export function writeBatch(_db?: any) {
  const operations: Array<() => Promise<void>> = [];
  return {
    delete(docRef: DocRef) {
      operations.push(() => deleteDoc(docRef));
    },
    set(docRef: DocRef, data: any, options?: any) {
      operations.push(() => setDoc(docRef, data, options));
    },
    update(docRef: DocRef, data: any) {
      operations.push(() => updateDoc(docRef, data));
    },
    async commit() {
      for (const op of operations) {
        await op();
      }
    }
  };
}

export function onSnapshot(ref: DocRef | QueryRef, onNext: (snapshot: any) => void, onError?: (error: any) => void) {
  if (!ref) return () => {};
  const isDoc = 'id' in ref && typeof (ref as any).id === 'string' && (ref as any).id.length > 0;
  const table = ref.table;

  if (!table) return () => {};

  if (isDoc) {
    getDoc(ref as DocRef).then(snap => onNext(snap)).catch(err => onError?.(err));
  } else {
    getDocs(ref as QueryRef).then(snap => onNext(snap)).catch(err => onError?.(err));
  }

  const channelId = `realtime:${table}:${Math.random().toString(36).substring(2, 9)}`;
  const channel = supabase
    .channel(channelId)
    .on('postgres_changes', { event: '*', schema: 'public', table }, () => {
      if (isDoc) {
        getDoc(ref as DocRef).then(snap => onNext(snap)).catch(err => onError?.(err));
      } else {
        getDocs(ref as QueryRef).then(snap => onNext(snap)).catch(err => onError?.(err));
      }
    })
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
