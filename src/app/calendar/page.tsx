"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import BottomNav from "@/components/BottomNav";
import { motion, AnimatePresence } from "framer-motion";
import {
    format,
    addMonths,
    subMonths,
    startOfMonth,
    endOfMonth,
    startOfWeek,
    endOfWeek,
    eachDayOfInterval,
    isSameMonth,
    isSameDay,
    isToday,
    parseISO
} from "date-fns";
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Info, Trophy, Target } from "lucide-react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

import { useData } from "@/context/DataContext";

export default function CalendarPage() {
    const { workouts, isLoading } = useData();
    const [currentMonth, setCurrentMonth] = useState(new Date());
    const [selectedDate, setSelectedDate] = useState<Date | null>(new Date());

    if (isLoading) return (
        <div className="min-h-screen flex items-center justify-center bg-black">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
    );

    const nextMonth = () => setCurrentMonth(addMonths(currentMonth, 1));
    const prevMonth = () => setCurrentMonth(subMonths(currentMonth, 1));

    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(monthStart);
    const startDate = startOfWeek(monthStart, { weekStartsOn: 1 });
    const endDate = endOfWeek(monthEnd, { weekStartsOn: 1 });

    const calendarDays = eachDayOfInterval({
        start: startDate,
        end: endDate,
    });

    const selectedWorkout = workouts.find(w =>
        selectedDate && isSameDay(parseISO(w.date), selectedDate)
    );

    return (
        <div className="p-6 space-y-8 pb-32">
            {/* Header */}
            <div className="flex justify-between items-center text-secondary">
                <h1 className="text-3xl font-black italic">CALENDAR</h1>
                <div className="bg-white/5 p-2 rounded-xl border border-white/10">
                    <CalendarIcon className="w-5 h-5 text-primary" />
                </div>
            </div>

            {/* Monthly Controls */}
            <div className="flex items-center justify-between glass p-2">
                <button onClick={prevMonth} className="p-2 hover:text-primary transition-colors">
                    <ChevronLeft className="w-6 h-6" />
                </button>
                <h2 className="text-xl font-bold uppercase tracking-widest italic">
                    {format(currentMonth, "MMMM yyyy")}
                </h2>
                <button onClick={nextMonth} className="p-2 hover:text-primary transition-colors">
                    <ChevronRight className="w-6 h-6" />
                </button>
            </div>

            {/* Calendar Grid */}
            <div className="glass overflow-hidden">
                <div className="grid grid-cols-7 border-b border-white/5">
                    {["M", "T", "W", "T", "F", "S", "S"].map((day) => (
                        <div key={day} className="py-3 text-center text-[10px] font-black text-white/20">
                            {day}
                        </div>
                    ))}
                </div>
                <div className="grid grid-cols-7">
                    {calendarDays.map((day, idx) => {
                        const workout = workouts.find(w => isSameDay(parseISO(w.date), day));
                        const isCurrentMonth = isSameMonth(day, monthStart);
                        const isSelected = selectedDate && isSameDay(day, selectedDate);

                        return (
                            <button
                                key={day.toString()}
                                onClick={() => setSelectedDate(day)}
                                className={cn(
                                    "h-14 flex flex-col items-center justify-center relative border-b border-r border-white/5 transition-all group",
                                    !isCurrentMonth && "opacity-20",
                                    isSelected && "bg-primary/10"
                                )}
                            >
                                <span className={cn(
                                    "text-sm font-bold",
                                    isToday(day) && "text-primary",
                                    isSelected && "text-primary scale-110"
                                )}>
                                    {format(day, "d")}
                                </span>

                                {workout && (
                                    <div className={cn(
                                        "w-1 h-1 rounded-full mt-1 shadow-[0_0_8px_currentColor]",
                                        workout.type === "rest" ? "bg-white/20" :
                                            workout.type === "race" ? "bg-accent scale-150" : "bg-primary"
                                    )} />
                                )}

                                {isSelected && (
                                    <motion.div
                                        layoutId="outline"
                                        className="absolute inset-0 border-2 border-primary/30 pointer-events-none"
                                    />
                                )}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Selected Day Details */}
            <AnimatePresence mode="wait">
                {selectedDate && (
                    <motion.div
                        key={selectedDate.toString()}
                        initial={{ y: 20, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        className="glass p-6 space-y-4 relative overflow-hidden"
                    >
                        <div className="flex justify-between items-start">
                            <div>
                                <p className="text-xs text-white/40 uppercase font-black tracking-widest mb-1">
                                    {format(selectedDate, "EEEE, MMMM do")}
                                </p>
                                <h3 className="text-2xl font-black italic uppercase flex items-center gap-2">
                                    {selectedWorkout ? (
                                        <>
                                            {selectedWorkout.type === 'race' && <Trophy className="w-5 h-5 text-primary" />}
                                            {selectedWorkout.type}
                                        </>
                                    ) : "No Workout"}
                                    {selectedWorkout?.type === 'race' && (
                                        <span className="bg-primary text-black text-[10px] font-black px-2 py-0.5 rounded italic animate-pulse">
                                            GO TIME
                                        </span>
                                    )}
                                </h3>
                            </div>
                            {selectedWorkout && (
                                <div className="bg-primary/20 px-3 py-1 rounded-full border border-primary/30">
                                    <span className="text-[10px] font-black text-primary italic uppercase tracking-tighter">Week {selectedWorkout.week_number}</span>
                                </div>
                            )}
                        </div>

                        {selectedWorkout ? (
                            <div className="space-y-4">
                                <p className="text-white/60 leading-relaxed">{selectedWorkout.description}</p>
                                {selectedWorkout.type.toLowerCase() !== 'rest' && (
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="bg-white/5 p-4 rounded-xl">
                                            <p className="text-[10px] text-white/20 uppercase font-black mb-1">Target Pace</p>
                                            <p className="font-bold text-primary">{selectedWorkout.target_pace}</p>
                                        </div>
                                        <div className="bg-white/5 p-4 rounded-xl">
                                            <p className="text-[10px] text-white/20 uppercase font-black mb-1">Distance</p>
                                            <p className="font-bold text-primary">{selectedWorkout.distance_km} KM</p>
                                        </div>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <p className="text-white/20 italic text-sm">No scheduled run for this date. Go explore!</p>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>

            <BottomNav />
        </div>
    );
}
