import { GeoPoint } from "@/types";

export function generateGPX(path: GeoPoint[], name: string = "AeroRun Activity"): string {
    const creator = "AeroRun";
    const time = path.length > 0 ? new Date(path[0].timestamp).toISOString() : new Date().toISOString();

    const gpxHeader = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="${creator}" xmlns="http://www.topografix.com/GPX/1/1" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">
  <metadata>
    <name>${name}</name>
    <time>${time}</time>
  </metadata>
  <trk>
    <name>${name}</name>
    <trkseg>`;

    const gpxFooter = `
    </trkseg>
  </trk>
</gpx>`;

    const trkpts = path.map(point => {
        const ptTime = new Date(point.timestamp).toISOString();
        let pt = `      <trkpt lat="${point.latitude}" lon="${point.longitude}">`;
        if (point.altitude !== null) pt += `\n        <ele>${point.altitude}</ele>`;
        pt += `\n        <time>${ptTime}</time>\n      </trkpt>`;
        return pt;
    }).join("\n");

    return gpxHeader + "\n" + trkpts + gpxFooter;
}
