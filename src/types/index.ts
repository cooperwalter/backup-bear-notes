export interface NoteRow {
  id: number;
  title: string;
  text: string | null;
  tag: string | null;
  trashed: number;
  modificationDate: number | null;
}

export interface FileRow {
  noteId: number;
  uuid: string | null;
  filename: string | null;
  extension: string | null;
}

export interface ProcessedNote extends NoteRow {
  filename: string;
  destinationDirectory: string;
}

export interface SqliteDatabase {
  all: <T = unknown>(sql: string) => Promise<T[]>;
}

export interface SqliteModule {
  open: (filename: string) => Promise<SqliteDatabase>;
}

export type MakeDirFunction = (path: string) => Promise<string | undefined>;

export interface FileSystemApi {
  writeFile: (path: string, data: string | null | undefined, options: { encoding: BufferEncoding }) => Promise<void>;
  unlink: (path: string) => Promise<void>;
  copyFile: (src: string, dest: string) => Promise<void>;
  utimes: (path: string, atime: Date, mtime: Date) => Promise<void>;
}

export interface BackupOptions {
  useTagsAsDirectories?: boolean;
  sqlite: SqliteModule;
  makeDir: MakeDirFunction;
  fs: FileSystemApi;
  dbPath: string;
  localFilesPath?: string;
}
