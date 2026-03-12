# Contributing to LexSim

Thank you for your interest in contributing to LexSim! This document provides guidelines and information for contributors.

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone <your-fork-url>`
3. Install dependencies: `npm install`
4. Create a `.env.local` file with your `GEMINI_API_KEY`
5. Start the dev server: `npm run dev`

## Development Workflow

1. Create a feature branch: `git checkout -b feature/your-feature-name`
2. Make your changes
3. Test thoroughly in the browser
4. Commit with clear messages: `git commit -m "feat: add new feature"`
5. Push to your fork: `git push origin feature/your-feature-name`
6. Open a Pull Request

## Code Style

- Use TypeScript for type safety
- Follow existing code patterns and naming conventions
- Use functional React components with hooks
- Keep components focused and single-responsibility
- Use Tailwind CSS for styling (maintain the dark theme with gold accents)

## Project Structure

```
components/          - React UI components
services/           - API integrations (Gemini AI)
types.ts            - TypeScript type definitions
constants.ts        - Mock data and templates
App.tsx             - Main app with routing
```

## Areas for Contribution

### High Priority
- **Persistent Storage**: Implement localStorage or IndexedDB for case data
- **Test Coverage**: Add unit and integration tests
- **Mobile Optimization**: Improve responsive design for mobile devices
- **Error Handling**: Better error boundaries and user feedback

### Features
- **Document Templates**: Expand the drafting assistant template library
- **Trial Scenarios**: Add more mock case templates
- **Export Formats**: Support PDF export for generated documents
- **Search**: Add case and document search functionality
- **Analytics**: Usage analytics and performance metrics

### AI Improvements
- **Context Window Management**: Better handling of long conversations
- **Prompt Engineering**: Optimize prompts for better AI responses
- **Cost Tracking**: Monitor and display API usage costs
- **Model Selection**: Allow users to choose between models

## Working with AI Services

All Gemini API interactions are centralized in `services/geminiService.ts`:

- Use structured output with `responseSchema` for type safety
- Handle errors gracefully with try/catch
- Test with different API keys and rate limits
- Consider token costs for expensive operations (thinking models, live API)

## Adding New Components

1. Create component file in `components/`
2. Follow existing component patterns
3. Add route in `App.tsx` if needed
4. Update type definitions in `types.ts` if needed
5. Export any new constants in `constants.ts`

## Testing Guidelines

Currently no test framework is configured. When adding tests:

- Mock Gemini API responses to avoid API costs
- Use `MOCK_CASE_TEMPLATES` for test data
- Test edge cases (empty states, API errors, invalid input)
- Test all witness personality types and trial phases

## Commit Message Format

Follow conventional commits:

- `feat:` - New feature
- `fix:` - Bug fix
- `docs:` - Documentation changes
- `style:` - Code style changes (formatting, etc.)
- `refactor:` - Code refactoring
- `test:` - Adding tests
- `chore:` - Maintenance tasks

## Pull Request Process

1. Update README.md if you add features
2. Update CLAUDE.md if you change architecture
3. Ensure all files have proper imports and no unused variables
4. Test in both development and production builds
5. Describe your changes clearly in the PR description

## Questions?

Open an issue for:
- Bug reports
- Feature requests
- Architecture questions
- General discussion

## Code of Conduct

- Be respectful and professional
- Welcome newcomers and help them learn
- Focus on constructive feedback
- Keep discussions on-topic

## License

By contributing, you agree that your contributions will be licensed under the same license as the project.

---

Thank you for contributing to LexSim!
