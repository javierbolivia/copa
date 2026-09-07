import {useLayoutEffect,useMemo} from 'react';

/** A request may publish only in its original mounted scope and sequence. */
export function useRequestGuard(scope:string) {
  const guard=useMemo(()=>{
    let active=false,epoch=0,sequence=0;
    const capture=()=>{const start=epoch;return ()=>active&&epoch===start;};
    return {
      mount(){active=true;epoch++;},
      dispose(){active=false;epoch++;sequence++;},
      capture,
      begin(){const current=capture(),id=++sequence;return ()=>current()&&sequence===id;},
      invalidate(){sequence++;},
    };
  },[scope]);
  useLayoutEffect(()=>{guard.mount();return ()=>guard.dispose();},[guard]);
  return guard;
}
