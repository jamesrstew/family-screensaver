/** The promise, or a refusal after `ms` (the work carries on and fills the cache). */
export async function within<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<never>((_, no) => {
    timer = setTimeout(() => no(new Error(`took over ${ms} ms`)), ms);
  });
  try {
    return await Promise.race([p, late]);
  } finally {
    clearTimeout(timer);
  }
}
