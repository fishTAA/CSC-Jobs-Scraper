FROM mcr.microsoft.com/playwright:v1.51.1-jammy


WORKDIR /app

COPY package*.json ./
RUN npm ci

# Install ts-node for running TypeScript directly
RUN npm install -g ts-node typescript

COPY . .

# Run your TypeScript entry file
CMD ["ts-node", "index.ts"]
