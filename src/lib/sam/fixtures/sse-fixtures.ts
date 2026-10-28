// SSE fixtures in the shape the SAM 3.1 Responses stream uses. Mask payloads (marker included) are real one_bit
// encodings made once with the parser package's internal encoder and checked to round-trip through decodeMaskToRaster.

/** 10x10, top five rows set: 50 pixels. */
export const TOP_HALF_10 = "data=10,10,!!!!!*y:@2@r4Zkg";
/** 4 rows x 6 columns, all set: 24 pixels. */
export const FULL_4x6 = "data=4,6,!!!!!'y:/tAxx";
/** 8x8 diagonal: 8 pixels. */
export const DIAGONAL_8 = "data=8,8,!!!!!(O1TG:){7";
/** 3x3, nothing set. */
export const EMPTY_3 = "data=3,3,!!!!!&!!!!!";

/** Frame 0 of the README example: a 320x334 clip, prompt "button", two objects, lossless masks. */
export const README_LINE =
  "<0f>0<|box;x1=211;y1=228;x2=270;y2=254;w=320;h=334|>" +
  "<|mask;x=0;y=0;data=27,60,~!!!!M!0c[0o91w?q1!pIH4pPRVp2B3'7`e.ioeAf6-k/#Xd8%dX9x(|>" +
  ",1<|box;x1=155;y1=228;x2=202;y2=254;w=320;h=334|>" +
  "<|mask;x=0;y=0;data=27,48,~!!!!J!0c[q=Pj_zs=*4C4(/./x#:/`S_GnD`=o3?X{emCgO$y@|>\n";

export function record(id: number, box: [number, number, number, number], mask: string, frame = { w: 100, h: 50 }, c?: number): string {
  const conf = c === undefined ? "" : `;c=${c}`;
  const maskConf = c === undefined ? "" : `c=${c};`;
  return `${id}<|box;x1=${box[0]};y1=${box[1]};x2=${box[2]};y2=${box[3]};w=${frame.w};h=${frame.h}${conf}|><|mask;x=0;y=0;${maskConf}${mask}|>`;
}

export function line(frame: number, ...records: string[]): string {
  return `<${frame}f>${records.join(",")}\n`;
}

const lane = { item_id: "msg_1", output_index: 0, content_index: 0 };

/** A full SSE body as the live API streams it: one delta per line, finalized by content_part.done only. */
export function sseBody(lines: string[], framesProcessed = 50): string {
  const text = lines.join("");
  const events: object[] = [
    { type: "response.created", response: { id: "resp_1", status: "in_progress" } },
    { type: "response.output_item.added", output_index: 0, item: { type: "message", id: "msg_1" } },
    ...lines.map((delta) => ({ type: "response.output_text.delta", ...lane, delta })),
    { type: "response.content_part.done", ...lane, part: { type: "output_text", text } },
    { type: "response.completed", response: { id: "resp_1", status: "completed", usage: { video_frames_processed: framesProcessed } } },
  ];
  return events.map((e) => `event: ${(e as { type: string }).type}\ndata: ${JSON.stringify(e)}\n\n`).join("");
}

/** Zero matches as the docs describe it: the stream completes with no output_text events at all. */
export const ZERO_MATCHES_BARE =
  `event: response.created\ndata: ${JSON.stringify({ type: "response.created", response: { id: "resp_0" } })}\n\n` +
  `event: response.completed\ndata: ${JSON.stringify({ type: "response.completed", response: { id: "resp_0", usage: { video_frames_processed: 50 } } })}\n\n` +
  "data: [DONE]\n\n";
