# Deployment Guide

This guide covers deploying LexSim to various static hosting platforms.

## Prerequisites

- Node.js 18+ installed
- Google Gemini API key
- Git repository (for automatic deployments)

## Build for Production

```bash
npm run build
```

This creates an optimized production build in the `dist/` directory.

To preview the production build locally:
```bash
npm run preview
```

## Environment Variables

Your hosting platform needs access to your Gemini API key. Each platform handles this differently:

- **Vercel/Netlify**: Set environment variable `GEMINI_API_KEY` in dashboard
- **GitHub Pages**: Not recommended for API keys (client-side exposure)
- **Self-hosted**: Configure at build time or use server-side proxy

⚠️ **Security Warning**: The current implementation exposes the API key in the client-side bundle. For production, consider:
1. Using a backend proxy to hide the API key
2. Implementing rate limiting
3. Restricting API key permissions in Google AI Studio

## Deployment Platforms

### Vercel (Recommended)

1. Install Vercel CLI:
   ```bash
   npm install -g vercel
   ```

2. Deploy:
   ```bash
   vercel
   ```

3. Set environment variable in Vercel dashboard:
   - Go to Project Settings → Environment Variables
   - Add `GEMINI_API_KEY` with your API key
   - Redeploy

### Netlify

1. Install Netlify CLI:
   ```bash
   npm install -g netlify-cli
   ```

2. Build the project:
   ```bash
   npm run build
   ```

3. Deploy:
   ```bash
   netlify deploy --prod --dir=dist
   ```

4. Set environment variable:
   - Go to Site Settings → Environment Variables
   - Add `GEMINI_API_KEY`
   - Trigger a new deploy

### GitHub Pages

⚠️ **Not recommended** for this project due to API key exposure.

If you still want to deploy:

1. Update `vite.config.ts` to set base path:
   ```typescript
   export default defineConfig({
     base: '/repo-name/',
     // ... rest of config
   });
   ```

2. Build:
   ```bash
   npm run build
   ```

3. Deploy to GitHub Pages:
   ```bash
   # Use gh-pages package
   npm install -D gh-pages
   npx gh-pages -d dist
   ```

### Self-Hosted (Docker)

Create a `Dockerfile`:

```dockerfile
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

Build and run:
```bash
docker build -t lexsim .
docker run -p 80:80 lexsim
```

### Static File Server

After building, serve the `dist/` directory with any static file server:

```bash
# Using Python
python -m http.server 8000 --directory dist

# Using Node.js serve
npx serve dist

# Using nginx
# Copy dist/ to /var/www/html/
```

## Post-Deployment Checklist

- [ ] Verify API key is configured correctly
- [ ] Test all features (document analysis, witness lab, trial simulator)
- [ ] Check microphone permissions work (HTTPS required)
- [ ] Test on mobile devices
- [ ] Monitor API usage in Google AI Studio
- [ ] Set up error tracking (Sentry, LogRocket, etc.)
- [ ] Configure analytics if needed

## Domain Configuration

### Custom Domain (Vercel)

1. Go to Project Settings → Domains
2. Add your custom domain
3. Update DNS records as instructed

### HTTPS

HTTPS is required for:
- Microphone access (Trial Simulator)
- Secure API key transmission

All recommended platforms provide automatic HTTPS.

## Monitoring & Maintenance

### API Usage
Monitor your Gemini API usage at [Google AI Studio](https://aistudio.google.com/):
- Check daily/monthly quotas
- Review costs
- Set up billing alerts

### Performance
- Use Lighthouse for performance audits
- Monitor bundle size: `npm run build -- --sourcemap`
- Consider code splitting for large routes

### Updates
```bash
# Update dependencies
npm update

# Check for outdated packages
npm outdated

# Rebuild and redeploy
npm run build
```

## Troubleshooting

### Build Errors

**Error**: `Module not found`
- Solution: Run `npm install` to ensure all dependencies are installed

**Error**: `Out of memory`
- Solution: Increase Node memory: `NODE_OPTIONS=--max-old-space-size=4096 npm run build`

### Runtime Errors

**API Key Issues**
- Verify environment variable is set correctly
- Check API key is active in Google AI Studio
- Ensure key has proper permissions

**Microphone Not Working**
- Ensure site is served over HTTPS
- Check browser permissions
- Test in different browsers

### Deployment Issues

**Environment Variables Not Loading**
- Restart the deployment after setting variables
- Check variable name matches exactly: `GEMINI_API_KEY`
- Verify build command includes environment variable injection

**404 on Refresh**
- HashRouter (currently used) should prevent this
- If switching to BrowserRouter, configure server redirects

## Cost Optimization

To reduce API costs:

1. **Cache responses** where appropriate
2. **Use Flash model** for simple tasks (already implemented)
3. **Limit thinking budget** for strategy analysis
4. **Implement rate limiting** on client side
5. **Monitor usage** regularly

## Security Best Practices

1. **Never commit** `.env.local` (already in .gitignore)
2. **Rotate API keys** regularly
3. **Set API quotas** in Google AI Studio
4. **Implement backend proxy** for production (recommended)
5. **Use environment variables** for sensitive data

## Rollback

If a deployment fails:

**Vercel**: Use dashboard to redeploy previous version
**Netlify**: Rollback from deploy history
**Manual**: Keep previous `dist/` directory as backup

---

For issues or questions, open an issue in the repository.
