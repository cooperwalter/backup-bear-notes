#!/usr/bin/env node

import path from 'node:path';
import fs from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import { open as sqliteOpen } from 'sqlite';
import sqlite3 from 'sqlite3';
import { makeDirectory } from 'make-dir';
import untildify from 'untildify';
import mri from 'mri';
import { backup } from './lib/backup.js';
import { fileURLToPath } from 'node:url';

const DEFAULT_BEAR_DB = untildify(
  `~/Library/Group Containers/9K33E3U3T4.net.shinyfrog.bear/Application Data/database.sqlite`
);

const DEFAULT_LOCAL_FILES_PATH = path.join(path.dirname(DEFAULT_BEAR_DB), 'Local Files');

interface CliArgs {
  'use-tags-as-directories'?: boolean;
  _: string[];
}

const thisFile = fileURLToPath(import.meta.url);
const argFile = process.argv[1];
const isMainModule = argFile === thisFile || realpathSync(argFile) === realpathSync(thisFile);

if (isMainModule) {
  const args = mri<CliArgs>(process.argv.slice(2));
  const outputDirectory = args._[0];

  if (!outputDirectory) {
    process.stderr.write(`You must provide an output directory\n`);
    process.exit(1);
  }

  const sqliteModule = {
    open: (filename: string) => sqliteOpen({ filename, driver: sqlite3.Database }),
  };

  backup(untildify(outputDirectory), {
    useTagsAsDirectories: args['use-tags-as-directories'],
    sqlite: sqliteModule,
    makeDir: makeDirectory,
    fs: fs as Parameters<typeof backup>[1]['fs'],
    dbPath: DEFAULT_BEAR_DB,
    localFilesPath: DEFAULT_LOCAL_FILES_PATH,
  }).then((writeFileResults) => {
    console.log(`Backed up ${writeFileResults.length} notes.`);
  }).catch((err: Error) => {
    process.nextTick(() => {
      throw err;
    });
  });
}

export { backup, DEFAULT_BEAR_DB, DEFAULT_LOCAL_FILES_PATH };
