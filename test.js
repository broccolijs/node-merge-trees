'use strict'

var MergeTrees = require('./')
var chai = require('chai'), expect = chai.expect
var chaiFiles = require('chai-files'); chai.use(chaiFiles);

var fixturify = require('fixturify');
var fs = require('fs-extra');

var file = chaiFiles.file;

function mergeFix(inputFixtures, options) {
  var mergeFixtures = new MergeFixtures(inputFixtures.length, options)
  var outputFixture = mergeFixtures.merge(inputFixtures)
  mergeFixtures.cleanup()
  return outputFixture
}

class MergeFixtures {
  constructor(numberOfFixtures, options) {
    this.root =  __dirname + '/tmp';
    fs.removeSync(this.root)
    fs.mkdirSync(this.root)
    this.outputPath = this.root + '/out'
    fs.mkdirSync(this.outputPath)
    this.inputPaths = []
    for (var i = 0; i < numberOfFixtures; i++) {
      var inputPath = this.root + '/' + i
      fs.mkdirSync(inputPath)
      this.inputPaths.push(inputPath)
    }
    this.numberOfFixtures = numberOfFixtures
    this.mergeTrees = new MergeTrees(this.inputPaths, this.outputPath, options)
  }

  merge(inputFixtures) {
    if (inputFixtures.length !== this.numberOfFixtures) {
      throw new Error('Expected ' + this.numberOfFixtures + ' fixtures, got ' + inputFixtures.length)
    }
    for (var i = 0; i < inputFixtures.length; i++) {
      fs.removeSync(this.inputPaths[i])
      fs.mkdirSync(this.inputPaths[i])
      fixturify.writeSync(this.inputPaths[i], inputFixtures[i])
    }
    this.mergeTrees.merge()
    return fixturify.readSync(this.outputPath)
  }

  cleanup() {
    fs.removeSync(this.root)
  }
}

function mapBy(array, property) {
  return array.map(function (item) {
    return item[property];
  });
}

describe('MergeTrees', function() {
  describe('._mergeRelativePaths()', function() {
    it('returns an array of file infos', function() {
      var mergeTrees = new MergeTrees(
        [__dirname + '/tests/fixtures/a'],
        __dirname + '/tmp/output'
      );

      var fileInfos = mergeTrees._mergeRelativePath('');
      var entries = mapBy(fileInfos, 'entry');

      expect(mapBy(entries, 'relativePath')).to.deep.equal([
        'bar.js',
        'foo.js',
      ]);
    });

    it('sorts its return value', function() {
      var mergeTrees = new MergeTrees(
        [__dirname + '/tests/fixtures/b/input0', __dirname + '/tests/fixtures/b/input1'],
        __dirname + '/tmp/output'
      );

      var fileInfos = mergeTrees._mergeRelativePath('');
      var entries = mapBy(fileInfos, 'entry');

      expect(mapBy(entries, 'relativePath')).to.deep.equal([
        'foo',
        'foo/a.js',
        'foo/b.js',
      ]);
    });
  });

  describe('.merge()', function() {
    var ROOT= __dirname + '/tmp/';
    var ONE = __dirname + '/tmp/one';
    var TWO = __dirname + '/tmp/two';
    var OUTPUT = __dirname + '/tmp/output';
    var mergeTrees;

    beforeEach(function() {
      fs.removeSync(ROOT);
      fs.mkdirSync(ROOT);
      fs.mkdirSync(ONE);
      fs.mkdirSync(TWO);
      fs.mkdirSync(OUTPUT);

      mergeTrees = new MergeTrees([
        ONE,
        TWO
      ], OUTPUT);
    });

    afterEach(function() {
      fs.removeSync(ROOT);
    });

    it('handles symlink -> merge transitions', function() {
      mergeTrees.merge();
      fixturify.writeSync(ONE,{
        subdir: { file1: '' }
      });
      mergeTrees.merge();
      expect(file(OUTPUT + '/subdir/file1')).to.exist;
      fixturify.writeSync(TWO,{
        subdir: { file2: '' }
      });
      mergeTrees.merge();
      expect(file(OUTPUT + '/subdir/file1')).to.exist;
      expect(file(OUTPUT + '/subdir/file2')).to.exist;
    });
  });

  it('merges files', function() {
    expect(mergeFix([
      {
        foo: '1'
      }, {
        baz: '2'
      }
    ])).to.deep.equal({
      foo: '1',
      baz: '2'
    })
  })


  it('merges empty directories', function() {
    expect(mergeFix([
      {
        foo: {},
        bar: {}
      }, {
        bar: {},
        baz: {}
      }
    ])).to.deep.equal({
      foo: {},
      bar: {},
      baz: {}
    })
  })

  it('refuses to overwrite files by default', function() {
    expect(function() {
      mergeFix([
        {
          foo: '1a',
          bar: '2a'
        }, {
          foo: '1b',
          bar: '2b'
        }
      ])
    }).to.throw(/Merge error: file bar exists in .* and [^]* overwrite: true/)
  })

  it('overwrites files with { overwrite: true }', function() {
    expect(mergeFix([
      {
        foo: '1a',
        bar: '2a',
      }, {
        bar: '2b',
        baz: '3b'
      }, {
        baz: '3c'
      }
    ], {
      overwrite: true
    })).to.deep.equal({
      foo: '1a',
      bar: '2b',
      baz: '3c'
    })
  })

  it('adds non-conflicting non-empty directories to the output', function() {
    expect(mergeFix([
      {
        foo: {
          bar: '1a',
        }
      }, {
      }
    ])).to.deep.equal({
      foo: {
        bar: '1a',
      }
    })
  });

  it('adds nested non-conflicting non-empty directories to the output', function() {
    expect(mergeFix([
      {
        foo: {
          bar: '1a',
          baz: {
            qux: {
              quux: '1b',
            }
          }
        }
      }, {
        bar: '2a',
      }
    ])).to.deep.equal({
      foo: {
        bar: '1a',
        baz: {
          qux: {
            quux: '1b',
          }
        }
      },
      bar: '2a',
    })
  });

  it('removes non-conflicting non-empty directories', function() {
    var mergeFixtures = new MergeFixtures(1)
    mergeFixtures.merge([
      {
        foo: {
          bar: '1a',
        }
      }
    ])
    expect(mergeFixtures.merge([
      {
      }
    ])).to.deep.equal({})
    mergeFixtures.cleanup()
  });

  it('removes nested non-conflicting non-empty directories', function() {
    var source = {
      foo: {
        bar: {
          baz: '1a',
        },
      },
    };
    var sibling = {
      foo: {
        qux: '2a',
      }
    };
    var mergeFixtures = new MergeFixtures(2)
    mergeFixtures.merge([source, sibling])
    expect(mergeFixtures.merge([{}, sibling])).to.deep.equal({
      foo: {
        qux: '2a',
      }
    })
  });

  it('refuses to honor conflicting capitalizations, with overwrite: false and true', function() {
    function expectItToRefuseConflictingCapitalizations(type, options) {
      var content = type === 'dir' ? {} : 'hello world'
      expect(function() {
        mergeFix([
          {
            FOO: content
          }, {
            Foo: content
          }
        ], options)
      }).to.throw(/Merge error: conflicting capitalizations:\nFOO in .*\nFoo in .*\nRemove/)
    }

    expectItToRefuseConflictingCapitalizations('file', { overwrite: false })
    expectItToRefuseConflictingCapitalizations('dir', { overwrite: false })
    expectItToRefuseConflictingCapitalizations('file', { overwrite: true })
    expectItToRefuseConflictingCapitalizations('dir', { overwrite: true })
  })

  it('merges directories', function() {
    expect(mergeFix([
      {
        subdir: {
          foo: '1'
        }
      }, {
        subdir2: {}
      }, {
        subdir: {
          bar: '2'
        }
      }
    ])).to.deep.equal({
      subdir: {
        foo: '1',
        bar: '2'
      },
      subdir2: {}
    })
  })

  it('rejects directories colliding with files, with overwrite: false and true', function() {
    function expectItToRejectTypeCollisions(options) {
      expect(function() {
        mergeFix([
          {
            foo: {}
          }, {
            foo: 'hello'
          }
        ], options)
      }).to.throw(/Merge error: conflicting file types: foo is a directory in .* but a file in .*/)
      expect(function() {
        mergeFix([
          {
            foo: 'hello'
          }, {
            foo: {}
          }
        ], options)
      }).to.throw(/Merge error: conflicting file types: foo is a file in .* but a directory in .*/)
    }

    expectItToRejectTypeCollisions({ overwrite: false })
    expectItToRejectTypeCollisions({ overwrite: true })
  })
})


require('mocha-eslint')('*.js')
