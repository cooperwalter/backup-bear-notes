#!/usr/bin/env node

const path = require('path')
const sqlite = require('sqlite')
const makeDir = require('make-dir')
const pify = require('pify')
const fs = pify(require('fs'))
const untildify = require('untildify')
const mri = require('mri')
const { backup } = require('./lib/backup')

const DEFAULT_BEAR_DB = untildify(
	`~/Library/Group Containers/9K33E3U3T4.net.shinyfrog.bear/Application Data/database.sqlite`
)

const DEFAULT_LOCAL_FILES_PATH = path.join(path.dirname(DEFAULT_BEAR_DB), 'Local Files')

if (require.main === module) {
	const { 'use-tags-as-directories': useTagsAsDirectories } = mri(process.argv.slice(2))
	const [ ,, outputDirectory ] = process.argv

	if (!outputDirectory) {
		process.stderr.write(`You must provide an output directory\n`)
		process.exit(1)
	}

	backup(untildify(outputDirectory), {
		useTagsAsDirectories,
		sqlite,
		makeDir,
		fs,
		dbPath: DEFAULT_BEAR_DB,
		localFilesPath: DEFAULT_LOCAL_FILES_PATH,
	}).then(writeFileResults => {
		console.log(`Backed up ${ writeFileResults.length } notes.`)
	}).catch(err => {
		process.nextTick(() => {
			throw err
		})
	})
}

module.exports = { backup, DEFAULT_BEAR_DB, DEFAULT_LOCAL_FILES_PATH }
