import {describe,expect,it,vi} from 'vitest';
import {YouTubeAdapter} from '../src/integrations/youtube-adapter.js';

function deferred<T>(){let resolve!:(value:T)=>void;const promise=new Promise<T>(done=>{resolve=done;});return {promise,resolve};}
function video(id:string,title='Original'){return {id,snippet:{title,channelId:'channel',channelTitle:'Channel',publishedAt:'2026-01-01',tags:['evidence']}};}
const json=(items:unknown[])=>new Response(JSON.stringify({items}));

describe('YouTube metadata single-flight without retained cache',()=>{
  it('20 overlapping imports make one request; the next lookup fetches fresh metadata',async()=>{
    const gate=deferred<void>();let title='Original';
    const fetch=vi.fn(async()=>{await gate.promise;return json([video('a',title)]);});
    const adapter=new YouTubeAdapter({apiKey:'test',fetch});
    const waiting=Array.from({length:20},()=>adapter.getVideo('a'));
    const requestsWhilePending=fetch.mock.calls.length;
    gate.resolve();
    const results=await Promise.all(waiting);
    expect(requestsWhilePending).toBe(1);
    expect(results.every(item=>item?.title==='Original')).toBe(true);
    title='Updated';expect((await adapter.getVideo('a'))?.title).toBe('Updated');
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('equivalent ID sets share a request without sharing mutable output objects',async()=>{
    const gate=deferred<void>(),fetch=vi.fn(async()=>{await gate.promise;return json([video('a'),video('b')]);});
    const adapter=new YouTubeAdapter({apiKey:'test',fetch});
    const a=adapter.getVideos(['a','b','a']),b=adapter.getVideos(['b','a']);
    const count=fetch.mock.calls.length;gate.resolve();
    const [first,second]=await Promise.all([a,b]);
    expect(count).toBe(1);
    expect(first).toEqual(second);
    (first[0]!.tags as string[]).push('changed');
    expect(second[0]!.tags).toEqual(['evidence']);
  });

  it('channel metadata coalesces but different resources, IDs and adapter credentials stay isolated',async()=>{
    const gate=deferred<Response>(),fetch=vi.fn(async()=>{await gate.promise;return json([]);});
    const a=new YouTubeAdapter({apiKey:'first',fetch}),b=new YouTubeAdapter({apiKey:'second',fetch});
    const waiting=[a.getChannels(['x']),a.getChannels(['x']),a.getVideos(['x']),a.getVideos(['y']),b.getChannels(['x'])];
    const count=fetch.mock.calls.length;gate.resolve(json([]));await Promise.all(waiting);
    expect(count).toBe(4);
  });

  it.each(['http','json','network'] as const)('does not retain a %s failure or poison retries',async kind=>{
    const gate=deferred<void>();let failing=true;
    const fetch=vi.fn(async()=>{await gate.promise;if(!failing)return json([video('a')]);if(kind==='network')throw new Error('offline');return kind==='http'?new Response('{}',{status:503}):new Response('not json');});
    const adapter=new YouTubeAdapter({apiKey:'test',fetch});
    const waiting=Promise.allSettled([adapter.getVideo('a'),adapter.getVideo('a')]);
    gate.resolve();const outcomes=await waiting;
    expect(outcomes.every(item=>item.status==='rejected')).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);
    failing=false;expect((await adapter.getVideo('a'))?.videoId).toBe('a');
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('does not share search or comment pagination requests',async()=>{
    const fetch=vi.fn(async()=>json([])),adapter=new YouTubeAdapter({apiKey:'test',fetch});
    await Promise.all([adapter.searchVideos('focus'),adapter.searchVideos('focus'),adapter.listCommentThreads({videoId:'a'}),adapter.listCommentThreads({videoId:'a'})]);
    expect(fetch).toHaveBeenCalledTimes(4);
  });

  it('releases a timed-out lookup so another call can succeed',async()=>{
    const fetch=vi.fn<typeof globalThis.fetch>().mockImplementationOnce(async(_url,options)=>new Promise((_resolve,reject)=>{
      options!.signal!.addEventListener('abort',()=>reject(new DOMException('Timed out','AbortError')),{once:true});
    })).mockImplementation(async()=>json([video('a')]));
    const adapter=new YouTubeAdapter({apiKey:'test',fetch,timeoutMs:5});
    const outcomes=await Promise.allSettled([adapter.getVideo('a'),adapter.getVideo('a')]);
    expect(outcomes.every(item=>item.status==='rejected')).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect((await adapter.getVideo('a'))?.videoId).toBe('a');
  });

  it('bounds tracking without dropping distinct requests or enlarging a metadata batch',async()=>{
    const gate=deferred<void>(),fetch=vi.fn(async()=>{await gate.promise;return json([]);});
    const adapter=new YouTubeAdapter({apiKey:'test',fetch});
    const calls=Array.from({length:101},(_,i)=>adapter.getVideo(String(i)));
    calls.push(adapter.getVideo('0'),adapter.getVideo('100'));
    const count=fetch.mock.calls.length;gate.resolve();await Promise.all(calls);
    expect(count).toBe(102); // Existing tracked request joins; overflow still executes.
    const batchFetch=vi.fn<typeof globalThis.fetch>(async()=>json([]));
    await new YouTubeAdapter({apiKey:'test',fetch:batchFetch}).getVideos(Array.from({length:60},(_,i)=>String(i)));
    expect(new URL(String(batchFetch.mock.calls[0]![0])).searchParams.get('id')!.split(',')).toHaveLength(50);
  });
});
