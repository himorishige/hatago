#!/bin/bash

# Hatago Auth POC Setup Script
# This script sets up the local development environment

set -e

echo "🚀 Setting up Hatago Auth POC..."

# Check if wrangler is installed
if ! command -v wrangler &> /dev/null; then
    echo "❌ Wrangler CLI is not installed."
    echo "Please install it with: npm install -g wrangler"
    exit 1
fi

# Check if pnpm is installed
if ! command -v pnpm &> /dev/null; then
    echo "❌ pnpm is not installed."
    echo "Please install it with: npm install -g pnpm"
    exit 1
fi

# Install dependencies
echo "📦 Installing dependencies..."
pnpm install

# Initialize D1 database with schema
echo "🗄️ Initializing D1 database..."
npx wrangler d1 execute hatago-permissions --file=./schema.sql

# Create KV namespace if not exists
echo "🔑 Creating KV namespace..."
npx wrangler kv:namespace create "OAUTH_KV" || echo "KV namespace already exists"

# Create .env file if not exists
if [ ! -f .env ]; then
    echo "📝 Creating .env file..."
    cat > .env << 'EOF'
# Authentication Type
AUTH_TYPE=mock

# Logging
LOG_LEVEL=debug
ENVIRONMENT=development

# Mock Auth (for development)
# No additional config needed

# Cloudflare Access (production)
# ACCESS_CLIENT_ID=your-access-client-id
# ACCESS_CLIENT_SECRET=your-access-client-secret
# ACCESS_AUTHORIZATION_URL=https://your-team.cloudflareaccess.com/cdn-cgi/access/sso/oidc/authorize
# ACCESS_TOKEN_URL=https://your-team.cloudflareaccess.com/cdn-cgi/access/sso/oidc/token
# ACCESS_JWKS_URL=https://your-team.cloudflareaccess.com/cdn-cgi/access/certs

# GitHub OAuth (alternative)
# GITHUB_CLIENT_ID=your-github-client-id
# GITHUB_CLIENT_SECRET=your-github-client-secret

# Service Token (for inter-service communication)
# SERVICE_CLIENT_ID=service-client-id
# SERVICE_CLIENT_SECRET=service-client-secret

# Cookie encryption key (generate with: openssl rand -base64 32)
COOKIE_ENCRYPTION_KEY=default-encryption-key-change-in-production
EOF
    echo "✅ .env file created. Please update with your credentials."
else
    echo "ℹ️ .env file already exists, skipping..."
fi

# Run type checking
echo "🔍 Running type check..."
pnpm typecheck || echo "⚠️ Type check failed, but continuing..."

echo ""
echo "✅ Setup complete!"
echo ""
echo "📚 Next steps:"
echo "1. Review and update .env file with your credentials"
echo "2. Start local development server: pnpm dev:local"
echo "3. Access the application at http://localhost:8787"
echo ""
echo "⚠️ Note: Cloudflare Containers won't work in local mode."
echo "   Only OAuth and MCP server features will be available locally."
echo ""