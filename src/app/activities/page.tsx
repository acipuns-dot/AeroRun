"use client";

import { useEffect, useState } from "react";
import BottomNav from "@/components/BottomNav";
import { motion } from "framer-motion";
import { Activity, Clock, MapPin, Zap, ChevronRight } from "lucide-react";
import { format } from "date-fns";
import Link from "next/link";

import { useData } from "@/context/DataContext";

export default function Activities() {
    const { activities, isLoading } = useData();

    if (isLoading) return (
        <div className="min-h-screen flex items-center justify-center bg-black">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
    );

    return (
        <div className="p-6 space-y-8 pb-32">
            <div className="flex justify-between items-center">
                <h1 className="text-3xl font-black italic">ACTIVITIES</h1>
                <div className="bg-white/5 p-2 rounded-full border border-white/10">
                    <Activity className="w-5 h-5 text-primary" />
                </div>
            </div>

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
                                className="glass p-4 space-y-3 relative overflow-hidden group active:scale-98 transition-all cursor-pointer hover:border-primary/20"
                            >
                                <div className="flex justify-between items-start">
                                    <div className="space-y-1">
                                        <p className="text-xs text-white/40 font-bold uppercase tracking-wider">
                                            {format(new Date(activity.start_date), "EEEE, MMM d")}
                                        </p>
                                        <h3 className="text-lg font-bold group-hover:text-primary transition-colors">
                                            {activity.name || "Afternoon Run"}
                                        </h3>
                                    </div>
                                    <div className="bg-primary/10 text-primary text-[10px] font-black px-2 py-1 rounded uppercase">
                                        {activity.type}
                                    </div>
                                </div>

                                <div className="grid grid-cols-3 gap-4">
                                    <div className="flex items-center space-x-2">
                                        <MapPin className="w-4 h-4 text-white/20" />
                                        <span className="text-sm font-bold">{(activity.distance / 1000).toFixed(2)}km</span>
                                    </div>
                                    <div className="flex items-center space-x-2">
                                        <Clock className="w-4 h-4 text-white/20" />
                                        <span className="text-sm font-bold">{Math.floor(activity.moving_time / 60)}m</span>
                                    </div>
                                    <div className="flex items-center space-x-2">
                                        <Zap className="w-4 h-4 text-white/20" />
                                        <span className="text-sm font-bold">{activity.average_heartrate || "--"} bpm</span>
                                    </div>
                                </div>

                                <div className="absolute right-4 top-1/2 -translate-y-1/2 opacity-20 group-hover:opacity-100 group-hover:translate-x-1 transition-all">
                                    <ChevronRight className="w-5 h-5 text-primary" />
                                </div>
                            </motion.div>
                        </Link>
                    ))}
                </div>
            ) : (
                <div className="text-center py-20 bg-white/5 rounded-3xl border border-white/5 border-dashed">
                    <p className="text-white/40 font-medium">No activities found in Intervals.icu</p>
                </div>
            )}

            <BottomNav />
        </div>
    );
}
