/** Stop at the first failure; retain queued IDs so the UI never offers them twice. */
export async function queueSourceSelection<T extends {videoId:string}>(
  videos:readonly T[],
  enqueue:(video:T)=>Promise<unknown>,
):Promise<{queuedIds:string[];error:unknown}> {
  const queuedIds:string[]=[];
  for(const video of videos){
    try{await enqueue(video);queuedIds.push(video.videoId);}
    catch(error){return {queuedIds,error};}
  }
  return {queuedIds,error:null};
}
