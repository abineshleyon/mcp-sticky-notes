const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();

// RENDER FIX: Use the port Render assigns, or 3500 if running locally
const PORT = process.env.PORT || 3500;

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
    inputSchema: { type: "object", properties: {}, required: [] }
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
// ---------------------------------------------------------
app.get('/sse', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });

  res.write(`event: endpoint\ndata: /messages\n\n`);
  console.log("✅ New SSE connection established");

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
// ---------------------------------------------------------
app.post('/messages', async (req, res) => {
  const message = req.body;
  
  if (!message.method) {
    return res.status(400).json({ error: "Invalid JSON-RPC message" });
  }

  try {
    let result = null;

    switch (message.method) {
      case 'initialize':
        result = {
          protocolVersion: "2024-11-05",
          capabilities: { tools: {} },
          serverInfo: { name: SERVER_NAME, version: SERVER_VERSION }
        };
        break;

      case 'notifications/initialized':
        break;

      case 'tools/list':
        result = { tools: mcpTools };
        break;

      case 'tools/call':
        result = await handleToolCall(message.params.name, message.params.arguments);
        break;

      default:
        // Ignore unknown methods
        break;
    }

    if (message.id !== undefined) {
      res.json({ jsonrpc: "2.0", id: message.id, result: result });
    } else {
      res.status(200).end();
    }

  } catch (error) {
    console.error("Error processing message:", error);
    if (message.id !== undefined) {
      res.json({
        jsonrpc: "2.0", id: message.id,
        error: { code: -32603, message: error.message }
      });
    } else {
      res.status(500).end();
    }
  }
});

// Helper function
async function handleToolCall(name, args) {
  switch (name) {
    case 'list_notes':
      return { content: [{ type: "text", text: JSON.stringify(notesStore, null, 2) }] };
    case 'create_note':
      const newNote = { id: Date.now().toString(36), title: args.title, text: args.text };
      notesStore.unshift(newNote);
      return { content: [{ type: "text", text: `Note created: ${newNote.title}` }] };
    case 'update_note':
      const index = notesStore.findIndex(n => n.id === args.id);
      if (index === -1) throw new Error("Note not found");
      notesStore[index] = { ...notesStore[index], ...args };
      return { content: [{ type: "text", text: `Note updated: ${notesStore[index].title}` }] };
    case 'delete_note':
      notesStore = notesStore.filter(n => n.id !== args.id);
      return { content: [{ type: "text", text: "Note deleted successfully" }] };
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// ---------------------------------------------------------
// 3. Other Endpoints
// ---------------------------------------------------------
app.get('/', (req, res) => {
  res.send('Sticky Notes MCP Server is running. Use /sse to connect. this is the testing for render taking new changes or not');
});

app.post('/sync', (req, res) => {
  const { notes } = req.body;
  notesStore = notes || [];
  res.json({ success: true, count: notesStore.length });
});

app.get('/notes', (req, res) => {
  res.json({ notes: notesStore });
});

// LISTEN ON 0.0.0.0 (Important for Render)
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 MCP Server running on port ${PORT}`);
});
