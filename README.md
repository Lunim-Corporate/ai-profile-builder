# Profile Automator

AI-powered profile builder that transforms any creative professional's online presence into a comprehensive, verified portfolio.
Now integrated into tabb.

## Features

- **Automatic Profile Generation**: Enter a URL (portfolio site, social media, IMDb page) and get a complete professional profile
- **Multi-Platform Aggregation**: Pulls data from IMDb, TMDB, YouTube, Vimeo, LinkedIn, and more
- **AI-Powered Synthesis**: Uses Perplexity for search enrichment and Google Gemini for intelligent profile generation
- **Video Integration**: Automatically finds trailers and videos for projects
- **Editable Content**: Edit profile pictures and project cover images with custom URLs
- **Dark/Light Mode**: Full theme support

## Prerequisites

- **Node.js** 18.x or higher
- **npm** or **yarn**
- **PostgreSQL** database (optional, uses in-memory storage by default)

## API Keys Required

You'll need to obtain API keys from the following services:

| Service | Purpose | Get Key At |
|---------|---------|-----------|
| **Google Gemini** | AI profile synthesis | [Google AI Studio](https://aistudio.google.com/) |
| **Perplexity** | Search enrichment | [Perplexity API](https://www.perplexity.ai/) |
| **TMDB** | Movie/TV posters & person photos | [TMDB API](https://www.themoviedb.org/settings/api) |
| **YouTube** | Video search & thumbnails | [Google Cloud Console](https://console.cloud.google.com/) |
| **Vimeo** | Video search & thumbnails | [Vimeo Developer](https://developer.vimeo.com/) |
| **OMDB** (optional) | Additional movie data | [OMDB API](http://www.omdbapi.com/apikey.aspx) |

## Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/YOUR_USERNAME/profile-automator.git
   cd profile-automator
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   
   Create a `.env` file in the root directory:
   ```env
   # Required API Keys
   GEMINI_API_KEY=your_gemini_api_key
   PERPLEXITY_API_KEY=your_perplexity_api_key
   TMDB_API_KEY=your_tmdb_api_key
   YOUTUBE_API_KEY=your_youtube_api_key
   VIMEO_API_KEY=your_vimeo_api_key
   
   # Optional
   OMDB_API_KEY=your_omdb_api_key
   SESSION_SECRET=your_random_session_secret
   
   # Database (optional - uses in-memory storage if not provided)
   DATABASE_URL=postgresql://user:password@localhost:5432/profile_automator
   ```

4. **Run database migrations** (if using PostgreSQL)
   ```bash
   npm run db:push
   ```

## Running the Application

### Development Mode

```bash
npm run dev
```

The application will start on **http://localhost:5000**

### Production Build

```bash
# Build the application
npm run build

# Start production server
npm start
```

## Project Structure

```
├── client/                 # Frontend React application
│   ├── src/
│   │   ├── components/    # React components
│   │   ├── pages/         # Page components
│   │   ├── hooks/         # Custom React hooks
│   │   └── lib/           # Utility functions
├── server/                 # Backend Express server
│   ├── services/          # API integrations (TMDB, YouTube, etc.)
│   ├── routes.ts          # API endpoints
│   └── storage.ts         # Data storage interface
├── shared/                 # Shared types and schemas
│   └── schema.ts          # Drizzle ORM schemas
└── package.json
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/profiles/generate` | Generate a new profile from URL |
| GET | `/api/profiles/:id` | Get a profile by ID |
| GET | `/api/profiles` | Get all profiles |
| PATCH | `/api/profiles/:profileId/image` | Update profile image |
| PATCH | `/api/profiles/:profileId/projects/:projectId/cover` | Update project cover image |

## Usage

1. Open the application in your browser
2. Enter a URL (IMDb page, portfolio website, social media profile)
3. Wait for the AI to crawl, aggregate, and synthesize the profile
4. View the generated profile with projects and media

## Tech Stack

- **Frontend**: React, TypeScript, Vite, Tailwind CSS, Shadcn/ui
- **Backend**: Express.js, TypeScript
- **Database**: PostgreSQL with Drizzle ORM (optional)
- **AI**: Google Gemini, Perplexity API
- **APIs**: TMDB, YouTube Data API, Vimeo API

## License

MIT
