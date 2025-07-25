# Springs & Pucks Node.js Server

A universal Socket.io server that supports both local HTTPS development and Heroku HTTP production deployment. This server enables real-time multiplayer functionality for the Springs & Pucks physics-simulation games.

This server supports the Springs & Pucks multiplayer physics simulation. For the main game client, visit [triquence.org](https://triquence.org).

The host client is in index.html at triquence.org. Additional players are added using the client.html page. These two pages can also be viewed in the corresponding repository for the triquence.org site:
https://github.com/m-jim-d/springsandpucks.git

## Features

- **Universal Environment Detection**: Automatically switches between HTTPS (local) and HTTP (Heroku) based on environment variables
- **Self-Signed Certificate Generation**: Automatically creates SSL certificates for local HTTPS development
- **Full Multiplayer Support**: Host/client roles, room management, chat messaging, WebRTC signaling
- **Idle Timeout Protection**: Prevents abandoned connections from consuming server resources
- **Cross-Platform**: Works on Windows, Linux, and Heroku

## Quick Start

### Prerequisites
- Node.js (v14 or higher)
- npm

### Installation

1. Clone this repository:
   ```bash
   git clone https://github.com/m-jim-d/springsandpucks-nodejs-server.git
   cd springsandpucks-nodejs-server
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

### Usage

#### Local Development (HTTPS)
```bash
run-server.bat dev
```
- Runs on port 3443 with self-signed SSL certificates
- Access at `https://localhost:3443`
- Browser will show security warning (click "Advanced" → "Proceed to localhost")

#### Production Mode (HTTP)
```bash
run-server.bat prod
```
- Runs on port 3000 without SSL
- Suitable for environments where SSL is handled externally (like Heroku)

#### Direct Node Execution
```bash
# Development mode
NODE_ENV=development node server.js

# Production mode  
NODE_ENV=production node server.js
```

## Environment Variables

- `NODE_ENV`: Set to `production` for HTTP mode, anything else for HTTPS mode
- `HEROKU`: If present, forces production mode regardless of NODE_ENV
- `PORT`: Server port (defaults to 3443 for dev, 3000 for production)

## Server Features

### Multiplayer Functionality
- **Room Management**: Multiple game rooms with unique hosts
- **Real-time Communication**: Chat messaging between players
- **WebRTC Signaling**: Peer-to-peer connection support
- **Mouse/Keyboard Events**: Client input forwarding to host
- **Connection Management**: Automatic user naming and reconnection handling

### Security Features
- **CORS Configuration**: Permissive settings for development
- **SSL Certificate Management**: Automatic generation and renewal
- **Idle Disconnect**: Configurable timeout to prevent resource abuse

## Deployment

### Heroku
This server is designed to work seamlessly with Heroku:

1. The server automatically detects Heroku environment
2. Uses HTTP (Heroku handles SSL termination)
3. Respects Heroku's PORT environment variable

### Local Network
Perfect for local multiplayer gaming:
- Host runs the server and game
- Clients connect from other devices on the same network
- Low latency for responsive gameplay

## File Structure

- `server.js` - Universal Socket.io server with environment detection
- `package.json` - Dependencies and npm scripts
- `run-server.bat` - Windows batch file for easy environment switching
- `.gitignore` - Excludes development files and build artifacts

## License

MIT License - see the license header in `server.js` for full details.
