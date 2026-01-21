"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import BottomNav from "@/components/BottomNav";
import { motion } from "framer-motion";
import { Layout, ChevronDown, ChevronUp, Map, Timer, Zap, Info } from "lucide-react";

import { useData } from "@/context/DataContext";

export default function Plan() {
    const { workouts, isLoading } = useData();
    const [expandedWeek, setExpandedWeek] = useState<number | null>(1);

    if (isLoading) return (
        <div className="min-h-screen flex items-center justify-center bg-black">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
    );

    const weeks = Array.from(new Set(workouts.map(w => w.week_number)));

    const getWeekStats = (weekNum: number) => {
        const weekWorkouts = workouts.filter(w => w.week_number === weekNum);
        const totalDist = weekWorkouts.reduce((acc, w) => acc + (w.distance_km || 0), 0);
        const sessions = weekWorkouts.filter(w => w.type !== "rest").length;
        return { totalDist, sessions };
    };

    return (
        <div className="p-6 space-y-8 pb-32">
            <div className="flex justify-between items-center">
                <h1 className="text-3xl font-black italic">TRAINING PLAN</h1>
                <div className="bg-white/5 p-2 rounded-xl border border-white/10 shadow-lg">
                    <Layout className="w-5 h-5 text-primary" />
                </div>
            </div>

            {workouts.length > 0 ? (
                <div className="space-y-4">
                    {weeks.sort((a, b) => a - b).map((weekNum) => {
                        const isExpanded = expandedWeek === weekNum;
                        const stats = getWeekStats(weekNum);
                        return (
                            <div key={weekNum} className="glass rounded-2xl overflow-hidden border-white/5">
                                <button
                                    onClick={() => setExpandedWeek(isExpanded ? null : weekNum)}
                                    className="w-full p-6 flex items-center justify-between hover:bg-white/5 transition-all"
                                >
                                    <div className="flex items-center space-x-4 text-left">
                                        <div className="bg-primary/10 p-3 rounded-xl font-black text-primary text-[10px] w-12 h-12 flex items-center justify-center">
                                            W{weekNum}
                                        </div>
                                        <div>
                                            <h3 className="font-bold text-lg">Week {weekNum}</h3>
                                            <p className="text-[10px] text-white/40 uppercase font-black tracking-widest">
                                                {stats.sessions} Sessions • {stats.totalDist.toFixed(1)}KM Total
                                            </p>
                                        </div>
                                    </div>
                                    <ChevronDown className={`w-5 h-5 text-white/20 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                                </button>

                                {isExpanded && (
                                    <div className="p-4 pt-0 space-y-3">
                                        {workouts
                                            .filter(w => w.week_number === weekNum)
                                            .map((workout, idx) => (
                                                <div
                                                    key={idx}
                                                    className="bg-white/5 rounded-xl p-4 flex items-center justify-between border border-white/5"
                                                >
                                                    <div className="flex items-center space-x-4">
                                                        <div className={`w-1 h-10 rounded-full ${workout.type === 'rest' ? 'bg-white/10' :
                                                            workout.type === 'long' ? 'bg-accent' :
                                                                workout.type === 'intervals' ? 'bg-primary' : 'bg-green-400'
                                                            }`} />
                                                        <div className="space-y-1">
                                                            <p className="text-[10px] text-white/20 font-black uppercase tracking-widest">{workout.day_of_week}</p>
                                                            <p className="font-bold text-sm capitalize">{workout.type} Run</p>
                                                        </div>
                                                    </div>
                                                    <div className="text-right">
                                                        <p className="font-black text-sm">{workout.distance_km > 0 ? `${workout.distance_km}KM` : 'Rest'}</p>
                                                        <p className="text-[10px] text-white/40 font-bold">{workout.target_pace || '--'}</p>
                                                    </div>
                                                </div>
                                            ))}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            ) : (
                <div className="text-center py-20 glass space-y-4">
                    <Info className="w-12 h-12 text-white/20 mx-auto" />
                    <div className="space-y-1">
                        <p className="text-white/40 font-bold uppercase tracking-widest text-xs">No plan found</p>
                        <p className="text-sm text-white/60">Head to Settings to generate your first plan.</p>
                    </div>
                </div>
            )}

            <BottomNav />
        </div>
    );
}
