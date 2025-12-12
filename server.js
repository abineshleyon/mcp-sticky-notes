const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
const PORT = 3500;

// Store notes in memory (you can add database later)
let notesStore = [];

// Middleware
app.use(cors());
app.use(bodyParser.json());

// MCP Tools/Resources for ChatGPT
const mcpTools = {
  tools: [
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
          title: {
            type: "string",
            description: "The title of the note"
          },
          text: {
            type: "string",
            description: "The content of the note"
          }
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
          id: {
            type: "string",
            description: "The ID of the note to update"
          },
          title: {
            type: "string",
            description: "The new title of the note"
          },
          text: {
            type: "string",
            description: "The new content of the note"
          }
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
          id: {
            type: "string",
            description: "The ID of the note to delete"
          }
        },
        required: ["id"]
      }
    },
    {
      name: "search_notes",
      description: "Search notes by keyword in title or content",
      inputSchema: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "The search query"
          }
        },
        required: ["query"]
      }
    }
  ]
};

// MCP Protocol Endpoints

// Initialize - Called when ChatGPT connects
app.post('/mcp/initialize', (req, res) => {
  res.json({
    protocolVersion: "2024-11-05",
    capabilities: {
      tools: {},
      resources: {}
    },
    serverInfo: {
      name: "sticky-notes-mcp",
      version: "1.0.0"
    }
  });
});

// List available tools
app.post('/mcp/tools/list', (req, res) => {
  res.json(mcpTools);
});

// Execute tool calls from ChatGPT
app.post('/mcp/tools/call', async (req, res) => {
  const { name, arguments: args } = req.body;

  try {
    let result;

    switch (name) {
      case 'list_notes':
        result = {
          content: [
            {
              type: "text",
              text: JSON.stringify(notesStore, null, 2)
            }
          ]
        };
        break;

      case 'create_note':
        const newNote = {
          id: Date.now().toString(36) + Math.random().toString(36).substr(2),
          title: args.title,
          text: args.text,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        notesStore.unshift(newNote);
        result = {
          content: [
            {
              type: "text",
              text: `Note created successfully: ${JSON.stringify(newNote, null, 2)}`
            }
          ]
        };
        break;

      case 'update_note':
        const noteIndex = notesStore.findIndex(n => n.id === args.id);
        if (noteIndex === -1) {
          throw new Error('Note not found');
        }
        notesStore[noteIndex] = {
          ...notesStore[noteIndex],
          ...(args.title && { title: args.title }),
          ...(args.text && { text: args.text }),
          updatedAt: new Date().toISOString()
        };
        result = {
          content: [
            {
              type: "text",
              text: `Note updated successfully: ${JSON.stringify(notesStore[noteIndex], null, 2)}`
            }
          ]
        };
        break;

      case 'delete_note':
        const initialLength = notesStore.length;
        notesStore = notesStore.filter(n => n.id !== args.id);
        if (notesStore.length === initialLength) {
          throw new Error('Note not found');
        }
        result = {
          content: [
            {
              type: "text",
              text: `Note deleted successfully`
            }
          ]
        };
        break;

      case 'search_notes':
        const query = args.query.toLowerCase();
        const matches = notesStore.filter(n => 
          n.title.toLowerCase().includes(query) || 
          n.text.toLowerCase().includes(query)
        );
        result = {
          content: [
            {
              type: "text",
              text: `Found ${matches.length} notes:\n${JSON.stringify(matches, null, 2)}`
            }
          ]
        };
        break;

      default:
        throw new Error(`Unknown tool: ${name}`);
    }

    res.json(result);
  } catch (error) {
    res.status(400).json({
      error: {
        code: "TOOL_EXECUTION_ERROR",
        message: error.message
      }
    });
  }
});

// Chrome Extension Endpoints

// Sync notes from Chrome extension
app.post('/sync', (req, res) => {
  const { notes } = req.body;
  notesStore = notes || [];
  res.json({ 
    success: true, 
    message: 'Notes synced successfully',
    count: notesStore.length 
  });
});

// Get all notes (for Chrome extension)
app.get('/notes', (req, res) => {
  res.json({ notes: notesStore });
});

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy',
    notesCount: notesStore.length,
    timestamp: new Date().toISOString()
  });
});

app.listen(PORT, () => {
  console.log(`🚀 MCP Server running on http://localhost:${PORT}`);
  console.log(`📝 Notes count: ${notesStore.length}`);
  console.log(`\n💡 To connect to ChatGPT:`);
  console.log(`   1. Go to ChatGPT Developer Mode settings`);
  console.log(`   2. Add custom MCP server`);
  console.log(`   3. Use URL: http://localhost:${PORT}`);
  console.log(`   4. Authentication: None`);
});