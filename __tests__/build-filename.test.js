import { describe, it, expect } from 'vitest'
import buildFilename from '../build-filename.js'

describe('buildFilename', () => {
	describe('basic functionality', () => {
		it('should append .md extension to title', () => {
			expect(buildFilename('My Note')).toBe('My Note.md')
		})

		it('should return just .md for empty string', () => {
			expect(buildFilename('')).toBe('.md')
		})
	})

	describe('slash replacement', () => {
		it('should replace forward slash with dash', () => {
			expect(buildFilename('23/01/2020')).toBe('23-01-2020.md')
		})

		it('should handle consecutive slashes', () => {
			expect(buildFilename('note//title')).toBe('note--title.md')
		})

		it('should handle leading slash', () => {
			expect(buildFilename('/leading')).toBe('-leading.md')
		})

		it('should handle trailing slash', () => {
			expect(buildFilename('trailing/')).toBe('trailing-.md')
		})

		it('should handle only slashes', () => {
			expect(buildFilename('///')).toBe('---.md')
		})
	})

	describe('special characters', () => {
		it('should preserve special characters other than slash', () => {
			expect(buildFilename('note!@#$%^&*()')).toBe('note!@#$%^&*().md')
		})

		it('should preserve backslashes (not replaced)', () => {
			expect(buildFilename('path\\to\\note')).toBe('path\\to\\note.md')
		})

		it('should preserve unicode characters', () => {
			expect(buildFilename('nota en español')).toBe('nota en español.md')
		})

		it('should preserve emoji', () => {
			expect(buildFilename('My Note 🐻')).toBe('My Note 🐻.md')
		})

		it('should preserve whitespace', () => {
			expect(buildFilename('   ')).toBe('   .md')
		})

		it('should preserve newlines', () => {
			expect(buildFilename('line1\nline2')).toBe('line1\nline2.md')
		})

		it('should preserve tabs', () => {
			expect(buildFilename('col1\tcol2')).toBe('col1\tcol2.md')
		})
	})

	describe('titles that already end with .md', () => {
		it('should add .md even if title already has .md', () => {
			expect(buildFilename('note.md')).toBe('note.md.md')
		})
	})

	describe('filename length truncation', () => {
		it('should not truncate short titles', () => {
			const shortTitle = 'Short Note'
			expect(buildFilename(shortTitle)).toBe('Short Note.md')
		})

		it('should truncate titles exceeding 251 bytes to fit within filesystem limits', () => {
			const longTitle = 'a'.repeat(300)
			const result = buildFilename(longTitle)
			expect(Buffer.byteLength(result, 'utf8')).toBeLessThanOrEqual(255)
		})

		it('should truncate to exactly 255 bytes including .md extension', () => {
			const longTitle = 'a'.repeat(300)
			const result = buildFilename(longTitle)
			expect(result).toBe('a'.repeat(251) + '.md')
		})

		it('should handle multi-byte unicode characters when truncating', () => {
			const unicodeTitle = '🐻'.repeat(100)
			const result = buildFilename(unicodeTitle)
			expect(Buffer.byteLength(result, 'utf8')).toBeLessThanOrEqual(255)
			expect(result.endsWith('.md')).toBe(true)
		})

		it('should not split multi-byte characters when truncating', () => {
			const unicodeTitle = 'a'.repeat(249) + '🐻'
			const result = buildFilename(unicodeTitle)
			expect(Buffer.byteLength(result, 'utf8')).toBeLessThanOrEqual(255)
			expect(result.endsWith('.md')).toBe(true)
			expect(() => Buffer.from(result, 'utf8').toString()).not.toThrow()
		})

		it('should replace slashes and truncate long titles', () => {
			const longTitleWithSlashes = ('a/b').repeat(150)
			const result = buildFilename(longTitleWithSlashes)
			expect(result).not.toContain('/')
			expect(Buffer.byteLength(result, 'utf8')).toBeLessThanOrEqual(255)
		})
	})

	describe('edge cases', () => {
		it('should handle title at exactly 251 bytes', () => {
			const exactTitle = 'a'.repeat(251)
			const result = buildFilename(exactTitle)
			expect(result).toBe(exactTitle + '.md')
			expect(Buffer.byteLength(result, 'utf8')).toBe(254)
		})

		it('should handle title at exactly 252 bytes (needs truncation)', () => {
			const slightlyLongTitle = 'a'.repeat(252)
			const result = buildFilename(slightlyLongTitle)
			expect(result).toBe('a'.repeat(251) + '.md')
		})
	})

	describe('error handling', () => {
		it('should throw TypeError for null input', () => {
			expect(() => buildFilename(null)).toThrow(TypeError)
		})

		it('should throw TypeError for undefined input', () => {
			expect(() => buildFilename(undefined)).toThrow(TypeError)
		})

		it('should throw TypeError for number input', () => {
			expect(() => buildFilename(123)).toThrow(TypeError)
		})

		it('should throw TypeError for object input', () => {
			expect(() => buildFilename({})).toThrow(TypeError)
		})

		it('should throw TypeError for array input', () => {
			expect(() => buildFilename([])).toThrow(TypeError)
		})
	})

	describe('empty/whitespace title handling with noteId', () => {
		it('should use untitled-{noteId}.md for empty string when noteId provided', () => {
			expect(buildFilename('', 123)).toBe('untitled-123.md')
		})

		it('should use untitled-{noteId}.md for whitespace-only when noteId provided', () => {
			expect(buildFilename('   ', 456)).toBe('untitled-456.md')
		})

		it('should use untitled-{noteId}.md for tabs only when noteId provided', () => {
			expect(buildFilename('\t\t', 789)).toBe('untitled-789.md')
		})

		it('should use untitled-{noteId}.md for newlines only when noteId provided', () => {
			expect(buildFilename('\n\n', 111)).toBe('untitled-111.md')
		})

		it('should use untitled-{noteId}.md for mixed whitespace when noteId provided', () => {
			expect(buildFilename(' \t\n ', 222)).toBe('untitled-222.md')
		})

		it('should keep dashes when slashes with spaces are sanitized (not whitespace-only)', () => {
			expect(buildFilename('/ / /', 333)).toBe('- - -.md')
		})

		it('should use regular title when title has non-whitespace content', () => {
			expect(buildFilename('  My Note  ', 555)).toBe('  My Note  .md')
		})

		it('should handle noteId of 0 correctly', () => {
			expect(buildFilename('', 0)).toBe('untitled-0.md')
		})

		it('should handle very large noteId', () => {
			expect(buildFilename('', 999999999999)).toBe('untitled-999999999999.md')
		})

		it('should maintain backward compatibility when noteId is undefined', () => {
			expect(buildFilename('')).toBe('.md')
			expect(buildFilename('   ')).toBe('   .md')
		})

		it('should maintain backward compatibility when noteId is null', () => {
			expect(buildFilename('', null)).toBe('.md')
		})

		it('should truncate untitled-{noteId} if it exceeds MAX_BYTES', () => {
			const hugeNoteId = '9'.repeat(300)
			const result = buildFilename('', hugeNoteId)
			expect(Buffer.byteLength(result, 'utf8')).toBeLessThanOrEqual(255)
			expect(result.startsWith('untitled-')).toBe(true)
			expect(result.endsWith('.md')).toBe(true)
		})
	})
})
