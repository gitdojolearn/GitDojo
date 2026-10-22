import { type CompletionEvidence, type CompletionKind } from "@gitdojo/shared-types";

const DATABASE = "gitdojo-completion-evidence";
const STORE = "pending";

export interface PendingCompletionEvidence {
  key: string;
  accountId: string;
  kind: CompletionKind;
  contentId: string;
  evidence: CompletionEvidence;
  savedAt: number;
}

function open(factory: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open(DATABASE, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE))
        request.result.createObjectStore(STORE, { keyPath: "key" });
    };
    request.onsuccess = () => {
      request.result.onversionchange = () => {
        request.result.close();
      };
      resolve(request.result);
    };
    request.onerror = () => {
      reject(request.error ?? new Error("Could not open evidence storage"));
    };
  });
}

function transaction<T>(
  factory: IDBFactory,
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore, resolve: (value: T) => void, reject: (error: Error) => void) => void,
): Promise<T> {
  return open(factory).then(
    (database) =>
      new Promise<T>((resolve, reject) => {
        let result: T;
        let failure: Error | undefined;
        const tx = database.transaction(STORE, mode);
        tx.oncomplete = () => {
          database.close();
          resolve(result);
        };
        tx.onabort = () => {
          database.close();
          reject(failure ?? tx.error ?? new Error("Evidence storage transaction failed"));
        };
        tx.onerror = () => {
          failure ??= tx.error ?? new Error("Evidence storage transaction failed");
        };
        run(
          tx.objectStore(STORE),
          (value) => {
            result = value;
          },
          (error) => {
            failure = error;
            tx.abort();
          },
        );
      }),
    (error: unknown) => {
      throw error instanceof Error ? error : new Error(String(error));
    },
  );
}

function browserFactory(): IDBFactory {
  if (typeof indexedDB === "undefined") throw new Error("IndexedDB is unavailable");
  return indexedDB;
}

function keyOf(accountId: string, kind: CompletionKind, contentId: string): string {
  return `${accountId}:${kind}:${contentId}`;
}

/** Stores validated repository evidence until the account confirms it. */
export function savePendingCompletionEvidence(
  entry: Omit<PendingCompletionEvidence, "key" | "savedAt">,
  factory: IDBFactory = browserFactory(),
): Promise<void> {
  const pending: PendingCompletionEvidence = {
    ...entry,
    key: keyOf(entry.accountId, entry.kind, entry.contentId),
    savedAt: Date.now(),
  };
  return transaction(factory, "readwrite", (store, resolve, reject) => {
    const request = store.put(pending);
    request.onsuccess = () => {
      resolve(undefined);
    };
    request.onerror = () => {
      reject(request.error ?? new Error("Could not save completion evidence"));
    };
  });
}

export function readPendingCompletionEvidence(
  accountId: string,
  factory: IDBFactory = browserFactory(),
): Promise<PendingCompletionEvidence[]> {
  return transaction(factory, "readonly", (store, resolve, reject) => {
    const request = store.getAll();
    request.onsuccess = () => {
      resolve(
        (request.result as PendingCompletionEvidence[])
          .filter((entry) => entry.accountId === accountId)
          .sort((a, b) => a.savedAt - b.savedAt),
      );
    };
    request.onerror = () => {
      reject(request.error ?? new Error("Could not read completion evidence"));
    };
  });
}

export function deletePendingCompletionEvidence(
  accountId: string,
  kind: CompletionKind,
  contentId: string,
  factory: IDBFactory = browserFactory(),
): Promise<void> {
  return transaction(factory, "readwrite", (store, resolve, reject) => {
    const request = store.delete(keyOf(accountId, kind, contentId));
    request.onsuccess = () => {
      resolve(undefined);
    };
    request.onerror = () => {
      reject(request.error ?? new Error("Could not clear completion evidence"));
    };
  });
}

/** Removes sensitive local repository evidence after the learner deletes their account. */
export async function clearPendingCompletionEvidence(
  accountId: string,
  factory: IDBFactory = browserFactory(),
): Promise<void> {
  const entries = await readPendingCompletionEvidence(accountId, factory);
  await Promise.all(
    entries.map((entry) =>
      deletePendingCompletionEvidence(accountId, entry.kind, entry.contentId, factory),
    ),
  );
}
