# Use official Node.js LTS lightweight image
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Install dependencies needed for node-gyp / native modules if needed
RUN apk add --no-cache openssl

# Copy package files
COPY package*.json ./
COPY prisma ./prisma/

# Install production dependencies
RUN npm ci

# Generate Prisma Client & prepare database
RUN npx prisma generate

# Copy source files
COPY . .

# Expose HTTP health-check port
EXPOSE 3000

# Set environment
ENV NODE_ENV=production

# Start the bot
CMD ["npm", "start"]
