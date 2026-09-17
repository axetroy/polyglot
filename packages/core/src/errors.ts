export class PolyglotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PolyglotError";
  }
}

export class UnsupportedFormatError extends PolyglotError {}

export class IncompatibleFormatError extends PolyglotError {}

export class InvalidFrontError extends PolyglotError {
  constructor(
    message: string,
    public readonly format: string
  ) {
    super(message);
    this.name = "InvalidFrontError";
  }
}

export class InvalidArchiveError extends PolyglotError {
  constructor(
    message: string,
    public readonly format: string
  ) {
    super(message);
    this.name = "InvalidArchiveError";
  }
}

export class RelocationError extends PolyglotError {
  constructor(
    message: string,
    public readonly format: string,
    public readonly offset: number
  ) {
    super(message);
    this.name = "RelocationError";
  }
}
