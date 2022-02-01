#!/usr/bin/env node

"use strict";

/* eslint-disable no-console */

let fs = require("fs");
let rimraf = require("rimraf");

let MergeTrees = require("./");

rimraf.sync("tmp");
fs.mkdirSync("tmp");

makeInputDir("tmp/input1", 2, 2);
makeInputDir("tmp/input2", 3, 3);
makeInputDir("tmp/input3", 5, 5);
makeInputDir("tmp/input4", 7, 7);
let inputPaths = ["tmp/input1", "tmp/input2", "tmp/input3", "tmp/input4"];

function makeInputDir(p, modulo, depth) {
  fs.mkdirSync(p);
  for (let i = 0; i < 24; i++) {
    if (i % modulo !== 0) continue;
    fs.writeFileSync(`${p}/file${i}`, `file ${i} contents`);
    if (depth > 1) {
      makeInputDir(`${p}/dir${i}`, modulo, depth - 1);
    }
  }
}

function modifyInput(i) {
  fs.writeFileSync(
    `tmp/input${i % 2 ? 1 : 3}/dir0/file0`,
    `${i % 4 < 2 ? "_" : ""}` // force size change
  );
}

let n = 100;

[false, null].forEach(canSymlink => {
  console.time(`initial merge, canSymlink=${canSymlink}`);
  for (let i = 0; i < n; i++) {
    fs.mkdirSync("tmp/out");
    let mergeTrees = new MergeTrees(inputPaths, "tmp/out", {
      overwrite: true,
      _fsUpdaterOptions: { canSymlink: canSymlink }
    });
    mergeTrees.merge();
    rimraf.sync("tmp/out");
  }
  console.timeEnd(`initial merge, canSymlink=${canSymlink}`);

  console.time(`incremental merge, canSymlink=${canSymlink}`);
  fs.mkdirSync("tmp/out");
  let mergeTrees = new MergeTrees(inputPaths, "tmp/out", {
    overwrite: true,
    _fsUpdaterOptions: { canSymlink: canSymlink }
  });
  for (let i = 0; i < n; i++) {
    modifyInput(i);
    mergeTrees.merge();
  }
  rimraf.sync("tmp/out");
  console.timeEnd(`incremental merge, canSymlink=${canSymlink}`);
});

rimraf.sync("tmp");
