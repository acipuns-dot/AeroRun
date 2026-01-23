"use client";

import { useEffect, useRef } from "react";
import { MapContainer, TileLayer, Polyline, Marker, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Fix for default marker icon in Next.js
// @ts-ignore
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png",
    iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
    shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
});

interface LiveMapProps {
    path: [number, number][];
    currentLocation: [number, number] | null;
}

function MapUpdater({ center }: { center: [number, number] | null }) {
    const map = useMap();

    useEffect(() => {
        if (center) {
            map.setView(center, map.getZoom());
        }
    }, [center, map]);

    return null;
}

export default function LiveMap({ path, currentLocation }: LiveMapProps) {
    // Default to a neutral location if no GPS yet (e.g. 0,0 or User's last known)
    // For now, we'll let Leaflet handle the initial render and jump when data arrives.
    const initialCenter: [number, number] = currentLocation || [0, 0];

    if (!currentLocation && path.length === 0) {
        return (
            <div className="h-full w-full bg-[#0A0A0A]" />
        );
    }

    return (
        <div className="h-full w-full relative z-0">
            <MapContainer
                center={initialCenter}
                zoom={16}
                scrollWheelZoom={false}
                zoomControl={false}
                attributionControl={false}
                className="h-full w-full"
            >
                <TileLayer
                    url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                />

                {/* The path run so far */}
                <Polyline
                    positions={path}
                    pathOptions={{ color: "#00e5ff", weight: 5, opacity: 0.8 }}
                />

                {/* Current Position Marker */}
                {currentLocation && (
                    <Marker position={currentLocation} icon={
                        new L.DivIcon({
                            className: "bg-transparent",
                            html: `<div class="w-4 h-4 bg-primary rounded-full border-2 border-white shadow-[0_0_10px_#00e5ff] pulse-ring"></div>`
                        })
                    } />
                )}

                <MapUpdater center={currentLocation} />
            </MapContainer>

            {/* Overlay Gradient for seamless integration */}
            <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-[#0A0A0A] to-transparent z-[400] pointer-events-none" />
        </div>
    );
}
