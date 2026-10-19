import type { FileId } from "../ids";

// The port of the file storage, such as the scans of Passports. The backend gives an adapter of its
// own storage; the core only keeps the ids of the files. A file is never erased (ADR 0005): a record
// that gets a new file keeps the old one in the storage.

/** What the storage knows of a file. */
export interface StoredFile {
  /** The size in bytes. */
  size: number;
  /** The MIME type that the browser sent with the upload, or null. */
  contentType: string | null;
}

/** Reads the file storage. */
export interface FileReader {
  /** The URL from which a browser gets the file, or null if the storage has no such file. */
  url(id: FileId): Promise<string | null>;
}

/** The file storage, for a command. */
export interface FileStorage extends FileReader {
  /**
   * A URL to which the client uploads one file, for a short time. The answer to the upload gives
   * the id of the file, which the client then sends with a command.
   */
  uploadUrl(): Promise<string>;
  /** The size and the type of the file, or null if the storage has no such file. */
  get(id: FileId): Promise<StoredFile | null>;
}
