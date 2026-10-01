/**
 * One namespaced, schema-versioned `localStorage` entry (AGENTS.md §1.7).
 *
 * The same rules as `CvRepository`, for the smaller payloads: a read never
 * throws, and a payload from another schema version or with the wrong shape is
 * discarded rather than trusted (AGENTS.md §8). A write that fails — private
 * mode, quota — is swallowed: the value still lives in memory for the session.
 */
export class VersionedStore<T extends object> {
  constructor(
    private readonly key: string,
    private readonly version: number,
    private readonly isValid: (value: Record<string, unknown>) => boolean,
  ) {}

  read(): T | null {
    let raw: string | null;
    try {
      raw = localStorage.getItem(this.key);
    } catch {
      return null;
    }
    if (raw === null) {
      return null;
    }

    try {
      const payload = JSON.parse(raw) as unknown;
      if (
        payload !== null &&
        typeof payload === 'object' &&
        (payload as { schemaVersion?: unknown }).schemaVersion === this.version &&
        this.isValid(payload as Record<string, unknown>)
      ) {
        const { schemaVersion: _version, ...value } = payload as Record<string, unknown>;
        return value as T;
      }
    } catch {
      /* corrupt JSON: discard below */
    }

    this.clear();
    return null;
  }

  write(value: T): void {
    try {
      localStorage.setItem(this.key, JSON.stringify({ schemaVersion: this.version, ...value }));
    } catch {
      /* private mode / quota: the in-memory state is still correct */
    }
  }

  clear(): void {
    try {
      localStorage.removeItem(this.key);
    } catch {
      /* nothing to do */
    }
  }
}
