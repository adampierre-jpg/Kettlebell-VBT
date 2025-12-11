// ============================================
// ============================================
// KETTLEBELL VBT - Gemini Analysis API
// Vercel Serverless Function
// ============================================

const { GoogleGenerativeAI } = require('@google/generative-ai');

// Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

module.exports = async function handler(req, res) {
    // Only allow POST
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { video, mimeType, protocol } = req.body;

        if (!video || !protocol) {
            return res.status(400).json({ error: 'Missing video or protocol data' });
        }

        // Build the analysis prompt
        const prompt = buildPrompt(protocol);

        // Call Gemini with JSON mode
        const model = genAI.getGenerativeModel({ 
            model: 'gemini-1.5-pro',
            generationConfig: {
                responseMimeType: 'application/json'
            }
        });

        const result = await model.generateContent([
            {
                inlineData: {
                    mimeType: mimeType || 'video/mp4',
                    data: video
                }
            },
            { text: prompt }
        ]);

        const response = await result.response;
        const text = response.text();

        // Parse Gemini's response into structured data
        const parsedResults = parseGeminiResponse(text, protocol);

        return res.status(200).json(parsedResults);

    } catch (error) {
        console.error('Analysis error:', error);
        return res.status(500).json({ 
            error: 'Analysis failed', 
            message: error.message 
        });
    }
};

function buildPrompt(protocol) {
    const exerciseName = {
        'snatch': 'kettlebell snatch',
        'swing': 'kettlebell swing',
        'clean': 'kettlebell clean',
        'clean-press': 'kettlebell clean and press',
        'jerk': 'kettlebell jerk'
    }[protocol.exercise] || 'kettlebell exercise';

    const armContext = getArmContext(protocol);

    return `Analyze this kettlebell video for velocity-based training metrics.

PROTOCOL:
- Exercise: ${exerciseName}
- Weight: ${protocol.weight}kg
- Expected: ${protocol.repsPerSet} reps every ${protocol.interval} seconds
- ${armContext}

TASK: For each rep, identify the start time (hip hinge/pull), end time (lockout), duration, and estimate velocity on a 1-10 scale.

Return this exact JSON structure:
{
    "reps": [
        {"repNumber": 1, "arm": "Left", "startTime": "00:03.2", "endTime": "00:04.1", "duration": 0.9, "velocityScore": 8}
    ],
    "summary": {
        "totalReps": 0,
        "avgDuration": 0.0,
        "avgVelocity": 0.0,
        "fastestRep": 1,
        "slowestRep": 1,
        "velocityDropPercent": 0.0
    },
    "coachingNotes": "Brief observation about consistency, fatigue, technique."
}`;
}

function getArmContext(protocol) {
    switch (protocol.armPattern) {
        case 'left-only':
            return 'All reps are performed with the LEFT arm.';
        case 'right-only':
            return 'All reps are performed with the RIGHT arm.';
        case 'alternating-sets':
            return `Arms alternate each set (every ${protocol.interval} seconds). Starting arm: ${protocol.startingArm.toUpperCase()}. So sets 1,3,5... use ${protocol.startingArm}, sets 2,4,6... use the other arm.`;
        case 'alternating-reps':
            return `Arms alternate each rep. Starting arm: ${protocol.startingArm.toUpperCase()}.`;
        case 'both':
            return 'This is a two-handed exercise (both arms used simultaneously).';
        default:
            return 'Identify which arm is used for each rep based on visual observation.';
    }
}

function parseGeminiResponse(text, protocol) {
    try {
        // Clean up the response - remove markdown code blocks if present
        let cleanText = text.trim();
        
        // Remove markdown code fences
        if (cleanText.startsWith('```json')) {
            cleanText = cleanText.slice(7);
        }
        if (cleanText.startsWith('```')) {
            cleanText = cleanText.slice(3);
        }
        if (cleanText.endsWith('```')) {
            cleanText = cleanText.slice(0, -3);
        }
        
        // Try to find JSON object in the response if there's extra text
        const jsonMatch = cleanText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            cleanText = jsonMatch[0];
        }
        
        cleanText = cleanText.trim();

        const data = JSON.parse(cleanText);

        // Ensure we have the required structure
        return {
            reps: data.reps || [],
            totalReps: data.summary?.totalReps || data.reps?.length || 0,
            avgDuration: data.summary?.avgDuration || calculateAvg(data.reps, 'duration'),
            avgVelocity: data.summary?.avgVelocity || calculateAvg(data.reps, 'velocityScore'),
            fastestRep: data.summary?.fastestRep || 1,
            slowestRep: data.summary?.slowestRep || data.reps?.length || 1,
            velocityDropoff: data.summary?.velocityDropPercent || calculateDropoff(data.reps),
            coachingNotes: data.coachingNotes || 'Analysis complete. Review the rep-by-rep data for insights.'
        };

    } catch (parseError) {
        console.error('Failed to parse Gemini response:', parseError);
        console.error('Raw response:', text);
        
        // Return a fallback structure with the raw text for debugging
        return {
            reps: [],
            totalReps: 0,
            avgDuration: 0,
            avgVelocity: 0,
            fastestRep: 0,
            slowestRep: 0,
            velocityDropoff: 0,
            coachingNotes: 'Parse error. Gemini response: ' + text.substring(0, 300)
        };
    }
}

function calculateAvg(reps, field) {
    if (!reps || reps.length === 0) return 0;
    const sum = reps.reduce((acc, rep) => acc + (rep[field] || 0), 0);
    return sum / reps.length;
}

function calculateDropoff(reps) {
    if (!reps || reps.length < 2) return 0;
    const firstVelocity = reps[0]?.velocityScore || 0;
    const lastVelocity = reps[reps.length - 1]?.velocityScore || 0;
    if (firstVelocity === 0) return 0;
    return ((firstVelocity - lastVelocity) / firstVelocity) * 100;
}
