// Capture is synchronous; stale renders can finish but cannot replace the cache.
export const createSnapshotCache = (capture, render) => {
  let revision = 0;
  let cached;
  const pending = new Map();
  return {
    invalidate() {
      revision++;
      cached = undefined;
    },
    get ready() {
      return Boolean(cached && cached.revision === revision);
    },
    get() {
      if (cached && cached.revision === revision) return Promise.resolve(cached.value);
      if (pending.has(revision)) return pending.get(revision);
      const id = revision;
      let snapshot;
      try {
        snapshot = capture();
      } catch (error) {
        return Promise.reject(error);
      }
      const promise = Promise.resolve()
        .then(() => render(snapshot))
        .then((value) => {
          if (id === revision) cached = { revision: id, value };
          return value;
        })
        .finally(() => pending.delete(id));
      pending.set(id, promise);
      return promise;
    }
  };
};
