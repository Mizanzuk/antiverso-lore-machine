# Lore Machine

A powerful tool for managing and organizing fictional universes, characters, events, and narrative elements.

## Features

- **Next.js 14** (App Router)
- **AI-powered chat** with Urizen (consultation) and Urthona (creation) agents
- **RAG (Retrieval-Augmented Generation)** with Supabase + OpenAI embeddings
- **Lore extraction** from text documents (PDF, DOCX, TXT)
- **Timeline visualization** for events and narrative chronology
- **Relationship mapping** between lore entries
- **Multi-universe support** with hierarchical world organization

## Getting Started

### Step 1 — Create Supabase Project

1. Go to [Supabase](https://supabase.com) and create a new project.
2. Navigate to **SQL Editor**.
3. Copy the entire content of `schema.sql`.
4. Paste it into the editor and execute.
5. Confirm that all tables were created successfully.

### Step 2 — Deploy to Vercel

1. Fork or clone this repository
2. Go to [Vercel](https://vercel.com) and import your repository
3. Add the following environment variables:
   - `OPENAI_API_KEY` → your OpenAI API key
   - `NEXT_PUBLIC_SUPABASE_URL` → your Supabase project URL
   - `SUPABASE_SERVICE_ROLE_KEY` → your Supabase service role key
4. Deploy!

### Step 3 — Start Using

Open your deployed site and start creating your fictional universe!

## Usage

### Creating a Universe

1. Go to the home page
2. Click "+ New Universe"
3. Enter a name and description
4. Start adding worlds and lore entries

### Extracting Lore from Documents

1. Navigate to "Upload" page
2. Select your universe and world
3. Upload a text document (PDF, DOCX, or TXT)
4. The AI will automatically extract characters, locations, events, and other lore elements
5. Review and save the extracted entries to your catalog

### Managing Lore

Use the "Admin" page to:
- Browse all lore entries
- Edit and update entries
- View relationships between entries
- Organize entries by type and world

## AI Agents

- **Urizen:** Consultation mode - answers questions based on existing lore
- **Urthona:** Creative mode - helps generate new narrative ideas while respecting established lore

## License

MIT

## Credits

Built with Next.js, Supabase, and OpenAI.
