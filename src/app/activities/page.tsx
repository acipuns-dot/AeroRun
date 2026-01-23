"use client";

import { useEffect, useState } from "react";
import BottomNav from "@/components/BottomNav";
import { motion } from "framer-motion";
import { Activity, Clock, MapPin, Zap, ChevronRight } from "lucide-react";
import { format } from "date-fns";
import Link from "next/link";

import { useData } from "@/context/DataContext";

export default function Activities() {
    const { activities, activitiesError, isLoading, refreshData } = useData();
    const [isSyncing, setIsSyncing] = useState(false);

    const handleSync = async () => {
        setIsSyncing(true);
        await refreshData();
        setIsSyncing(false);
    };

    if (isLoading) return (
        <div className="min-h-screen flex items-center justify-center">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
    );

    return (
        <div className="p-6 space-y-8 pb-32">
            <div className="flex justify-between items-center">
                <h1 className="text-3xl font-black italic">ACTIVITIES</h1>
                <div className="flex items-center space-x-2">
                    <button
                        onClick={handleSync}
                        disabled={isSyncing}
                        className={`bg-white/5 p-2 rounded-full border border-white/10 hover:bg-white/10 transition-all ${isSyncing ? "animate-spin" : ""}`}
                    >
                        <Activity className={`w-5 h-5 ${isSyncing ? "text-primary/50" : "text-primary"}`} />
                    </button>
                </div>
            </div>

            {activitiesError && (
                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="mx-2 p-4 bg-red-400/10 border border-red-400/20 rounded-2xl flex items-start gap-4"
                >
                    <Activity className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                        <p className="text-xs font-black text-red-400 uppercase tracking-widest">Sync Failed</p>
                        <p className="text-sm text-white/60 leading-relaxed">{activitiesError}</p>
                        <Link
                            href="/settings"
                            className="inline-block text-[10px] font-black text-primary uppercase tracking-[0.2em] mt-2 underline"
                        >
                            Verify Settings
                        </Link>
                    </div>
                </motion.div>
            )}

            {activities.length > 0 ? (
                <div className="space-y-6">
                    {activities.map((activity, idx) => (
                        <Link
                            key={activity.id}
                            href={`/activities/${activity.id}`}
                            className="block"
                        >
                            <motion.div
                                initial={{ x: -20, opacity: 0 }}
                                animate={{ x: 0, opacity: 1 }}
                                transition={{ delay: idx * 0.05 }}
                                className="bg-[#111] border border-white/5 rounded-[28px] p-6 space-y-5 relative overflow-hidden group active:scale-98 transition-all cursor-pointer hover:border-primary/20"
                            >
                                <div className="flex justify-between items-start">
                                    <div className="space-y-0.5">
                                        <p className="text-[10px] text-white/30 font-bold uppercase tracking-[0.1em]">
                                            {format(new Date(activity.start_date), "EEEE, MMM d")}
                                        </p>
                                        <h3 className="text-xl font-black italic tracking-tight group-hover:text-primary transition-colors">
                                            {activity.name || "Afternoon Run"}
                                        </h3>
                                    </div>
                                    <div className="bg-white/5 border border-white/10 text-white/60 text-[9px] font-black px-2 py-0.5 rounded uppercase tracking-wider">
                                        {activity.type}
                                    </div>
                                </div>

                                <div className="grid grid-cols-3 gap-2 pt-2">
                                    <div className="flex flex-col space-y-1">
                                        <div className="flex items-center space-x-1.5">
                                            <MapPin className="w-3.5 h-3.5 text-primary" />
                                            <span className="text-base font-black italic">{(activity.distance / 1000).toFixed(2)}</span>
                                        </div>
                                        <span className="text-[8px] text-white/20 uppercase font-bold tracking-widest leading-none">Km</span>
                                    </div>
                                    <div className="flex flex-col space-y-1 border-x border-white/5 px-4">
                                        <div className="flex items-center space-x-1.5">
                                            <Clock className="w-3.5 h-3.5 text-white/40" />
                                            <span className="text-base font-black italic">{Math.floor(activity.moving_time / 60)}</span>
                                        </div>
                                        <span className="text-[8px] text-white/20 uppercase font-bold tracking-widest leading-none">Min</span>
                                    </div>
                                    <div className="flex flex-col space-y-1 pl-2">
                                        <div className="flex items-center space-x-1.5">
                                            <Zap className="w-3.5 h-3.5 text-orange-500" />
                                            <span className="text-base font-black italic">{activity.average_heartrate || "--"}</span>
                                        </div>
                                        <span className="text-[8px] text-white/20 uppercase font-bold tracking-widest leading-none">Bpm</span>
                                    </div>
                                </div>

                                <div className="absolute right-4 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all">
                                    <ChevronRight className="w-5 h-5 text-primary" />
                                </div>
                            </motion.div>
                        </Link>
                    ))}
                </div>
            ) : !activitiesError ? (
                <div className="text-center py-20 bg-white/5 rounded-3xl border border-white/5 border-dashed mx-2">
                    <p className="text-white/40 font-medium">No activities found in Intervals.icu</p>
                </div>
            ) : null}

            <BottomNav />
        </div>
    );
}
