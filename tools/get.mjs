// Tiny helper: GET JSON from the Pokémon TCG API with retries (it is slow and sometimes answers 500).
export async function getJSON(url, tries = 10) {
  for (let i = 1; ; i++) {
    try {
      const r = await fetch(url, { headers: process.env.PTCG_KEY ? { "X-Api-Key": process.env.PTCG_KEY } : {} , signal: AbortSignal.timeout(90000) });
      if (r.ok) return await r.json();
      throw new Error("HTTP " + r.status);
    } catch (e) {
      if (i >= tries) throw e;
      console.error(`  retry ${i} (${e.message}) ${url}`);
      await new Promise(res => setTimeout(res, 1500 * i));
    }
  }
}
