// Installs only validation tables on manually initialized Beta databases.
// Does not fabricate migration history for the existing business schema.
import {readFile} from 'node:fs/promises';
import {parseArgs} from 'node:util';
import pg from 'pg';
process.loadEnvFile('server/.env');
const {values}=parseArgs({options:{apply:{type:'boolean',default:false},check:{type:'boolean',default:false}}});
const connectionString=process.env.MIGRATION_DATABASE_URL||process.env.DATABASE_URL;
if(!connectionString)throw new Error('Configure the existing backend database connection first');
const db=new pg.Client({connectionString,connectionTimeoutMillis:8000,query_timeout:30000});
async function status(){return (await db.query(`select to_regclass('public.profiles') is not null base_ready,to_regclass('public.validation_sessions') is not null sessions,to_regclass('public.validation_events') is not null events,exists(select 1 from information_schema.columns where table_schema='public' and table_name='validation_sessions' and column_name='mode') integrity,exists(select 1 from pg_policies where schemaname='public' and tablename='validation_sessions' and policyname='validation_session_scope') policies,to_regclass('public.validation_invitations') is not null invitations`)).rows[0];}
try{
 await db.connect();let current=await status();
 if(!values.apply){console.log(JSON.stringify({operation:'read-only validation schema check',...current}));}
 else{
  if(!current.base_ready)throw new Error('Apply the existing Beta business schema before validation setup');
  const history=(await db.query("select to_regclass('beta_migrations.history') is not null present")).rows[0].present;
  if(history&&(await db.query("select 1 from beta_migrations.history where name='202610120001_beta.sql'")).rowCount)throw new Error('This database uses automatic migration history. Use npm run migrate -w server so checksums are recorded.');
  await db.query('begin');await db.query("set local lock_timeout='5s'; set local statement_timeout='30s'");await db.query("select pg_advisory_xact_lock(hashtextextended('beta:validation-install',0))");current=await status();
  if(current.sessions!==current.events)throw new Error('Existing validation schema is incomplete. No changes applied.');
  const files=[];if(!current.sessions)files.push('202610120002_validation.sql');if(!current.integrity)files.push('202610150001_validation_integrity.sql');else if(!current.policies)throw new Error('Validation columns exist without the expected policies. Reconcile the existing schema first.');
  if(!current.invitations)files.push('202610150002_validation_invitations.sql');
  for(const name of files){const sql=(await readFile(new URL('../supabase/migrations/'+name,import.meta.url),'utf8')).replace(/^\s*begin\s*;/i,'').replace(/commit\s*;\s*$/i,'');await db.query(sql);}
  await db.query('commit');console.log(JSON.stringify({operation:'validation schema install',applied:files,status:await status(),note:'No participants or events were seeded. Keep AUTO_MIGRATE=false until the original schema history is reconciled.'}));
 }
}catch(error){await db.query('rollback').catch(()=>{});console.error('Validation schema setup failed.',{code:error.code??'setup_error',...(error.message?.startsWith('This database uses')?{action:'Use npm run migrate -w server'}:{})});process.exitCode=1;}finally{await db.end().catch(()=>{});}
