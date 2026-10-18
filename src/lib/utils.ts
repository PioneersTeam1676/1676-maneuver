
export const SCOUTING_DATA_HEADER = [
  "id","matchNumber","alliance","scoutName","selectTeam",
  "startPoses0","startPoses1","startPoses2","startPoses3","startPoses4","startPoses5",
  "autoCoralPlaceL1Count","autoCoralPlaceL2Count","autoCoralPlaceL3Count","autoCoralPlaceL4Count","autoCoralPlaceDropMissCount",
  "autoCoralPickPreloadCount","autoCoralPickStationCount","autoCoralPickMark1Count","autoCoralPickMark2Count","autoCoralPickMark3Count",
  "autoAlgaePlaceNetShot","autoAlgaePlaceProcessor","autoAlgaePlaceDropMiss","autoAlgaePlaceRemove",
  "autoAlgaePickReefCount","autoAlgaePickMark1Count","autoAlgaePickMark2Count","autoAlgaePickMark3Count",
  "autoPassedStartLine",
  "teleopCoralPlaceL1Count","teleopCoralPlaceL2Count","teleopCoralPlaceL3Count","teleopCoralPlaceL4Count","teleopCoralPlaceDropMissCount",
  "teleopCoralPickStationCount","teleopCoralPickCarpetCount",
  "teleopAlgaePlaceNetShot","teleopAlgaePlaceProcessor","teleopAlgaePlaceDropMiss","teleopAlgaePlaceRemove",
  "teleopAlgaePickReefCount","teleopAlgaePickCarpetCount",
  "shallowClimbAttempted","deepClimbAttempted","parkAttempted","climbFailed","playedDefense","brokeDown","comment"
];
import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function convertArrayOfArraysToCSV(data: (string | number)[][]): string {
  return data
    .map((row) =>
      row
        .map((item) =>
          typeof item === "string"
            ? `"${item.replace(/"/g, '""')}"`
            : item
        )
        .join(",")
    )
    .join("\n");
}

export const convertTeamRole = (value: string | null) => {
      switch (value) {
        case "lead":
          return "Lead";
        case "red-1":
          return "Red 1";
        case "red-2":
          return "Red 2";
        case "red-3":
          return "Red 3";
        case "blue-1":
          return "Blue 1";
        case "blue-2":
          return "Blue 2";
        case "blue-3":
          return "Blue 3";
      }
      return "Role";
    };

// Unique id that also works outside secure contexts (plain-http LAN hosts),
// where crypto.randomUUID is undefined.
export const generateEntryId = (): string => {
  const c = typeof globalThis !== "undefined" ? globalThis.crypto : undefined
  if (c && typeof c.randomUUID === "function") {
    return c.randomUUID()
  }
  const bytes = new Uint8Array(16)
  if (c && typeof c.getRandomValues === "function") {
    c.getRandomValues(bytes)
  } else {
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256)
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
