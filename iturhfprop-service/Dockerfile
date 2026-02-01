FROM ubuntu:22.04

# Prevent interactive prompts during build
ENV DEBIAN_FRONTEND=noninteractive

# Install build tools and Node.js
RUN apt-get update && apt-get install -y \
    git \
    build-essential \
    curl \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# Clone and build ITURHFProp
WORKDIR /opt
RUN git clone https://github.com/G4FKH/ITURHFProp.git iturhfprop

WORKDIR /opt/iturhfprop/Linux
RUN make

# Verify build
RUN ls -la /opt/iturhfprop/Linux/ITURHFProp

# Create data directory for coefficient files
RUN mkdir -p /opt/iturhfprop/data

# Set up the API service
WORKDIR /app
COPY package.json ./
RUN npm install --production

COPY server.js ./

# Environment
ENV PORT=3000
ENV ITURHFPROP_PATH=/opt/iturhfprop/Linux/ITURHFProp
ENV ITURHFPROP_DATA=/opt/iturhfprop/Data

EXPOSE 3000

CMD ["node", "server.js"]
