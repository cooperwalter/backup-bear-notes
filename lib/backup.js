const path = require('path')
const buildFilename = require('../build-filename')

async function backup(outputDirectory, options = {}) {
	const {
		useTagsAsDirectories = false,
		sqlite,
		makeDir,
		fs,
		dbPath,
	} = options

	if (!sqlite || !makeDir || !fs || !dbPath) {
		throw new Error('Missing required dependencies: sqlite, makeDir, fs, dbPath')
	}

	await makeDir(outputDirectory)

	const db = await sqlite.open(dbPath)

	const rows = await db.all(`
		SELECT
			ZSFNOTE.ZTITLE AS title,
			ZSFNOTE.ZTEXT AS text,
			ZSFNOTETAG.ZTITLE AS tag,
			ZSFNOTE.ZTRASHED AS trashed
		FROM
			ZSFNOTE
		LEFT JOIN Z_7TAGS ON ZSFNOTE.Z_PK = Z_7TAGS.Z_7NOTES
		LEFT JOIN ZSFNOTETAG ON Z_7TAGS.Z_14TAGS = ZSFNOTETAG.Z_PK
		ORDER BY LENGTH(tag)`)

	if (useTagsAsDirectories) {
		const tags = Array.from(new Set(rows.map(row => row.tag)))

		await Promise.all(tags.map(tag => {
			const tagDirectory = tag ? tag : 'untagged'

			return makeDir(path.join(outputDirectory, tagDirectory))
		}))
	}

	return Promise.all(
		rows.map(({ title, text, tag, trashed }) => {
			const filename = buildFilename(title)
			const destinationDirectory = !useTagsAsDirectories ?
				outputDirectory : path.join(outputDirectory, tag || 'untagged')

			if (trashed) {
				return fs.unlink(path.join(destinationDirectory, filename))
			}

			return fs.writeFile(path.join(destinationDirectory, filename), text, { encoding: 'utf8' })
		})
	)
}

module.exports = { backup }
