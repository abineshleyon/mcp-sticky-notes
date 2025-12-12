const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
const PORT = 3500;

// Store notes in memory (resets on restart)
let notesStore = [];

// Middleware
app.use(cors());
app.use(bodyParser.json());

// ---------------------------------------------------------
// MCP Constants & Tools Definition
// ---------------------------------------------------------
const SERVER_NAME = "sticky-notes-mcp";
const SERVER_VERSION = "1.0.0";

const mcpTools = [
  {
    name: "list_notes",
    description: "Get all sticky notes from the Chrome extension",
    inputSchema: {
      type: "object",
      properties: {},
      required: []
    }
  },
  {
    name: "create_note",
    description: "Create a new sticky note",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "The title of the note" },
        text: { type: "string", description: "The content of the note" }
      },
      required: ["title", "text"]
    }
  },
  {
    name: "update_note",
    description: "Update an existing sticky note",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "The ID of the note to update" },
        title: { type: "string", description: "The new title of the note" },
        text: { type: "string", description: "The new content of the note" }
      },
      required: ["id"]
    }
  },
  {
    name: "delete_note",
    description: "Delete a sticky note",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "The ID of the note to delete" }
      },
      required: ["id"]
    }
  }
];

// ---------------------------------------------------------
// 1. SSE Endpoint (The Connection)
// ChatGPT connects here to start the session.
// ---------------------------------------------------------
app.get('/sse', (req, res) => {
  // Set headers for Server-Sent Events
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });

  // Send the "endpoint" event.
  // This tells ChatGPT where to send the actual commands (POST requests).
  // We use a relative path "/messages".
  res.write(`event: endpoint\ndata: /messages\n\n`);

  console.log("✅ New SSE connection established");

  // Keep the connection alive
  const keepAlive = setInterval(() => {
    res.write(': keep-alive\n\n');
  }, 15000);

  req.on('close', () => {
    console.log("❌ SSE connection closed");
    clearInterval(keepAlive);
  });
});

// ---------------------------------------------------------
// 2. Messages Endpoint (The Logic)
// ChatGPT sends commands (JSON-RPC) here.
// ---------------------------------------------------------
app.post('/messages', async (req, res) => {
  const message = req.body;
  
  // Basic JSON-RPC validation
  if (!message.method) {
    return res.status(400).json({ error: "Invalid JSON-RPC message" });
  }

  console.log(`📩 Received method: ${message.method}`);

  try {
    let result = null;

    switch (message.method) {
      // --- Initialization ---
      case 'initialize':
        result = {
          protocolVersion: "2024-11-05",
          capabilities: {
            tools: {} // We support tools
          },
          serverInfo: {
            name: SERVER_NAME,
            version: SERVER_VERSION
          }
        };
        break;

      case 'notifications/initialized':
        // Just an acknowledgement, no response data needed
        break;

      // --- Tool Listing ---
      case 'tools/list':
        result = {
          tools: mcpTools
        };
        break;

      // --- Tool Execution ---
      case 'tools/call':
        result = await handleToolCall(message.params.name, message.params.arguments);
        break;

      default:
        // Ignore unknown methods or pings
        break;
    }

    // Send valid JSON-RPC response
    if (message.id !== undefined) {
      res.json({
        jsonrpc: "2.0",
        id: message.id,
        result: result
      });
    } else {
      // Notifications (no ID) don't get a response
      res.status(200).end();
    }

  } catch (error) {
    console.error("Error processing message:", error);
    if (message.id !== undefined) {
      res.json({
        jsonrpc: "2.0",
        id: message.id,
        error: {
          code: -32603,
          message: error.message
        }
      });
    } else {
      res.status(500).end();
    }
  }
});

// Helper function to handle tool logic
async function handleToolCall(name, args) {
  switch (name) {
    case 'list_notes':
      return {
        content: [{ type: "text", text: JSON.stringify(notesStore, null, 2) }]
      };

    case 'create_note':
      const newNote = {
        id: Date.now().toString(36),
        title: args.title,
        text: args.text,
        timestamp: new Date().toISOString()
      };
      notesStore.unshift(newNote);
      return {
        content: [{ type: "text", text: `Note created: ${newNote.title} (ID: ${newNote.id})` }]
      };

    case 'update_note':
      const index = notesStore.findIndex(n => n.id === args.id);
      if (index === -1) throw new Error("Note not found");
      
      notesStore[index] = { ...notesStore[index], ...args };
      return {
        content: [{ type: "text", text: `Note updated: ${notesStore[index].title}` }]
      };

    case 'delete_note':
      const initialLength = notesStore.length;
      notesStore = notesStore.filter(n => n.id !== args.id);
      if (notesStore.length === initialLength) throw new Error("Note not found");
      return {
        content: [{ type: "text", text: "Note deleted successfully" }]
      };

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// ---------------------------------------------------------
// 3. Other Endpoints (Root & Chrome Extension)
// ---------------------------------------------------------

// Root endpoint - Health check
app.get('/', (req, res) => {
  res.send('Sticky Notes MCP Server is running. Use /sse to connect.');
});

// Chrome Extension: Sync
app.post('/sync', (req, res) => {
  const { notes } = req.body;
  if (Array.isArray(notes)) {
    notesStore = notes;
    res.json({ success: true, count: notesStore.length });
  } else {
    res.status(400).json({ error: "Invalid notes data" });
  }
});

// Chrome Extension: Get
app.get('/notes', (req, res) => {
  res.json({ notes: notesStore });
});

app.listen(PORT, () => {
  console.log(`🚀 MCP Server running on port ${PORT}`);
});

module.exports = app;
