# Knowledge MCP Documentation

This directory contains comprehensive documentation for the Knowledge MCP Server TypeScript implementation.

## Documentation Index

### Core Documentation

1. **[Technical Specification](./technical-specification.md)**
   - Complete API reference and architecture overview
   - Storage structure and project identification
   - Request tracing and activity logging
   - Security features and implementation details

2. **[Error Handling Guide](./error-handling-guide.md)**
   - Standardized error codes and their meanings
   - Debugging with unique trace IDs
   - Error handling patterns and best practices
   - Log analysis and troubleshooting tips

3. **[MCP Security Guidelines](./mcp-security-guidelines.md)**
   - Abstraction boundary security principles
   - Implementation requirements and patterns
   - Security validation and testing requirements
   - Path security and information leakage prevention

4. **[MCP Interface Test Plan](./mcp-interface-test-plan.md)**
   - Language-agnostic test specifications
   - Comprehensive test case documentation
   - Success criteria and validation methods
   - Edge case testing scenarios

5. **[Publishing Guidelines](./publishing-guidelines.md)**
   - Release process and versioning strategy
   - Package publishing and distribution
   - Quality gates and deployment procedures
   - Maintenance and update workflows

## Quick Start

### For Users

1. Install the package: `npm install -g @spothlynx/knowledge-mcp`
2. Review the [Technical Specification](./technical-specification.md) for API details
3. Follow the [MCP Interface Test Plan](./mcp-interface-test-plan.md) to verify installation

### For Developers

1. Read the [Technical Specification](./technical-specification.md) for architecture details
2. Follow the [MCP Security Guidelines](./mcp-security-guidelines.md) for security requirements
3. Check the [Error Handling Guide](./error-handling-guide.md) for debugging patterns
4. Run the comprehensive test suite to validate functionality

## Document Quality Standards

All documentation follows these standards:

- **Accuracy**: All examples are tested and working
- **Completeness**: Complete API coverage with detailed explanations
- **Consistency**: Consistent terminology and formatting throughout
- **Security Focus**: Security considerations highlighted where relevant
- **Up-to-date**: Reflects current implementation (v0.3.0)

## Document Maintenance

When making changes to the codebase:

1. Update relevant documentation files immediately
2. Ensure all code examples are tested and functional
3. Keep API documentation in sync with implementation
4. Update test plans if interface changes occur
5. Review security guidelines for new features

## Contributing to Documentation

To contribute to the documentation:

1. Follow the existing format and structure
2. Include working, tested code examples
3. Test all commands and configurations before submitting
4. Submit pull requests with clear descriptions of changes
5. Ensure consistency with the established style guide

## Version Information

This documentation reflects **Knowledge MCP Server v0.3.0** (TypeScript implementation).

### Recent Updates

- ✅ Enhanced file locking mechanisms for concurrent operations
- ✅ Comprehensive test coverage (133 tests, 100% passing)
- ✅ Advanced error handling with trace IDs
- ✅ Security-first design with abstraction boundaries
- ✅ Production-ready performance optimizations

## Architecture Overview

The Knowledge MCP Server is built with:

- **TypeScript 5.7+** for type safety and developer experience
- **Model Context Protocol SDK** for MCP compliance
- **Zod** for comprehensive input validation
- **Git integration** for automatic version control
- **Queue-based file locking** for concurrent operation safety
- **Comprehensive logging** with unique trace IDs

## Support and Resources

- **GitHub Repository**: [https://github.com/sven-borkert/knowledge-mcp](https://github.com/sven-borkert/knowledge-mcp)
- **Issue Tracking**: [GitHub Issues](https://github.com/sven-borkert/knowledge-mcp/issues)
- **MCP Protocol**: [Official Documentation](https://modelcontextprotocol.io/)
- **Test Results**: Run `pnpm run test:all` for comprehensive validation
