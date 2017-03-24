'use strict';

import chai from 'chai';
import chaiFiles from 'chai-files';
import fixturify from 'fixturify';
import fs from 'fs-extra';
import MergeTrees from '../src/index';
import MergeFixtures from './merge-fixtures';

const { expect } = chai;
const { file } = chaiFiles;

chai.use(chaiFiles);

function mergeFix(inputFixtures: any[], options?: any) {
  const mergeFixtures = new MergeFixtures(inputFixtures.length, options);
  const outputFixture = mergeFixtures.merge(inputFixtures);
  mergeFixtures.cleanup();
  return outputFixture;
}

function mapBy(array, property) {
  return array.map((item) => item[property]);
}

describe('MergeTrees', () => {
  describe('._mergeRelativePaths()', () => {
    it('returns an array of file infos', () => {
      const mergeTrees = new MergeTrees(
        [__dirname + '/fixtures/a'],
        __dirname + '/tmp/output'
      );

      const fileInfos = mergeTrees._mergeRelativePath('');
      const entries = mapBy(fileInfos, 'entry');

      expect(mapBy(entries, 'relativePath')).to.deep.equal([
        'bar.js',
        'foo.js',
      ]);
    });

    it('sorts its return value', () => {
      const mergeTrees = new MergeTrees(
        [__dirname + '/fixtures/b/input0', __dirname + '/fixtures/b/input1'],
        __dirname + '/tmp/output'
      );

      const fileInfos = mergeTrees._mergeRelativePath('');
      const entries = mapBy(fileInfos, 'entry');

      expect(mapBy(entries, 'relativePath')).to.deep.equal([
        'foo',
        'foo/a.js',
        'foo/b.js',
      ]);
    });
  });

  describe('.merge()', () => {
    const ROOT = `${__dirname}/tmp/`;
    const ONE = `${__dirname}/tmp/one`;
    const TWO = `${__dirname}/tmp/two`;
    const OUTPUT = `${__dirname}/tmp/output`;
    let mergeTrees;

    beforeEach(() => {
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

    afterEach(() => {
      fs.removeSync(ROOT);
    });

    it('handles symlink -> merge transitions', () => {
      mergeTrees.merge();
      fixturify.writeSync(ONE, {
        subdir: { file1: '' }
      });
      mergeTrees.merge();
      expect(file(OUTPUT + '/subdir/file1')).to.exist;
      fixturify.writeSync(TWO, {
        subdir: { file2: '' }
      });
      mergeTrees.merge();
      expect(file(OUTPUT + '/subdir/file1')).to.exist;
      expect(file(OUTPUT + '/subdir/file2')).to.exist;
    });
  });

  it('merges files', () => {
    expect(mergeFix([
      {
        foo: '1'
      }, {
        baz: '2'
      }
    ])).to.deep.equal({
      foo: '1',
      baz: '2'
    });
  });

  it('merges empty directories', () => {
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
    });
  });

  it('refuses to overwrite files by default', () => {
    expect(() => {
      mergeFix([
        {
          foo: '1a',
          bar: '2a'
        }, {
          foo: '1b',
          bar: '2b'
        }
      ]);
    }).to.throw(/Merge error: file bar exists in .* and [^]* overwrite: true/);
  });

  it('overwrites files with { overwrite: true }', () => {
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
    });
  });

  it('adds non-conflicting non-empty directories to the output', () => {
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
    });
  });

  it('adds nested non-conflicting non-empty directories to the output', () => {
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
    });
  });

  it('removes non-conflicting non-empty directories', () => {
    const mergeFixtures = new MergeFixtures(1);
    mergeFixtures.merge([
      {
        foo: {
          bar: '1a',
        }
      }
    ]);
    expect(mergeFixtures.merge([
      {
      }
    ])).to.deep.equal({});
    mergeFixtures.cleanup();
  });

  it('removes nested non-conflicting non-empty directories', () => {
    const source = {
      foo: {
        bar: {
          baz: '1a',
        },
      },
    };
    const sibling = {
      foo: {
        qux: '2a',
      }
    };
    const mergeFixtures = new MergeFixtures(2);
    mergeFixtures.merge([source, sibling]);
    expect(mergeFixtures.merge([{}, sibling])).to.deep.equal({
      foo: {
        qux: '2a',
      }
    });
  });

  it('refuses to honor conflicting capitalizations, with overwrite: false and true', () => {
    function expectItToRefuseConflictingCapitalizations(type, options) {
      const content = type === 'dir' ? {} : 'hello world';
      expect(() => {
        mergeFix([
          {
            FOO: content
          }, {
            Foo: content
          }
        ], options);
      }).to.throw(/Merge error: conflicting capitalizations:\nFOO in .*\nFoo in .*\nRemove/);
    }

    expectItToRefuseConflictingCapitalizations('file', { overwrite: false });
    expectItToRefuseConflictingCapitalizations('dir', { overwrite: false });
    expectItToRefuseConflictingCapitalizations('file', { overwrite: true });
    expectItToRefuseConflictingCapitalizations('dir', { overwrite: true });
  });

  it('merges directories', () => {
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
    });
  });

  it('rejects directories colliding with files, with overwrite: false and true', () => {
    function expectItToRejectTypeCollisions(options) {
      expect(() => {
        mergeFix([
          {
            foo: {}
          }, {
            foo: 'hello'
          }
        ], options);
      }).to.throw(/Merge error: conflicting file types: foo is a directory in .* but a file in .*/);
      expect(() => {
        mergeFix([
          {
            foo: 'hello'
          }, {
            foo: {}
          }
        ], options);
      }).to.throw(/Merge error: conflicting file types: foo is a file in .* but a directory in .*/);
    }

    expectItToRejectTypeCollisions({ overwrite: false });
    expectItToRejectTypeCollisions({ overwrite: true });
  });
});
