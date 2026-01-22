"use server";

import Groq from "groq-sdk";
import { COACHING_KNOWLEDGE, REALITY_CHECK_RULES } from "@/lib/coaching-knowledge";

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
        // Normalize time: "35" -> "35:00", "35:30" -> "35:30"
        const cleanTime = stats.best5kTime.trim();
        let pbMin = 0;
        let pbSec = 0;

        if (!cleanTime.includes(":")) {
            // Assume single number is minutes
            pbMin = parseFloat(cleanTime);
        } else {
            const parts = cleanTime.split(":").map(Number);
            pbMin = parts[0];
            pbSec = parts[1] || 0;
        }

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
        const easyStart = clampPace(pbSecondsPerKm * 1.35); // Slowed down from 1.25
        const easyEnd = clampPace(pbSecondsPerKm * 1.55);   // Slowed down from 1.45
        easyRange = `${formatSecondsToPace(easyStart)} - ${formatSecondsToPace(easyEnd)}`;

        const tempoStart = clampPace(pbSecondsPerKm * 1.15);
        const tempoEnd = clampPace(pbSecondsPerKm * 1.25);
        tempoRange = `${formatSecondsToPace(tempoStart)} - ${formatSecondsToPace(tempoEnd)}`;

        // Intervals: Cap at PB pace. Beginners should NOT run faster than PB pace in week 1.
        // If PB is 8:00/km, Intervals should be ~8:00/km, NOT 6:00/km.
        const safeIntervalPace = Math.max(pbSecondsPerKm, 300); // absolute cap at 5:00/km for safety unless PB is faster
        intervalPace = formatSecondsToPace(safeIntervalPace);
    }

    // Hill Repeats & Strides Calibration
    const hillsPace = tempoRange; // Hill intensity is roughly tempo effort
    const stridesPace = "Mile pace or faster (Sprints)";

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

    // Volume Progression Calculation
    const baseWeeklyKm = stats.goal === "beginner" ? 20 : stats.goal === "intermediate" ? 30 : 40;
    const peakMultiplier = targetDistKm === 5 ? 1.5 :
        targetDistKm === 10 ? 1.8 :
            targetDistKm === 21.1 ? 2.2 :
                2.5; // Marathon
    const peakWeeklyKm = Math.round(baseWeeklyKm * peakMultiplier);

    const volumeGuidance = `
WEEKLY VOLUME & DISTRIBUTION (STRICT):
- **80/20 Rule**: Approximately 80% of runs MUST be Easy. Maximum 1-2 "Quality" sessions per week.
- **Quality Sessions**: Intervals, Tempo, or Hill Repeats.
- **Distribution**:
    - 3-4 runs/week: 1 Quality, 2-3 Easy.
    - 5-6 runs/week: 1-2 Quality, 4 Easy.
- Week 1-2: ${baseWeeklyKm}km (Base Phase)
- Week 3: ${Math.round(baseWeeklyKm * 1.1)}km
- Week 4: ${Math.round(baseWeeklyKm * 0.8)}km ⚠️ DOWN WEEK
- Week 5-7: ${Math.round(baseWeeklyKm * 1.2)}-${Math.round(baseWeeklyKm * 1.4)}km (Build Phase)
- Week 8: ${Math.round(baseWeeklyKm * 1.0)}km ⚠️ DOWN WEEK
- Week 9-11: ${Math.round(peakWeeklyKm * 0.9)}-${peakWeeklyKm}km (Peak Phase)
- Week 12: ${Math.round(peakWeeklyKm * 0.5)}km (Taper)

NEW WORKOUT TYPES (INCORPORATE THESE):
1. **Hill Repeats**: e.g., "6x30s Uphill Sprints (Strong Effort), walk down recovery."
2. **Strides**: e.g., "Add 6x100m Strides (90% effort, walk back) to the end of an Easy Run."
3. **Progression Runs**: e.g., "5km total: 3km Easy, 2km at Tempo Pace."

VOLUME PROGRESSION RULES :
1. **10% Rule**: Never increase weekly volume by more than 10-15%
2. **Down Weeks**: Week 4 and Week 8 MUST be 20-25% lower than previous week
3. **Long Run Cap**: Long run should not exceed 30-35% of weekly volume
4. **Periodization**: Base (W1-4) → Build (W5-8) → Peak (W9-11) → Taper (W12)
`;

    // RAG-Lite: Inject Expert Knowledge
    const distanceKey = stats.targetDistance as keyof typeof COACHING_KNOWLEDGE;
    const expertKnowledge = COACHING_KNOWLEDGE[distanceKey] || COACHING_KNOWLEDGE["5km"];

    const prompt = `
    You are an elite endurance coach with the wisdom of Jack Daniels, Pfitzinger, and Kipchoge.
    
    USER PROFILE:
    - Current Fitness (Best 5km): ${stats.best5kTime} (Approx Pace: ${currentPbPace})
    - Goal: ${stats.targetDistance} ${stats.targetTime ? `(Target: ${stats.targetTime})` : ""}
    - Level: ${stats.goal}
    
    EXPERT METHODOLOGY (APPLY THIS STRICTLY):
    ${expertKnowledge}
    
    ${REALITY_CHECK_RULES}
    
    ${volumeGuidance}
    // ...
    CRITICAL PACING CONSTRAINTS (BASELINE):
    1. **Easy / Long Runs**: ${easyRange} (Floor: 9:30/km).
    2. **Tempo / Threshold**: ${tempoRange}
    3. **Intervals**: ${intervalPace}
    4. **Hill Repeats Effort**: ${hillsPace}
    5. **Strides Effort**: ${stridesPace}
    6. **Race Day Target**: ${targetGoalPace}.

    PROGRESSION RULES (MUST APPLY):
    - **Gradual Improvement**: You MUST simulate fitness gains. Do NOT output the same pace for 12 weeks.
    - **Tempo/Intervals**: Start at the slower/safer end. By the final 4 weeks, progress to the faster end of the provided ranges.
    - **Easy Runs**: Can slightly improve (e.g., 5-10s/km faster) in phase 2 and 3, but prioritize recovery.
    - **Volume**: Increase distance/duration gradually (max 10% per week).

    REALITY CHECK Analysis:
    ${realityCheckNote || "Goal seems reasonable relative to current fitness."}

    TASK:
    Generate 3 DISTINCT training plan options.
    
    CHAIN-OF-THOUGHT REASONING (REQUIRED):
    Before generating the specific weeks, you MUST internally formulate a strategy.
    For EACH plan option, you must output a 'strategy_reasoning' field in the JSON.
    This field should explain:
    1. Why you chose this specific periodization.
    2. How you are handling the user's specific pace gaps.
    3. Why this plan fits the requested methodology.

    PLAN STRUCTURE REQUIREMENTS:
    1. **First Day**: Week 1, Day 1 MUST be a run.
    2. **Race Day**: Final day MUST be "RACE DAY!".
    3. **Completeness**: Week 1 to Week ${realityCheckNote ? 18 : 12}. NO PLACEHOLDERS.
    4. **Description Format**: Intervals.icu compatible (steps starting with '- ', repeats with 'Nx').

    Return a JSON object with this EXACT structure:
    {
      "options": [
        {
          "id": "steady|performance|health",
          "title": "Plan Title",
          "strategy_reasoning": "Detailed explanation of the coaching logic used here...",
          "description": "Short description...",
          "coach_notes": "...",
          "total_weeks": 12,
          "weeks": [
            {
              "week_number": 1,
              "days": [
                {
                  "day": "Monday",
                  "type": "rest|easy|intervals|long|tempo|race",
                  "description": "- Warmup 10m\\n- 5km run\\n- Cooldown 5m",
                  "distance": 5.0,
                  "duration": 45,
                  "target_pace": "5:30/km"
                }
              ]
            }
          ]
        }
      ]
    }
    `;

    console.log("[Groq Action] Generating training plan with Multi-Key Rotation & Expert Knowledge...");

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
                        content: `You are a world-class running coach. You NEVER fail to produce a full, detailed JSON schedule. 
                        You combine the scientific rigor of Pfitzinger with the motivational style of a modern coach.
                        You ALWAYS explain your strategy in the 'strategy_reasoning' field.`,
                    },
                    {
                        role: "user",
                        content: prompt,
                    },
                ],
                model: "llama-3.3-70b-versatile",
                response_format: { type: "json_object" },
                max_tokens: 25000, // Increased for CoT
                temperature: 0.2, // Slightly higher for "Strategic" creativity, but still low for JSON stability
            });

            const content = completion.choices[0].message.content;
            if (!content) throw new Error("No response from Groq AI");

            return JSON.parse(content);
        } catch (error: any) {
            // ... (error handling remains same) ...
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
