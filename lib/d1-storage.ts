// Bounded private file storage for small workspaces on Workers/D1 Free.
// The migration enforces the quota inside SQLite, including concurrent writes.
export const FILE_STORAGE_LIMIT = 200_000_000;
export const MAX_FILE_BYTES = 3_000_000;
const CHUNK_BYTES = 500_000;
function storageError(message: string, status = 507) {
  return Object.assign(new Error(message), { status });
}
export function d1Storage(database: D1Database) {
  return {
    async put(key: string, value: Uint8Array, _options?: unknown) {
      if (!value.byteLength || value.byteLength > MAX_FILE_BYTES) {
        throw storageError('Files must be between 1 byte and 3 MB.', 413);
      }
      const statements = [database.prepare('INSERT INTO stored_objects (object_key, size) VALUES (?, ?)').bind(key, value.byteLength)];
      for (let offset = 0; offset < value.byteLength; offset += CHUNK_BYTES) {
        statements.push(database.prepare('INSERT INTO stored_chunks (object_key, part, data) VALUES (?, ?, ?)')
          .bind(key, offset / CHUNK_BYTES, value.slice(offset, offset + CHUNK_BYTES).buffer));
      }
      try {
        await database.batch(statements);
      } catch (error) {
        const message = String(error) + String((error as Error)?.cause ?? '');
        if (/file_storage_full/.test(message)) {
          throw storageError('The 200 MB file storage limit is full. New uploads are paused; existing documents are preserved. Contact the administrator.');
        }
        throw error;
      }
    },
    async get(key: string) {
      const object = await database.prepare('SELECT size FROM stored_objects WHERE object_key = ?').bind(key).first<{size: number}>();
      if (!object) return null;
      const chunks = await database.prepare('SELECT data FROM stored_chunks WHERE object_key = ? ORDER BY part').bind(key).all<{data: number[] | ArrayBuffer}>();
      const bytes = new Uint8Array(object.size);
      let offset = 0;
      for (const chunk of chunks.results) {
        const part = new Uint8Array(chunk.data);
        bytes.set(part, offset);
        offset += part.byteLength;
      }
      if (offset !== object.size) throw storageError('This document could not be read completely. Contact the administrator.', 500);
      return { body: bytes, arrayBuffer: async () => bytes.buffer };
    },
    async delete(key: string) {
      await database.prepare('DELETE FROM stored_objects WHERE object_key = ?').bind(key).run();
    },
  };
}
