"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { generatePlanOptionsAction, generateFullPlanAction } from "@/app/actions/groq";
import BottomNav from "@/components/BottomNav";
import { motion } from "framer-motion";
import { Settings as SettingsIcon, LogOut, User, RefreshCw, Ruler, Weight, Timer, Shield, Calendar as CalendarIcon, ArrowRight, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useData } from "@/context/DataContext";
import { getFutureEventsAction, deleteWorkoutAction } from "@/app/actions/intervals";

export default function Settings() {
    const { profile, isLoading, refreshData } = useData();
    // ... existing state ...
    const [regenerating, setRegenerating] = useState(false);
    const [planOptions, setPlanOptions] = useState<any[]>([]);
    const [isSelectingPlan, setIsSelectingPlan] = useState(false);
    const [isSelectingGoal, setIsSelectingGoal] = useState(false);
    const [isSelectingStartDate, setIsSelectingStartDate] = useState(false);
    const [selectedPlan, setSelectedPlan] = useState<any>(null);
    const [saving, setSaving] = useState(false);
    const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
    const [isSyncing, setIsSyncing] = useState(false);
    const [showSuccessOverlay, setShowSuccessOverlay] = useState(false); // Custom toast state

    // Profile Edit State
    const [isEditingProfile, setIsEditingProfile] = useState(false);
    const [editHeight, setEditHeight] = useState("");
    const [editWeight, setEditWeight] = useState("");
    const [edit5kTime, setEdit5kTime] = useState("");

    const [targetDistance, setTargetDistance] = useState<"5km" | "10km" | "Half Marathon" | "Full Marathon">("5km");
    const [targetTime, setTargetTime] = useState("");

    // User Schedule Preferences
    const [daysPerWeek, setDaysPerWeek] = useState<3 | 4 | 5 | 6>(4);
    const [longRunDay, setLongRunDay] = useState<"Monday" | "Tuesday" | "Wednesday" | "Thursday" | "Friday" | "Saturday" | "Sunday">("Sunday");
    const [selectedRunDays, setSelectedRunDays] = useState<string[]>(["Monday", "Wednesday", "Friday", "Sunday"]);

    const router = useRouter();

    if (isLoading) return (
        <div className="min-h-screen flex items-center justify-center bg-black">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
    );

    const handleSync = async () => {
        setIsSyncing(true);
        try {
            await refreshData();
        } finally {
            setIsSyncing(false);
        }
    };

    const handleLogout = async () => {
        await supabase.auth.signOut();
        router.push("/");
    };

    const handleUpdateProfile = async () => {
        if (!profile) return;
        setSaving(true);
        try {
            const { error } = await supabase
                .from("profiles")
                .update({
                    height: parseFloat(editHeight),
                    weight: parseFloat(editWeight),
                    best_5k_time: edit5kTime
                })
                .eq("id", profile.id);

            if (error) throw error;
            await refreshData();
            setIsEditingProfile(false);
        } catch (error: any) {
            console.error("Error updating profile:", error);
            alert("Failed to update profile: " + error.message);
        }
        setSaving(false);
    };

    const startEditing = () => {
        if (!profile) return;
        setEditHeight(profile.height.toString());
        setEditWeight(profile.weight.toString());
        setEdit5kTime(profile.best_5k_time);
        setIsEditingProfile(true);
    };

    const handleStartGeneration = async () => {
        if (!profile) return;
        setRegenerating(true);
        try {
            const data = await generatePlanOptionsAction({
                height: profile.height,
                weight: profile.weight,
                age: profile.age,
                best5kTime: profile.best_5k_time,
                goal: profile.training_level,
                targetDistance,
                targetTime: targetTime || undefined,
                daysPerWeek,
                longRunDay,
                selectedRunDays,
            });

            if (data.options) {
                setPlanOptions(data.options);
                setIsSelectingGoal(false);
                setIsSelectingPlan(true);
            }
        } catch (error) {
            console.error("Error generating options:", error);
            alert("Failed to generate options. Check console.");
        }
        setRegenerating(false);
    };

    const handleSelectPlan = async (option: any) => {
        if (!profile) return;
        setSaving(true);
        setSelectedPlanId(option.id);

        try {
            const data = await generateFullPlanAction(
                {
                    height: profile.height,
                    weight: profile.weight,
                    age: profile.age,
                    best5kTime: profile.best_5k_time,
                    goal: profile.training_level,
                    targetDistance,
                    targetTime: targetTime || undefined,
                    daysPerWeek,
                    longRunDay,
                    selectedRunDays,
                },
                option.id,
                planOptions
            );

            if (data.weeks) {
                setSelectedPlan({ ...option, weeks: data.weeks });
                setIsSelectingPlan(false);
                setIsSelectingStartDate(true);
            }
        } catch (error) {
            console.error("Error generating full plan:", error);
            alert("Coach failed to build the full schedule. Please try again.");
        }
        setSaving(false);
    };

    const handleActivatePlan = async (startOption: "today" | "tomorrow" | "monday") => {
        if (!profile || !selectedPlan) return;
        setSaving(true);

        const now = new Date();
        let startDate: Date;

        // Helper to get day index
        const dayMap: { [key: string]: number } = {
            "Monday": 0, "Tuesday": 1, "Wednesday": 2, "Thursday": 3, "Friday": 4, "Saturday": 5, "Sunday": 6
        };
        const dayNames = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

        // 1. Determine the "Plan's Start Day" (e.g., usually Monday = 0)
        // We find the first workout of Week 1 to establish the baseline
        const week1Days = selectedPlan.weeks.find((w: any) => w.week_number === 1)?.days || [];
        const firstPlanDayName = week1Days[0]?.day || "Monday";
        const firstPlanDayIndex = dayMap[firstPlanDayName] !== undefined ? dayMap[firstPlanDayName] : 0;

        // 2. Set the REAL Start Date
        if (startOption === "today") {
            startDate = new Date(now);
        } else if (startOption === "tomorrow") {
            startDate = new Date(now);
            startDate.setDate(startDate.getDate() + 1);
        } else {
            // "Next Monday" (or next standard start day)
            // Actually, let's keep the previous behavior for "Monday" which is aligning to the calendar next Monday
            const day = now.getDay();
            const daysUntilNextMonday = (8 - day) % 7 || 7;
            startDate = new Date(now);
            startDate.setDate(startDate.getDate() + daysUntilNextMonday);
        }
        startDate.setHours(0, 0, 0, 0);

        try {
            // Clear old workouts
            const { error: deleteError } = await supabase.from("workouts").delete().eq("user_id", profile.id);
            if (deleteError) {
                console.error("Error clearing old workouts:", deleteError);
                throw new Error("Failed to clear old training plan. Please try again.");
            }

            const workoutsToInsert = selectedPlan.weeks.flatMap((week: any) =>
                (week.days || []).map((day: any) => {
                    const getDayOffset = (d: string) => {
                        if (d.includes("Day")) {
                            return (parseInt(d.replace("Day ", "")) || 1) - 1;
                        }
                        const map: Record<string, number> = { "Monday": 0, "Tuesday": 1, "Wednesday": 2, "Thursday": 3, "Friday": 4, "Saturday": 5, "Sunday": 6 };
                        return map[d] || 0;
                    };

                    const daysFromPlanStart = getDayOffset(day.day);
                    const weekNum = Number(week.week_number) || 1;
                    const totalDaysOffset = ((weekNum - 1) * 7) + daysFromPlanStart;

                    const workoutDate = new Date(startDate);
                    workoutDate.setDate(workoutDate.getDate() + totalDaysOffset);

                    // --- PARTIAL WEEK 1 LOGIC ---
                    // If this is Week 1 and the workout date is BEFORE the start date, convert to Rest Day
                    let finalType = day.type;
                    let finalDescription = day.description;
                    let finalDistance = day.distance;
                    let finalDuration = day.duration;
                    let finalPace = day.target_pace;

                    if (weekNum === 1 && workoutDate < startDate) {
                        finalType = "rest";
                        finalDescription = "Rest Day";
                        finalDistance = 0;
                        finalDuration = 0;
                        finalPace = "";
                    }

                    // FIX: Use local time for date string
                    if (isNaN(workoutDate.getTime())) {
                        console.error("Invalid date calculated:", { startDate, totalDaysOffset, weekNum, daysFromPlanStart });
                        throw new Error(`Date calculation failed for Week ${weekNum} Day ${day.day}`);
                    }

                    const year = workoutDate.getFullYear();
                    const month = String(workoutDate.getMonth() + 1).padStart(2, '0');
                    const dayNum = String(workoutDate.getDate()).padStart(2, '0');
                    const localDateString = `${year}-${month}-${dayNum}`;

                    // Update day name to match the NEW date
                    // JS getDay(): 0=Sun, 1=Mon... 6=Sat
                    // We need to map back to our 0=Mon...6=Sun system if we strictly want to store that, 
                    // OR just store the string name.
                    const realDayIndex = workoutDate.getDay(); // 0 is Sunday
                    // Map JS day (0=Sun) to our names.
                    const realDayName = realDayIndex === 0 ? "Sunday" : dayNames[realDayIndex - 1];

                    return {
                        user_id: profile.id,
                        week_number: week.week_number,
                        day_of_week: realDayName,
                        type: finalType,
                        description: finalDescription,
                        distance_km: Number(finalDistance) || 0,
                        duration_mins: Number(finalDuration) || 0,
                        target_pace: finalPace || "",
                        date: localDateString
                    };
                })
            );

            const { error } = await supabase.from("workouts").insert(workoutsToInsert);
            if (error) {
                console.error("Supabase insert error:", error);
                throw error;
            }

            await refreshData();
            // Show Success Overlay instead of alert
            setShowSuccessOverlay(true);
            setTimeout(() => {
                router.push("/plan");
            }, 2000);
        } catch (error: any) {
            console.error("Error saving plan:", error);
            alert(`Failed to save plan: ${error.message || error.details || "Unknown error"}`);
        }
        setSaving(false);
    };

    if (isSelectingGoal) {
        return (
            <div className="p-6 space-y-8 pb-32">
                <div className="space-y-2">
                    <button onClick={() => setIsSelectingGoal(false)} className="text-primary text-xs font-bold uppercase tracking-widest">
                        ← Back to Settings
                    </button>
                    <h1 className="text-3xl font-black italic">SET YOUR GOAL</h1>
                    <p className="text-white/40 text-sm">What race are we training for?</p>
                </div>

                <div className="space-y-6">
                    <div className="grid grid-cols-2 gap-4">
                        {(["5km", "10km", "Half Marathon", "Full Marathon"] as const).map((dist) => (
                            <motion.button
                                key={dist}
                                whileHover={{ scale: 1.02 }}
                                whileTap={{ scale: 0.98 }}
                                onClick={() => setTargetDistance(dist)}
                                className={`glass p-6 text-center transition-all duration-300 border-2 relative overflow-hidden ${targetDistance === dist
                                    ? "border-primary bg-primary/20 shadow-[0_0_20px_rgba(0,195,255,0.2)]"
                                    : "border-white/5 bg-white/5 hover:border-white/20"
                                    }`}
                            >
                                {targetDistance === dist && (
                                    <motion.div
                                        layoutId="activeGoal"
                                        className="absolute inset-0 bg-primary/10"
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                    />
                                )}
                                <p className={`font-black italic relative z-10 transition-colors ${targetDistance === dist ? "text-primary text-xl" : "text-white/40 text-lg"
                                    }`}>{dist}</p>
                            </motion.button>
                        ))}
                    </div>

                    <div className="space-y-2">
                        <label className="text-xs font-black text-white/40 uppercase tracking-widest ml-1">Target Time (Optional)</label>
                        <input
                            type="text"
                            placeholder="e.g. Sub 20:00 or Sub 4:00:00"
                            value={targetTime}
                            onChange={(e) => setTargetTime(e.target.value)}
                            className="w-full bg-white/5 border border-white/10 rounded-xl p-4 text-white focus:outline-none focus:border-primary transition-colors"
                        />
                    </div>

                    {/* Schedule Preferences */}
                    <div className="space-y-4 glass p-6 border border-primary/20">
                        <h3 className="text-sm font-black text-primary uppercase tracking-widest">Your Schedule</h3>

                        {/* Days Per Week */}
                        <div className="space-y-2">
                            <label className="text-xs font-black text-white/60 uppercase tracking-widest ml-1">Days Per Week</label>
                            <div className="grid grid-cols-4 gap-2">
                                {([3, 4, 5, 6] as const).map((days) => (
                                    <button
                                        key={days}
                                        onClick={() => setDaysPerWeek(days)}
                                        className={`py-3 rounded-lg font-black transition-all ${daysPerWeek === days
                                            ? "bg-primary text-black"
                                            : "bg-white/5 text-white/40 hover:bg-white/10"
                                            }`}
                                    >
                                        {days}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Specific Days Selection */}
                        <div className="space-y-2">
                            <label className="text-xs font-black text-white/60 uppercase tracking-widest ml-1">
                                Which Days Can You Run?
                            </label>
                            <div className="grid grid-cols-7 gap-1">
                                {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((shortDay, idx) => {
                                    const fullDay = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"][idx];
                                    const isSelected = selectedRunDays.includes(fullDay);

                                    return (
                                        <button
                                            key={fullDay}
                                            onClick={() => {
                                                if (isSelected) {
                                                    // Always allow deselection
                                                    setSelectedRunDays(selectedRunDays.filter(d => d !== fullDay));
                                                } else {
                                                    // Select (but don't exceed daysPerWeek)
                                                    if (selectedRunDays.length < daysPerWeek) {
                                                        setSelectedRunDays([...selectedRunDays, fullDay]);
                                                    }
                                                }
                                            }}
                                            className={`py-2 px-1 rounded-lg text-xs font-black transition-all ${isSelected
                                                ? "bg-primary text-black"
                                                : "bg-white/5 text-white/40 hover:bg-white/10"
                                                }`}
                                        >
                                            {shortDay}
                                        </button>
                                    );
                                })}
                            </div>
                            <p className="text-[10px] text-white/40 ml-1">
                                {selectedRunDays.length}/{daysPerWeek} days selected
                            </p>
                        </div>

                        {/* Long Run Day */}
                        <div className="space-y-2">
                            <label className="text-xs font-black text-white/60 uppercase tracking-widest ml-1">Long Run Day</label>
                            <select
                                value={longRunDay}
                                onChange={(e) => setLongRunDay(e.target.value as any)}
                                className="w-full bg-white/5 border border-white/10 rounded-xl p-4 text-white focus:outline-none focus:border-primary transition-colors"
                            >
                                {["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].map((day) => (
                                    <option key={day} value={day} className="bg-black">{day}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <button
                        onClick={handleStartGeneration}
                        disabled={regenerating}
                        className="w-full bg-primary text-black font-black py-4 rounded-xl hover:scale-105 active:scale-95 transition-all text-sm uppercase tracking-widest disabled:opacity-50 flex items-center justify-center space-x-2"
                    >
                        {regenerating ? (
                            <>
                                <RefreshCw className="w-4 h-4 animate-spin" />
                                <span className="text-xs">Generating Options...</span>
                            </>
                        ) : (
                            <span>Generate 3 Optimized Plans</span>
                        )}
                    </button>
                </div>
            </div>
        );
    }

    if (isSelectingPlan) {
        return (
            <div className="p-6 space-y-8 pb-32">
                <div className="space-y-2">
                    <button onClick={() => setIsSelectingPlan(false)} className="text-primary text-xs font-bold uppercase tracking-widest">
                        ← Back to Goal
                    </button>
                    <h1 className="text-3xl font-black italic">CHOOSE YOUR PATH</h1>
                    <p className="text-white/40 text-sm">AI Coach has built these specifically for your {targetDistance} goal.</p>
                </div>

                <div className="space-y-4">
                    {planOptions.map((plan, idx) => (
                        <motion.div
                            key={plan.id}
                            initial={{ x: 20, opacity: 0 }}
                            animate={{ x: 0, opacity: 1 }}
                            transition={{ delay: idx * 0.1 }}
                            className="glass p-6 space-y-4 border-primary/10 hover:border-primary/30 transition-colors"
                        >
                            <div className="flex justify-between items-start">
                                <h3 className="text-xl font-black italic text-primary">{plan.title}</h3>
                                <div className="bg-primary/10 px-2 py-1 rounded text-[10px] font-black text-primary uppercase">
                                    {plan.total_weeks || "?"} WEEKS
                                </div>
                            </div>

                            <p className="text-sm text-white/80 leading-relaxed">{plan.description}</p>

                            {plan.strategy_reasoning && (
                                <div className="bg-primary/5 p-4 rounded-xl border border-primary/10">
                                    <p className="text-[10px] text-primary/60 uppercase font-black mb-2 flex items-center gap-2">
                                        <Sparkles className="w-3 h-3" /> AI Strategy
                                    </p>
                                    <p className="text-xs text-white/80 leading-relaxed italic">"{plan.strategy_reasoning}"</p>
                                </div>
                            )}

                            <div className="bg-white/5 p-4 rounded-xl border border-white/5">
                                <p className="text-[10px] text-white/20 uppercase font-black mb-2">Coach Notes (Health)</p>
                                <p className="text-xs text-white/60 leading-relaxed italic">"{plan.coach_notes}"</p>
                            </div>

                            <button
                                onClick={() => handleSelectPlan(plan)}
                                disabled={saving}
                                className={`w-full font-black py-4 rounded-xl hover:scale-105 active:scale-95 transition-all text-sm uppercase tracking-widest disabled:opacity-50 ${saving && selectedPlanId === plan.id
                                    ? "bg-primary/20 text-primary border-2 border-primary"
                                    : "bg-primary text-black"
                                    }`}
                            >
                                {saving && selectedPlanId === plan.id ? (
                                    <span className="flex items-center gap-2">
                                        <RefreshCw className="w-4 h-4 animate-spin" />
                                        Building Full Schedule...
                                    </span>
                                ) : `Activate Training`}
                            </button>
                        </motion.div>
                    ))}
                </div>
            </div>
        );
    }

    if (isSelectingStartDate) {
        return (
            <div className="p-6 space-y-8 pb-32">
                <div className="space-y-2">
                    <button onClick={() => setIsSelectingStartDate(false)} className="text-primary text-xs font-bold uppercase tracking-widest">
                        ← Back to Plans
                    </button>
                    <h1 className="text-3xl font-black italic">WHEN DO WE START?</h1>
                    <p className="text-white/40 text-sm">Choose your Day 1.</p>
                </div>

                <div className="grid grid-cols-1 gap-4">
                    <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => handleActivatePlan("today")}
                        disabled={saving}
                        className="glass p-6 flex flex-col items-center justify-center space-y-2 border-2 border-transparent hover:border-primary/50 transition-all group"
                    >
                        <div className="bg-primary/10 p-4 rounded-full group-hover:bg-primary/20 transition-colors">
                            <RefreshCw className="w-8 h-8 text-primary" />
                        </div>
                        <h3 className="text-xl font-black italic">START TODAY</h3>
                        <p className="text-xs text-white/40 uppercase tracking-widest">IMMEDIATE ACTION</p>
                    </motion.button>

                    <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => handleActivatePlan("tomorrow")}
                        disabled={saving}
                        className="glass p-6 flex flex-col items-center justify-center space-y-2 border-2 border-transparent hover:border-white/20 transition-all"
                    >
                        <h3 className="text-xl font-black italic">START TOMORROW</h3>
                        <p className="text-xs text-white/40 uppercase tracking-widest">PREPARE TONIGHT</p>
                    </motion.button>

                    <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => handleActivatePlan("monday")}
                        disabled={saving}
                        className="glass p-6 flex flex-col items-center justify-center space-y-2 border-2 border-transparent hover:border-white/20 transition-all"
                    >
                        <div className="bg-white/5 p-3 rounded-full">
                            <CalendarIcon className="w-6 h-6 text-white/60" />
                        </div>
                        <h3 className="text-xl font-black italic">NEXT MONDAY</h3>
                        <p className="text-xs text-white/40 uppercase tracking-widest">FRESH WEEK START</p>
                    </motion.button>
                </div>

                {saving && (
                    <div className="fixed inset-0 bg-black/80 flex flex-col items-center justify-center z-50">
                        <RefreshCw className="w-12 h-12 text-primary animate-spin mb-4" />
                        <p className="font-black italic text-2xl animate-pulse">ACTIVATING PLAN...</p>
                    </div>
                )}
            </div>
        );
    }

    return (
        <div className="p-6 space-y-8 pb-32">
            <div className="flex justify-between items-center">
                <h1 className="text-3xl font-black italic">SETTINGS</h1>
                <div className="bg-white/5 p-2 rounded-full border border-white/10">
                    <SettingsIcon className="w-5 h-5 text-primary" />
                </div>
            </div>

            {profile ? (
                <div className="space-y-6">
                    {/* Profile Card */}
                    <div className="glass p-6 space-y-6">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                            <div className="flex items-center space-x-4 min-w-0">
                                <div className="bg-primary/20 p-3 rounded-full border border-primary/20 flex-shrink-0">
                                    <User className="w-6 h-6 text-primary" />
                                </div>
                                <div className="min-w-0">
                                    <h2 className="font-bold text-lg truncate">{profile.email}</h2>
                                    <p className="text-xs text-white/40 uppercase font-black tracking-widest">{profile.training_level} RUNNER</p>
                                </div>
                            </div>
                            <div className="flex-shrink-0">
                                {!isEditingProfile ? (
                                    <button
                                        onClick={startEditing}
                                        className="w-full sm:w-auto text-[10px] font-black uppercase tracking-widest text-primary hover:bg-primary/10 px-4 py-2 rounded-lg border border-primary/20 transition-all"
                                    >
                                        Edit Profile
                                    </button>
                                ) : (
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => setIsEditingProfile(false)}
                                            className="flex-1 sm:flex-none text-[10px] font-black uppercase tracking-widest text-white/40 hover:bg-white/5 px-4 py-2 rounded-lg border border-white/10 transition-all"
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            onClick={handleUpdateProfile}
                                            disabled={saving}
                                            className="flex-1 sm:flex-none text-[10px] font-black uppercase tracking-widest text-black bg-primary px-4 py-2 rounded-lg transition-all disabled:opacity-50"
                                        >
                                            {saving ? "..." : "Save"}
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="grid grid-cols-3 gap-3">
                            {isEditingProfile ? (
                                <>
                                    <div className="bg-white/5 p-3 rounded-xl">
                                        <p className="text-[10px] text-white/20 uppercase font-black mb-1">Height (cm)</p>
                                        <input
                                            type="number"
                                            value={editHeight}
                                            onChange={(e) => setEditHeight(e.target.value)}
                                            className="w-full bg-transparent text-primary font-bold text-center border-b border-primary/20 focus:outline-none focus:border-primary"
                                        />
                                    </div>
                                    <div className="bg-white/5 p-3 rounded-xl">
                                        <p className="text-[10px] text-white/20 uppercase font-black mb-1">Weight (kg)</p>
                                        <input
                                            type="number"
                                            value={editWeight}
                                            onChange={(e) => setEditWeight(e.target.value)}
                                            className="w-full bg-transparent text-primary font-bold text-center border-b border-primary/20 focus:outline-none focus:border-primary"
                                        />
                                    </div>
                                    <div className="bg-white/5 p-3 rounded-xl">
                                        <p className="text-[10px] text-white/20 uppercase font-black mb-1">5K Time</p>
                                        <input
                                            type="text"
                                            value={edit5kTime}
                                            onChange={(e) => setEdit5kTime(e.target.value)}
                                            placeholder="MM:SS"
                                            className="w-full bg-transparent text-primary font-bold text-center border-b border-primary/20 focus:outline-none focus:border-primary"
                                        />
                                    </div>
                                </>
                            ) : (
                                <>
                                    <div className="bg-white/5 p-3 rounded-xl text-center">
                                        <Ruler className="w-4 h-4 text-white/20 mx-auto mb-1" />
                                        <p className="text-[10px] text-white/40 uppercase font-black tracking-widest">Height</p>
                                        <p className="font-bold">{profile.height}cm</p>
                                    </div>
                                    <div className="bg-white/5 p-3 rounded-xl text-center">
                                        <Weight className="w-4 h-4 text-white/20 mx-auto mb-1" />
                                        <p className="text-[10px] text-white/40 uppercase font-black tracking-widest">Weight</p>
                                        <p className="font-bold">{profile.weight}kg</p>
                                    </div>
                                    <div className="bg-white/5 p-3 rounded-xl text-center">
                                        <Timer className="w-4 h-4 text-white/20 mx-auto mb-1" />
                                        <p className="text-[10px] text-white/40 uppercase font-black tracking-widest">5K Time</p>
                                        <p className="font-bold">{profile.best_5k_time}</p>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="space-y-3">
                        <h3 className="text-xs font-black text-white/20 uppercase tracking-[0.2em] ml-2">Training Control</h3>
                        <button
                            onClick={() => setIsSelectingGoal(true)}
                            className="w-full glass p-5 flex items-center justify-between group active:scale-98 transition-all"
                        >
                            <div className="flex items-center space-x-4">
                                <div className="bg-primary/10 p-2 rounded-lg">
                                    <RefreshCw className="w-5 h-5 text-primary" />
                                </div>
                                <div className="text-left">
                                    <p className="font-bold group-hover:text-primary transition-colors">Regenerate Plan</p>
                                    <p className="text-xs text-white/40">Choose a new race goal & target time</p>
                                </div>
                            </div>
                            <Shield className="w-4 h-4 text-white/20" />
                        </button>
                    </div>

                    <div className="space-y-3 pt-6">
                        <h3 className="text-xs font-black text-white/20 uppercase tracking-[0.2em] ml-2">Account</h3>
                        <button
                            onClick={handleLogout}
                            className="w-full bg-red-500/10 border border-red-500/20 p-5 rounded-2xl flex items-center space-x-4 group active:scale-98 transition-all"
                        >
                            <div className="bg-red-500/10 p-2 rounded-lg">
                                <LogOut className="w-5 h-5 text-red-500" />
                            </div>
                            <p className="font-bold text-red-500">Sign Out</p>
                        </button>
                    </div>

                    <div className="space-y-3 pt-6 border-t border-white/5">
                        <h3 className="text-xs font-black text-white/20 uppercase tracking-[0.2em] ml-2">Integrations</h3>
                        <div className="glass p-6 flex items-center justify-between">
                            <div className="flex items-center space-x-4">
                                <div className="bg-[#121212] p-3 rounded-xl border border-[#222]">
                                    <img src="https://intervals.icu/favicon.ico" className="w-6 h-6 grayscale opacity-50" />
                                </div>
                                <div>
                                    <h5 className="font-bold">Intervals.icu</h5>
                                    <p className="text-xs text-white/40">Status: Connected</p>
                                </div>
                            </div>
                            <button
                                onClick={handleSync}
                                disabled={isSyncing}
                                className="text-xs font-bold text-primary border border-primary/20 px-4 py-2 rounded-lg hover:bg-primary/10 active:scale-95 transition-all uppercase disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {isSyncing ? "Syncing..." : "Sync Now"}
                            </button>
                        </div>
                    </div>

                    <div className="space-y-3 pt-6 border-t border-white/5">
                        <h3 className="text-xs font-black text-red-500/50 uppercase tracking-[0.2em] ml-2">Danger Zone</h3>
                        <button
                            onClick={async () => {
                                if (confirm("ARE YOU SURE? This will delete ALL local workouts AND clear future planned workouts from Intervals.icu.")) {
                                    setSaving(true);
                                    try {
                                        // 1. Clear Intervals.icu
                                        try {
                                            const events = await getFutureEventsAction();
                                            if (Array.isArray(events)) {
                                                const deletePromises = events
                                                    .filter((e: any) => e.category === 'WORKOUT') // Ensure we only delete workouts, not races/notes
                                                    .map((e: any) => deleteWorkoutAction(e.id));
                                                await Promise.all(deletePromises);
                                            }
                                        } catch (err) {
                                            console.error("Failed to clear Intervals.icu data:", err);
                                        }

                                        // 2. Clear Local DB
                                        const { error } = await supabase.from("workouts").delete().eq("user_id", profile.id);
                                        if (error) throw error;

                                        await refreshData();
                                        alert("All data cleared from App & Intervals.icu!");
                                    } catch (e) {
                                        console.error(e);
                                        alert("Failed to clear data.");
                                    }
                                    setSaving(false);
                                }
                            }}
                            disabled={saving}
                            className="w-full bg-red-500/10 border border-red-500/20 p-4 rounded-xl flex items-center justify-between group active:scale-98 transition-all hover:bg-red-500/20"
                        >
                            <span className="font-black text-red-500 text-sm">RESET ALL DATA</span>
                            {saving ? <RefreshCw className="w-4 h-4 text-red-500 animate-spin" /> : <Shield className="w-4 h-4 text-red-500" />}
                        </button>
                    </div>
                </div>
            ) : (
                <div className="text-center py-20 italic text-white/40">Profile not found.</div>
            )}

            <BottomNav />

            {/* Success Overlay */}
            {showSuccessOverlay && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-6"
                >
                    <motion.div
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        className="bg-[#0A0A0A] border border-primary/20 p-8 rounded-2xl w-full max-w-sm flex flex-col items-center text-center shadow-2xl relative overflow-hidden"
                    >
                        <div className="absolute inset-0 bg-primary/5 blur-3xl" />

                        <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-6 relative">
                            <motion.div
                                animate={{ scale: [1, 1.2, 1], opacity: [0.5, 1, 0.5] }}
                                transition={{ repeat: Infinity, duration: 2 }}
                                className="absolute inset-0 bg-primary/20 rounded-full blur-md"
                            />
                            <RefreshCw className="w-8 h-8 text-primary" />
                        </div>

                        <h3 className="text-2xl font-black italic text-white mb-2">PLAN ACTIVATED</h3>
                        <p className="text-white/60 text-sm">Your new training schedule is live.</p>

                        <div className="h-1 w-full bg-white/10 mt-6 rounded-full overflow-hidden">
                            <motion.div
                                initial={{ width: "0%" }}
                                animate={{ width: "100%" }}
                                transition={{ duration: 2 }} // Matches the setTimeout
                                className="h-full bg-primary"
                            />
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </div>
    );
}
