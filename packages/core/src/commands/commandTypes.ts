export interface CommandError {
  code:
    | "INVALID_BPM"
    | "INVALID_STEP_INDEX"
    | "INVALID_VELOCITY"
    | "CHANNEL_NOT_FOUND"
    | "CELL_NOT_FOUND"
    | "BAR_NOT_FOUND"
    | "INVALID_SPLIT"
    | "INVALID_MERGE"
    | "INVALID_PROJECT"
    | "UNKNOWN_COMMAND";
  message: string;
}

export type Command =
  | { type: "transport/setBpm"; bpm: number }
  | { type: "transport/play" }
  | { type: "transport/stop" }
  | { type: "drum/toggleStep"; channelId: string; stepIndex: number }
  | { type: "drum/setVelocity"; channelId: string; stepIndex: number; velocity: number }
  | { type: "drum/muteChannel"; channelId: string; muted: boolean }
  | { type: "drum/soloChannel"; channelId: string; solo: boolean }
  | { type: "lyrics/updateCellText"; cellId: string; text: string }
  | { type: "lyrics/splitCell"; cellId: string; parts: number }
  | { type: "lyrics/mergeCells"; cellIds: string[] }
  | { type: "lyrics/selectCells"; cellIds: string[] }
  | { type: "project/addBar" }
  | { type: "project/removeBar"; barId: string };

export const commandError = (code: CommandError["code"], message: string): CommandError => ({
  code,
  message
});
