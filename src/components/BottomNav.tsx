"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Calendar, Activity, Settings, Layout, Play } from "lucide-react";

const navItems = [
    { icon: Home, label: "Home", href: "/" },
    { icon: Layout, label: "Plan", href: "/plan" },

    { icon: null, label: "Record", href: "/record" }, // Placeholder for FAB
    { icon: Activity, label: "Activities", href: "/activities" },
    { icon: Settings, label: "Settings", href: "/settings" },
];

export default function BottomNav() {
    const pathname = usePathname();

    return (
        <nav className="fixed bottom-0 left-0 right-0 nav-blur border-t border-white/5 pb-8 pb-safe pt-2 grid grid-cols-5 items-center z-50">
            {navItems.map((item) => {
                const isActive = pathname === item.href;

                // Special rendering for the "Record" FAB
                if (item.label === "Record") {
                    return (
                        <div key={item.href} className="flex justify-center h-full relative">
                            <div className="absolute -top-7">
                                <Link
                                    href={item.href}
                                    className="w-16 h-16 rounded-full bg-primary flex items-center justify-center shadow-[0_0_30px_rgba(0,255,255,0.3)] hover:scale-105 active:scale-95 transition-all border-4 border-[#0A0A0A]"
                                >
                                    <Play className="w-8 h-8 text-black fill-black ml-1.5" />
                                </Link>
                            </div>
                        </div>
                    );
                }

                return (
                    <Link
                        key={item.href}
                        href={item.href}
                        className={`flex flex-col items-center justify-center p-2 transition-colors ${isActive ? "text-primary" : "text-white/40"
                            }`}
                    >
                        {item.icon && <item.icon className={`w-6 h-6 ${isActive ? "drop-shadow-[0_0_8px_#00e5ff]" : ""}`} />}
                        <span className="text-[10px] mt-1 font-bold uppercase tracking-tighter">{item.label}</span>
                    </Link>
                );
            })}
        </nav>
    );
}
