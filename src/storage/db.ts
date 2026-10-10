import type { Project, Sample } from '../types';

const open = () => new Promise<IDBDatabase>((resolve, reject) => {
  const request = indexedDB.open('dirtdj', 1);
  request.onupgradeneeded = () => { request.result.createObjectStore('samples', { keyPath: 'id' }); request.result.createObjectStore('project'); };
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});
async function request<T>(store: string, mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(store, mode);
    const result = operation(transaction.objectStore(store));
    transaction.oncomplete = () => { db.close(); resolve(result.result); };
    transaction.onerror = () => { db.close(); reject(transaction.error); };
    transaction.onabort = () => { db.close(); reject(transaction.error ?? new Error('Storage transaction aborted.')); };
  });
}
export const loadSamples = () => request<Sample[]>('samples', 'readonly', store => store.getAll());
export const saveSample = (sample: Sample) => request('samples', 'readwrite', store => store.put(sample));
export const deleteSample = (id: string) => request('samples', 'readwrite', store => store.delete(id));
export const loadProject = () => request<Project | undefined>('project', 'readonly', store => store.get('current'));
export const saveProject = (project: Project) => request('project', 'readwrite', store => store.put(project, 'current'));
