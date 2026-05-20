/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config, { isServer }) => {
    // Handle dynamic imports in TalkingHead.js
    // TalkingHead tries to dynamically import lipsync modules like lipsync-en.mjs, lipsync-nl.mjs, etc.
    // We need to tell webpack to include these as dynamic chunks that can be loaded at runtime
    config.module.rules.push({
      test: /lipsync-\w+\.mjs$/,
      type: 'javascript/dynamic',
    });

    return config;
  },
};

export default nextConfig;
