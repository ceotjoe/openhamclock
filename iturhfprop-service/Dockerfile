FROM ubuntu:22.04

# Prevent interactive prompts during build
ENV DEBIAN_FRONTEND=noninteractive

# Install Node.js and utilities
RUN apt-get update && apt-get install -y \
    curl \
    tar \
    ca-certificates \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# Create directory for ITURHFProp
WORKDIR /opt/iturhfprop

# Download individual binary files from v14.3 release (latest)
RUN curl -L -o ITURHFProp "https://github.com/ITU-R-Study-Group-3/ITU-R-HF/releases/download/v14.3/ITURHFProp" \
    && curl -L -o libp533.so "https://github.com/ITU-R-Study-Group-3/ITU-R-HF/releases/download/v14.3/libp533.so" \
    && curl -L -o libp372.so "https://github.com/ITU-R-Study-Group-3/ITU-R-HF/releases/download/v14.3/libp372.so" \
    && chmod +x ITURHFProp

# Download source to get Data files - use wildcard to handle directory naming
RUN curl -L -o source.tar.gz "https://github.com/ITU-R-Study-Group-3/ITU-R-HF/archive/refs/tags/v14.3.tar.gz" \
    && tar -xzf source.tar.gz \
    && ls -la \
    && mv ITU-R-HF-*/Data . \
    && mv ITU-R-HF-*/IonMap . \
    && rm -rf ITU-R-HF-* source.tar.gz

# Set library path so ITURHFProp can find shared libs
ENV LD_LIBRARY_PATH=/opt/iturhfprop:$LD_LIBRARY_PATH

# Verify installation
RUN echo "=== Binary files ===" && ls -la /opt/iturhfprop/*.so /opt/iturhfprop/ITURHFProp \
    && echo "=== Data directory ===" && ls /opt/iturhfprop/Data/ | head -10 \
    && echo "=== IonMap directory ===" && ls /opt/iturhfprop/IonMap/ | head -5

# Set up the API service
WORKDIR /app
COPY package.json ./
RUN npm install --production

COPY server.js ./

# Environment
ENV PORT=3000
ENV ITURHFPROP_PATH=/opt/iturhfprop/ITURHFProp
ENV ITURHFPROP_DATA=/opt/iturhfprop

EXPOSE 3000

CMD ["node", "server.js"]
