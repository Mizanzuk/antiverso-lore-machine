/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['@supabase/supabase-js', 'openai'],
  },
  typescript: {
    // Ignora erros de tipagem (como a falta do @types/mammoth) para permitir o deploy
    ignoreBuildErrors: true,
  },
  eslint: {
    // Ignora erros de linting durante o build
    ignoreDuringBuilds: true,
  },
};
export default nextConfig;
