# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Voice Karte 4 is a full-stack medical transcription application that records/uploads audio, transcribes it using Google's Gemini API, and generates medical documents (SOAP notes, referral letters, etc.) in Japanese.

## Tech Stack

- **Frontend**: React 18 + TypeScript + Vite
- **Backend**: Express.js (ES modules) on port 3004
- **API**: Google Gemini API for transcription and text generation
- **File handling**: Multer for uploads, files stored in `uploads/` and `transcripts/`

## Development Commands

```bash
npm install          # Install dependencies
npm run dev         # Start both frontend (Vite) and backend (nodemon) concurrently
npm run build       # Build for production (TypeScript + Vite)
npm run lint        # Run ESLint
npm start           # Start Express server only
```

## Architecture

- **Frontend entry**: `src/main.tsx` → `src/App.tsx` (all UI logic in single component)
- **Backend entry**: `server.js` (Express server with API endpoints)
- **API proxy**: Vite proxies `/api/*` requests to `http://localhost:3004`
- **State management**: React useState hooks, localStorage for API key and mode settings
- **File persistence**: Audio files saved to `uploads/`, transcripts to `transcripts/`

## Key API Endpoints

- `POST /api/set-api-key` - Store API key in server memory
- `POST /api/transcribe` - Transcribe uploaded audio file
- `POST /api/generate` - Generate medical text from transcription
- `DELETE /api/clear-data` - Remove all uploaded files and transcripts