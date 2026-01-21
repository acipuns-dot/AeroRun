"use server";

import Groq from "groq-sdk";

const getGroqKeys = () => {
    const keysStr = process.env.GROQ_API_KEYS || process.env.GROQ_API_KEY || "";
    return keysStr.split(",").map(k => k.trim()).filter(k => k.length > 0);
};

export interface UserStats {
    height: number;
    weight: number;
    age: number;
    best5kTime: string;
    goal: "beginner" | "intermediate" | "elite";
    targetDistance: "5km" | "10km" | "Half Marathon" | "Full Marathon";
    targetTime?: string;
}

const parseTimeStringToSeconds = (timeStr: string): number | null => {
    // Try to parse "HH:MM:SS" or "MM:SS"
    const parts = timeStr.replace(/[^0-9:]/g, "").split(":").map(Number);
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    return null;
};

const formatSecondsToPace = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}/km`;
};

// Calculate current pace from 5km PB
export const generateTrainingPlanAction = async (stats: UserStats) => {
    let currentPbPace = "Unknown";
    let pbSecondsPerKm = 0;
    try {
        const [pbMin, pbSec] = stats.best5kTime.split(":").map(Number);
        if (!isNaN(pbMin) && !isNaN(pbSec)) {
            const totalPbSeconds = (pbMin * 60 + pbSec);
            pbSecondsPerKm = totalPbSeconds / 5;
            currentPbPace = formatSecondsToPace(pbSecondsPerKm);
        }
    } catch (e) {
        console.error("Error calculating pace", e);
    }

    const MAX_SECONDS_PER_KM = 570; // 9:30/km (baseline for jogging)
    const clampPace = (seconds: number) => Math.min(seconds, MAX_SECONDS_PER_KM);

    // Pacing calculations for prompt
    let easyRange = "Unknown";
    let tempoRange = "Unknown";
    let intervalPace = "Unknown";

    if (pbSecondsPerKm > 0) {
        // Safe multipliers based on exercise science (relative to 5k pace)
        // Easy: 1.25 - 1.45x slower
        // Tempo: 1.10 - 1.20x slower
        // Intervals: 0.95 - 1.05x (roughly 5k pace)
        const easyStart = clampPace(pbSecondsPerKm * 1.25);
        const easyEnd = clampPace(pbSecondsPerKm * 1.45);
        easyRange = `${formatSecondsToPace(easyStart)} - ${formatSecondsToPace(easyEnd)}`;

        const tempoStart = clampPace(pbSecondsPerKm * 1.1);
        const tempoEnd = clampPace(pbSecondsPerKm * 1.2);
        tempoRange = `${formatSecondsToPace(tempoStart)} - ${formatSecondsToPace(tempoEnd)}`;

        intervalPace = formatSecondsToPace(clampPace(pbSecondsPerKm));
    }

    // Reality Check: Calculate Goal Pace if target time exists
    let realityCheckNote = "";
    let targetGoalPace = "Unknown";
    const targetSeconds = stats.targetTime ? parseTimeStringToSeconds(stats.targetTime) : null;
    let targetDistKm = 5;
    if (stats.targetDistance === "10km") targetDistKm = 10;
    if (stats.targetDistance === "Half Marathon") targetDistKm = 21.1;
    if (stats.targetDistance === "Full Marathon") targetDistKm = 42.2;

    if (targetSeconds) {
        const goalPaceSecondsPerKm = targetSeconds / targetDistKm;
        targetGoalPace = formatSecondsToPace(goalPaceSecondsPerKm);
        const paceGap = goalPaceSecondsPerKm - pbSecondsPerKm; // Negative means goal is faster

        if (pbSecondsPerKm > 0) {
            if (paceGap < 0 && targetDistKm > 5) {
                realityCheckNote = `WARNING: USER GOAL IS UNREALISTICALLY FAST. 
                They want to run ${stats.targetDistance} at a pace FASTER than their current 5km PB (${currentPbPace}).
                - Goal Pace: ${targetGoalPace}
                
                MANDATORY ADJUSTMENTS:
                1. EXTEND PLAN DURATION: You MUST generate plans between 18-24 Weeks to handle this massive fitness jump.
                2. "Steady" & "Health" plans should ignore the exact time target and focus on "Completion" or "PB Improvement" instead to prevent injury.
                3. "Performance" plan can try to hit the goal but must warn about high risk.`;
            } else if (Math.abs(paceGap) < 15 && targetDistKm > 5) {
                realityCheckNote = `NOTE: Goal is very aggressive (close to current 5k PB pace for a longer distance). Recommend 14-16 weeks minimum.`;
            }
        }
    } else if (pbSecondsPerKm > 0) {
        // If no target time, assume goal is to beat current PB pace slightly or maintain it
        targetGoalPace = formatSecondsToPace(pbSecondsPerKm * 0.98); // 2% faster than PB
    }

    // Distance Constraints
    let maxDistanceNote = "";
    if (stats.targetDistance === "5km") maxDistanceNote = "MAX Long Run Distance: 8km.";
    if (stats.targetDistance === "10km") maxDistanceNote = "MAX Long Run Distance: 14km.";
    if (stats.targetDistance === "Half Marathon") maxDistanceNote = "MAX Long Run Distance: 22km.";
    if (stats.targetDistance === "Full Marathon") maxDistanceNote = "MAX Long Run Distance: 34km.";

    const prompt = `
    You are a professional running coach.
    Generate 3 DISTINCT training plan options for a runner:
    - Current Fitness (Best 5km): ${stats.best5kTime} (Approx Pace: ${currentPbPace})
    - Goal: ${stats.targetDistance} ${stats.targetTime ? `(Target Time: ${stats.targetTime})` : ""}
    - User Training Level: ${stats.goal}
    
    CRITICAL PACING GUIDELINES (MANDATORY):
    Based on their current 5k PB of ${currentPbPace}, you MUST use these EXACT pace ranges:
    1. **Easy / Long Runs**: ${easyRange} (DO NOT go faster than ${formatSecondsToPace(pbSecondsPerKm * 1.3)})
    2. **Tempo / Threshold**: ${tempoRange}
    3. **Intervals**: ${intervalPace} (Do NOT go faster than this in early weeks)

    STRICT CONSTRAINTS:
    1. **Safety First**: If a user's 5k PB is 8:00/km (40 mins), their "Easy" runs should be ~10:30-12:00/km.
    2. **No Over-Pacing**: Never schedule a run faster than their 5k PB pace in the first 4 weeks of a beginner plan.
    3. **Plan Duration**: ${realityCheckNote ? realityCheckNote : "Standard 10-14 Weeks."}
    4. **Distance Limits**: ${maxDistanceNote} (Do NOT exceed this).
    5. **First Day Action**: The VERY FIRST day (Week 1, Day 1) of EVERY plan MUST be a running workout (Easy Run, etc.), NEVER a rest day.
    6. **Mixed Periodization**: Vary the training mix week-to-week. (e.g., Week 1: 2 Easy, 1 Long; Week 2: 1 Easy, 1 Interval, 1 Long). Avoid repeats.
    7. **Race Day Finale**: The VERY LAST day of the entire plan MUST be a "race" type. Title: "RACE DAY!". Goal: Achieve target ${stats.targetDistance}. Target Pace for this session MUST be: ${targetGoalPace}.
    8. **Pace Floor**: The SLOWEST pace you should ever suggest is 9:30/km (this is the baseline for jogging). Never go slower than this.

    REALITY CHECK Analysis:
    ${realityCheckNote || "Goal seems reasonable relative to current fitness."}

    STRICT CONSTRAINTS:
    1. **Plan Duration**: 
       - If Reality Check warns of aggressive goal: 16-24 Weeks.
       - Standard goals: 10-14 Weeks.
       - Maintenance/Easy goals: 8-12 Weeks.

    2. **Strategy**:
    1. "Steady Progress": Balanced. If goal is unrealistic, prioritize safe progress over hitting the exact time.
    2. "Performance Peak": Aggressive. Takes the goal seriously but requires high commitment.
    3. "Health & Longevity": Conservative. Ignores aggressive time goals if safety is at risk.

    4. **PROGRESSIVE OVERLOAD (CRITICAL)**:
       - **Weeks 1-4**: MUST BE SLOWER than PB. Focus on building volume. 
       - **Rule**: "Train where you ARE, not where you want to be." Start the plan based on Current 5k PB Pace (${currentPbPace}), NOT the target goal pace.

    5. **COMPLETENESS (MANDATORY)**:
       - You MUST provide EVERY single week from Week 1 to Week ${realityCheckNote ? 18 : 12}.
       - DO NOT skip any weeks. DO NOT use placeholders.
       - YOU MUST RETURN A LARGE JSON. I NEED EVERY OBJECT FOR EVERY WEEK.

    Return plans as a JSON object with this EXACT structure:
    {
      "options": [
        {
          "id": "steady|performance|health",
          "title": "Plan Title",
          "description": "...",
          "coach_notes": "...",
          "total_weeks": 12,
          "weeks": [
            {
              "week_number": 1,
              "days": [
                {
                  "day": "Monday",
                  "type": "rest|easy|intervals|long|tempo|race",
                  "description": "For 'rest' type, provide a friendly recovery note. For 'race' type, provide an epic motivation. For other types, use Intervals.icu structured format. Every step MUST start with '- '. For repetitions, use 'Nx' on a line before the steps. ONLY include Distance, Time, and Pace. Example: '- Warmup 10m 6:00/km\\n- 5km 5:30/km\\n6x\\n- 1km 5:00/km\\n- 500m 7:00/km\\n- Cooldown 5m 6:30/km'",
                  "distance": 0.0,
                  "duration": 0,
                  "target_pace": "The specific pace for this run (e.g. 5:30/km). For 'race' MUST be the Target Goal Pace provided above."
                }
              ]
            }
          ]
        }
      ]
    }
    
    IMPORTANT for Intervals.icu Integration:
    The 'description' field MUST be formatted for the Intervals.icu workout builder:
    1. Each step starts with '- '.
    2. Repeats are defined by 'Nx' on the line BEFORE the steps to be repeated.
    3. Metrics allowed: time (m, s), distance (km, m), and pace (m:ss/km).
    
    Example for Intervals session:
    "- Warmup 15m 11:00/km\\n6x\\n- 800m 8:00/km\\n- 2m 12:00/km\\n- Cooldown 10m 11:00/km"
    
    IMPORTANT: Return ONLY valid JSON.
    `;

    console.log("[Groq Action] Generating training plan with Multi-Key Rotation...");

    const keys = getGroqKeys();
    if (keys.length === 0) {
        throw new Error("No Groq API keys found. Please set GROQ_API_KEYS or GROQ_API_KEY.");
    }

    for (let i = 0; i < keys.length; i++) {
        const apiKey = keys[i];
        console.log(`[Groq Action] Attempting with key ${i + 1}/${keys.length}...`);

        const groq = new Groq({ apiKey });

        try {
            const completion = await groq.chat.completions.create({
                messages: [
                    {
                        role: "system",
                        content: "You are an elite endurance coach. You always provide full, week-by-week training plans with ZERO omissions or placeholders. You are capable of returning very large JSON objects.",
                    },
                    {
                        role: "user",
                        content: prompt,
                    },
                ],
                model: "llama-3.3-70b-versatile",
                response_format: { type: "json_object" },
                max_tokens: 15000,
                temperature: 0.1,
            });

            const content = completion.choices[0].message.content;
            if (!content) throw new Error("No response from Groq AI");

            return JSON.parse(content);
        } catch (error: any) {
            const isRateLimit = error.status === 429 ||
                error.message?.toLowerCase().includes("rate limit") ||
                error.code === "rate_limit_exceeded";

            if (isRateLimit && i < keys.length - 1) {
                console.warn(`[Groq Action] Key ${i + 1} hit rate limit. Rotating to next key...`);
                continue; // Try next key
            }

            console.error(`[Groq Action] Error with key ${i + 1}:`, error);
            throw new Error(error.message || "Failed to generate training plans");
        }
    }

    throw new Error("All Groq API keys exhausted or failed.");
};
