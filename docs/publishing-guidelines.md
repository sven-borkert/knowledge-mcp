# Publishing Guidelines (Maintainers)

This document contains instructions for maintainers on how to publish new versions of the Knowledge MCP Server to npm.

## Prerequisites

```bash
# Login to npm (one-time setup)
npm login

# Verify you're logged in as the correct user
npm whoami  # Should show your npm username
```

## Publishing Updates

The package includes automated versioning and publishing scripts:

### Quick Commands

```bash
# For bug fixes and small improvements
npm run publish:patch    # 0.1.0 → 0.1.1

# For new features and enhancements
npm run publish:minor    # 0.1.0 → 0.2.0

# For breaking changes
npm run publish:major    # 0.1.0 → 1.0.0
```

### What Happens During Publish

1. **Version bump**: Updates package.json and creates a git tag
2. **Clean build**: Removes old dist files and rebuilds TypeScript
3. **Quality checks**: Runs type checking, linting, and tests
4. **Publish**: Uploads to npm registry with public access
5. **Git integration**: Commits version change and pushes tags

### Manual Process

If you need more control over the process:

```bash
# 1. Update version
npm version patch|minor|major

# 2. Build and test (automatic via prepublishOnly)
pnpm run clean
pnpm run build
pnpm run test:interface

# 3. Publish to npm
npm publish --access public

# 4. Push version tag to GitHub
git push origin main --tags
```

## Version Strategy

- **Patch versions** (0.1.x): Bug fixes, performance improvements
- **Minor versions** (0.x.0): New features, enhancements
- **Major versions** (x.0.0): Breaking changes

## Pre-publish Checklist

Before publishing:

1. ✅ All tests pass (`pnpm run test:interface`)
2. ✅ TypeScript builds without errors (`pnpm run build`)
3. ✅ Linting passes (`pnpm run lint`)
4. ✅ README.md is up to date
5. ✅ CHANGELOG is updated (if applicable)
6. ✅ No sensitive information in code
7. ✅ Binary has executable permissions (handled by postbuild script)

## Post-publish Steps

After successful publish:

1. Create GitHub release with changelog
2. Update documentation if needed
3. Notify users of breaking changes (if any)
4. Monitor npm package page for issues

## Troubleshooting

### OTP Required

If npm requires an OTP (One-Time Password):

```bash
# You'll be prompted during publish
npm publish --access public --otp=123456
```

### Permission Denied

If you get permission errors:

1. Verify you're logged in: `npm whoami`
2. Check package ownership: `npm owner ls @spothlynx/knowledge-mcp`
3. Ensure you have publish rights

### Build Failures

If the build fails during publish:

```bash
# Clean everything and retry
pnpm run clean
rm -rf node_modules
pnpm install
pnpm run build
pnpm run test:interface
```

## NPM Package Configuration

Key settings in package.json:

- `"publishConfig": { "access": "public" }` - Ensures public access
- `"files": ["dist", "README.md", "LICENSE"]` - Only includes necessary files
- `"bin": { "knowledge-mcp": "./dist/knowledge-mcp/index.js" }` - Executable entry
- `"prepublishOnly"` script - Runs build and tests before publish