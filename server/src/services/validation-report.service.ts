import type {PoolClient} from 'pg';
export const sessionColumns='s.id,s.participant_id,s.language,s.started_at,s.completed_at,s.last_seen_at,s.device_type,s.browser,s.core_flow_completed,s.mode,s.excluded,s.exclusion_reason,s.human_verified,s.reviewed_at';
const scope=`with scoped as (select * from validation_sessions where mode=$1 and not excluded),evidence as (select e.* from validation_events e join scoped s on s.id=e.session_id where e.source<>'legacy'),eligible as(select distinct session_id from evidence where source='server' and (event_type='NATLAS_SUCCESS' or event_type='NATLAS_FAILED' and metadata->>'provider_called'='true'))`;
export async function validationSummary(db:PoolClient,mode:string){
 const result=(await db.query(`${scope} select
 (select count(*)::int from scoped) sessions,
 (select count(*)::int from eligible) participants,
 (select count(*)::int from scoped s join eligible e on s.id=e.session_id where human_verified) confirmed_people,
 (select count(*)::int from scoped where core_flow_completed) core_flow_participants,
 (select count(*)::int from evidence) total_events,
 (select count(distinct (session_id,interaction_id))::int from evidence where event_type in ('VOICE_STARTED','NATLAS_PROCESSING_STARTED')) voice_interactions,
 (select count(*)::int from evidence where source='server' and event_type='NATLAS_SUCCESS') natlas_success,
 (select count(*)::int from evidence where source='server' and event_type='NATLAS_FAILED') natlas_failed,
 (select round(avg(processing_time_ms))::int from evidence where source='server' and event_type in ('NATLAS_SUCCESS','NATLAS_FAILED')) avg_processing_ms,
 (select count(distinct (r.session_id,r.interaction_id))::int from evidence r where r.event_type='TRANSCRIPT_RETRY' and exists(select 1 from evidence v where v.session_id=r.session_id and v.interaction_id=r.interaction_id and v.event_type in ('VOICE_STARTED','NATLAS_PROCESSING_STARTED'))) retried_interactions,
 (select count(*)::int from evidence where event_type='VOICE_CANCELLED' and metadata->>'phase'='recording') cancellations,
 (select count(distinct session_id)::int from evidence where (was_edited or event_type='TRANSCRIPT_EDITED') and session_id in(select session_id from eligible)) edited_participants,
 (select count(*)::int from evidence where source='server' and event_type='TRANSACTION_SAVED' and workflow='sale') sales,
 (select count(*)::int from evidence where source='server' and event_type='TRANSACTION_SAVED' and workflow='expense') expenses,
 (select count(*)::int from evidence where source='server' and event_type='TRANSACTION_SAVED' and workflow='stock') stock,
 (select count(*)::int from evidence where source='server' and event_type='TRANSACTION_SAVED' and workflow='debt') debts,
 (select count(*)::int from evidence where source='server' and event_type='FLOW_COMPLETED') completed_workflows,
 (select count(*)::int from evidence f where f.source='server' and f.event_type='FLOW_COMPLETED' and exists(select 1 from evidence a where a.session_id=f.session_id and a.interaction_id=f.interaction_id and a.event_type='NATLAS_SUCCESS' and a.source='server' and a.created_at<=f.created_at)) voice_end_to_end`,[mode])).rows[0];
 const by_language=(await db.query(`${scope} select s.language,count(*)::int participants from scoped s join eligible e on e.session_id=s.id group by s.language order by s.language`,[mode])).rows;
 const attempts=result.natlas_success+result.natlas_failed;
 return {...result,by_language,mode,target:50,success_rate:attempts?result.natlas_success/attempts*100:null,retry_rate:result.voice_interactions?Math.min(100,result.retried_interactions/result.voice_interactions*100):null,edited_percentage:result.participants?result.edited_participants/result.participants*100:null};
}
export function csvCell(value:unknown){let text=value instanceof Date?value.toISOString():String(value??'');if(/^[=+\-@\t\r]/.test(text))text="'"+text;return '"'+text.replaceAll('"','""')+'"';}
export function csv(rows:Record<string,unknown>[],columns:string[]){return '\uFEFF'+[columns.map(csvCell).join(','),...rows.map(row=>columns.map(column=>csvCell(row[column])).join(','))].join('\r\n');}
