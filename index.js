"use strict";

let FSUpdater = require("fs-updater");
let heimdall = require("heimdalljs");

let Directory = FSUpdater.Directory;
let DirectoryIndex = FSUpdater.DirectoryIndex;
let makeFSObject = FSUpdater.makeFSObject;

class MergeTrees {
  constructor(inputPaths, outputPath, options) {
    options = options || {};
    let name = "merge-trees:" + (options.annotation || "");
    if (!Array.isArray(inputPaths)) {
      throw new TypeError(name + ": Expected array, got: [" + inputPaths + "]");
    }

    this.inputPaths = inputPaths;
    this.outputPath = outputPath;
    this.options = options;

    this.updater = new FSUpdater(outputPath, options._fsUpdaterOptions);
  }

  merge() {
    let instrumentation = heimdall.start("MergeTrees:readInput");
    let dir = this._getMergedDirectory();
    instrumentation.stop();

    instrumentation = heimdall.start("MergeTrees:update");
    this.updater.update(dir);
    instrumentation.stop();
  }


  // Say we are iterating into the "foo" directory, which only exists in
  // this.inputPaths[1] and this.inputPaths[2]. Then baseDir will be "foo/",
  // and directoriesWithInputPaths will be
  //
  // [
  //   {
  //     fsObject: new Directory(`${this.inputPaths[1]}/foo`),
  //     inputPath: this.inputPaths[1]
  //   },
  //   {
  //     fsObject: new Directory(`${this.inputPaths[2]}/foo`),
  //     inputPath: this.inputPaths[2]
  //   }
  // ]
  //
  // The `fsObject` property is named so because later on we have a similar
  // structure that may also contain File objects.
  //
  // `baseDir` and the `inputPath` property are only used for error reporting.
  // Note that we must not use `fsObject.valueOf()` to report errors, because we
  // may have followed symlinks and thus the fsObject may not point into any of
  // the inputPaths.
  _getMergedDirectory() {
    let initialDirectoriesWithInputPaths = this.inputPaths.map(inputPath => ({
      fsObject: makeFSObject(inputPath), // Directory object
      inputPath: inputPath // remember for error reporting
    }));

    let mergedOutput = new DirectoryIndex();

    let jobs = [[initialDirectoriesWithInputPaths, "", null, mergedOutput]];

    let job;

    // eslint-disable-next-line no-cond-assign
    while (job = jobs.pop()) {
      const [directoriesWithInputPaths, basePath, parentFilename, parentOutput] = job;

      if (directoriesWithInputPaths.length === 1) {
        if (parentFilename) {
          parentOutput.set(parentFilename, directoriesWithInputPaths[0].fsObject);
        } else {
          mergedOutput = directoriesWithInputPaths[0].fsObject;
        }
        continue;
      }

      let overwrite = this.options.overwrite;

      let fileInfo = this._buildUpFileInfo(directoriesWithInputPaths, basePath, overwrite);

      let currentOutput = !parentFilename ? parentOutput : new DirectoryIndex();

      for (let [fileName, fsObjectsWithInputPaths] of fileInfo) {
        if (fsObjectsWithInputPaths[0].fsObject instanceof Directory) {
          jobs.unshift([fsObjectsWithInputPaths, `${basePath}${fileName}/`, fileName, currentOutput]);
        } else {
          // If there are multiple files, last one wins to get overwriting
          // behavior.
          let fsObject = fsObjectsWithInputPaths[fsObjectsWithInputPaths.length - 1].fsObject;

          currentOutput.set(fileName, fsObject);
        }
      }

      if (parentFilename) {
        parentOutput.set(parentFilename, currentOutput);
      }
    }

    return mergedOutput;
  }

  // fileInfo maps file names to fsObjectWithInputPaths lists. These lists
  // contain, for each instance of the file in the input directories, the
  // FSObject for that file and the inputPath (from this.inputPaths) that it
  // came from.
  _buildUpFileInfo(directoriesWithInputPaths, baseDir, overwrite) {
    let fileInfo = new Map();

    for (let directoryWithInputPath of directoriesWithInputPaths) {
      let directory = directoryWithInputPath.fsObject;
      let inputPath = directoryWithInputPath.inputPath;

      for (let [fileName, fsObject] of directory.getIndexSync()) {
        let relativePath = baseDir + fileName;

        let fsObjectsWithInputPaths = fileInfo.get(fileName);
        if (fsObjectsWithInputPaths == null) {
          fsObjectsWithInputPaths = [];
          fileInfo.set(fileName, fsObjectsWithInputPaths);
        } else {
          // Guard against conflicting file types
          let isDirectory = fsObject instanceof Directory;
          let originallyDirectory =
            fsObjectsWithInputPaths[0].fsObject instanceof Directory;
          if (originallyDirectory !== isDirectory) {
            let type1 = originallyDirectory ? "directory" : "file";
            let path1 = fsObjectsWithInputPaths[0].inputPath;
            let type2 = isDirectory ? "directory" : "file";
            let path2 = inputPath;
            throw new Error(
              `Merge error: conflicting file types: ` +
              `${relativePath} is a ${type1} in ${path1}` +
              ` but a ${type2} in ${path2}\n` +
              `Remove or rename either one of those.`
            );
          }

          // Guard against overwriting when disabled
          if (!isDirectory && !overwrite) {
            let originalPath = fsObjectsWithInputPaths[0].inputPath;
            throw new Error(
              `Merge error: file ${relativePath} exists in ` +
              `${originalPath} and ${inputPath}\n` +
              `Pass option { overwrite: true } to mergeTrees in order ` +
              `to have the latter file win.`
            );
          }
        }

        fsObjectsWithInputPaths.push({
          fsObject: fsObject,
          inputPath: inputPath
        });
      }
    }

    return fileInfo;
  }
}

module.exports = MergeTrees;
