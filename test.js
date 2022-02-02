"use strict";

var MergeTrees = require("./");
var chai = require("chai"),
  expect = chai.expect;

var fixturify = require("fixturify");
var fs = require("fs-extra");

function mergeFix(inputFixtures, options) {
  var mergeFixtures = new MergeFixtures(inputFixtures.length, options);
  var outputFixture = mergeFixtures.merge(inputFixtures);
  mergeFixtures.cleanup();
  return outputFixture;
}

var defaultFSUpdaterOptions = { retry: false };

class MergeFixtures {
  constructor(numberOfFixtures, options) {
    if (options == null) options = {};
    if (options._fsUpdaterOptions == null) {
      options._fsUpdaterOptions = defaultFSUpdaterOptions;
    }
    this.root = __dirname + "/tmp";
    fs.removeSync(this.root);
    fs.mkdirSync(this.root);
    this.outputPath = this.root + "/out";
    fs.mkdirSync(this.outputPath);
    this.inputPaths = [];
    for (var i = 0; i < numberOfFixtures; i++) {
      var inputPath = this.root + "/" + i;
      fs.mkdirSync(inputPath);
      this.inputPaths.push(inputPath);
    }
    this.numberOfFixtures = numberOfFixtures;
    this.mergeTrees = new MergeTrees(this.inputPaths, this.outputPath, options);
  }

  merge(inputFixtures) {
    if (inputFixtures.length !== this.numberOfFixtures) {
      throw new Error(
        "Expected " +
        this.numberOfFixtures +
        " fixtures, got " +
        inputFixtures.length
      );
    }
    for (var i = 0; i < inputFixtures.length; i++) {
      fs.removeSync(this.inputPaths[i]);
      fs.mkdirSync(this.inputPaths[i]);
      fixturify.writeSync(this.inputPaths[i], inputFixtures[i]);
    }
    this.mergeTrees.merge();
    return fixturify.readSync(this.outputPath);
  }

  cleanup() {
    fs.removeSync(this.root);
  }
}

describe("MergeTrees", function () {
  describe(".merge()", function () {
    var ROOT = __dirname + "/tmp/";
    var ONE = __dirname + "/tmp/one";
    var TWO = __dirname + "/tmp/two";
    var OUTPUT = __dirname + "/tmp/output";
    var mergeTrees;

    beforeEach(function () {
      fs.removeSync(ROOT);
      fs.mkdirSync(ROOT);
      fs.mkdirSync(ONE);
      fs.mkdirSync(TWO);
      fs.mkdirSync(OUTPUT);

      mergeTrees = new MergeTrees([ONE, TWO], OUTPUT, {
        _fsUpdaterOptions: defaultFSUpdaterOptions
      });
    });

    afterEach(function () {
      fs.removeSync(ROOT);
    });

    it("resolves symlinks", function () {
      // The Directory::getIndexSync() method in FSUpdater takes care of
      // resolving symlinks for us, but we still want to make sure this happens.
      if (process.platform === "win32") return;
      fs.writeFileSync(`${ONE}/file`, "");
      fs.mkdirSync(`${ONE}/dir`);
      fs.symlinkSync(fs.realpathSync(`${ONE}/file`), `${ONE}/symlink_to_file`);
      fs.symlinkSync(fs.realpathSync(`${ONE}/dir`), `${ONE}/symlink_to_dir`);
      mergeTrees.merge();
      expect(fs.readlinkSync(`${OUTPUT}/symlink_to_file`)).to.equal(
        fs.realpathSync(`${ONE}/file`)
      );
      expect(fs.readlinkSync(`${OUTPUT}/symlink_to_dir`)).to.equal(
        fs.realpathSync(`${ONE}/dir`)
      );
    });
  });

  it("merges files", function () {
    expect(
      mergeFix([
        {
          foo: "1"
        },
        {
          baz: "2"
        }
      ])
    ).to.deep.equal({
      foo: "1",
      baz: "2"
    });
  });

  it("merges empty directories", function () {
    expect(
      mergeFix([
        {
          foo: {},
          bar: {}
        },
        {
          bar: {},
          baz: {}
        }
      ])
    ).to.deep.equal({
      foo: {},
      bar: {},
      baz: {}
    });
  });

  it("refuses to overwrite files by default", function () {
    expect(function () {
      mergeFix([
        {
          foo: "1a",
          bar: "2a"
        },
        {
          foo: "1b",
          bar: "2b"
        }
      ]);
    }).to.throw(/Merge error: file bar exists in .* and [^]* overwrite: true/);
  });

  it("overwrites files with { overwrite: true }", function () {
    expect(
      mergeFix(
        [
          {
            foo: "1a",
            bar: "2a"
          },
          {
            bar: "2b",
            baz: "3b"
          },
          {
            baz: "3c"
          }
        ],
        {
          overwrite: true
        }
      )
    ).to.deep.equal({
      foo: "1a",
      bar: "2b",
      baz: "3c"
    });
  });

  it("merges directories", function () {
    expect(
      mergeFix([
        {
          subdir: {
            foo: "1"
          }
        },
        {
          subdir2: {
            baz: "3"
          }
        },
        {
          subdir: {
            bar: "2"
          }
        }
      ])
    ).to.deep.equal({
      subdir: {
        foo: "1",
        bar: "2"
      },
      subdir2: {
        baz: "3"
      }
    });
  });

  it("rejects directories colliding with files, with overwrite: false and true", function () {
    function expectItToRejectTypeCollisions(options) {
      expect(function () {
        mergeFix(
          [
            {
              foo: {}
            },
            {
              foo: "hello"
            }
          ],
          options
        );
      }).to.throw(
        /Merge error: conflicting file types: foo is a directory in .* but a file in .*/
      );
      expect(function () {
        mergeFix(
          [
            {
              foo: "hello"
            },
            {
              foo: {}
            }
          ],
          options
        );
      }).to.throw(
        /Merge error: conflicting file types: foo is a file in .* but a directory in .*/
      );
    }

    expectItToRejectTypeCollisions({ overwrite: false });
    expectItToRejectTypeCollisions({ overwrite: true });
  });
});

require("mocha-eslint")("*.js");
