import { describe, it, expect, vi, beforeEach } from 'vitest';
import path from 'node:path';
import { backup } from '../src/lib/backup.js';
import type { NoteRow, FileRow, SqliteModule, MakeDirFunction, FileSystemApi, BackupOptions } from '../src/types/index.js';

interface MockDb {
  all: ReturnType<typeof vi.fn>;
}

interface MockSqlite {
  open: ReturnType<typeof vi.fn>;
}

interface MockFs {
  writeFile: ReturnType<typeof vi.fn>;
  unlink: ReturnType<typeof vi.fn>;
  copyFile?: ReturnType<typeof vi.fn>;
  utimes?: ReturnType<typeof vi.fn>;
}

interface NodeError extends Error {
  code?: string;
}

function makeMockSqlite(rows: Partial<NoteRow>[] = [], fileRows: Partial<FileRow>[] | null = null): MockSqlite {
  const mockDb: MockDb = {
    all: fileRows !== null
      ? vi.fn()
        .mockResolvedValueOnce(rows)
        .mockResolvedValueOnce(fileRows)
      : vi.fn().mockResolvedValue(rows),
  };
  return {
    open: vi.fn().mockResolvedValue(mockDb),
  };
}

function makeMockMakeDir(): ReturnType<typeof vi.fn> {
  return vi.fn().mockResolvedValue(undefined);
}

function makeMockFs(): MockFs {
  return {
    writeFile: vi.fn().mockResolvedValue(undefined),
    unlink: vi.fn().mockResolvedValue(undefined),
    copyFile: vi.fn().mockResolvedValue(undefined),
    utimes: vi.fn().mockResolvedValue(undefined),
  };
}

describe('backup function', () => {
  let mockSqlite: MockSqlite;
  let mockMakeDir: ReturnType<typeof vi.fn>;
  let mockFs: MockFs;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('directory creation', () => {
    it('should create the output directory', async () => {
      mockSqlite = makeMockSqlite([]);
      mockMakeDir = makeMockMakeDir();
      mockFs = makeMockFs();

      await backup('/output/path', {
        sqlite: mockSqlite as unknown as SqliteModule,
        makeDir: mockMakeDir as unknown as MakeDirFunction,
        fs: mockFs as unknown as FileSystemApi,
        dbPath: '/test/db.sqlite',
      });

      expect(mockMakeDir).toHaveBeenCalledWith('/output/path');
    });

    it('should create tag directories when useTagsAsDirectories is true', async () => {
      mockSqlite = makeMockSqlite([
        { id: 1, title: 'Note 1', text: 'Content 1', tag: 'work', trashed: 0 },
        { id: 2, title: 'Note 2', text: 'Content 2', tag: 'personal', trashed: 0 },
      ]);
      mockMakeDir = makeMockMakeDir();
      mockFs = makeMockFs();

      await backup('/output/path', {
        useTagsAsDirectories: true,
        sqlite: mockSqlite as unknown as SqliteModule,
        makeDir: mockMakeDir as unknown as MakeDirFunction,
        fs: mockFs as unknown as FileSystemApi,
        dbPath: '/test/db.sqlite',
      });

      expect(mockMakeDir).toHaveBeenCalledWith('/output/path');
      expect(mockMakeDir).toHaveBeenCalledWith(path.join('/output/path', 'work'));
      expect(mockMakeDir).toHaveBeenCalledWith(path.join('/output/path', 'personal'));
    });

    it('should create untagged directory for notes without tags when useTagsAsDirectories is true', async () => {
      mockSqlite = makeMockSqlite([
        { id: 1, title: 'Note 1', text: 'Content 1', tag: null, trashed: 0 },
      ]);
      mockMakeDir = makeMockMakeDir();
      mockFs = makeMockFs();

      await backup('/output/path', {
        useTagsAsDirectories: true,
        sqlite: mockSqlite as unknown as SqliteModule,
        makeDir: mockMakeDir as unknown as MakeDirFunction,
        fs: mockFs as unknown as FileSystemApi,
        dbPath: '/test/db.sqlite',
      });

      expect(mockMakeDir).toHaveBeenCalledWith(path.join('/output/path', 'untagged'));
    });
  });

  describe('database operations', () => {
    it('should open the database with the provided path', async () => {
      mockSqlite = makeMockSqlite([]);
      mockMakeDir = makeMockMakeDir();
      mockFs = makeMockFs();

      await backup('/output/path', {
        sqlite: mockSqlite as unknown as SqliteModule,
        makeDir: mockMakeDir as unknown as MakeDirFunction,
        fs: mockFs as unknown as FileSystemApi,
        dbPath: '/custom/db.sqlite',
      });

      expect(mockSqlite.open).toHaveBeenCalledWith('/custom/db.sqlite');
    });

    it('should query notes with correct SQL containing ZSFNOTE table', async () => {
      const mockDb = { all: vi.fn().mockResolvedValue([]) };
      mockSqlite = { open: vi.fn().mockResolvedValue(mockDb) };
      mockMakeDir = makeMockMakeDir();
      mockFs = makeMockFs();

      await backup('/output/path', {
        sqlite: mockSqlite as unknown as SqliteModule,
        makeDir: mockMakeDir as unknown as MakeDirFunction,
        fs: mockFs as unknown as FileSystemApi,
        dbPath: '/test/db.sqlite',
      });

      expect(mockDb.all).toHaveBeenCalledWith(expect.stringContaining('SELECT'));
      expect(mockDb.all).toHaveBeenCalledWith(expect.stringContaining('ZSFNOTE'));
    });

    it('should query notes with correct SQL containing ZSFNOTETAG table', async () => {
      const mockDb = { all: vi.fn().mockResolvedValue([]) };
      mockSqlite = { open: vi.fn().mockResolvedValue(mockDb) };
      mockMakeDir = makeMockMakeDir();
      mockFs = makeMockFs();

      await backup('/output/path', {
        sqlite: mockSqlite as unknown as SqliteModule,
        makeDir: mockMakeDir as unknown as MakeDirFunction,
        fs: mockFs as unknown as FileSystemApi,
        dbPath: '/test/db.sqlite',
      });

      expect(mockDb.all).toHaveBeenCalledWith(expect.stringContaining('ZSFNOTETAG'));
    });

    it('should handle empty database with no notes', async () => {
      mockSqlite = makeMockSqlite([]);
      mockMakeDir = makeMockMakeDir();
      mockFs = makeMockFs();

      const results = await backup('/output/path', {
        sqlite: mockSqlite as unknown as SqliteModule,
        makeDir: mockMakeDir as unknown as MakeDirFunction,
        fs: mockFs as unknown as FileSystemApi,
        dbPath: '/test/db.sqlite',
      });

      expect(results).toEqual([]);
      expect(mockFs.writeFile).not.toHaveBeenCalled();
      expect(mockFs.unlink).not.toHaveBeenCalled();
    });
  });

  describe('file writing for non-trashed notes', () => {
    it('should write note content to file with correct path', async () => {
      mockSqlite = makeMockSqlite([
        { id: 1, title: 'Test Note', text: 'Note content', tag: null, trashed: 0 },
      ]);
      mockMakeDir = makeMockMakeDir();
      mockFs = makeMockFs();

      await backup('/output/path', {
        sqlite: mockSqlite as unknown as SqliteModule,
        makeDir: mockMakeDir as unknown as MakeDirFunction,
        fs: mockFs as unknown as FileSystemApi,
        dbPath: '/test/db.sqlite',
      });

      expect(mockFs.writeFile).toHaveBeenCalledWith(
        path.join('/output/path', 'Test Note.md'),
        'Note content',
        { encoding: 'utf8' }
      );
    });

    it('should write multiple notes', async () => {
      mockSqlite = makeMockSqlite([
        { id: 1, title: 'Note 1', text: 'Content 1', tag: null, trashed: 0 },
        { id: 2, title: 'Note 2', text: 'Content 2', tag: null, trashed: 0 },
      ]);
      mockMakeDir = makeMockMakeDir();
      mockFs = makeMockFs();

      await backup('/output/path', {
        sqlite: mockSqlite as unknown as SqliteModule,
        makeDir: mockMakeDir as unknown as MakeDirFunction,
        fs: mockFs as unknown as FileSystemApi,
        dbPath: '/test/db.sqlite',
      });

      expect(mockFs.writeFile).toHaveBeenCalledTimes(2);
    });

    it('should write to tag directory when useTagsAsDirectories is true', async () => {
      mockSqlite = makeMockSqlite([
        { id: 1, title: 'Work Note', text: 'Work content', tag: 'work', trashed: 0 },
      ]);
      mockMakeDir = makeMockMakeDir();
      mockFs = makeMockFs();

      await backup('/output/path', {
        useTagsAsDirectories: true,
        sqlite: mockSqlite as unknown as SqliteModule,
        makeDir: mockMakeDir as unknown as MakeDirFunction,
        fs: mockFs as unknown as FileSystemApi,
        dbPath: '/test/db.sqlite',
      });

      expect(mockFs.writeFile).toHaveBeenCalledWith(
        path.join('/output/path', 'work', 'Work Note.md'),
        'Work content',
        { encoding: 'utf8' }
      );
    });

    it('should write to untagged directory for null tag when useTagsAsDirectories is true', async () => {
      mockSqlite = makeMockSqlite([
        { id: 1, title: 'Untagged Note', text: 'Untagged content', tag: null, trashed: 0 },
      ]);
      mockMakeDir = makeMockMakeDir();
      mockFs = makeMockFs();

      await backup('/output/path', {
        useTagsAsDirectories: true,
        sqlite: mockSqlite as unknown as SqliteModule,
        makeDir: mockMakeDir as unknown as MakeDirFunction,
        fs: mockFs as unknown as FileSystemApi,
        dbPath: '/test/db.sqlite',
      });

      expect(mockFs.writeFile).toHaveBeenCalledWith(
        path.join('/output/path', 'untagged', 'Untagged Note.md'),
        'Untagged content',
        { encoding: 'utf8' }
      );
    });
  });

  describe('file deletion for trashed notes', () => {
    it('should delete file for trashed note', async () => {
      mockSqlite = makeMockSqlite([
        { id: 1, title: 'Trashed Note', text: 'Trashed content', tag: null, trashed: 1 },
      ]);
      mockMakeDir = makeMockMakeDir();
      mockFs = makeMockFs();

      await backup('/output/path', {
        sqlite: mockSqlite as unknown as SqliteModule,
        makeDir: mockMakeDir as unknown as MakeDirFunction,
        fs: mockFs as unknown as FileSystemApi,
        dbPath: '/test/db.sqlite',
      });

      expect(mockFs.unlink).toHaveBeenCalledWith(
        path.join('/output/path', 'Trashed Note.md')
      );
      expect(mockFs.writeFile).not.toHaveBeenCalled();
    });

    it('should delete from tag directory when useTagsAsDirectories is true', async () => {
      mockSqlite = makeMockSqlite([
        { id: 1, title: 'Trashed Work Note', text: 'Content', tag: 'work', trashed: 1 },
      ]);
      mockMakeDir = makeMockMakeDir();
      mockFs = makeMockFs();

      await backup('/output/path', {
        useTagsAsDirectories: true,
        sqlite: mockSqlite as unknown as SqliteModule,
        makeDir: mockMakeDir as unknown as MakeDirFunction,
        fs: mockFs as unknown as FileSystemApi,
        dbPath: '/test/db.sqlite',
      });

      expect(mockFs.unlink).toHaveBeenCalledWith(
        path.join('/output/path', 'work', 'Trashed Work Note.md')
      );
    });
  });

  describe('mixed operations', () => {
    it('should handle mix of trashed and non-trashed notes', async () => {
      mockSqlite = makeMockSqlite([
        { id: 1, title: 'Active Note', text: 'Active content', tag: null, trashed: 0 },
        { id: 2, title: 'Trashed Note', text: 'Trashed content', tag: null, trashed: 1 },
      ]);
      mockMakeDir = makeMockMakeDir();
      mockFs = makeMockFs();

      await backup('/output/path', {
        sqlite: mockSqlite as unknown as SqliteModule,
        makeDir: mockMakeDir as unknown as MakeDirFunction,
        fs: mockFs as unknown as FileSystemApi,
        dbPath: '/test/db.sqlite',
      });

      expect(mockFs.writeFile).toHaveBeenCalledTimes(1);
      expect(mockFs.unlink).toHaveBeenCalledTimes(1);
    });

    it('should return array with results for all operations', async () => {
      mockSqlite = makeMockSqlite([
        { id: 1, title: 'Note 1', text: 'Content 1', tag: null, trashed: 0 },
        { id: 2, title: 'Note 2', text: 'Content 2', tag: null, trashed: 0 },
        { id: 3, title: 'Note 3', text: 'Content 3', tag: null, trashed: 1 },
      ]);
      mockMakeDir = makeMockMakeDir();
      mockFs = makeMockFs();

      const results = await backup('/output/path', {
        sqlite: mockSqlite as unknown as SqliteModule,
        makeDir: mockMakeDir as unknown as MakeDirFunction,
        fs: mockFs as unknown as FileSystemApi,
        dbPath: '/test/db.sqlite',
      });

      expect(results).toHaveLength(3);
    });
  });

  describe('title sanitization', () => {
    it('should sanitize titles with slashes', async () => {
      mockSqlite = makeMockSqlite([
        { id: 1, title: 'Note/With/Slashes', text: 'Content', tag: null, trashed: 0 },
      ]);
      mockMakeDir = makeMockMakeDir();
      mockFs = makeMockFs();

      await backup('/output/path', {
        sqlite: mockSqlite as unknown as SqliteModule,
        makeDir: mockMakeDir as unknown as MakeDirFunction,
        fs: mockFs as unknown as FileSystemApi,
        dbPath: '/test/db.sqlite',
      });

      expect(mockFs.writeFile).toHaveBeenCalledWith(
        path.join('/output/path', 'Note-With-Slashes.md'),
        'Content',
        { encoding: 'utf8' }
      );
    });
  });

  describe('tag deduplication', () => {
    it('should deduplicate tags when creating directories', async () => {
      mockSqlite = makeMockSqlite([
        { id: 1, title: 'Note 1', text: 'Content 1', tag: 'work', trashed: 0 },
        { id: 2, title: 'Note 2', text: 'Content 2', tag: 'work', trashed: 0 },
        { id: 3, title: 'Note 3', text: 'Content 3', tag: 'work', trashed: 0 },
      ]);
      mockMakeDir = makeMockMakeDir();
      mockFs = makeMockFs();

      await backup('/output/path', {
        useTagsAsDirectories: true,
        sqlite: mockSqlite as unknown as SqliteModule,
        makeDir: mockMakeDir as unknown as MakeDirFunction,
        fs: mockFs as unknown as FileSystemApi,
        dbPath: '/test/db.sqlite',
      });

      const workDirCalls = mockMakeDir.mock.calls.filter(
        (call: string[]) => call[0] === path.join('/output/path', 'work')
      );
      expect(workDirCalls).toHaveLength(1);
    });
  });

  describe('error handling', () => {
    it('should throw error when sqlite dependency is missing', async () => {
      await expect(backup('/output/path', {
        makeDir: makeMockMakeDir() as unknown as MakeDirFunction,
        fs: makeMockFs() as unknown as FileSystemApi,
        dbPath: '/test/db.sqlite',
      } as BackupOptions)).rejects.toThrow('Missing required dependencies');
    });

    it('should throw error when makeDir dependency is missing', async () => {
      await expect(backup('/output/path', {
        sqlite: makeMockSqlite([]) as unknown as SqliteModule,
        fs: makeMockFs() as unknown as FileSystemApi,
        dbPath: '/test/db.sqlite',
      } as BackupOptions)).rejects.toThrow('Missing required dependencies');
    });

    it('should throw error when fs dependency is missing', async () => {
      await expect(backup('/output/path', {
        sqlite: makeMockSqlite([]) as unknown as SqliteModule,
        makeDir: makeMockMakeDir() as unknown as MakeDirFunction,
        dbPath: '/test/db.sqlite',
      } as BackupOptions)).rejects.toThrow('Missing required dependencies');
    });

    it('should throw error when dbPath is missing', async () => {
      await expect(backup('/output/path', {
        sqlite: makeMockSqlite([]) as unknown as SqliteModule,
        makeDir: makeMockMakeDir() as unknown as MakeDirFunction,
        fs: makeMockFs() as unknown as FileSystemApi,
      } as BackupOptions)).rejects.toThrow('Missing required dependencies');
    });
  });

  describe('error propagation from dependencies', () => {
    it('should propagate error when makeDir fails to create output directory', async () => {
      const mockMakeDirError = vi.fn().mockRejectedValue(new Error('Permission denied'));
      mockSqlite = makeMockSqlite([]);
      mockFs = makeMockFs();

      await expect(backup('/output/path', {
        sqlite: mockSqlite as unknown as SqliteModule,
        makeDir: mockMakeDirError as unknown as MakeDirFunction,
        fs: mockFs as unknown as FileSystemApi,
        dbPath: '/test/db.sqlite',
      })).rejects.toThrow('Permission denied');
    });

    it('should propagate error when sqlite.open fails to open database', async () => {
      const mockSqliteError = {
        open: vi.fn().mockRejectedValue(new Error('Database not found')),
      };
      mockMakeDir = makeMockMakeDir();
      mockFs = makeMockFs();

      await expect(backup('/output/path', {
        sqlite: mockSqliteError as unknown as SqliteModule,
        makeDir: mockMakeDir as unknown as MakeDirFunction,
        fs: mockFs as unknown as FileSystemApi,
        dbPath: '/test/db.sqlite',
      })).rejects.toThrow('Database not found');
    });

    it('should propagate error when db.all fails to query notes', async () => {
      const mockDb = { all: vi.fn().mockRejectedValue(new Error('Query failed')) };
      const mockSqliteQueryError = { open: vi.fn().mockResolvedValue(mockDb) };
      mockMakeDir = makeMockMakeDir();
      mockFs = makeMockFs();

      await expect(backup('/output/path', {
        sqlite: mockSqliteQueryError as unknown as SqliteModule,
        makeDir: mockMakeDir as unknown as MakeDirFunction,
        fs: mockFs as unknown as FileSystemApi,
        dbPath: '/test/db.sqlite',
      })).rejects.toThrow('Query failed');
    });

    it('should propagate error when fs.writeFile fails to write note', async () => {
      mockSqlite = makeMockSqlite([
        { id: 1, title: 'Test Note', text: 'Content', tag: null, trashed: 0 },
      ]);
      mockMakeDir = makeMockMakeDir();
      mockFs = {
        writeFile: vi.fn().mockRejectedValue(new Error('Disk full')),
        unlink: vi.fn().mockResolvedValue(undefined),
      };

      await expect(backup('/output/path', {
        sqlite: mockSqlite as unknown as SqliteModule,
        makeDir: mockMakeDir as unknown as MakeDirFunction,
        fs: mockFs as unknown as FileSystemApi,
        dbPath: '/test/db.sqlite',
      })).rejects.toThrow('Disk full');
    });

    it('should ignore ENOENT error when file does not exist for trashed note', async () => {
      mockSqlite = makeMockSqlite([
        { id: 1, title: 'Trashed Note', text: 'Content', tag: null, trashed: 1 },
      ]);
      mockMakeDir = makeMockMakeDir();
      const enoentError: NodeError = new Error('ENOENT: no such file or directory');
      enoentError.code = 'ENOENT';
      mockFs = {
        writeFile: vi.fn().mockResolvedValue(undefined),
        unlink: vi.fn().mockRejectedValue(enoentError),
      };

      await expect(backup('/output/path', {
        sqlite: mockSqlite as unknown as SqliteModule,
        makeDir: mockMakeDir as unknown as MakeDirFunction,
        fs: mockFs as unknown as FileSystemApi,
        dbPath: '/test/db.sqlite',
      })).resolves.not.toThrow();
    });

    it('should propagate non-ENOENT errors when fs.unlink fails to delete trashed note', async () => {
      mockSqlite = makeMockSqlite([
        { id: 1, title: 'Trashed Note', text: 'Content', tag: null, trashed: 1 },
      ]);
      mockMakeDir = makeMockMakeDir();
      const permissionError: NodeError = new Error('EACCES: permission denied');
      permissionError.code = 'EACCES';
      mockFs = {
        writeFile: vi.fn().mockResolvedValue(undefined),
        unlink: vi.fn().mockRejectedValue(permissionError),
      };

      await expect(backup('/output/path', {
        sqlite: mockSqlite as unknown as SqliteModule,
        makeDir: mockMakeDir as unknown as MakeDirFunction,
        fs: mockFs as unknown as FileSystemApi,
        dbPath: '/test/db.sqlite',
      })).rejects.toThrow('EACCES');
    });

    it('should propagate error when makeDir fails to create tag directory', async () => {
      mockSqlite = makeMockSqlite([
        { id: 1, title: 'Note', text: 'Content', tag: 'work', trashed: 0 },
      ]);
      let callCount = 0;
      const mockMakeDirFailOnSecond = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve(undefined);
        }
        return Promise.reject(new Error('Cannot create tag directory'));
      });
      mockFs = makeMockFs();

      await expect(backup('/output/path', {
        useTagsAsDirectories: true,
        sqlite: mockSqlite as unknown as SqliteModule,
        makeDir: mockMakeDirFailOnSecond as unknown as MakeDirFunction,
        fs: mockFs as unknown as FileSystemApi,
        dbPath: '/test/db.sqlite',
      })).rejects.toThrow('Cannot create tag directory');
    });
  });

  describe('edge cases with note content', () => {
    it('should handle note with empty string text content', async () => {
      mockSqlite = makeMockSqlite([
        { id: 1, title: 'Empty Note', text: '', tag: null, trashed: 0 },
      ]);
      mockMakeDir = makeMockMakeDir();
      mockFs = makeMockFs();

      await backup('/output/path', {
        sqlite: mockSqlite as unknown as SqliteModule,
        makeDir: mockMakeDir as unknown as MakeDirFunction,
        fs: mockFs as unknown as FileSystemApi,
        dbPath: '/test/db.sqlite',
      });

      expect(mockFs.writeFile).toHaveBeenCalledWith(
        path.join('/output/path', 'Empty Note.md'),
        '',
        { encoding: 'utf8' }
      );
    });

    it('should handle note with null text content', async () => {
      mockSqlite = makeMockSqlite([
        { id: 1, title: 'Null Content Note', text: null, tag: null, trashed: 0 },
      ]);
      mockMakeDir = makeMockMakeDir();
      mockFs = makeMockFs();

      await backup('/output/path', {
        sqlite: mockSqlite as unknown as SqliteModule,
        makeDir: mockMakeDir as unknown as MakeDirFunction,
        fs: mockFs as unknown as FileSystemApi,
        dbPath: '/test/db.sqlite',
      });

      expect(mockFs.writeFile).toHaveBeenCalledWith(
        path.join('/output/path', 'Null Content Note.md'),
        null,
        { encoding: 'utf8' }
      );
    });

    it('should use untitled-{id}.md for note with empty string title', async () => {
      mockSqlite = makeMockSqlite([
        { id: 123, title: '', text: 'Content', tag: null, trashed: 0 },
      ]);
      mockMakeDir = makeMockMakeDir();
      mockFs = makeMockFs();

      await backup('/output/path', {
        sqlite: mockSqlite as unknown as SqliteModule,
        makeDir: mockMakeDir as unknown as MakeDirFunction,
        fs: mockFs as unknown as FileSystemApi,
        dbPath: '/test/db.sqlite',
      });

      expect(mockFs.writeFile).toHaveBeenCalledWith(
        path.join('/output/path', 'untitled-123.md'),
        'Content',
        { encoding: 'utf8' }
      );
    });

    it('should propagate error when note has null title causing buildFilename to throw', async () => {
      mockSqlite = makeMockSqlite([
        { id: 1, title: null as unknown as string, text: 'Content', tag: null, trashed: 0 },
      ]);
      mockMakeDir = makeMockMakeDir();
      mockFs = makeMockFs();

      await expect(backup('/output/path', {
        sqlite: mockSqlite as unknown as SqliteModule,
        makeDir: mockMakeDir as unknown as MakeDirFunction,
        fs: mockFs as unknown as FileSystemApi,
        dbPath: '/test/db.sqlite',
      })).rejects.toThrow(TypeError);
    });

    it('should handle same note appearing with multiple different tags', async () => {
      mockSqlite = makeMockSqlite([
        { id: 1, title: 'Multi-tag Note', text: 'Content', tag: 'work', trashed: 0 },
        { id: 1, title: 'Multi-tag Note', text: 'Content', tag: 'personal', trashed: 0 },
      ]);
      mockMakeDir = makeMockMakeDir();
      mockFs = makeMockFs();

      await backup('/output/path', {
        useTagsAsDirectories: true,
        sqlite: mockSqlite as unknown as SqliteModule,
        makeDir: mockMakeDir as unknown as MakeDirFunction,
        fs: mockFs as unknown as FileSystemApi,
        dbPath: '/test/db.sqlite',
      });

      expect(mockFs.writeFile).toHaveBeenCalledTimes(2);
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        path.join('/output/path', 'work', 'Multi-tag Note.md'),
        'Content',
        { encoding: 'utf8' }
      );
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        path.join('/output/path', 'personal', 'Multi-tag Note.md'),
        'Content',
        { encoding: 'utf8' }
      );
    });

    it('should handle note with very long title that requires truncation', async () => {
      const longTitle = 'a'.repeat(300);
      mockSqlite = makeMockSqlite([
        { id: 1, title: longTitle, text: 'Content', tag: null, trashed: 0 },
      ]);
      mockMakeDir = makeMockMakeDir();
      mockFs = makeMockFs();

      await backup('/output/path', {
        sqlite: mockSqlite as unknown as SqliteModule,
        makeDir: mockMakeDir as unknown as MakeDirFunction,
        fs: mockFs as unknown as FileSystemApi,
        dbPath: '/test/db.sqlite',
      });

      const writtenPath = mockFs.writeFile.mock.calls[0][0] as string;
      const filename = path.basename(writtenPath);
      expect(Buffer.byteLength(filename, 'utf8')).toBeLessThanOrEqual(255);
      expect(filename.endsWith('.md')).toBe(true);
    });

    it('should use untitled-{id}.md for whitespace-only title', async () => {
      mockSqlite = makeMockSqlite([
        { id: 456, title: '   ', text: 'Content', tag: null, trashed: 0 },
      ]);
      mockMakeDir = makeMockMakeDir();
      mockFs = makeMockFs();

      await backup('/output/path', {
        sqlite: mockSqlite as unknown as SqliteModule,
        makeDir: mockMakeDir as unknown as MakeDirFunction,
        fs: mockFs as unknown as FileSystemApi,
        dbPath: '/test/db.sqlite',
      });

      expect(mockFs.writeFile).toHaveBeenCalledWith(
        path.join('/output/path', 'untitled-456.md'),
        'Content',
        { encoding: 'utf8' }
      );
    });

    it('should delete untitled-{id}.md for trashed empty-title note', async () => {
      mockSqlite = makeMockSqlite([
        { id: 789, title: '', text: 'Content', tag: null, trashed: 1 },
      ]);
      mockMakeDir = makeMockMakeDir();
      mockFs = makeMockFs();

      await backup('/output/path', {
        sqlite: mockSqlite as unknown as SqliteModule,
        makeDir: mockMakeDir as unknown as MakeDirFunction,
        fs: mockFs as unknown as FileSystemApi,
        dbPath: '/test/db.sqlite',
      });

      expect(mockFs.unlink).toHaveBeenCalledWith(
        path.join('/output/path', 'untitled-789.md')
      );
    });

    it('should write untitled-{id}.md to tag directory when useTagsAsDirectories is true', async () => {
      mockSqlite = makeMockSqlite([
        { id: 111, title: '   ', text: 'Content', tag: 'work', trashed: 0 },
      ]);
      mockMakeDir = makeMockMakeDir();
      mockFs = makeMockFs();

      await backup('/output/path', {
        useTagsAsDirectories: true,
        sqlite: mockSqlite as unknown as SqliteModule,
        makeDir: mockMakeDir as unknown as MakeDirFunction,
        fs: mockFs as unknown as FileSystemApi,
        dbPath: '/test/db.sqlite',
      });

      expect(mockFs.writeFile).toHaveBeenCalledWith(
        path.join('/output/path', 'work', 'untitled-111.md'),
        'Content',
        { encoding: 'utf8' }
      );
    });
  });

  describe('filename deduplication to prevent overwrites', () => {
    it('should append -1 suffix to second note with same title', async () => {
      mockSqlite = makeMockSqlite([
        { id: 1, title: 'Duplicate', text: 'Content 1', tag: null, trashed: 0 },
        { id: 2, title: 'Duplicate', text: 'Content 2', tag: null, trashed: 0 },
      ]);
      mockMakeDir = makeMockMakeDir();
      mockFs = makeMockFs();

      await backup('/output/path', {
        sqlite: mockSqlite as unknown as SqliteModule,
        makeDir: mockMakeDir as unknown as MakeDirFunction,
        fs: mockFs as unknown as FileSystemApi,
        dbPath: '/test/db.sqlite',
      });

      expect(mockFs.writeFile).toHaveBeenCalledWith(
        path.join('/output/path', 'Duplicate.md'),
        'Content 1',
        { encoding: 'utf8' }
      );
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        path.join('/output/path', 'Duplicate-1.md'),
        'Content 2',
        { encoding: 'utf8' }
      );
    });

    it('should append incrementing suffixes for multiple notes with same title', async () => {
      mockSqlite = makeMockSqlite([
        { id: 1, title: 'Same', text: 'Content 1', tag: null, trashed: 0 },
        { id: 2, title: 'Same', text: 'Content 2', tag: null, trashed: 0 },
        { id: 3, title: 'Same', text: 'Content 3', tag: null, trashed: 0 },
        { id: 4, title: 'Same', text: 'Content 4', tag: null, trashed: 0 },
      ]);
      mockMakeDir = makeMockMakeDir();
      mockFs = makeMockFs();

      await backup('/output/path', {
        sqlite: mockSqlite as unknown as SqliteModule,
        makeDir: mockMakeDir as unknown as MakeDirFunction,
        fs: mockFs as unknown as FileSystemApi,
        dbPath: '/test/db.sqlite',
      });

      expect(mockFs.writeFile).toHaveBeenCalledTimes(4);
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        path.join('/output/path', 'Same.md'),
        'Content 1',
        { encoding: 'utf8' }
      );
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        path.join('/output/path', 'Same-1.md'),
        'Content 2',
        { encoding: 'utf8' }
      );
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        path.join('/output/path', 'Same-2.md'),
        'Content 3',
        { encoding: 'utf8' }
      );
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        path.join('/output/path', 'Same-3.md'),
        'Content 4',
        { encoding: 'utf8' }
      );
    });

    it('should not add suffix for same title in different tag directories', async () => {
      mockSqlite = makeMockSqlite([
        { id: 1, title: 'Note', text: 'Work content', tag: 'work', trashed: 0 },
        { id: 2, title: 'Note', text: 'Personal content', tag: 'personal', trashed: 0 },
      ]);
      mockMakeDir = makeMockMakeDir();
      mockFs = makeMockFs();

      await backup('/output/path', {
        useTagsAsDirectories: true,
        sqlite: mockSqlite as unknown as SqliteModule,
        makeDir: mockMakeDir as unknown as MakeDirFunction,
        fs: mockFs as unknown as FileSystemApi,
        dbPath: '/test/db.sqlite',
      });

      expect(mockFs.writeFile).toHaveBeenCalledWith(
        path.join('/output/path', 'work', 'Note.md'),
        'Work content',
        { encoding: 'utf8' }
      );
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        path.join('/output/path', 'personal', 'Note.md'),
        'Personal content',
        { encoding: 'utf8' }
      );
    });

    it('should add suffix for same title in same tag directory', async () => {
      mockSqlite = makeMockSqlite([
        { id: 1, title: 'Note', text: 'Content 1', tag: 'work', trashed: 0 },
        { id: 2, title: 'Note', text: 'Content 2', tag: 'work', trashed: 0 },
      ]);
      mockMakeDir = makeMockMakeDir();
      mockFs = makeMockFs();

      await backup('/output/path', {
        useTagsAsDirectories: true,
        sqlite: mockSqlite as unknown as SqliteModule,
        makeDir: mockMakeDir as unknown as MakeDirFunction,
        fs: mockFs as unknown as FileSystemApi,
        dbPath: '/test/db.sqlite',
      });

      expect(mockFs.writeFile).toHaveBeenCalledWith(
        path.join('/output/path', 'work', 'Note.md'),
        'Content 1',
        { encoding: 'utf8' }
      );
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        path.join('/output/path', 'work', 'Note-1.md'),
        'Content 2',
        { encoding: 'utf8' }
      );
    });

    it('should truncate base filename when adding suffix would exceed 255 bytes', async () => {
      const longTitle = 'a'.repeat(251);
      mockSqlite = makeMockSqlite([
        { id: 1, title: longTitle, text: 'Content 1', tag: null, trashed: 0 },
        { id: 2, title: longTitle, text: 'Content 2', tag: null, trashed: 0 },
      ]);
      mockMakeDir = makeMockMakeDir();
      mockFs = makeMockFs();

      await backup('/output/path', {
        sqlite: mockSqlite as unknown as SqliteModule,
        makeDir: mockMakeDir as unknown as MakeDirFunction,
        fs: mockFs as unknown as FileSystemApi,
        dbPath: '/test/db.sqlite',
      });

      const calls = mockFs.writeFile.mock.calls;
      expect(calls).toHaveLength(2);

      const firstFilename = path.basename(calls[0][0] as string);
      expect(firstFilename).toBe(longTitle + '.md');

      const secondFilename = path.basename(calls[1][0] as string);
      expect(Buffer.byteLength(secondFilename, 'utf8')).toBeLessThanOrEqual(255);
      expect(secondFilename).toMatch(/-1\.md$/);
    });

    it('should deduplicate titles that normalize to same filename via slash replacement', async () => {
      mockSqlite = makeMockSqlite([
        { id: 1, title: 'a/b', text: 'Content 1', tag: null, trashed: 0 },
        { id: 2, title: 'a-b', text: 'Content 2', tag: null, trashed: 0 },
      ]);
      mockMakeDir = makeMockMakeDir();
      mockFs = makeMockFs();

      await backup('/output/path', {
        sqlite: mockSqlite as unknown as SqliteModule,
        makeDir: mockMakeDir as unknown as MakeDirFunction,
        fs: mockFs as unknown as FileSystemApi,
        dbPath: '/test/db.sqlite',
      });

      expect(mockFs.writeFile).toHaveBeenCalledWith(
        path.join('/output/path', 'a-b.md'),
        'Content 1',
        { encoding: 'utf8' }
      );
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        path.join('/output/path', 'a-b-1.md'),
        'Content 2',
        { encoding: 'utf8' }
      );
    });

    it('should deduplicate trashed notes for correct file deletion', async () => {
      mockSqlite = makeMockSqlite([
        { id: 1, title: 'To Delete', text: 'Content 1', tag: null, trashed: 1 },
        { id: 2, title: 'To Delete', text: 'Content 2', tag: null, trashed: 1 },
      ]);
      mockMakeDir = makeMockMakeDir();
      mockFs = makeMockFs();

      await backup('/output/path', {
        sqlite: mockSqlite as unknown as SqliteModule,
        makeDir: mockMakeDir as unknown as MakeDirFunction,
        fs: mockFs as unknown as FileSystemApi,
        dbPath: '/test/db.sqlite',
      });

      expect(mockFs.unlink).toHaveBeenCalledWith(
        path.join('/output/path', 'To Delete.md')
      );
      expect(mockFs.unlink).toHaveBeenCalledWith(
        path.join('/output/path', 'To Delete-1.md')
      );
    });

    it('should handle large suffix numbers without exceeding byte limit', async () => {
      const notes = Array.from({ length: 15 }, (_, i) => ({
        id: i + 1,
        title: 'a'.repeat(250),
        text: `Content ${i}`,
        tag: null,
        trashed: 0,
      }));
      mockSqlite = makeMockSqlite(notes);
      mockMakeDir = makeMockMakeDir();
      mockFs = makeMockFs();

      await backup('/output/path', {
        sqlite: mockSqlite as unknown as SqliteModule,
        makeDir: mockMakeDir as unknown as MakeDirFunction,
        fs: mockFs as unknown as FileSystemApi,
        dbPath: '/test/db.sqlite',
      });

      const calls = mockFs.writeFile.mock.calls;
      for (const call of calls) {
        const filename = path.basename(call[0] as string);
        expect(Buffer.byteLength(filename, 'utf8')).toBeLessThanOrEqual(255);
      }
    });
  });

  describe('asset backup', () => {
    it('should create assets directory when localFilesPath is provided', async () => {
      mockSqlite = makeMockSqlite([], []);
      mockMakeDir = makeMockMakeDir();
      mockFs = makeMockFs();

      await backup('/output/path', {
        sqlite: mockSqlite as unknown as SqliteModule,
        makeDir: mockMakeDir as unknown as MakeDirFunction,
        fs: mockFs as unknown as FileSystemApi,
        dbPath: '/test/db.sqlite',
        localFilesPath: '/test/Local Files',
      });

      expect(mockMakeDir).toHaveBeenCalledWith('/output/path');
      expect(mockMakeDir).toHaveBeenCalledWith(path.join('/output/path', 'assets'));
    });

    it('should not create assets directory when localFilesPath is not provided', async () => {
      mockSqlite = makeMockSqlite([]);
      mockMakeDir = makeMockMakeDir();
      mockFs = makeMockFs();

      await backup('/output/path', {
        sqlite: mockSqlite as unknown as SqliteModule,
        makeDir: mockMakeDir as unknown as MakeDirFunction,
        fs: mockFs as unknown as FileSystemApi,
        dbPath: '/test/db.sqlite',
      });

      expect(mockMakeDir).toHaveBeenCalledTimes(1);
      expect(mockMakeDir).toHaveBeenCalledWith('/output/path');
    });

    it('should query ZSFNOTEFILE table when localFilesPath is provided', async () => {
      const mockDb = {
        all: vi.fn()
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([]),
      };
      mockSqlite = { open: vi.fn().mockResolvedValue(mockDb) };
      mockMakeDir = makeMockMakeDir();
      mockFs = makeMockFs();

      await backup('/output/path', {
        sqlite: mockSqlite as unknown as SqliteModule,
        makeDir: mockMakeDir as unknown as MakeDirFunction,
        fs: mockFs as unknown as FileSystemApi,
        dbPath: '/test/db.sqlite',
        localFilesPath: '/test/Local Files',
      });

      expect(mockDb.all).toHaveBeenCalledTimes(2);
      expect(mockDb.all).toHaveBeenNthCalledWith(2, expect.stringContaining('ZSFNOTEFILE'));
    });

    it('should copy image files from Note Images folder with UUID prefix', async () => {
      mockSqlite = makeMockSqlite(
        [{ id: 1, title: 'Note', text: '![](test.png)', tag: null, trashed: 0 }],
        [{ noteId: 1, uuid: 'ABC12345-DEFG-HIJK', filename: 'test.png', extension: 'png' }]
      );
      mockMakeDir = makeMockMakeDir();
      mockFs = makeMockFs();

      await backup('/output/path', {
        sqlite: mockSqlite as unknown as SqliteModule,
        makeDir: mockMakeDir as unknown as MakeDirFunction,
        fs: mockFs as unknown as FileSystemApi,
        dbPath: '/test/db.sqlite',
        localFilesPath: '/test/Local Files',
      });

      expect(mockFs.copyFile).toHaveBeenCalledWith(
        path.join('/test/Local Files', 'Note Images', 'ABC12345-DEFG-HIJK', 'test.png'),
        path.join('/output/path', 'assets', 'ABC12345-test.png')
      );
    });

    it('should copy attachment files from Note Files folder', async () => {
      mockSqlite = makeMockSqlite(
        [{ id: 1, title: 'Note', text: '[doc.pdf](doc.pdf)', tag: null, trashed: 0 }],
        [{ noteId: 1, uuid: 'XYZ98765-QRST-UVWX', filename: 'doc.pdf', extension: 'pdf' }]
      );
      mockMakeDir = makeMockMakeDir();
      mockFs = makeMockFs();

      await backup('/output/path', {
        sqlite: mockSqlite as unknown as SqliteModule,
        makeDir: mockMakeDir as unknown as MakeDirFunction,
        fs: mockFs as unknown as FileSystemApi,
        dbPath: '/test/db.sqlite',
        localFilesPath: '/test/Local Files',
      });

      expect(mockFs.copyFile).toHaveBeenCalledWith(
        path.join('/test/Local Files', 'Note Files', 'XYZ98765-QRST-UVWX', 'doc.pdf'),
        path.join('/output/path', 'assets', 'XYZ98765-doc.pdf')
      );
    });

    it('should rewrite image references in markdown to include assets/ path', async () => {
      mockSqlite = makeMockSqlite(
        [{ id: 1, title: 'Note', text: '# My Note\n\n![](image.png)\n\nSome text', tag: null, trashed: 0 }],
        [{ noteId: 1, uuid: 'AAAABBBB-CCCC-DDDD', filename: 'image.png', extension: 'png' }]
      );
      mockMakeDir = makeMockMakeDir();
      mockFs = makeMockFs();

      await backup('/output/path', {
        sqlite: mockSqlite as unknown as SqliteModule,
        makeDir: mockMakeDir as unknown as MakeDirFunction,
        fs: mockFs as unknown as FileSystemApi,
        dbPath: '/test/db.sqlite',
        localFilesPath: '/test/Local Files',
      });

      expect(mockFs.writeFile).toHaveBeenCalledWith(
        path.join('/output/path', 'Note.md'),
        '# My Note\n\n![](assets/AAAABBBB-image.png)\n\nSome text',
        { encoding: 'utf8' }
      );
    });

    it('should rewrite URL-encoded image references', async () => {
      mockSqlite = makeMockSqlite(
        [{ id: 1, title: 'Note', text: '![](my%20image.png)', tag: null, trashed: 0 }],
        [{ noteId: 1, uuid: '11112222-3333-4444', filename: 'my image.png', extension: 'png' }]
      );
      mockMakeDir = makeMockMakeDir();
      mockFs = makeMockFs();

      await backup('/output/path', {
        sqlite: mockSqlite as unknown as SqliteModule,
        makeDir: mockMakeDir as unknown as MakeDirFunction,
        fs: mockFs as unknown as FileSystemApi,
        dbPath: '/test/db.sqlite',
        localFilesPath: '/test/Local Files',
      });

      expect(mockFs.writeFile).toHaveBeenCalledWith(
        path.join('/output/path', 'Note.md'),
        '![](assets/11112222-my%20image.png)',
        { encoding: 'utf8' }
      );
    });

    it('should rewrite attachment references in markdown', async () => {
      mockSqlite = makeMockSqlite(
        [{ id: 1, title: 'Note', text: '[Report.xlsx](Report.xlsx)<!-- {"embed":"true"} -->', tag: null, trashed: 0 }],
        [{ noteId: 1, uuid: 'FILE1234-5678-ABCD', filename: 'Report.xlsx', extension: 'xlsx' }]
      );
      mockMakeDir = makeMockMakeDir();
      mockFs = makeMockFs();

      await backup('/output/path', {
        sqlite: mockSqlite as unknown as SqliteModule,
        makeDir: mockMakeDir as unknown as MakeDirFunction,
        fs: mockFs as unknown as FileSystemApi,
        dbPath: '/test/db.sqlite',
        localFilesPath: '/test/Local Files',
      });

      expect(mockFs.writeFile).toHaveBeenCalledWith(
        path.join('/output/path', 'Note.md'),
        '[Report.xlsx](assets/FILE1234-Report.xlsx)<!-- {"embed":"true"} -->',
        { encoding: 'utf8' }
      );
    });

    it('should use ../assets/ path when useTagsAsDirectories is true', async () => {
      mockSqlite = makeMockSqlite(
        [{ id: 1, title: 'Note', text: '![](image.png)', tag: 'work', trashed: 0 }],
        [{ noteId: 1, uuid: 'TAG12345-WORK-NOTE', filename: 'image.png', extension: 'png' }]
      );
      mockMakeDir = makeMockMakeDir();
      mockFs = makeMockFs();

      await backup('/output/path', {
        useTagsAsDirectories: true,
        sqlite: mockSqlite as unknown as SqliteModule,
        makeDir: mockMakeDir as unknown as MakeDirFunction,
        fs: mockFs as unknown as FileSystemApi,
        dbPath: '/test/db.sqlite',
        localFilesPath: '/test/Local Files',
      });

      expect(mockFs.writeFile).toHaveBeenCalledWith(
        path.join('/output/path', 'work', 'Note.md'),
        '![](../assets/TAG12345-image.png)',
        { encoding: 'utf8' }
      );
    });

    it('should handle notes with multiple images', async () => {
      mockSqlite = makeMockSqlite(
        [{ id: 1, title: 'Note', text: '![](a.png)\n![](b.png)', tag: null, trashed: 0 }],
        [
          { noteId: 1, uuid: 'UUID-AAA-1234', filename: 'a.png', extension: 'png' },
          { noteId: 1, uuid: 'UUID-BBB-5678', filename: 'b.png', extension: 'png' },
        ]
      );
      mockMakeDir = makeMockMakeDir();
      mockFs = makeMockFs();

      await backup('/output/path', {
        sqlite: mockSqlite as unknown as SqliteModule,
        makeDir: mockMakeDir as unknown as MakeDirFunction,
        fs: mockFs as unknown as FileSystemApi,
        dbPath: '/test/db.sqlite',
        localFilesPath: '/test/Local Files',
      });

      expect(mockFs.copyFile).toHaveBeenCalledTimes(2);
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        path.join('/output/path', 'Note.md'),
        '![](assets/UUID-AAA-a.png)\n![](assets/UUID-BBB-b.png)',
        { encoding: 'utf8' }
      );
    });

    it('should handle notes with no files', async () => {
      mockSqlite = makeMockSqlite(
        [{ id: 1, title: 'Note', text: 'Just text, no images', tag: null, trashed: 0 }],
        []
      );
      mockMakeDir = makeMockMakeDir();
      mockFs = makeMockFs();

      await backup('/output/path', {
        sqlite: mockSqlite as unknown as SqliteModule,
        makeDir: mockMakeDir as unknown as MakeDirFunction,
        fs: mockFs as unknown as FileSystemApi,
        dbPath: '/test/db.sqlite',
        localFilesPath: '/test/Local Files',
      });

      expect(mockFs.copyFile).not.toHaveBeenCalled();
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        path.join('/output/path', 'Note.md'),
        'Just text, no images',
        { encoding: 'utf8' }
      );
    });

    it('should skip missing source files gracefully with ENOENT error', async () => {
      mockSqlite = makeMockSqlite(
        [{ id: 1, title: 'Note', text: '![](missing.png)', tag: null, trashed: 0 }],
        [{ noteId: 1, uuid: 'MISS1234-NOPE-FILE', filename: 'missing.png', extension: 'png' }]
      );
      mockMakeDir = makeMockMakeDir();
      const enoentError: NodeError = new Error('ENOENT: no such file or directory');
      enoentError.code = 'ENOENT';
      mockFs = {
        writeFile: vi.fn().mockResolvedValue(undefined),
        unlink: vi.fn().mockResolvedValue(undefined),
        copyFile: vi.fn().mockRejectedValue(enoentError),
      };

      await expect(backup('/output/path', {
        sqlite: mockSqlite as unknown as SqliteModule,
        makeDir: mockMakeDir as unknown as MakeDirFunction,
        fs: mockFs as unknown as FileSystemApi,
        dbPath: '/test/db.sqlite',
        localFilesPath: '/test/Local Files',
      })).resolves.not.toThrow();
    });

    it('should propagate non-ENOENT errors when copying files', async () => {
      mockSqlite = makeMockSqlite(
        [{ id: 1, title: 'Note', text: '![](image.png)', tag: null, trashed: 0 }],
        [{ noteId: 1, uuid: 'ERR12345-PERM-DENY', filename: 'image.png', extension: 'png' }]
      );
      mockMakeDir = makeMockMakeDir();
      const permError: NodeError = new Error('EACCES: permission denied');
      permError.code = 'EACCES';
      mockFs = {
        writeFile: vi.fn().mockResolvedValue(undefined),
        unlink: vi.fn().mockResolvedValue(undefined),
        copyFile: vi.fn().mockRejectedValue(permError),
      };

      await expect(backup('/output/path', {
        sqlite: mockSqlite as unknown as SqliteModule,
        makeDir: mockMakeDir as unknown as MakeDirFunction,
        fs: mockFs as unknown as FileSystemApi,
        dbPath: '/test/db.sqlite',
        localFilesPath: '/test/Local Files',
      })).rejects.toThrow('EACCES');
    });

    it('should deduplicate file copies by UUID when same file appears in multiple notes', async () => {
      mockSqlite = makeMockSqlite(
        [
          { id: 1, title: 'Note 1', text: '![](shared.png)', tag: null, trashed: 0 },
          { id: 2, title: 'Note 2', text: '![](shared.png)', tag: null, trashed: 0 },
        ],
        [
          { noteId: 1, uuid: 'SHARED-UUID-1234', filename: 'shared.png', extension: 'png' },
          { noteId: 2, uuid: 'SHARED-UUID-1234', filename: 'shared.png', extension: 'png' },
        ]
      );
      mockMakeDir = makeMockMakeDir();
      mockFs = makeMockFs();

      await backup('/output/path', {
        sqlite: mockSqlite as unknown as SqliteModule,
        makeDir: mockMakeDir as unknown as MakeDirFunction,
        fs: mockFs as unknown as FileSystemApi,
        dbPath: '/test/db.sqlite',
        localFilesPath: '/test/Local Files',
      });

      expect(mockFs.copyFile).toHaveBeenCalledTimes(1);
    });

    it('should truncate asset filename when original filename is too long', async () => {
      const longFilename = 'a'.repeat(300) + '.png';
      mockSqlite = makeMockSqlite(
        [{ id: 1, title: 'Note', text: `![](${longFilename})`, tag: null, trashed: 0 }],
        [{ noteId: 1, uuid: 'LONG1234-FILE-NAME', filename: longFilename, extension: 'png' }]
      );
      mockMakeDir = makeMockMakeDir();
      mockFs = makeMockFs();

      await backup('/output/path', {
        sqlite: mockSqlite as unknown as SqliteModule,
        makeDir: mockMakeDir as unknown as MakeDirFunction,
        fs: mockFs as unknown as FileSystemApi,
        dbPath: '/test/db.sqlite',
        localFilesPath: '/test/Local Files',
      });

      const copyCall = mockFs.copyFile!.mock.calls[0];
      const destFilename = path.basename(copyCall[1] as string);
      expect(Buffer.byteLength(destFilename, 'utf8')).toBeLessThanOrEqual(255);
      expect(destFilename.startsWith('LONG1234-')).toBe(true);
    });

    it('should skip files with null uuid or filename', async () => {
      mockSqlite = makeMockSqlite(
        [{ id: 1, title: 'Note', text: 'Content', tag: null, trashed: 0 }],
        [
          { noteId: 1, uuid: null, filename: 'test.png', extension: 'png' },
          { noteId: 1, uuid: 'VALID123-UUID-HERE', filename: null, extension: 'png' },
        ]
      );
      mockMakeDir = makeMockMakeDir();
      mockFs = makeMockFs();

      await backup('/output/path', {
        sqlite: mockSqlite as unknown as SqliteModule,
        makeDir: mockMakeDir as unknown as MakeDirFunction,
        fs: mockFs as unknown as FileSystemApi,
        dbPath: '/test/db.sqlite',
        localFilesPath: '/test/Local Files',
      });

      expect(mockFs.copyFile).not.toHaveBeenCalled();
    });

    it('should handle images with special characters in filename', async () => {
      mockSqlite = makeMockSqlite(
        [{ id: 1, title: 'Note', text: '![](image (1).png)', tag: null, trashed: 0 }],
        [{ noteId: 1, uuid: 'SPEC1234-CHAR-FILE', filename: 'image (1).png', extension: 'png' }]
      );
      mockMakeDir = makeMockMakeDir();
      mockFs = makeMockFs();

      await backup('/output/path', {
        sqlite: mockSqlite as unknown as SqliteModule,
        makeDir: mockMakeDir as unknown as MakeDirFunction,
        fs: mockFs as unknown as FileSystemApi,
        dbPath: '/test/db.sqlite',
        localFilesPath: '/test/Local Files',
      });

      expect(mockFs.copyFile).toHaveBeenCalledWith(
        path.join('/test/Local Files', 'Note Images', 'SPEC1234-CHAR-FILE', 'image (1).png'),
        path.join('/output/path', 'assets', 'SPEC1234-image (1).png')
      );
    });

    it('should place all assets in single shared folder when useTagsAsDirectories is true', async () => {
      mockSqlite = makeMockSqlite(
        [
          { id: 1, title: 'Work Note', text: '![](work.png)', tag: 'work', trashed: 0 },
          { id: 2, title: 'Home Note', text: '![](home.png)', tag: 'home', trashed: 0 },
        ],
        [
          { noteId: 1, uuid: 'WORK1234-UUID-HERE', filename: 'work.png', extension: 'png' },
          { noteId: 2, uuid: 'HOME5678-UUID-HERE', filename: 'home.png', extension: 'png' },
        ]
      );
      mockMakeDir = makeMockMakeDir();
      mockFs = makeMockFs();

      await backup('/output/path', {
        useTagsAsDirectories: true,
        sqlite: mockSqlite as unknown as SqliteModule,
        makeDir: mockMakeDir as unknown as MakeDirFunction,
        fs: mockFs as unknown as FileSystemApi,
        dbPath: '/test/db.sqlite',
        localFilesPath: '/test/Local Files',
      });

      expect(mockFs.copyFile).toHaveBeenCalledWith(
        expect.any(String),
        path.join('/output/path', 'assets', 'WORK1234-work.png')
      );
      expect(mockFs.copyFile).toHaveBeenCalledWith(
        expect.any(String),
        path.join('/output/path', 'assets', 'HOME5678-home.png')
      );
    });
  });

  describe('modification date preservation', () => {
    const CORE_DATA_EPOCH_SECONDS = Date.UTC(2001, 0, 1) / 1000;

    it('should call fs.utimes with correct Date when modificationDate is present', async () => {
      const modificationDate = 727810948.573216;
      mockSqlite = makeMockSqlite([
        { id: 1, title: 'Note', text: 'Content', tag: null, trashed: 0, modificationDate },
      ]);
      mockMakeDir = makeMockMakeDir();
      mockFs = makeMockFs();

      await backup('/output/path', {
        sqlite: mockSqlite as unknown as SqliteModule,
        makeDir: mockMakeDir as unknown as MakeDirFunction,
        fs: mockFs as unknown as FileSystemApi,
        dbPath: '/test/db.sqlite',
      });

      expect(mockFs.utimes).toHaveBeenCalledTimes(1);
      const [filePath, atime, mtime] = mockFs.utimes!.mock.calls[0];
      expect(filePath).toBe(path.join('/output/path', 'Note.md'));
      expect(atime).toBeInstanceOf(Date);
      expect(mtime).toBeInstanceOf(Date);
      const expectedDate = new Date((modificationDate + CORE_DATA_EPOCH_SECONDS) * 1000);
      expect((mtime as Date).getTime()).toBe(expectedDate.getTime());
    });

    it('should not call fs.utimes when modificationDate is null', async () => {
      mockSqlite = makeMockSqlite([
        { id: 1, title: 'Note', text: 'Content', tag: null, trashed: 0, modificationDate: null },
      ]);
      mockMakeDir = makeMockMakeDir();
      mockFs = makeMockFs();

      await backup('/output/path', {
        sqlite: mockSqlite as unknown as SqliteModule,
        makeDir: mockMakeDir as unknown as MakeDirFunction,
        fs: mockFs as unknown as FileSystemApi,
        dbPath: '/test/db.sqlite',
      });

      expect(mockFs.utimes).not.toHaveBeenCalled();
    });

    it('should not call fs.utimes when modificationDate is undefined', async () => {
      mockSqlite = makeMockSqlite([
        { id: 1, title: 'Note', text: 'Content', tag: null, trashed: 0 },
      ]);
      mockMakeDir = makeMockMakeDir();
      mockFs = makeMockFs();

      await backup('/output/path', {
        sqlite: mockSqlite as unknown as SqliteModule,
        makeDir: mockMakeDir as unknown as MakeDirFunction,
        fs: mockFs as unknown as FileSystemApi,
        dbPath: '/test/db.sqlite',
      });

      expect(mockFs.utimes).not.toHaveBeenCalled();
    });

    it('should not call fs.utimes for trashed notes', async () => {
      mockSqlite = makeMockSqlite([
        { id: 1, title: 'Note', text: 'Content', tag: null, trashed: 1, modificationDate: 727810948 },
      ]);
      mockMakeDir = makeMockMakeDir();
      mockFs = makeMockFs();

      await backup('/output/path', {
        sqlite: mockSqlite as unknown as SqliteModule,
        makeDir: mockMakeDir as unknown as MakeDirFunction,
        fs: mockFs as unknown as FileSystemApi,
        dbPath: '/test/db.sqlite',
      });

      expect(mockFs.utimes).not.toHaveBeenCalled();
    });

    it('should set correct timestamps for multiple notes with different modification dates', async () => {
      const modDate1 = 700000000;
      const modDate2 = 750000000;
      mockSqlite = makeMockSqlite([
        { id: 1, title: 'Note 1', text: 'Content 1', tag: null, trashed: 0, modificationDate: modDate1 },
        { id: 2, title: 'Note 2', text: 'Content 2', tag: null, trashed: 0, modificationDate: modDate2 },
      ]);
      mockMakeDir = makeMockMakeDir();
      mockFs = makeMockFs();

      await backup('/output/path', {
        sqlite: mockSqlite as unknown as SqliteModule,
        makeDir: mockMakeDir as unknown as MakeDirFunction,
        fs: mockFs as unknown as FileSystemApi,
        dbPath: '/test/db.sqlite',
      });

      expect(mockFs.utimes).toHaveBeenCalledTimes(2);

      const call1 = mockFs.utimes!.mock.calls.find((call: unknown[]) => (call[0] as string).includes('Note 1'));
      const call2 = mockFs.utimes!.mock.calls.find((call: unknown[]) => (call[0] as string).includes('Note 2'));

      const expectedDate1 = new Date((modDate1 + CORE_DATA_EPOCH_SECONDS) * 1000);
      const expectedDate2 = new Date((modDate2 + CORE_DATA_EPOCH_SECONDS) * 1000);

      expect((call1![2] as Date).getTime()).toBe(expectedDate1.getTime());
      expect((call2![2] as Date).getTime()).toBe(expectedDate2.getTime());
    });

    it('should convert Core Data epoch timestamp correctly to JavaScript Date', async () => {
      const coreDataTimestamp = 0;
      mockSqlite = makeMockSqlite([
        { id: 1, title: 'Note', text: 'Content', tag: null, trashed: 0, modificationDate: coreDataTimestamp },
      ]);
      mockMakeDir = makeMockMakeDir();
      mockFs = makeMockFs();

      await backup('/output/path', {
        sqlite: mockSqlite as unknown as SqliteModule,
        makeDir: mockMakeDir as unknown as MakeDirFunction,
        fs: mockFs as unknown as FileSystemApi,
        dbPath: '/test/db.sqlite',
      });

      const [, , mtime] = mockFs.utimes!.mock.calls[0];
      expect((mtime as Date).getUTCFullYear()).toBe(2001);
      expect((mtime as Date).getUTCMonth()).toBe(0);
      expect((mtime as Date).getUTCDate()).toBe(1);
    });
  });
});
