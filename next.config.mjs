/** @type {import('next').NextConfig} */
const nextConfig = {
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
