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
				{ title: 'Note 1', text: 'Content 1', tag: 'work', trashed: 0 },
				{ title: 'Note 2', text: 'Content 2', tag: 'personal', trashed: 0 },
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
				{ title: 'Note 1', text: 'Content 1', tag: null, trashed: 0 },
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
				{ title: 'Test Note', text: 'Note content', tag: null, trashed: 0 },
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
				{ title: 'Note 1', text: 'Content 1', tag: null, trashed: 0 },
				{ title: 'Note 2', text: 'Content 2', tag: null, trashed: 0 },
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
				{ title: 'Work Note', text: 'Work content', tag: 'work', trashed: 0 },
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
				{ title: 'Untagged Note', text: 'Untagged content', tag: null, trashed: 0 },
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
				{ title: 'Trashed Note', text: 'Trashed content', tag: null, trashed: 1 },
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
				{ title: 'Trashed Work Note', text: 'Content', tag: 'work', trashed: 1 },
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
				{ title: 'Active Note', text: 'Active content', tag: null, trashed: 0 },
				{ title: 'Trashed Note', text: 'Trashed content', tag: null, trashed: 1 },
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
				{ title: 'Note 1', text: 'Content 1', tag: null, trashed: 0 },
				{ title: 'Note 2', text: 'Content 2', tag: null, trashed: 0 },
				{ title: 'Note 3', text: 'Content 3', tag: null, trashed: 1 },
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
				{ title: 'Note/With/Slashes', text: 'Content', tag: null, trashed: 0 },
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
				{ title: 'Note 1', text: 'Content 1', tag: 'work', trashed: 0 },
				{ title: 'Note 2', text: 'Content 2', tag: 'work', trashed: 0 },
				{ title: 'Note 3', text: 'Content 3', tag: 'work', trashed: 0 },
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
				{ title: 'Test Note', text: 'Content', tag: null, trashed: 0 },
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

		it('should propagate error when fs.unlink fails to delete trashed note', async () => {
			mockSqlite = makeMockSqlite([
				{ title: 'Trashed Note', text: 'Content', tag: null, trashed: 1 },
			])
			mockMakeDir = makeMockMakeDir()
			mockFs = {
				writeFile: vi.fn().mockResolvedValue(undefined),
				unlink: vi.fn().mockRejectedValue(new Error('ENOENT: no such file')),
			}

			await expect(backup('/output/path', {
				sqlite: mockSqlite,
				makeDir: mockMakeDir,
				fs: mockFs,
				dbPath: '/test/db.sqlite',
			})).rejects.toThrow('ENOENT')
		})

		it('should propagate error when makeDir fails to create tag directory', async () => {
			mockSqlite = makeMockSqlite([
				{ title: 'Note', text: 'Content', tag: 'work', trashed: 0 },
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
				{ title: 'Empty Note', text: '', tag: null, trashed: 0 },
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
				{ title: 'Null Content Note', text: null, tag: null, trashed: 0 },
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

		it('should handle note with empty string title', async () => {
			mockSqlite = makeMockSqlite([
				{ title: '', text: 'Content', tag: null, trashed: 0 },
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
				path.join('/output/path', '.md'),
				'Content',
				{ encoding: 'utf8' }
			)
		})

		it('should propagate error when note has null title causing buildFilename to throw', async () => {
			mockSqlite = makeMockSqlite([
				{ title: null, text: 'Content', tag: null, trashed: 0 },
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
				{ title: 'Multi-tag Note', text: 'Content', tag: 'work', trashed: 0 },
				{ title: 'Multi-tag Note', text: 'Content', tag: 'personal', trashed: 0 },
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
				{ title: longTitle, text: 'Content', tag: null, trashed: 0 },
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
	})
})
