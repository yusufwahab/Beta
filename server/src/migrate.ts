import {createHash} from 'node:crypto';
import {readdir,readFile} from 'node:fs/promises';
import pg from 'pg';

const migrationsDirectory=new URL('../../supabase/migrations/',import.meta.url);

export async function migrate(connectionString:string,directory:URL=migrationsDirectory){
 const files=(await readdir(directory)).filter(name=>/^\d+_[\w-]+\.sql$/.test(name)).sort();
 if(!files.length)throw new Error('No SQL migrations found. Include supabase/migrations in the backend deployment.');
 const migrations=await Promise.all(files.map(async name=>{
  const sql=(await readFile(new URL(name,directory),'utf8')).replace(/\r\n/g,'\n');
  // The runner owns the transaction; retain BEGIN/COMMIT in files for SQL-editor use.
  if(!/^\s*begin\s*;/i.test(sql)||! /commit\s*;\s*$/i.test(sql))throw new Error(`Migration ${name} must have a BEGIN/COMMIT wrapper.`);
  return {name,checksum:createHash('sha256').update(sql).digest('hex'),sql:sql.replace(/^\s*begin\s*;/i,'').replace(/commit\s*;\s*$/i,'')};
 }));
 const client=new pg.Client({connectionString,connectionTimeoutMillis:10000});
 await client.connect();
 try{
  await client.query('begin');
  await client.query("set local lock_timeout='60s'; set local statement_timeout='120s'");
  // Serialize concurrent backend starts on this database, including history creation.
  await client.query("select pg_advisory_xact_lock(hashtextextended('beta:schema-migrations',0))");
  await client.query('create schema if not exists beta_migrations; revoke all on schema beta_migrations from public');
  await client.query('create table if not exists beta_migrations.history(name text primary key,checksum text not null,applied_at timestamptz not null default now())');
  await client.query('revoke all on beta_migrations.history from public');
  const applied=new Map((await client.query<{name:string;checksum:string}>('select name,checksum from beta_migrations.history')).rows.map(row=>[row.name,row.checksum]));
  for(const name of applied.keys())if(!files.includes(name))throw new Error(`Applied migration ${name} is missing from this deployment.`);
  const pending:string[]=[];
  for(const migration of migrations){
   if(applied.has(migration.name)){
    if(applied.get(migration.name)!==migration.checksum)throw new Error(`Applied migration ${migration.name} has changed. Restore it and add a new migration file.`);
    continue;
   }
   if([...applied.keys()].some(name=>name>migration.name))throw new Error(`Migration ${migration.name} is older than an applied migration. Add migrations in increasing filename order.`);
   if(migration.name==='202610120001_beta.sql'){
    const existing=(await client.query("select to_regclass('public.profiles') as profiles,to_regclass('public.businesses') as businesses")).rows[0];
    if(existing.profiles||existing.businesses)throw new Error('Beta tables already exist without automatic migration history. Keep AUTO_MIGRATE=false until the existing schema has been reconciled; no tables were overwritten.');
   }
   await client.query(migration.sql);
   await client.query('insert into beta_migrations.history(name,checksum) values($1,$2)',[migration.name,migration.checksum]);
   pending.push(migration.name);
  }
  await client.query('commit');
  return pending;
 }catch(error){await client.query('rollback');throw error;}
 finally{await client.end();}
}

export async function migrateFromEnvironment(){
 const url=process.env.MIGRATION_DATABASE_URL||process.env.DATABASE_URL;
 if(!url)throw new Error('Set DATABASE_URL or MIGRATION_DATABASE_URL to run migrations.');
 const applied=await migrate(url);
 console.log(applied.length?`Applied migrations: ${applied.join(', ')}`:'Database migrations are up to date');
}
