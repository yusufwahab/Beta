import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,copyFile,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import pg from 'pg';
import {migrate} from './migrate.js';

test('automatic migrations: concurrent startup, restart, rollback and checksum protection',{
 skip:!process.env.BETA_MIGRATION_TEST_DATABASE_URL,
},async()=>{
 const url=process.env.BETA_MIGRATION_TEST_DATABASE_URL!;
 const client=new pg.Client({connectionString:url});
 await client.connect();
 const directory=await mkdtemp(join(tmpdir(),'beta-migrations-'));
 const location=pathToFileURL(directory+'/');
 const name='202610120001_beta.sql';
 try{
  // This test requires an empty, explicitly disposable local database.
  await client.query("create schema auth; create table auth.users(id uuid primary key); do $$ begin if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if; end $$; create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;");
  await copyFile(new URL('../../supabase/migrations/'+name,import.meta.url),join(directory,name));
  const starts=await Promise.all([migrate(url,location),migrate(url,location)]);
  assert.deepEqual(starts.map(result=>result.length).sort(),[0,1]);
  assert.equal((await client.query('select count(*)::int count from beta_migrations.history')).rows[0].count,1);
  assert.ok((await client.query("select to_regclass('public.sales') as sales")).rows[0].sales);
  assert.deepEqual(await migrate(url,location),[]);
  const future=join(directory,'202610120002_probe.sql');
  await writeFile(future,'begin; create table public.migration_probe(id integer); select * from beta_missing_table; commit;');
  await assert.rejects(migrate(url,location),/does not exist/);
  assert.equal((await client.query("select to_regclass('public.migration_probe') as probe")).rows[0].probe,null);
  assert.equal((await client.query('select count(*)::int count from beta_migrations.history')).rows[0].count,1);
  await writeFile(future,'begin; create table public.migration_probe(id integer); commit;');
  assert.deepEqual(await migrate(url,location),['202610120002_probe.sql']);
  const initial=await readFile(join(directory,name),'utf8');
  await writeFile(join(directory,name),initial.replace('begin;','begin;\n-- changed after application'));
  await assert.rejects(migrate(url,location),/has changed/);
  await client.query('begin; set local role beta_api');
  await assert.rejects(client.query('select * from beta_migrations.history'),/permission denied/);
  await client.query('rollback');
 }finally{
  await client.end();
  assert.equal(dirname(resolve(directory)),resolve(tmpdir()));
  await rm(directory,{recursive:true,force:true});
 }
});
