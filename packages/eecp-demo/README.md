# @digitaldefiance/eecp-demo

Reference web application demonstrating EECP capabilities. Features rich text editing with Quill, participant sidebar, countdown timer, shareable links, and document export functionality.

## Features

- **Rich text editor** with formatting controls
- **Participant list** with online status indicators
- **Countdown timer** showing workspace expiration
- **Shareable link generation** with embedded credentials
- **Document export** to plaintext

## Installation

```bash
npm install @digitaldefiance/eecp-demo
# or
yarn add @digitaldefiance/eecp-demo
```

## Quick Start

### Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Open browser to http://localhost:5173
```

### Production Build

```bash
# Build for production
npm run build

# Preview production build
npm run preview
```

## Usage

### Creating a Workspace

1. Click "Create New Workspace"
2. Configure workspace settings:
   - Duration (1-24 hours)
   - Maximum participants (1-100)
3. Click "Create"
4. Share the generated link with collaborators

### Joining a Workspace

1. Open the shared link in your browser
2. The workspace ID and key are embedded in the URL
3. Automatically connects and loads the document

### Collaborative Editing

- Type in the editor to insert text
- Use formatting toolbar for bold, italic, lists, etc.
- Changes sync in real-time with other participants
- See participant list in the sidebar
- Watch countdown timer for workspace expiration

### Exporting Documents

1. Click "Export" button
2. Choose format (plaintext or markdown)
3. Document downloads to your device

## Features in Detail

### Rich Text Editor

Built with Quill editor, supporting:
- Bold, italic, underline, strikethrough
- Headings (H1-H6)
- Bullet and numbered lists
- Block quotes
- Code blocks
- Links
- Text alignment
- Color and background color

### Participant Management

- Real-time participant list
- Online/offline status indicators
- Participant join/leave notifications
- Participant count display

### Workspace Lifecycle

- Countdown timer showing time remaining
- Automatic workspace expiration
- Warning notifications before expiration
- Workspace extension capability (if authorized)

### Shareable Links

Generated links include:
- Workspace ID
- Participant key (encrypted in URL)
- Server URL
- Automatic connection on load

Example:
```
https://your-demo.com/?workspace=550e8400...&key=base64...&server=wss://server.com
```

## Configuration

Create a `.env` file in the demo directory:

```env
VITE_EECP_SERVER_URL=wss://your-server.com
VITE_DEFAULT_WORKSPACE_DURATION=3600000
VITE_MAX_PARTICIPANTS=10
```

## Deployment

### Vercel

```bash
npm install -g vercel
vercel deploy
```

### Netlify

```bash
npm install -g netlify-cli
netlify deploy --prod
```

### Docker

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build
EXPOSE 5173
CMD ["npm", "run", "preview"]
```

Build and run:
```bash
docker build -t eecp-demo .
docker run -p 5173:5173 eecp-demo
```

## Technology Stack

- **React 19** - UI framework
- **Vite** - Build tool and dev server
- **Quill** - Rich text editor
- **Material-UI** - Component library

## Related Packages

- [@digitaldefiance/eecp-protocol](../eecp-protocol) - Protocol definitions
- [@digitaldefiance/eecp-crypto](../eecp-crypto) - Cryptographic primitives
- [@digitaldefiance/eecp-client](../eecp-client) - Browser client
- [@digitaldefiance/eecp-server](../eecp-server) - Server implementation

## License

MIT
