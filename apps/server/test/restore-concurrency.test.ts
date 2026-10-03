import {describe,expect,it,vi} from "vitest";
import {createApp} from "../src/app.js";
import {BackupService} from "../src/services/backup-service.js";

describe("restore exclusivity",()=>{
  it("blocks reads and writes during restoration and reopens access after a failure",async()=>{
    let start!:()=>void,finish!:()=>void;
    const started=new Promise<void>(resolve=>{start=resolve;});
    const pending=new Promise<void>(resolve=>{finish=resolve;});
    const restore=vi.spyOn(BackupService.prototype,"restore").mockImplementation(async()=>{start();await pending;throw new Error("injected restore failure");});
    const app=await createApp({databasePath:":memory:",serveFrontend:false});
    const operation=app.inject({method:"POST",url:"/api/backups/restore",payload:{filename:"missing.sqlite",confirmed:true}}).then(response=>response);
    try{
      await started;
      expect((await app.inject({method:"GET",url:"/api/health"})).statusCode).toBe(503);
      expect((await app.inject({method:"POST",url:"/api/backups/restore",payload:{filename:"missing.sqlite",confirmed:true}})).statusCode).toBe(503);
      finish();expect((await operation).statusCode).toBe(500);
      expect((await app.inject({method:"GET",url:"/api/health"})).statusCode).toBe(200);
    }finally{finish();await operation;restore.mockRestore();await app.close();}
  });
  it("rejects restore while an earlier mutation is still running and releases the guard",async()=>{
    const app=await createApp({databasePath:":memory:",serveFrontend:false});
    let start!:()=>void,finish!:()=>void;
    const started=new Promise<void>(resolve=>{start=resolve;});
    const pending=new Promise<void>(resolve=>{finish=resolve;});
    app.post("/audit-slow-mutation",async()=>{start();await pending;return {ok:true};});
    const mutation=app.inject({method:"POST",url:"/audit-slow-mutation"}).then(response=>response);
    try{
      await started;
      const blocked=await app.inject({method:"POST",url:"/api/backups/restore",payload:{filename:"missing.sqlite",confirmed:true}});
      expect(blocked.statusCode).toBe(409);expect(blocked.json().error).toBe("restore_busy");
      finish();await mutation;
      const invalid=await app.inject({method:"POST",url:"/api/backups/restore",payload:{filename:"missing.sqlite",confirmed:true}});
      expect(invalid.json().error).not.toBe("restore_busy");
      expect((await app.inject({method:"GET",url:"/api/health"})).statusCode).toBe(200);
    }finally{finish();await mutation;await app.close();}
  });
});
