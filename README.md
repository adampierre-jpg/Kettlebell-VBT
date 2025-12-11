# Kettlebell VBT (Velocity-Based Training)

AI-powered velocity analysis for kettlebell training using Google Gemini's video understanding.

## What It Does

1. User uploads a video of their kettlebell set
2. User defines their protocol (exercise, reps, intervals, arm pattern)
3. Gemini AI analyzes the video frame-by-frame
4. Returns rep-by-rep velocity metrics, fatigue analysis, and coaching notes

## Tech Stack

- **Frontend**: Vanilla HTML/CSS/JS (no framework overhead)
- **Backend**: Vercel Serverless Functions
- **AI**: Google Gemini 1.5 Pro (video analysis)
- **Hosting**: Vercel (free tier)

## Setup Instructions

### 1. Get a Gemini API Key (Free)

1. Go to [Google AI Studio](https://aistudio.google.com)
2. Sign in with your Google account
3. Click "Get API Key" in the left sidebar
4. Create a new API key
5. Copy and save it somewhere safe

### 2. Install Prerequisites

You need:
- [Node.js](https://nodejs.org) (version 18 or higher)
- [Git](https://git-scm.com) (for version control)
- A [GitHub](https://github.com) account
- A [Vercel](https://vercel.com) account (free, sign up with GitHub)

### 3. Deploy to Vercel

**Option A: One-Click Deploy (Easiest)**

Once the repo is on GitHub, you can import it directly to Vercel:

1. Go to [vercel.com/new](https://vercel.com/new)
2. Import your GitHub repository
3. In "Environment Variables", add:
   - Name: `GEMINI_API_KEY`
   - Value: Your API key from step 1
4. Click "Deploy"

**Option B: Command Line Deploy**

```bash
# Install Vercel CLI globally
npm install -g vercel

# Navigate to project folder
cd kettlebell-vbt

# Login to Vercel
vercel login

# Deploy (follow prompts)
vercel

# When asked about environment variables, add:
# GEMINI_API_KEY = your-api-key-here

# For production deployment:
vercel --prod
```

### 4. Test It

1. Open your deployed URL
2. Set your protocol (exercise, reps, intervals)
3. Upload a video of your kettlebell set
4. Click "Analyze Video"
5. Review your velocity metrics

## Local Development

```bash
# Install dependencies
npm install

# Create .env file with your API key
echo "GEMINI_API_KEY=your-key-here" > .env

# Run local dev server
npm run dev
```

Then open http://localhost:3000

## Cost Breakdown

| Service | Free Tier | Your Usage |
|---------|-----------|------------|
| Vercel Hosting | 100GB bandwidth/month | ~0.01GB |
| Vercel Functions | 100 hours/month | ~0.1 hours |
| Gemini API | 15 requests/minute, 1500/day | ~10-50/day |

**Total: $0/month** at typical usage levels

## Limitations

- Video file size: 100MB max
- Analysis accuracy depends on video quality and angle
- Side-view videos provide better velocity tracking than front-view
- Gemini's velocity estimates are relative (not absolute m/s)

## Future Enhancements

- [ ] Session history (local storage)
- [ ] Export to CSV
- [ ] Compare sessions over time
- [ ] Absolute velocity calculation (with reference markers)
- [ ] Integration with training logs

## Files

```
kettlebell-vbt/
├── index.html      # Main app UI
├── styles.css      # Styling
├── app.js          # Frontend logic
├── api/
│   └── analyze.js  # Gemini API integration
├── package.json    # Dependencies
├── vercel.json     # Deployment config
└── README.md       # This file
```

## Support

Built for Essential Fitness by Claude.
