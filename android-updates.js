function newestAndroidRelease(releases) {
  if (!Array.isArray(releases)) throw new Error('Invalid release response');
  return releases.filter(r => !r.draft).map(r => {
    const match = /^android-v(\d+)-preview$/.exec(r.tag_name || '');
    if (!match) return null;
    const version = Number(match[1]);
    const asset = r.assets?.find(a => a.name === `wpcrm-offline-v${version}-preview.apk` && a.size > 0);
    if (!asset) return null;
    const expected = `https://github.com/thebaumeister-rgb/wpcrm-call-logger/releases/download/${r.tag_name}/${asset.name}`;
    return asset.browser_download_url === expected ? { version, url: expected } : null;
  }).filter(Boolean).sort((a, b) => b.version - a.version)[0] || null;
}
if (typeof module !== 'undefined') module.exports = { newestAndroidRelease };
if (typeof document !== 'undefined') {
  const installed = Number(new URLSearchParams(location.search).get('installed'));
  const status = document.querySelector('#status'), download = document.querySelector('#download'), retry = document.querySelector('#retry');
  async function check() {
    retry.disabled = true; download.hidden = true; status.textContent = 'Checking GitHub...';
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch('https://api.github.com/repos/thebaumeister-rgb/wpcrm-call-logger/releases?per_page=100', { cache: 'no-store', signal: controller.signal });
      if (!response.ok) throw new Error('GitHub could not be reached. Try again or open releases below.');
      const latest = newestAndroidRelease(await response.json());
      if (!latest) throw new Error('No complete Android release found. Try again later.');
      if (installed > 0 && installed >= latest.version) status.textContent = `Installed version ${installed} is up to date. Latest published version: ${latest.version}.`;
      else { status.textContent = `Version ${latest.version} is available${installed > 0 ? ` (installed: ${installed})` : ''}.`; download.href = latest.url; download.textContent = `Download version ${latest.version}`; download.hidden = false; }
    } catch (error) { status.textContent = error.name === 'AbortError' ? 'Check timed out. Try again.' : error.message; }
    finally { clearTimeout(timer); retry.disabled = false; }
  }
  retry.onclick = check; check();
}
