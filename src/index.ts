import {
  unlinkSync,
  readdirSync,
  mkdirSync,
  rmdirSync,
  statSync
} from 'fs';
import rimraf from 'rimraf';
import { sync as symlinkOrCopySync } from 'symlink-or-copy';
import HeimdallLogger from 'heimdalljs-logger';
import FSTree from 'fs-tree-diff';
import Entry from './entry';
import heimdall from 'heimdalljs';
import CanSymLink from 'can-symlink';

const canSymlink = CanSymLink();
const defaultIsEqual = FSTree.defaultIsEqual;

function ApplyPatchesSchema(): void {
  this.mkdir = 0;
  this.rmdir = 0;
  this.unlink = 0;
  this.change = 0;
  this.create = 0;
  this.other = 0;
  this.processed = 0;
  this.linked = 0;
}

function unlinkOrRmrfSync(path): void {
  if (canSymlink) {
    unlinkSync(path);
  } else {
    rimraf.sync(path);
  }
}

export default class MergeTrees {
  public options: any;
  public inputPaths: string[];
  public outputPath: string;

  private _logger: any;
  private _currentTree: any;

  constructor(inputPaths: string[], outputPath: string, options?: any) {
    options = options || {};
    const name = `merge-trees: ${options.annotation || ''}`;
    if (!Array.isArray(inputPaths)) {
      throw new TypeError(`${name}: Expected array, got: [${inputPaths}]`);
    }

    this._logger = HeimdallLogger(name);

    this.inputPaths = inputPaths;
    this.outputPath = outputPath;
    this.options = options;
    this._currentTree = FSTree.fromPaths([]);
  }

  public merge(): void {
    this._logger.debug('deriving patches');
    let instrumentation = heimdall.start('derivePatches');

    const fileInfos = this._mergeRelativePath('');
    const entries = fileInfos.map((fileInfo) => fileInfo.entry);

    const newTree = FSTree.fromEntries(entries);
    const patches = this._currentTree.calculatePatch(newTree, isEqual);

    instrumentation.stats.patches = patches.length;
    instrumentation.stats.entries = entries.length;

    instrumentation.stop();

    this._currentTree = newTree;

    instrumentation = heimdall.start('applyPatches', ApplyPatchesSchema);

    try {
      this._logger.debug('applying patches');
      this._applyPatch(patches, instrumentation.stats);
    } catch (e) {
      this._logger.warn('patch application failed, starting from scratch');
      // Whatever the failure, start again and do a complete build next time
      this._currentTree = FSTree.fromPaths([]);
      rimraf.sync(this.outputPath);
      throw e;
    }

    instrumentation.stop();
  }

  public _mergeRelativePath(baseDir: string, possibleIndices?: any): any[] {
    const inputPaths = this.inputPaths;
    const overwrite = this.options.overwrite;
    const result = [];
    const isBaseCase = (possibleIndices === undefined);

    // baseDir has a trailing path.sep if non-empty
    let fileName;

    // Array of readdir arrays
    const names = inputPaths.map((inputPath, index) => {
      if (possibleIndices == null || possibleIndices.indexOf(index) !== -1) {
        return readdirSync(inputPath + '/' + baseDir).sort();
      } else {
        return [];
      }
    });

    // Guard against conflicting capitalizations
    const lowerCaseNames = {};
    for (let i = 0; i < this.inputPaths.length; i++) {
      for (let j = 0; j < names[i].length; j++) {
        fileName = names[i][j];
        const lowerCaseName = fileName.toLowerCase();
        // Note: We are using .toLowerCase to approximate the case
        // insensitivity behavior of HFS+ and NTFS. While .toLowerCase is at
        // least Unicode aware, there are probably better-suited functions.
        if (lowerCaseNames[lowerCaseName] === undefined) {
          lowerCaseNames[lowerCaseName] = {
            index: i,
            originalName: fileName
          };
        } else {
          const originalIndex = lowerCaseNames[lowerCaseName].index;
          const originalName = lowerCaseNames[lowerCaseName].originalName;
          if (originalName !== fileName) {
            throw new Error('Merge error: conflicting capitalizations:\n'
                            + baseDir + originalName + ' in ' + this.inputPaths[originalIndex] + '\n'
                            + baseDir + fileName + ' in ' + this.inputPaths[i] + '\n'
                            + 'Remove one of the files and re-add it with matching capitalization.\n'
                            + 'We are strict about this to avoid divergent behavior '
                            + 'between case-insensitive Mac/Windows and case-sensitive Linux.'
                           );
          }
        }
      }
    }
    // From here on out, no files and directories exist with conflicting
    // capitalizations, which means we can use `===` without .toLowerCase
    // normalization.

    // Accumulate fileInfo hashes of { isDirectory, indices }.
    // Also guard against conflicting file types and overwriting.
    const fileInfo = {};
    let inputPath;
    let infoHash;

    for (let i = 0; i < inputPaths.length; i++) {
      inputPath = inputPaths[i];
      for (let j = 0; j < names[i].length; j++) {
        fileName = names[i][j];

        // TODO: walk backwards to skip stating files we will just drop anyways
        const entry = buildEntry(baseDir + fileName, inputPath);
        const isDirectory = entry.isDirectory();

        if (fileInfo[fileName] == null) {
          fileInfo[fileName] = {
            entry,
            isDirectory,
            indices: [i] // indices into inputPaths in which this file exists
          };
        } else {
          fileInfo[fileName].entry = entry;
          fileInfo[fileName].indices.push(i);

          // Guard against conflicting file types
          const originallyDirectory = fileInfo[fileName].isDirectory;
          if (originallyDirectory !== isDirectory) {
            throw new Error('Merge error: conflicting file types: ' + baseDir + fileName
                            + ' is a ' + (originallyDirectory ? 'directory' : 'file')
                            + ' in ' + this.inputPaths[fileInfo[fileName].indices[0]]
                            + ' but a ' + (isDirectory ? 'directory' : 'file')
                            + ' in ' + this.inputPaths[i] + '\n'
                            + 'Remove or rename either of those.'
                           );
          }

          // Guard against overwriting when disabled
          if (!isDirectory && !overwrite) {
            throw new Error('Merge error: '
                            + 'file ' + baseDir + fileName + ' exists in '
                            + this.inputPaths[fileInfo[fileName].indices[0]] + ' and ' + this.inputPaths[i] + '\n'
                            + 'Pass option { overwrite: true } to mergeTrees in order '
                            + 'to have the latter file win.'
                           );
          }
        }
      }
    }

    // Done guarding against all error conditions. Actually merge now.
    for (let i = 0; i < this.inputPaths.length; i++) {
      for (let j = 0; j < names[i].length; j++) {
        fileName = names[i][j];
        infoHash = fileInfo[fileName];

        if (infoHash.isDirectory) {
          if (infoHash.indices.length === 1 && canSymlink) {
            // This directory appears in only one tree: we can symlink it without
            // reading the full tree
            infoHash.entry.linkDir = true;
            result.push(infoHash);
          } else {
            if (infoHash.indices[0] === i) { // avoid duplicate recursion
              const subEntries = this._mergeRelativePath(`${baseDir + fileName}/`, infoHash.indices);

              // FSTreeDiff requires intermediate directory entries, so push
              // `infoHash` (this dir) as well as sub entries.
              result.push(infoHash);
              result.push.apply(result, subEntries);
            }
          }
        } else { // isFile
          if (infoHash.indices[infoHash.indices.length - 1] === i) {
            result.push(infoHash);
          } else {
            // This file exists in a later inputPath. Do nothing here to have the
            // later file win out and thus "overwrite" the earlier file.
          }
        }
      }
    }

    if (isBaseCase) {
      // FSTreeDiff requires entries to be sorted by `relativePath`.
      return result.sort((a, b) => {
        const pathA = a.entry.relativePath;
        const pathB = b.entry.relativePath;

        if (pathA === pathB) {
          return 0;
        } else if (pathA < pathB) {
          return -1;
        } else {
          return 1;
        }
      });
    } else {
      return result;
    }
  }

  private _applyPatch(patch: any[], instrumentation: any): void {
    patch.forEach((p) => {
      const operation = p[0];
      const relativePath = p[1];
      const entry = p[2];

      const outputFilePath = `${this.outputPath}/${relativePath}`;
      const inputFilePath = `${entry && entry.basePath}/${relativePath}`;

      switch (operation) {
        case 'mkdir':     {
          instrumentation.mkdir++;
          return this._applyMkdir(entry, inputFilePath, outputFilePath);
        }
        case 'rmdir':   {
          instrumentation.rmdir++;
          return this._applyRmdir(entry, inputFilePath, outputFilePath);
        }
        case 'unlink':  {
          instrumentation.unlink++;
          return unlinkSync(outputFilePath);
        }
        case 'create':    {
          instrumentation.create++;
          return symlinkOrCopySync(inputFilePath, outputFilePath);
        }
        case 'change':    {
          instrumentation.change++;
          return this._applyChange(entry, inputFilePath, outputFilePath);
        }
        default:
          return {};
      }
    }, this);
  }

  private _applyMkdir(entry: Entry, inputFilePath: string, outputFilePath: string): void {
    if (entry.linkDir) {
      return symlinkOrCopySync(inputFilePath, outputFilePath);
    } else {
      return mkdirSync(outputFilePath);
    }
  }

  private _applyRmdir(entry: Entry, inputFilePath: string, outputFilePath: string): void {
    if (entry.linkDir) {
      return unlinkOrRmrfSync(outputFilePath);
    } else {
      return rmdirSync(outputFilePath);
    }
  }

  private _applyChange(entry: Entry, inputFilePath: string, outputFilePath: string): void {
    if (entry.isDirectory()) {
      if (entry.linkDir) {
        // directory copied -> link
        rmdirSync(outputFilePath);
        return symlinkOrCopySync(inputFilePath, outputFilePath);
      } else {
        // directory link -> copied
        //
        // we don't check for `canSymlink` here because that is handled in
        // `isLinkStateEqual`.  If symlinking is not supported we will not get
        // directory change operations
        unlinkSync(outputFilePath);
        mkdirSync(outputFilePath);
        return;
      }
    } else {
      // file changed
      unlinkSync(outputFilePath);
      return symlinkOrCopySync(inputFilePath, outputFilePath);
    }
  }
}

function isLinkStateEqual(entryA: Entry, entryB: Entry): boolean {
  // We don't symlink files, only directories
  if (!(entryA.isDirectory() && entryB.isDirectory())) {
    return true;
  }

  // We only symlink on systems that support it
  if (!canSymlink) {
    return true;
  }

  // This can change between rebuilds if a dir goes from existing in multiple
  // input sources to exactly one input source, or vice versa
  return entryA.linkDir === entryB.linkDir;
}

function isEqual(entryA: Entry, entryB: Entry): boolean {
  return defaultIsEqual(entryA, entryB) && isLinkStateEqual(entryA, entryB);
}

function buildEntry(relativePath: string, basePath: string): Entry {
  const stat = statSync(`${basePath}/${relativePath}`);
  return new Entry(relativePath, basePath, stat.mode, stat.size, stat.mtime);
}
