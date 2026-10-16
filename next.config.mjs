/** @type {import('next').NextConfig} */
const nextConfig = {
  // the test runner builds into its own folder so it can run next to your dev server
  ...(process.env.OUTTA_DIST_DIR ? { distDir: process.env.OUTTA_DIST_DIR } : {}),
  // The app's files carry a content hash in their URL (see scripts/build.mjs), so they can be
  // cached for a year. The page itself is always re-checked, so a new build shows up at once.
  async headers() {
    const year = [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }];
    return [
      { source: '/app.js', headers: year },
      { source: '/styles.css', headers: year },
      { source: '/shim.js', headers: year },
      { source: '/', headers: [{ key: 'Cache-Control', value: 'no-cache' }] },
      { source: '/index.html', headers: [{ key: 'Cache-Control', value: 'no-cache' }] },
    ];
  },
  async rewrites() {
    return [
      // The app is a single page served from /public.
      { source: '/', destination: '/index.html' },
      // Uploaded photos and boarding passes are referenced as /_blob/<id>.
      { source: '/_blob/:id', destination: '/api/assets/:id' },
    ];
  },
};

export default nextConfig;
