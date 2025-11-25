# Build stage
FROM gradle:jdk21 AS build
WORKDIR /app

# Copy root gradle files
COPY build.gradle settings.gradle gradlew ./
COPY gradle ./gradle

# Copy server source
COPY server ./server

# Build the server
RUN ./gradlew :server:installDist

# Run stage
FROM eclipse-temurin:21-jre

WORKDIR /app

# Copy built application from build stage
COPY --from=build /app/server/build/install/server ./

# Expose ports
# 10000: Ice
# 8888: Audio WebSocket
# 12345: TCP JSON
EXPOSE 10000 8888 12345

# Run the server
CMD ["./bin/server"]
