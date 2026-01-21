"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getActivityDetailsAction } from "@/app/actions/intervals";
import BottomNav from "@/components/BottomNav";
import { motion } from "framer-motion";
import { ArrowLeft, MapPin, Clock, Zap, TrendingUp, Heart, Activity as ActivityIcon, Mountain } from "lucide-react";
import { format } from "date-fns";
import { useData } from "@/context/DataContext";

export default function ActivityDetail() {
    const params = useParams();
    const router = useRouter();
    const { activities, isLoading: isContextLoading } = useData();
    const [activity, setActivity] = useState<any>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const loadActivity = async () => {
            if (!params.id) return;

            // 1. Try to find in context first
            const localActivity = activities?.find((a: any) => a.id === params.id);
            if (localActivity) {
                console.log('[ActivityDetail] Found activity in context');
                setActivity(localActivity);
                setIsLoading(false);
                return;
            }

            // 2. Fallback to API if not in context or context is loading
            if (!isContextLoading) {
                console.log('[ActivityDetail] Not found in context, fetching from API...');
                setIsLoading(true);
                const data = await getActivityDetailsAction(params.id as string);
                setActivity(data);
                setIsLoading(false);
            }
        };

        loadActivity();
    }, [params.id, activities, isContextLoading]);

    if (isLoading) return (
        <div className="min-h-screen flex items-center justify-center bg-black">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
    );

    if (!activity) return (
        <div className="min-h-screen flex items-center justify-center bg-black">
            <div className="text-center">
                <p className="text-white/40">Activity not found</p>
                <button onClick={() => router.back()} className="mt-4 text-primary">Go Back</button>
            </div>
        </div>
    );

    const distanceKm = (activity.distance / 1000).toFixed(2);
    const durationMin = Math.floor(activity.moving_time / 60);
    const durationSec = activity.moving_time % 60;
    const avgPaceMinPerKm = activity.distance > 0 ? (activity.moving_time / 60) / (activity.distance / 1000) : 0;
    const paceMin = Math.floor(avgPaceMinPerKm);
    const paceSec = Math.round((avgPaceMinPerKm - paceMin) * 60);

    return (
        <div className="min-h-screen pb-32">
            {/* Header */}
            <div className="p-6 flex items-center space-x-4">
                <button
                    onClick={() => router.back()}
                    className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                >
                    <ArrowLeft className="w-5 h-5" />
                </button>
                <div className="flex-1">
                    <h1 className="text-xl font-bold">{activity.name || "Run"}</h1>
                    <p className="text-xs text-white/40">
                        {activity.start_date ? format(new Date(activity.start_date), "EEEE, MMMM d, yyyy 'at' h:mm a") : "Date unavailable"}
                    </p>
                </div>
                <div className="bg-primary/10 text-primary text-xs font-black px-3 py-1 rounded-full uppercase">
                    {activity.type}
                </div>
            </div>

            <div className="px-6 space-y-6">
                {/* Key Stats */}
                <div className="grid grid-cols-2 gap-4">
                    <div className="glass p-4 space-y-2">
                        <MapPin className="w-5 h-5 text-primary" />
                        <p className="text-xs text-white/40 uppercase font-bold">Distance</p>
                        <p className="text-2xl font-black">{distanceKm} <span className="text-sm font-normal text-white/40">KM</span></p>
                    </div>
                    <div className="glass p-4 space-y-2">
                        <Clock className="w-5 h-5 text-accent" />
                        <p className="text-xs text-white/40 uppercase font-bold">Duration</p>
                        <p className="text-2xl font-black">{durationMin}:{durationSec.toString().padStart(2, '0')}</p>
                    </div>
                    <div className="glass p-4 space-y-2">
                        <Zap className="w-5 h-5 text-green-400" />
                        <p className="text-xs text-white/40 uppercase font-bold">Avg Pace</p>
                        <p className="text-2xl font-black">{paceMin}:{paceSec.toString().padStart(2, '0')} <span className="text-sm font-normal text-white/40">/km</span></p>
                    </div>
                    <div className="glass p-4 space-y-2">
                        <Heart className="w-5 h-5 text-red-400" />
                        <p className="text-xs text-white/40 uppercase font-bold">Avg HR</p>
                        <p className="text-2xl font-black">{activity.average_heartrate || "--"} <span className="text-sm font-normal text-white/40">bpm</span></p>
                    </div>
                </div>

                {/* Additional Metrics */}
                {(activity.total_elevation_gain || activity.average_cadence || activity.calories) && (
                    <div className="glass p-6 space-y-4">
                        <h2 className="text-sm font-bold uppercase tracking-widest text-white/60">Additional Metrics</h2>
                        <div className="grid grid-cols-2 gap-4">
                            {activity.total_elevation_gain > 0 && (
                                <div className="flex items-center space-x-3">
                                    <Mountain className="w-4 h-4 text-white/40" />
                                    <div>
                                        <p className="text-xs text-white/40">Elevation Gain</p>
                                        <p className="font-bold">{Math.round(activity.total_elevation_gain)}m</p>
                                    </div>
                                </div>
                            )}
                            {activity.average_cadence && (
                                <div className="flex items-center space-x-3">
                                    <TrendingUp className="w-4 h-4 text-white/40" />
                                    <div>
                                        <p className="text-xs text-white/40">Avg Cadence</p>
                                        <p className="font-bold">{Math.round(activity.average_cadence)} spm</p>
                                    </div>
                                </div>
                            )}
                            {activity.calories && (
                                <div className="flex items-center space-x-3">
                                    <Zap className="w-4 h-4 text-white/40" />
                                    <div>
                                        <p className="text-xs text-white/40">Calories</p>
                                        <p className="font-bold">{Math.round(activity.calories)} kcal</p>
                                    </div>
                                </div>
                            )}
                            {activity.max_heartrate && (
                                <div className="flex items-center space-x-3">
                                    <Heart className="w-4 h-4 text-white/40" />
                                    <div>
                                        <p className="text-xs text-white/40">Max HR</p>
                                        <p className="font-bold">{activity.max_heartrate} bpm</p>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Description */}
                {activity.description && (
                    <div className="glass p-6 space-y-2">
                        <h2 className="text-sm font-bold uppercase tracking-widest text-white/60">Description</h2>
                        <p className="text-white/80">{activity.description}</p>
                    </div>
                )}
            </div>

            <BottomNav />
        </div>
    );
}
