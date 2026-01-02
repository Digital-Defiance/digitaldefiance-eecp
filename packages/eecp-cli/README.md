# @digitaldefiance/eecp-cli

Command-line interface for testing and automation. Create workspaces, join sessions, export documents, and interact with EECP from the terminal with a full-featured interactive editor.

## Features

- **Create workspaces** with configurable duration
- **Join workspaces** with ID and key
- **Interactive terminal-based collaborative editor**
- **Export documents** to plaintext files
- **List active workspaces and participants**

## Installation

```bash
npm install -g @digitaldefiance/eecp-cli
# or
yarn global add @digitaldefiance/eecp-cli
```

## Commands

### Create Workspace

Create a new collaborative workspace:

```bash
eecp create [options]

Options:
  -s, --server <url>      Server URL (default: "ws://localhost:3000")
  -d, --duration <ms>     Workspace duration in milliseconds (default: 3600000)
  -m, --max-participants  Maximum participants (default: 10)
  -o, --output <file>     Save credentials to file
  -v, --verbose           Verbose output

Example:
eecp create --duration 7200000 --max-participants 5 --output workspace.json
```

Output:
```json
{
  "workspaceId": "550e8400-e29b-41d4-a716-446655440000",
  "masterKey": "base64-encoded-key",
  "expiresAt": "2026-01-01T12:00:00.000Z",
  "joinUrl": "eecp join --server ws://localhost:3000 --workspace 550e8400... --key base64..."
}
```

### Join Workspace

Join an existing workspace and start collaborative editing:

```bash
eecp join [options]

Options:
  -s, --server <url>       Server URL (required)
  -w, --workspace <id>     Workspace ID (required)
  -k, --key <key>          Master key (required)
  -i, --input <file>       Load credentials from file
  -n, --name <name>        Participant name (default: auto-generated)
  -v, --verbose            Verbose output

Example:
eecp join --server ws://localhost:3000 --workspace 550e8400... --key base64...

# Or load from file:
eecp join --input workspace.json
```

### Interactive Editor

Once joined, you'll enter an interactive terminal editor:

```
╔════════════════════════════════════════════════════════════╗
║  EECP Collaborative Editor                                 ║
║  Workspace: 550e8400-e29b-41d4-a716-446655440000          ║
║  Participants: 3                                           ║
║  Expires: 2026-01-01 12:00:00                             ║
╚════════════════════════════════════════════════════════════╝

[Document content appears here]

Commands:
  :help     Show help
  :save     Export document
  :quit     Exit editor
  :status   Show workspace status
  :list     List participants
```

### Export Document

Export the current document to a file:

```bash
eecp export [options]

Options:
  -s, --server <url>       Server URL (required)
  -w, --workspace <id>     Workspace ID (required)
  -k, --key <key>          Master key (required)
  -o, --output <file>      Output file (default: stdout)
  -f, --format <format>    Output format: text, json (default: text)

Example:
eecp export --server ws://localhost:3000 --workspace 550e8400... --key base64... --output document.txt
```

### List Workspaces

List active workspaces on the server:

```bash
eecp list [options]

Options:
  -s, --server <url>  Server URL (default: "ws://localhost:3000")
  -v, --verbose       Show detailed information

Example:
eecp list --server ws://localhost:3000
```

Output:
```
Active Workspaces:
┌──────────────────────────────────────┬─────────────┬──────────────┬────────────────────┐
│ Workspace ID                         │ Participants│ Max          │ Expires            │
├──────────────────────────────────────┼─────────────┼──────────────┼────────────────────┤
│ 550e8400-e29b-41d4-a716-446655440000 │ 3           │ 10           │ 2026-01-01 12:00   │
│ 660e8400-e29b-41d4-a716-446655440001 │ 1           │ 5            │ 2026-01-01 13:30   │
└──────────────────────────────────────┴─────────────┴──────────────┴────────────────────┘
```

### Extend Workspace

Extend the duration of an existing workspace:

```bash
eecp extend [options]

Options:
  -s, --server <url>       Server URL (required)
  -w, --workspace <id>     Workspace ID (required)
  -k, --key <key>          Master key (required)
  -d, --duration <ms>      Additional duration in milliseconds (required)

Example:
eecp extend --server ws://localhost:3000 --workspace 550e8400... --key base64... --duration 3600000
```

### Revoke Workspace

Immediately revoke a workspace:

```bash
eecp revoke [options]

Options:
  -s, --server <url>       Server URL (required)
  -w, --workspace <id>     Workspace ID (required)
  -k, --key <key>          Master key (required)
  -y, --yes                Skip confirmation

Example:
eecp revoke --server ws://localhost:3000 --workspace 550e8400... --key base64...
```

## Automation Examples

### Scripted Workspace Creation

```bash
#!/bin/bash

# Create workspace and save credentials
eecp create --duration 7200000 --output workspace.json

# Extract workspace ID
WORKSPACE_ID=$(jq -r '.workspaceId' workspace.json)

echo "Created workspace: $WORKSPACE_ID"
echo "Share this command with collaborators:"
echo "eecp join --input workspace.json"
```

### Automated Document Export

```bash
#!/bin/bash

# Export document every 5 minutes
while true; do
  eecp export \
    --server ws://localhost:3000 \
    --workspace $WORKSPACE_ID \
    --key $MASTER_KEY \
    --output "backup-$(date +%Y%m%d-%H%M%S).txt"
  
  sleep 300
done
```

### CI/CD Integration

```yaml
# .github/workflows/test-collaboration.yml
name: Test Collaboration

on: [push]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      
      - name: Install EECP CLI
        run: npm install -g @digitaldefiance/eecp-cli
      
      - name: Start EECP Server
        run: |
          npx @digitaldefiance/eecp-server &
          sleep 5
      
      - name: Create Workspace
        run: |
          eecp create --output workspace.json
          cat workspace.json
      
      - name: Test Collaboration
        run: |
          # Join workspace and insert text
          echo "Test content" | eecp join --input workspace.json --non-interactive
          
          # Export and verify
          eecp export --input workspace.json --output result.txt
          grep "Test content" result.txt
```

## Configuration File

Create a `.eecprc` file in your home directory for default settings:

```json
{
  "server": "ws://localhost:3000",
  "defaultDuration": 3600000,
  "defaultMaxParticipants": 10,
  "editor": {
    "theme": "dark",
    "lineNumbers": true,
    "autoSave": true
  }
}
```

## Environment Variables

- `EECP_SERVER` - Default server URL
- `EECP_WORKSPACE` - Default workspace ID
- `EECP_KEY` - Default master key
- `EECP_LOG_LEVEL` - Log level (debug, info, warn, error)

## Interactive Editor Shortcuts

- `Ctrl+S` - Save/export document
- `Ctrl+Q` - Quit editor
- `Ctrl+L` - Clear screen
- `Ctrl+P` - Show participants
- `Ctrl+H` - Show help
- `Ctrl+R` - Refresh document

## Technology Stack

- **TypeScript** - Type-safe implementation
- **Commander.js** - CLI framework
- **Node.js** - Runtime environment

## Related Packages

- [@digitaldefiance/eecp-protocol](../eecp-protocol) - Protocol definitions
- [@digitaldefiance/eecp-crypto](../eecp-crypto) - Cryptographic primitives
- [@digitaldefiance/eecp-client](../eecp-client) - Client library
- [@digitaldefiance/eecp-server](../eecp-server) - Server implementation

## License

MIT
