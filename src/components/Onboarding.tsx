"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, User, Ruler, Weight, Timer, LogOut } from "lucide-react";
import { supabase } from "@/lib/supabase";

export default function Onboarding({ onComplete }: { onComplete: (data: any) => void }) {
    const [step, setStep] = useState(1);
    const [formData, setFormData] = useState({
        height: "",
        weight: "",
        age: "",
        best5k: "",
        level: "beginner"
    });

    const nextStep = () => setStep(step + 1);

    const steps = [
        {
            id: 1,
            title: "How tall are you?",
            icon: <Ruler className="w-8 h-8 text-primary" />,
            field: "height",
            placeholder: "cm",
            type: "number"
        },
        {
            id: 2,
            title: "What's your weight?",
            icon: <Weight className="w-8 h-8 text-primary" />,
            field: "weight",
            placeholder: "kg",
            type: "number"
        },
        {
            id: 3,
            title: "Your age?",
            icon: <User className="w-8 h-8 text-primary" />,
            field: "age",
            placeholder: "Years",
            type: "number"
        },
        {
            id: 4,
            title: "Best 5km Time?",
            icon: <Timer className="w-8 h-8 text-primary" />,
            field: "best5k",
            placeholder: "MM:SS",
            type: "text"
        }
    ];

    const currentStepData = steps[step - 1];

    return (
        <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-transparent">
            <div className="w-full max-w-md">
                <div className="mb-8 flex space-x-2">
                    {[1, 2, 3, 4, 5].map((s) => (
                        <div
                            key={s}
                            className={`h-1 flex-1 rounded-full transition-colors ${s <= step ? "bg-primary shadow-[0_0_8px_#00e5ff]" : "bg-white/10"
                                }`}
                        />
                    ))}
                </div>

                <AnimatePresence mode="wait">
                    {step <= 4 ? (
                        <motion.div
                            key={step}
                            initial={{ x: 20, opacity: 0 }}
                            animate={{ x: 0, opacity: 1 }}
                            exit={{ x: -20, opacity: 0 }}
                            className="glass p-8 space-y-6"
                        >
                            <div className="flex justify-center">{currentStepData.icon}</div>
                            <h1 className="text-2xl font-bold text-center">{currentStepData.title}</h1>
                            <input
                                autoFocus
                                type={currentStepData.type}
                                placeholder={currentStepData.placeholder}
                                className="w-full bg-white/5 border border-white/10 rounded-xl p-4 text-center text-3xl font-mono focus:outline-none focus:border-primary transition-colors"
                                value={(formData as any)[currentStepData.field]}
                                onChange={(e) =>
                                    setFormData({ ...formData, [currentStepData.field]: e.target.value })
                                }
                            />
                            <button
                                onClick={nextStep}
                                className="w-full bg-primary text-black font-bold py-4 rounded-xl flex items-center justify-center space-x-2 neo-blue-glow active:scale-95 transition-transform"
                            >
                                <span>Continue</span>
                                <ArrowRight className="w-5 h-5" />
                            </button>
                        </motion.div>
                    ) : (
                        <motion.div
                            key="final"
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            className="glass p-8 space-y-6 text-center"
                        >
                            <h1 className="text-2xl font-bold">Choose your level</h1>
                            <div className="grid grid-cols-1 gap-4">
                                {["beginner", "intermediate", "elite"].map((lvl) => (
                                    <button
                                        key={lvl}
                                        type="button"
                                        onClick={() => {
                                            console.log("Setting level to:", lvl);
                                            setFormData({ ...formData, level: lvl });
                                        }}
                                        className={`p-4 rounded-xl border transition-all ${formData.level === lvl
                                            ? "border-primary bg-primary/10 text-primary shadow-[0_0_10px_rgba(0,229,255,0.2)]"
                                            : "border-white/10 hover:border-white/20 text-white/40"
                                            } capitalize font-bold`}
                                    >
                                        {lvl}
                                    </button>
                                ))}
                            </div>
                            <button
                                type="button"
                                onClick={() => {
                                    console.log("Finishing onboarding with data:", formData);
                                    onComplete(formData);
                                }}
                                className="w-full bg-primary text-black font-bold py-4 rounded-xl flex items-center justify-center space-x-2 neo-blue-glow active:scale-95 transition-transform mt-4"
                            >
                                <span>Finish Setup</span>
                                <ArrowRight className="w-5 h-5" />
                            </button>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            <button
                onClick={() => supabase.auth.signOut()}
                className="mt-8 flex items-center space-x-2 text-white/20 hover:text-white/60 transition-colors text-xs font-medium uppercase tracking-widest"
            >
                <LogOut className="w-4 h-4" />
                <span>Not you? Log Out</span>
            </button>
        </div>
    );
}
