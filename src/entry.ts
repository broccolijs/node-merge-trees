export default class Entry {
  public size: number;
  public mode: any;
  public mtime: number;
  public linkDir: boolean;
  public basePath: string;
  public relativePath: string;

  constructor(relativePath, basePath, mode, size, mtime) {
    this.mode = mode;

    this.relativePath = relativePath;
    this.basePath = basePath;
    this.size = size;
    this.mtime = mtime;

    this.linkDir = false;
  }

  public isDirectory(): boolean {
    return (this.mode & 61440) === 16384;
  }
}
