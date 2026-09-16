import { describe, expect, it, vi } from "vitest";
import { queueSourceSelection } from "../../web/src/features/modules/source-import-selection.ts";

describe("partial source selection",()=>{
  it("retains queued imports and stops before later videos on failure",async()=>{
    const failure=new Error("queue unavailable");
    const enqueue=vi.fn().mockResolvedValueOnce({}).mockRejectedValueOnce(failure);
    expect(await queueSourceSelection([{videoId:"a"},{videoId:"b"},{videoId:"c"}],enqueue)).toEqual({queuedIds:["a"],error:failure});
    expect(enqueue).toHaveBeenCalledTimes(2);
  });
  it("allows retrying only the unfinished selection",async()=>{
    const enqueue=vi.fn().mockResolvedValue({});
    expect(await queueSourceSelection([{videoId:"b"},{videoId:"c"}],enqueue)).toEqual({queuedIds:["b","c"],error:null});
    expect(enqueue.mock.calls.flat().map(video=>video.videoId)).toEqual(["b","c"]);
  });
});
