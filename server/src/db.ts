import pg from 'pg';
export const pool=new pg.Pool({connectionString:process.env.DATABASE_URL??process.env.BETA_TEST_DATABASE_URL,max:10,connectionTimeoutMillis:8000,idleTimeoutMillis:30000});
export class AppError extends Error { constructor(public status:number,message:string){super(message);} }
export async function transaction<T>(user:string,fn:(db:pg.PoolClient)=>Promise<T>):Promise<T>{
 if(!process.env.DATABASE_URL) throw new AppError(503,'Database is not configured. Set DATABASE_URL and apply the migration.');
 const db=await pool.connect();
 try{await db.query('begin');await db.query('set local role beta_api');await db.query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true)",[user,JSON.stringify({sub:user,role:'authenticated'})]);const result=await fn(db);await db.query('commit');return result;}catch(e){await db.query('rollback');throw e;}finally{db.release();}
}
export async function authorize(db:pg.PoolClient,business:string){const r=await db.query('select id from businesses where id=$1',[business]);if(!r.rowCount)throw new AppError(403,'Business access denied');}
export async function audit(db:pg.PoolClient,business:string,user:string,action:string,id:string){await db.query('insert into activity_events(business_id,created_by,action,entity_id) values($1,$2,$3,$4)',[business,user,action,id]);}
