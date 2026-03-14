/** @type {import('next').NextConfig} */
const nextConfig = {
    output: 'export',
    images: { unoptimized: true },
    devIndicators: {
        buildActivity: false,
    },
};

export default nextConfig;
