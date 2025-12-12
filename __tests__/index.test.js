import { describe, it, expect, vi, beforeEach } from 'vitest'
import path from 'path'
import { backup } from '../lib/backup.js'

function makeMockSqlite(rows = []) {
	return {
		open: vi.fn().mockResolvedValue({
			all: vi.fn().mockResolvedValue(rows),
		}),
	}
}

function makeMockMakeDir() {
	return vi.fn().mockResolvedValue(undefined)
}

function makeMockFs() {
	return {
		writeFile: vi.fn().mockResolvedValue(undefined),
		unlink: vi.fn().mockResolvedValue(undefined),
	}
}

describe('backup function', () => {
	let mockSqlite
	let mockMakeDir
	let mockFs

	beforeEach(() => {
		vi.clearAllMocks()
	})

	describe('directory creation', () => {
		it('should create the output directory', async () => {
			mockSqlite = makeMockSqlite([])
			mockMakeDir = makeMockMakeDir()
			mockFs = makeMockFs()

			await backup('/output/path', {
				sqlite: mockSqlite,
				makeDir: mockMakeDir,
				fs: mockFs,
				dbPath: '/test/db.sqlite',
			})

			expect(mockMakeDir).toHaveBeenCalledWith('/output/path')
		})

		it('should create tag directories when useTagsAsDirectories is true', async () => {
			mockSqlite = makeMockSqlite([
				{ id: 1, title: 'Note 1', text: 'Content 1', tag: 'work', trashed: 0 },
				{ id: 2, title: 'Note 2', text: 'Content 2', tag: 'personal', trashed: 0 },
			])
			mockMakeDir = makeMockMakeDir()
			mockFs = makeMockFs()

			await backup('/output/path', {
				useTagsAsDirectories: true,
				sqlite: mockSqlite,
				makeDir: mockMakeDir,
				fs: mockFs,
				dbPath: '/test/db.sqlite',
			})

			expect(mockMakeDir).toHaveBeenCalledWith('/output/path')
			expect(mockMakeDir).toHaveBeenCalledWith(path.join('/output/path', 'work'))
			expect(mockMakeDir).toHaveBeenCalledWith(path.join('/output/path', 'personal'))
		})

		it('should create untagged directory for notes without tags when useTagsAsDirectories is true', async () => {
			mockSqlite = makeMockSqlite([
				{ id: 1, title: 'Note 1', text: 'Content 1', tag: null, trashed: 0 },
			])
			mockMakeDir = makeMockMakeDir()
			mockFs = makeMockFs()

			await backup('/output/path', {
				useTagsAsDirectories: true,
				sqlite: mockSqlite,
				makeDir: mockMakeDir,
				fs: mockFs,
				dbPath: '/test/db.sqlite',
			})

			expect(mockMakeDir).toHaveBeenCalledWith(path.join('/output/path', 'untagged'))
		})
	})

	describe('database operations', () => {
		it('should open the database with the provided path', async () => {
			mockSqlite = makeMockSqlite([])
			mockMakeDir = makeMockMakeDir()
			mockFs = makeMockFs()

			await backup('/output/path', {
				sqlite: mockSqlite,
				makeDir: mockMakeDir,
				fs: mockFs,
				dbPath: '/custom/db.sqlite',
			})

			expect(mockSqlite.open).toHaveBeenCalledWith('/custom/db.sqlite')
		})

		it('should query notes with correct SQL containing ZSFNOTE table', async () => {
			const mockDb = { all: vi.fn().mockResolvedValue([]) }
			mockSqlite = { open: vi.fn().mockResolvedValue(mockDb) }
			mockMakeDir = makeMockMakeDir()
			mockFs = makeMockFs()

			await backup('/output/path', {
				sqlite: mockSqlite,
				makeDir: mockMakeDir,
				fs: mockFs,
				dbPath: '/test/db.sqlite',
			})

			expect(mockDb.all).toHaveBeenCalledWith(expect.stringContaining('SELECT'))
			expect(mockDb.all).toHaveBeenCalledWith(expect.stringContaining('ZSFNOTE'))
		})

		it('should query notes with correct SQL containing ZSFNOTETAG table', async () => {
			const mockDb = { all: vi.fn().mockResolvedValue([]) }
			mockSqlite = { open: vi.fn().mockResolvedValue(mockDb) }
			mockMakeDir = makeMockMakeDir()
			mockFs = makeMockFs()

			await backup('/output/path', {
				sqlite: mockSqlite,
				makeDir: mockMakeDir,
				fs: mockFs,
				dbPath: '/test/db.sqlite',
			})

			expect(mockDb.all).toHaveBeenCalledWith(expect.stringContaining('ZSFNOTETAG'))
		})

		it('should handle empty database with no notes', async () => {
			mockSqlite = makeMockSqlite([])
			mockMakeDir = makeMockMakeDir()
			mockFs = makeMockFs()

			const results = await backup('/output/path', {
				sqlite: mockSqlite,
				makeDir: mockMakeDir,
				fs: mockFs,
				dbPath: '/test/db.sqlite',
			})

			expect(results).toEqual([])
			expect(mockFs.writeFile).not.toHaveBeenCalled()
			expect(mockFs.unlink).not.toHaveBeenCalled()
		})
	})

	describe('file writing for non-trashed notes', () => {
		it('should write note content to file with correct path', async () => {
			mockSqlite = makeMockSqlite([
				{ id: 1, title: 'Test Note', text: 'Note content', tag: null, trashed: 0 },
			])
			mockMakeDir = makeMockMakeDir()
			mockFs = makeMockFs()

			await backup('/output/path', {
				sqlite: mockSqlite,
				makeDir: mockMakeDir,
				fs: mockFs,
				dbPath: '/test/db.sqlite',
			})

			expect(mockFs.writeFile).toHaveBeenCalledWith(
				path.join('/output/path', 'Test Note.md'),
				'Note content',
				{ encoding: 'utf8' }
			)
		})

		it('should write multiple notes', async () => {
			mockSqlite = makeMockSqlite([
				{ id: 1, title: 'Note 1', text: 'Content 1', tag: null, trashed: 0 },
				{ id: 2, title: 'Note 2', text: 'Content 2', tag: null, trashed: 0 },
			])
			mockMakeDir = makeMockMakeDir()
			mockFs = makeMockFs()

			await backup('/output/path', {
				sqlite: mockSqlite,
				makeDir: mockMakeDir,
				fs: mockFs,
				dbPath: '/test/db.sqlite',
			})

			expect(mockFs.writeFile).toHaveBeenCalledTimes(2)
		})

		it('should write to tag directory when useTagsAsDirectories is true', async () => {
			mockSqlite = makeMockSqlite([
				{ id: 1, title: 'Work Note', text: 'Work content', tag: 'work', trashed: 0 },
			])
			mockMakeDir = makeMockMakeDir()
			mockFs = makeMockFs()

			await backup('/output/path', {
				useTagsAsDirectories: true,
				sqlite: mockSqlite,
				makeDir: mockMakeDir,
				fs: mockFs,
				dbPath: '/test/db.sqlite',
			})

			expect(mockFs.writeFile).toHaveBeenCalledWith(
				path.join('/output/path', 'work', 'Work Note.md'),
				'Work content',
				{ encoding: 'utf8' }
			)
		})

		it('should write to untagged directory for null tag when useTagsAsDirectories is true', async () => {
			mockSqlite = makeMockSqlite([
				{ id: 1, title: 'Untagged Note', text: 'Untagged content', tag: null, trashed: 0 },
			])
			mockMakeDir = makeMockMakeDir()
			mockFs = makeMockFs()

			await backup('/output/path', {
				useTagsAsDirectories: true,
				sqlite: mockSqlite,
				makeDir: mockMakeDir,
				fs: mockFs,
				dbPath: '/test/db.sqlite',
			})

			expect(mockFs.writeFile).toHaveBeenCalledWith(
				path.join('/output/path', 'untagged', 'Untagged Note.md'),
				'Untagged content',
				{ encoding: 'utf8' }
			)
		})
	})

	describe('file deletion for trashed notes', () => {
		it('should delete file for trashed note', async () => {
			mockSqlite = makeMockSqlite([
				{ id: 1, title: 'Trashed Note', text: 'Trashed content', tag: null, trashed: 1 },
			])
			mockMakeDir = makeMockMakeDir()
			mockFs = makeMockFs()

			await backup('/output/path', {
				sqlite: mockSqlite,
				makeDir: mockMakeDir,
				fs: mockFs,
				dbPath: '/test/db.sqlite',
			})

			expect(mockFs.unlink).toHaveBeenCalledWith(
				path.join('/output/path', 'Trashed Note.md')
			)
			expect(mockFs.writeFile).not.toHaveBeenCalled()
		})

		it('should delete from tag directory when useTagsAsDirectories is true', async () => {
			mockSqlite = makeMockSqlite([
				{ id: 1, title: 'Trashed Work Note', text: 'Content', tag: 'work', trashed: 1 },
			])
			mockMakeDir = makeMockMakeDir()
			mockFs = makeMockFs()

			await backup('/output/path', {
				useTagsAsDirectories: true,
				sqlite: mockSqlite,
				makeDir: mockMakeDir,
				fs: mockFs,
				dbPath: '/test/db.sqlite',
			})

			expect(mockFs.unlink).toHaveBeenCalledWith(
				path.join('/output/path', 'work', 'Trashed Work Note.md')
			)
		})
	})

	describe('mixed operations', () => {
		it('should handle mix of trashed and non-trashed notes', async () => {
			mockSqlite = makeMockSqlite([
				{ id: 1, title: 'Active Note', text: 'Active content', tag: null, trashed: 0 },
				{ id: 2, title: 'Trashed Note', text: 'Trashed content', tag: null, trashed: 1 },
			])
			mockMakeDir = makeMockMakeDir()
			mockFs = makeMockFs()

			await backup('/output/path', {
				sqlite: mockSqlite,
				makeDir: mockMakeDir,
				fs: mockFs,
				dbPath: '/test/db.sqlite',
			})

			expect(mockFs.writeFile).toHaveBeenCalledTimes(1)
			expect(mockFs.unlink).toHaveBeenCalledTimes(1)
		})

		it('should return array with results for all operations', async () => {
			mockSqlite = makeMockSqlite([
				{ id: 1, title: 'Note 1', text: 'Content 1', tag: null, trashed: 0 },
				{ id: 2, title: 'Note 2', text: 'Content 2', tag: null, trashed: 0 },
				{ id: 3, title: 'Note 3', text: 'Content 3', tag: null, trashed: 1 },
			])
			mockMakeDir = makeMockMakeDir()
			mockFs = makeMockFs()

			const results = await backup('/output/path', {
				sqlite: mockSqlite,
				makeDir: mockMakeDir,
				fs: mockFs,
				dbPath: '/test/db.sqlite',
			})

			expect(results).toHaveLength(3)
		})
	})

	describe('title sanitization', () => {
		it('should sanitize titles with slashes', async () => {
			mockSqlite = makeMockSqlite([
				{ id: 1, title: 'Note/With/Slashes', text: 'Content', tag: null, trashed: 0 },
			])
			mockMakeDir = makeMockMakeDir()
			mockFs = makeMockFs()

			await backup('/output/path', {
				sqlite: mockSqlite,
				makeDir: mockMakeDir,
				fs: mockFs,
				dbPath: '/test/db.sqlite',
			})

			expect(mockFs.writeFile).toHaveBeenCalledWith(
				path.join('/output/path', 'Note-With-Slashes.md'),
				'Content',
				{ encoding: 'utf8' }
			)
		})
	})

	describe('tag deduplication', () => {
		it('should deduplicate tags when creating directories', async () => {
			mockSqlite = makeMockSqlite([
				{ id: 1, title: 'Note 1', text: 'Content 1', tag: 'work', trashed: 0 },
				{ id: 2, title: 'Note 2', text: 'Content 2', tag: 'work', trashed: 0 },
				{ id: 3, title: 'Note 3', text: 'Content 3', tag: 'work', trashed: 0 },
			])
			mockMakeDir = makeMockMakeDir()
			mockFs = makeMockFs()

			await backup('/output/path', {
				useTagsAsDirectories: true,
				sqlite: mockSqlite,
				makeDir: mockMakeDir,
				fs: mockFs,
				dbPath: '/test/db.sqlite',
			})

			const workDirCalls = mockMakeDir.mock.calls.filter(
				call => call[0] === path.join('/output/path', 'work')
			)
			expect(workDirCalls).toHaveLength(1)
		})
	})

	describe('error handling', () => {
		it('should throw error when sqlite dependency is missing', async () => {
			await expect(backup('/output/path', {
				makeDir: makeMockMakeDir(),
				fs: makeMockFs(),
				dbPath: '/test/db.sqlite',
			})).rejects.toThrow('Missing required dependencies')
		})

		it('should throw error when makeDir dependency is missing', async () => {
			await expect(backup('/output/path', {
				sqlite: makeMockSqlite([]),
				fs: makeMockFs(),
				dbPath: '/test/db.sqlite',
			})).rejects.toThrow('Missing required dependencies')
		})

		it('should throw error when fs dependency is missing', async () => {
			await expect(backup('/output/path', {
				sqlite: makeMockSqlite([]),
				makeDir: makeMockMakeDir(),
				dbPath: '/test/db.sqlite',
			})).rejects.toThrow('Missing required dependencies')
		})

		it('should throw error when dbPath is missing', async () => {
			await expect(backup('/output/path', {
				sqlite: makeMockSqlite([]),
				makeDir: makeMockMakeDir(),
				fs: makeMockFs(),
			})).rejects.toThrow('Missing required dependencies')
		})
	})

	describe('error propagation from dependencies', () => {
		it('should propagate error when makeDir fails to create output directory', async () => {
			const mockMakeDirError = vi.fn().mockRejectedValue(new Error('Permission denied'))
			mockSqlite = makeMockSqlite([])
			mockFs = makeMockFs()

			await expect(backup('/output/path', {
				sqlite: mockSqlite,
				makeDir: mockMakeDirError,
				fs: mockFs,
				dbPath: '/test/db.sqlite',
			})).rejects.toThrow('Permission denied')
		})

		it('should propagate error when sqlite.open fails to open database', async () => {
			const mockSqliteError = {
				open: vi.fn().mockRejectedValue(new Error('Database not found')),
			}
			mockMakeDir = makeMockMakeDir()
			mockFs = makeMockFs()

			await expect(backup('/output/path', {
				sqlite: mockSqliteError,
				makeDir: mockMakeDir,
				fs: mockFs,
				dbPath: '/test/db.sqlite',
			})).rejects.toThrow('Database not found')
		})

		it('should propagate error when db.all fails to query notes', async () => {
			const mockDb = { all: vi.fn().mockRejectedValue(new Error('Query failed')) }
			const mockSqliteQueryError = { open: vi.fn().mockResolvedValue(mockDb) }
			mockMakeDir = makeMockMakeDir()
			mockFs = makeMockFs()

			await expect(backup('/output/path', {
				sqlite: mockSqliteQueryError,
				makeDir: mockMakeDir,
				fs: mockFs,
				dbPath: '/test/db.sqlite',
			})).rejects.toThrow('Query failed')
		})

		it('should propagate error when fs.writeFile fails to write note', async () => {
			mockSqlite = makeMockSqlite([
				{ id: 1, title: 'Test Note', text: 'Content', tag: null, trashed: 0 },
			])
			mockMakeDir = makeMockMakeDir()
			mockFs = {
				writeFile: vi.fn().mockRejectedValue(new Error('Disk full')),
				unlink: vi.fn().mockResolvedValue(undefined),
			}

			await expect(backup('/output/path', {
				sqlite: mockSqlite,
				makeDir: mockMakeDir,
				fs: mockFs,
				dbPath: '/test/db.sqlite',
			})).rejects.toThrow('Disk full')
		})

		it('should ignore ENOENT error when file does not exist for trashed note', async () => {
			mockSqlite = makeMockSqlite([
				{ id: 1, title: 'Trashed Note', text: 'Content', tag: null, trashed: 1 },
			])
			mockMakeDir = makeMockMakeDir()
			const enoentError = new Error('ENOENT: no such file or directory')
			enoentError.code = 'ENOENT'
			mockFs = {
				writeFile: vi.fn().mockResolvedValue(undefined),
				unlink: vi.fn().mockRejectedValue(enoentError),
			}

			await expect(backup('/output/path', {
				sqlite: mockSqlite,
				makeDir: mockMakeDir,
				fs: mockFs,
				dbPath: '/test/db.sqlite',
			})).resolves.not.toThrow()
		})

		it('should propagate non-ENOENT errors when fs.unlink fails to delete trashed note', async () => {
			mockSqlite = makeMockSqlite([
				{ id: 1, title: 'Trashed Note', text: 'Content', tag: null, trashed: 1 },
			])
			mockMakeDir = makeMockMakeDir()
			const permissionError = new Error('EACCES: permission denied')
			permissionError.code = 'EACCES'
			mockFs = {
				writeFile: vi.fn().mockResolvedValue(undefined),
				unlink: vi.fn().mockRejectedValue(permissionError),
			}

			await expect(backup('/output/path', {
				sqlite: mockSqlite,
				makeDir: mockMakeDir,
				fs: mockFs,
				dbPath: '/test/db.sqlite',
			})).rejects.toThrow('EACCES')
		})

		it('should propagate error when makeDir fails to create tag directory', async () => {
			mockSqlite = makeMockSqlite([
				{ id: 1, title: 'Note', text: 'Content', tag: 'work', trashed: 0 },
			])
			let callCount = 0
			const mockMakeDirFailOnSecond = vi.fn().mockImplementation(() => {
				callCount++
				if (callCount === 1) {
					return Promise.resolve(undefined)
				}
				return Promise.reject(new Error('Cannot create tag directory'))
			})
			mockFs = makeMockFs()

			await expect(backup('/output/path', {
				useTagsAsDirectories: true,
				sqlite: mockSqlite,
				makeDir: mockMakeDirFailOnSecond,
				fs: mockFs,
				dbPath: '/test/db.sqlite',
			})).rejects.toThrow('Cannot create tag directory')
		})
	})

	describe('edge cases with note content', () => {
		it('should handle note with empty string text content', async () => {
			mockSqlite = makeMockSqlite([
				{ id: 1, title: 'Empty Note', text: '', tag: null, trashed: 0 },
			])
			mockMakeDir = makeMockMakeDir()
			mockFs = makeMockFs()

			await backup('/output/path', {
				sqlite: mockSqlite,
				makeDir: mockMakeDir,
				fs: mockFs,
				dbPath: '/test/db.sqlite',
			})

			expect(mockFs.writeFile).toHaveBeenCalledWith(
				path.join('/output/path', 'Empty Note.md'),
				'',
				{ encoding: 'utf8' }
			)
		})

		it('should handle note with null text content', async () => {
			mockSqlite = makeMockSqlite([
				{ id: 1, title: 'Null Content Note', text: null, tag: null, trashed: 0 },
			])
			mockMakeDir = makeMockMakeDir()
			mockFs = makeMockFs()

			await backup('/output/path', {
				sqlite: mockSqlite,
				makeDir: mockMakeDir,
				fs: mockFs,
				dbPath: '/test/db.sqlite',
			})

			expect(mockFs.writeFile).toHaveBeenCalledWith(
				path.join('/output/path', 'Null Content Note.md'),
				null,
				{ encoding: 'utf8' }
			)
		})

		it('should use untitled-{id}.md for note with empty string title', async () => {
			mockSqlite = makeMockSqlite([
				{ id: 123, title: '', text: 'Content', tag: null, trashed: 0 },
			])
			mockMakeDir = makeMockMakeDir()
			mockFs = makeMockFs()

			await backup('/output/path', {
				sqlite: mockSqlite,
				makeDir: mockMakeDir,
				fs: mockFs,
				dbPath: '/test/db.sqlite',
			})

			expect(mockFs.writeFile).toHaveBeenCalledWith(
				path.join('/output/path', 'untitled-123.md'),
				'Content',
				{ encoding: 'utf8' }
			)
		})

		it('should propagate error when note has null title causing buildFilename to throw', async () => {
			mockSqlite = makeMockSqlite([
				{ id: 1, title: null, text: 'Content', tag: null, trashed: 0 },
			])
			mockMakeDir = makeMockMakeDir()
			mockFs = makeMockFs()

			await expect(backup('/output/path', {
				sqlite: mockSqlite,
				makeDir: mockMakeDir,
				fs: mockFs,
				dbPath: '/test/db.sqlite',
			})).rejects.toThrow(TypeError)
		})

		it('should handle same note appearing with multiple different tags', async () => {
			mockSqlite = makeMockSqlite([
				{ id: 1, title: 'Multi-tag Note', text: 'Content', tag: 'work', trashed: 0 },
				{ id: 1, title: 'Multi-tag Note', text: 'Content', tag: 'personal', trashed: 0 },
			])
			mockMakeDir = makeMockMakeDir()
			mockFs = makeMockFs()

			await backup('/output/path', {
				useTagsAsDirectories: true,
				sqlite: mockSqlite,
				makeDir: mockMakeDir,
				fs: mockFs,
				dbPath: '/test/db.sqlite',
			})

			expect(mockFs.writeFile).toHaveBeenCalledTimes(2)
			expect(mockFs.writeFile).toHaveBeenCalledWith(
				path.join('/output/path', 'work', 'Multi-tag Note.md'),
				'Content',
				{ encoding: 'utf8' }
			)
			expect(mockFs.writeFile).toHaveBeenCalledWith(
				path.join('/output/path', 'personal', 'Multi-tag Note.md'),
				'Content',
				{ encoding: 'utf8' }
			)
		})

		it('should handle note with very long title that requires truncation', async () => {
			const longTitle = 'a'.repeat(300)
			mockSqlite = makeMockSqlite([
				{ id: 1, title: longTitle, text: 'Content', tag: null, trashed: 0 },
			])
			mockMakeDir = makeMockMakeDir()
			mockFs = makeMockFs()

			await backup('/output/path', {
				sqlite: mockSqlite,
				makeDir: mockMakeDir,
				fs: mockFs,
				dbPath: '/test/db.sqlite',
			})

			const writtenPath = mockFs.writeFile.mock.calls[0][0]
			const filename = path.basename(writtenPath)
			expect(Buffer.byteLength(filename, 'utf8')).toBeLessThanOrEqual(255)
			expect(filename.endsWith('.md')).toBe(true)
		})

		it('should use untitled-{id}.md for whitespace-only title', async () => {
			mockSqlite = makeMockSqlite([
				{ id: 456, title: '   ', text: 'Content', tag: null, trashed: 0 },
			])
			mockMakeDir = makeMockMakeDir()
			mockFs = makeMockFs()

			await backup('/output/path', {
				sqlite: mockSqlite,
				makeDir: mockMakeDir,
				fs: mockFs,
				dbPath: '/test/db.sqlite',
			})

			expect(mockFs.writeFile).toHaveBeenCalledWith(
				path.join('/output/path', 'untitled-456.md'),
				'Content',
				{ encoding: 'utf8' }
			)
		})

		it('should delete untitled-{id}.md for trashed empty-title note', async () => {
			mockSqlite = makeMockSqlite([
				{ id: 789, title: '', text: 'Content', tag: null, trashed: 1 },
			])
			mockMakeDir = makeMockMakeDir()
			mockFs = makeMockFs()

			await backup('/output/path', {
				sqlite: mockSqlite,
				makeDir: mockMakeDir,
				fs: mockFs,
				dbPath: '/test/db.sqlite',
			})

			expect(mockFs.unlink).toHaveBeenCalledWith(
				path.join('/output/path', 'untitled-789.md')
			)
		})

		it('should write untitled-{id}.md to tag directory when useTagsAsDirectories is true', async () => {
			mockSqlite = makeMockSqlite([
				{ id: 111, title: '   ', text: 'Content', tag: 'work', trashed: 0 },
			])
			mockMakeDir = makeMockMakeDir()
			mockFs = makeMockFs()

			await backup('/output/path', {
				useTagsAsDirectories: true,
				sqlite: mockSqlite,
				makeDir: mockMakeDir,
				fs: mockFs,
				dbPath: '/test/db.sqlite',
			})

			expect(mockFs.writeFile).toHaveBeenCalledWith(
				path.join('/output/path', 'work', 'untitled-111.md'),
				'Content',
				{ encoding: 'utf8' }
			)
		})
	})

	describe('filename deduplication to prevent overwrites', () => {
		it('should append -1 suffix to second note with same title', async () => {
			mockSqlite = makeMockSqlite([
				{ id: 1, title: 'Duplicate', text: 'Content 1', tag: null, trashed: 0 },
				{ id: 2, title: 'Duplicate', text: 'Content 2', tag: null, trashed: 0 },
			])
			mockMakeDir = makeMockMakeDir()
			mockFs = makeMockFs()

			await backup('/output/path', {
				sqlite: mockSqlite,
				makeDir: mockMakeDir,
				fs: mockFs,
				dbPath: '/test/db.sqlite',
			})

			expect(mockFs.writeFile).toHaveBeenCalledWith(
				path.join('/output/path', 'Duplicate.md'),
				'Content 1',
				{ encoding: 'utf8' }
			)
			expect(mockFs.writeFile).toHaveBeenCalledWith(
				path.join('/output/path', 'Duplicate-1.md'),
				'Content 2',
				{ encoding: 'utf8' }
			)
		})

		it('should append incrementing suffixes for multiple notes with same title', async () => {
			mockSqlite = makeMockSqlite([
				{ id: 1, title: 'Same', text: 'Content 1', tag: null, trashed: 0 },
				{ id: 2, title: 'Same', text: 'Content 2', tag: null, trashed: 0 },
				{ id: 3, title: 'Same', text: 'Content 3', tag: null, trashed: 0 },
				{ id: 4, title: 'Same', text: 'Content 4', tag: null, trashed: 0 },
			])
			mockMakeDir = makeMockMakeDir()
			mockFs = makeMockFs()

			await backup('/output/path', {
				sqlite: mockSqlite,
				makeDir: mockMakeDir,
				fs: mockFs,
				dbPath: '/test/db.sqlite',
			})

			expect(mockFs.writeFile).toHaveBeenCalledTimes(4)
			expect(mockFs.writeFile).toHaveBeenCalledWith(
				path.join('/output/path', 'Same.md'),
				'Content 1',
				{ encoding: 'utf8' }
			)
			expect(mockFs.writeFile).toHaveBeenCalledWith(
				path.join('/output/path', 'Same-1.md'),
				'Content 2',
				{ encoding: 'utf8' }
			)
			expect(mockFs.writeFile).toHaveBeenCalledWith(
				path.join('/output/path', 'Same-2.md'),
				'Content 3',
				{ encoding: 'utf8' }
			)
			expect(mockFs.writeFile).toHaveBeenCalledWith(
				path.join('/output/path', 'Same-3.md'),
				'Content 4',
				{ encoding: 'utf8' }
			)
		})

		it('should not add suffix for same title in different tag directories', async () => {
			mockSqlite = makeMockSqlite([
				{ id: 1, title: 'Note', text: 'Work content', tag: 'work', trashed: 0 },
				{ id: 2, title: 'Note', text: 'Personal content', tag: 'personal', trashed: 0 },
			])
			mockMakeDir = makeMockMakeDir()
			mockFs = makeMockFs()

			await backup('/output/path', {
				useTagsAsDirectories: true,
				sqlite: mockSqlite,
				makeDir: mockMakeDir,
				fs: mockFs,
				dbPath: '/test/db.sqlite',
			})

			expect(mockFs.writeFile).toHaveBeenCalledWith(
				path.join('/output/path', 'work', 'Note.md'),
				'Work content',
				{ encoding: 'utf8' }
			)
			expect(mockFs.writeFile).toHaveBeenCalledWith(
				path.join('/output/path', 'personal', 'Note.md'),
				'Personal content',
				{ encoding: 'utf8' }
			)
		})

		it('should add suffix for same title in same tag directory', async () => {
			mockSqlite = makeMockSqlite([
				{ id: 1, title: 'Note', text: 'Content 1', tag: 'work', trashed: 0 },
				{ id: 2, title: 'Note', text: 'Content 2', tag: 'work', trashed: 0 },
			])
			mockMakeDir = makeMockMakeDir()
			mockFs = makeMockFs()

			await backup('/output/path', {
				useTagsAsDirectories: true,
				sqlite: mockSqlite,
				makeDir: mockMakeDir,
				fs: mockFs,
				dbPath: '/test/db.sqlite',
			})

			expect(mockFs.writeFile).toHaveBeenCalledWith(
				path.join('/output/path', 'work', 'Note.md'),
				'Content 1',
				{ encoding: 'utf8' }
			)
			expect(mockFs.writeFile).toHaveBeenCalledWith(
				path.join('/output/path', 'work', 'Note-1.md'),
				'Content 2',
				{ encoding: 'utf8' }
			)
		})

		it('should truncate base filename when adding suffix would exceed 255 bytes', async () => {
			const longTitle = 'a'.repeat(251)
			mockSqlite = makeMockSqlite([
				{ id: 1, title: longTitle, text: 'Content 1', tag: null, trashed: 0 },
				{ id: 2, title: longTitle, text: 'Content 2', tag: null, trashed: 0 },
			])
			mockMakeDir = makeMockMakeDir()
			mockFs = makeMockFs()

			await backup('/output/path', {
				sqlite: mockSqlite,
				makeDir: mockMakeDir,
				fs: mockFs,
				dbPath: '/test/db.sqlite',
			})

			const calls = mockFs.writeFile.mock.calls
			expect(calls).toHaveLength(2)

			const firstFilename = path.basename(calls[0][0])
			expect(firstFilename).toBe(longTitle + '.md')

			const secondFilename = path.basename(calls[1][0])
			expect(Buffer.byteLength(secondFilename, 'utf8')).toBeLessThanOrEqual(255)
			expect(secondFilename).toMatch(/-1\.md$/)
		})

		it('should deduplicate titles that normalize to same filename via slash replacement', async () => {
			mockSqlite = makeMockSqlite([
				{ id: 1, title: 'a/b', text: 'Content 1', tag: null, trashed: 0 },
				{ id: 2, title: 'a-b', text: 'Content 2', tag: null, trashed: 0 },
			])
			mockMakeDir = makeMockMakeDir()
			mockFs = makeMockFs()

			await backup('/output/path', {
				sqlite: mockSqlite,
				makeDir: mockMakeDir,
				fs: mockFs,
				dbPath: '/test/db.sqlite',
			})

			expect(mockFs.writeFile).toHaveBeenCalledWith(
				path.join('/output/path', 'a-b.md'),
				'Content 1',
				{ encoding: 'utf8' }
			)
			expect(mockFs.writeFile).toHaveBeenCalledWith(
				path.join('/output/path', 'a-b-1.md'),
				'Content 2',
				{ encoding: 'utf8' }
			)
		})

		it('should deduplicate trashed notes for correct file deletion', async () => {
			mockSqlite = makeMockSqlite([
				{ id: 1, title: 'To Delete', text: 'Content 1', tag: null, trashed: 1 },
				{ id: 2, title: 'To Delete', text: 'Content 2', tag: null, trashed: 1 },
			])
			mockMakeDir = makeMockMakeDir()
			mockFs = makeMockFs()

			await backup('/output/path', {
				sqlite: mockSqlite,
				makeDir: mockMakeDir,
				fs: mockFs,
				dbPath: '/test/db.sqlite',
			})

			expect(mockFs.unlink).toHaveBeenCalledWith(
				path.join('/output/path', 'To Delete.md')
			)
			expect(mockFs.unlink).toHaveBeenCalledWith(
				path.join('/output/path', 'To Delete-1.md')
			)
		})

		it('should handle large suffix numbers without exceeding byte limit', async () => {
			const notes = Array.from({ length: 15 }, (_, i) => ({
				id: i + 1,
				title: 'a'.repeat(250),
				text: `Content ${i}`,
				tag: null,
				trashed: 0,
			}))
			mockSqlite = makeMockSqlite(notes)
			mockMakeDir = makeMockMakeDir()
			mockFs = makeMockFs()

			await backup('/output/path', {
				sqlite: mockSqlite,
				makeDir: mockMakeDir,
				fs: mockFs,
				dbPath: '/test/db.sqlite',
			})

			const calls = mockFs.writeFile.mock.calls
			for (const call of calls) {
				const filename = path.basename(call[0])
				expect(Buffer.byteLength(filename, 'utf8')).toBeLessThanOrEqual(255)
			}
		})
	})
})
