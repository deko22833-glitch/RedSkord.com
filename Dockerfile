FROM node:18-alpine

WORKDIR /app

# Install dependencies first (better layer caching)
COPY package*.json ./
RUN npm install --only=production

# Copy source
COPY server ./server
COPY client ./client

# Expose port (platforms will set PORT env)
ENV PORT=3000
EXPOSE 3000

# Start server
CMD ["node", "server/index.js"]


