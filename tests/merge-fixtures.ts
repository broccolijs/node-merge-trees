import fixturify from 'fixturify';
import fs from 'fs-extra';
import MergeTrees from '../src/index';

export default class MergeFixtures {
  private root: string;
  private outputPath: string;
  private inputPaths: string[];
  private numberOfFixtures: number;
  private mergeTrees: MergeTrees;

  constructor(numberOfFixtures: number, options?: any) {
    this.root =  __dirname + '/tmp';
    fs.removeSync(this.root);
    fs.mkdirSync(this.root);
    this.outputPath = this.root + '/out';
    fs.mkdirSync(this.outputPath);
    this.inputPaths = [];
    for (let i = 0; i < numberOfFixtures; i++) {
      const inputPath = this.root + '/' + i;
      fs.mkdirSync(inputPath);
      this.inputPaths.push(inputPath);
    }
    this.numberOfFixtures = numberOfFixtures;
    this.mergeTrees = new MergeTrees(this.inputPaths, this.outputPath, options);
  }

  public merge(inputFixtures: Array<object>): object {
    if (inputFixtures.length !== this.numberOfFixtures) {
      throw new Error('Expected ' + this.numberOfFixtures + ' fixtures, got ' + inputFixtures.length);
    }
    for (let i = 0; i < inputFixtures.length; i++) {
      fs.removeSync(this.inputPaths[i]);
      fs.mkdirSync(this.inputPaths[i]);
      fixturify.writeSync(this.inputPaths[i], inputFixtures[i]);
    }
    this.mergeTrees.merge();
    return fixturify.readSync(this.outputPath);
  }

  public cleanup(): void {
    fs.removeSync(this.root);
  }
}
