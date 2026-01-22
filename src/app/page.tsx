"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import AuthForm from "@/components/AuthForm";
import Onboarding from "@/components/Onboarding";
import BottomNav from "@/components/BottomNav";
import { Profile } from "@/types";
import { motion } from "framer-motion";
import { Calendar as CalendarIcon, Target, TrendingUp, ChevronLeft, ChevronRight, CheckCircle2, Trash2, Trophy } from "lucide-react";
import Link from "next/link";
import { pushWorkoutAction, deleteWorkoutAction } from "@/app/actions/intervals";
import { format, addDays, startOfWeek, endOfWeek, eachDayOfInterval, isSameDay } from "date-fns";
import { useData } from "@/context/DataContext";

export default function Home() {
  const { session, profile, workouts, activities, isLoading, refreshData } = useData();
  const [isPushing, setIsPushing] = useState(false);
  const [pushSuccess, setPushSuccess] = useState(false);

  const calculateWeeklyStats = () => {
    const startOfCurrentWeek = startOfWeek(new Date(), { weekStartsOn: 1 });
    const weeklyActivities = activities.filter(a => new Date(a.start_date) >= startOfCurrentWeek);

    const totalDist = weeklyActivities.reduce((acc, a) => acc + (a.distance / 1000), 0);
    const totalTime = weeklyActivities.reduce((acc, a) => acc + a.moving_time, 0);

    let avgPaceStr = "--:--";
    if (totalDist > 0 && totalTime > 0) {
      const totalTimeMin = totalTime / 60;
      const paceDec = totalTimeMin / totalDist;
      const paceMin = Math.floor(paceDec);
      const paceSec = Math.round((paceDec - paceMin) * 60);
      avgPaceStr = `${paceMin}:${paceSec.toString().padStart(2, '0')}`;
    }

    return { totalDist: totalDist.toFixed(1), avgPace: avgPaceStr };
  };

  const stats = calculateWeeklyStats();

  const handleOnboardingComplete = async (data: any) => {
    if (!session) return;
    try {
      const { error } = await supabase.from("profiles").upsert({
        id: session.user.id,
        email: session.user.email,
        height: parseFloat(data.height),
        weight: parseFloat(data.weight),
        age: parseInt(data.age),
        best_5k_time: data.best5k,
        training_level: data.level,
        onboarded: true,
      });

      if (error) throw error;
      await refreshData();
    } catch (err: any) {
      console.error(err);
      alert("Error saving profile: " + err.message);
    }
  };

  const today = new Date();
  const todayWorkout = workouts.find(w => isSameDay(new Date(w.date), today));

  const handlePushWorkout = async () => {
    if (!todayWorkout) return;
    setIsPushing(true);
    setPushSuccess(false);
    try {
      const resp = await pushWorkoutAction({
        name: `${todayWorkout.type.toUpperCase()}: ${todayWorkout.description}`,
        type: "Run",
        category: "WORKOUT",
        start_date_local: format(new Date(todayWorkout.date), "yyyy-MM-dd'T'08:00:00"),
        moving_time: todayWorkout.duration_mins * 60,
        distance: todayWorkout.distance_km * 1000,
        description: todayWorkout.description,
      });

      if (resp?.id) {
        await supabase
          .from("workouts")
          .update({ intervals_event_id: resp.id })
          .eq("id", todayWorkout.id);

        await refreshData();
        setPushSuccess(true);
        setTimeout(() => setPushSuccess(false), 3000);
      } else {
        alert("Failed to push to Intervals.icu (See console)");
      }
    } catch (err) {
      console.error(err);
      alert("Failed to push workout.");
    } finally {
      setIsPushing(false);
    }
  };

  const handleDeleteWorkout = async () => {
    if (!todayWorkout?.intervals_event_id) return;
    try {
      const success = await deleteWorkoutAction(todayWorkout.intervals_event_id);
      if (success) {
        await supabase
          .from("workouts")
          .update({ intervals_event_id: null })
          .eq("id", todayWorkout.id);

        await refreshData();
        alert("Workout deleted from Intervals.icu!");
      } else {
        alert("Failed to delete from Intervals.icu");
      }
    } catch (err) {
      console.error(err);
      alert("Failed to delete workout.");
    }
  };

  if (isLoading) return (
    <div className="min-h-screen flex items-center justify-center bg-black">
      <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (!session) return <AuthForm />;
  if (!profile) return <Onboarding onComplete={handleOnboardingComplete} />;

  return (
    <div className="p-6 space-y-8 pb-32">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-sm font-medium text-white/40">Welcome back,</h1>
          <h2 className="text-2xl font-bold">{session.user.email?.split("@")[0]}</h2>
        </div>
        <Link href="/calendar" className="bg-white/5 p-2 rounded-xl border border-white/10 hover:bg-white/10 transition-colors">
          <CalendarIcon className="w-5 h-5 text-primary" />
        </Link>
      </div>

      <div className={`glass p-6 space-y-4 relative overflow-hidden transition-all duration-500 ${todayWorkout?.type.toLowerCase() === 'race' ? 'border-primary/50 shadow-[0_0_30px_rgba(0,229,255,0.2)]' : ''}`}>
        <div className="absolute top-0 right-0 p-4 opacity-10">
          {todayWorkout?.type.toLowerCase() === 'race' ? <Trophy className="w-16 h-16 text-primary" /> : <Target className="w-16 h-16 text-primary" />}
        </div>
        <div className="space-y-1">
          <h3 className="text-primary font-bold text-sm tracking-widest uppercase flex items-center gap-2">
            Today's Focus
            {todayWorkout?.type.toLowerCase() === 'race' && (
              <span className="bg-primary text-black text-[10px] font-black px-2 py-0.5 rounded italic animate-pulse">
                GO TIME
              </span>
            )}
          </h3>
          <h4 className="text-2xl font-black flex items-center gap-2">
            {todayWorkout && todayWorkout.type.toLowerCase() !== 'rest' ? (
              <>
                {todayWorkout.type.toLowerCase() === 'race' && <Trophy className="w-6 h-6 text-primary" />}
                {todayWorkout.type.toUpperCase()}
              </>
            ) : "REST DAY"}
          </h4>
        </div>
        {todayWorkout && todayWorkout.type.toLowerCase() !== 'rest' ? (
          <div className="space-y-4">
            <p className="text-white/60 leading-relaxed">{todayWorkout.description}</p>
            <div className="flex justify-between items-end bg-white/5 p-4 rounded-xl border border-white/5">
              <div>
                <p className="text-[10px] text-white/20 uppercase font-black mb-1">Distance</p>
                <p className="text-2xl font-black text-primary">{todayWorkout.distance_km} <span className="text-xs font-normal text-white/20">KM</span></p>
              </div>
              <div className="text-right">
                <p className="text-[10px] text-white/20 uppercase font-black mb-1">Target Pace</p>
                <p className="text-2xl font-black text-primary">{todayWorkout.target_pace}</p>
              </div>
            </div>

            {!todayWorkout.intervals_event_id ? (
              <button
                onClick={handlePushWorkout}
                disabled={isPushing || pushSuccess}
                className={`w-full font-bold py-4 rounded-xl flex items-center justify-center space-x-2 active:scale-95 transition-all shadow-lg ${pushSuccess
                    ? 'bg-green-500 text-white'
                    : 'bg-primary text-black neo-blue-glow'
                  } disabled:opacity-70 disabled:cursor-not-allowed`}
              >
                {isPushing ? (
                  <>
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                      className="w-5 h-5 border-2 border-black border-t-transparent rounded-full"
                    />
                    <span className="uppercase tracking-widest text-sm">Pushing...</span>
                  </>
                ) : pushSuccess ? (
                  <>
                    <CheckCircle2 className="w-5 h-5" />
                    <span className="uppercase tracking-widest text-sm">Workout Pushed!</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-5 h-5" />
                    <span className="uppercase tracking-widest text-sm text-black">Push Workout</span>
                  </>
                )}
              </button>
            ) : (
              <button
                onClick={handleDeleteWorkout}
                className="w-full bg-red-500/10 border border-red-500/20 text-red-500 font-bold py-4 rounded-xl flex items-center justify-center space-x-2 active:scale-95 transition-all"
              >
                <Trash2 className="w-5 h-5" />
                <span className="uppercase tracking-widest text-sm">Delete Workout</span>
              </button>
            )}
          </div>
        ) : (
          <div className="bg-white/5 p-6 rounded-xl border border-dashed border-white/10">
            <p className="text-white/40 italic text-center">
              {todayWorkout?.description || "Enjoy your recovery. Tomorrow we go again."}
            </p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="glass p-4 space-y-2">
          <TrendingUp className="w-5 h-5 text-accent" />
          <p className="text-xs text-white/40 uppercase font-bold">Weekly Dist.</p>
          <p className="text-xl font-black">{stats.totalDist} <span className="text-xs font-normal text-white/40">KM</span></p>
        </div>
        <div className="glass p-4 space-y-2">
          <Target className="w-5 h-5 text-green-400" />
          <p className="text-xs text-white/40 uppercase font-bold">Avg. Pace</p>
          <p className="text-xl font-black">{stats.avgPace} <span className="text-xs font-normal text-white/40">/KM</span></p>
        </div>
      </div>


      <BottomNav />
    </div>
  );
}
