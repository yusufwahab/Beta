import {Router} from 'express';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import {z} from 'zod';
import {AppError} from './db.js';
import {parseContacts,maskEmail} from './services/validation-import.service.js';
import {acceptInvitation,inspectInvitation,invitationAdmin,importContacts,sendInvitation,invitationReport} from './services/validation-invitation.service.js';
import {csv} from './services/validation-report.service.js';
const mode=z.enum(['live','test']);
const token=z.string().regex(/^[A-Za-z0-9_-]{43}$/);
export function publicInvitationRoutes(){const router=Router();router.use('/api/test/invite',rateLimit({windowMs:15*60000,limit:40,standardHeaders:'draft-8',legacyHeaders:false,message:{error:{message:'Too many invitation requests. Please try again later.'}}}),(_req,res,next)=>{res.set({'Cache-Control':'no-store','Referrer-Policy':'no-referrer'});next();});
 router.post('/api/test/invite/inspect',async(req,res)=>{const input=z.object({token}).strict().parse(req.body);res.json({data:await inspectInvitation(input.token)});});
 router.post('/api/test/invite/accept',async(req,res)=>{const input=z.object({token,consent:z.literal(true)}).strict().parse(req.body);res.json({data:await acceptInvitation(input.token,req.headers['user-agent']??'')});});return router;}
// Mounted only after validationRoutes' verified team guard.
export function invitationAdminRoutes(){const router=Router();
 router.use('/invitations',rateLimit({windowMs:60000,limit:40,standardHeaders:'draft-8',legacyHeaders:false}));
 const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:2*1024*1024,files:1,fields:3}}).single('file');
 router.post('/invitations/import',(req,res,next)=>upload(req,res,error=>{if(error)return next(new AppError(400,'Upload one CSV or XLSX spreadsheet, smaller than 2 MB'));next();}),async(req,res)=>{
  const input=z.object({mode,commit:z.enum(['true','false']).default('false')}).strict().parse(req.body);if(!req.file)throw new AppError(400,'Choose a spreadsheet first');const rows=await parseContacts(req.file.buffer,req.file.originalname);
  res.json({data:await invitationAdmin(res.locals.user.id,db=>importContacts(db,rows,input.mode,input.commit==='true',res.locals.user.id))});
 });
 router.post('/invitations/send',async(req,res)=>{const input=z.object({mode,ids:z.array(z.uuid()).min(1).max(5),resend:z.boolean().default(false)}).strict().parse(req.body);const results=[];for(const id of [...new Set(input.ids)]){try{results.push(await sendInvitation(res.locals.user.id,id,input.mode,input.resend));}catch(error){results.push({id,status:'not_sent',message:error instanceof AppError?error.message:'Email configuration or delivery is unavailable'});}}res.json({data:{results}});});
 router.post('/invitations/:id/revoke',async(req,res)=>{const id=z.uuid().parse(req.params.id);await invitationAdmin(res.locals.user.id,async db=>{const result=await db.query('update validation_invitations set revoked_at=clock_timestamp(),token_hash=null where id=$1 returning id',[id]);if(!result.rowCount)throw new AppError(404,'Invitation not found');});res.json({data:{ok:true}});});
 router.get('/invitations',async(req,res)=>{const dataset=mode.parse(req.query.mode);const data=await invitationAdmin(res.locals.user.id,async db=>{const rows=await invitationReport(db,dataset);return {rows,funnel:{imported:rows.length,invited:rows.filter(r=>r.invited_at).length,opened:rows.filter(r=>r.invite_opened_at).length,accepted:rows.filter(r=>r.accepted_at).length,started:rows.filter(r=>r.testing_started_at&&!r.excluded&&!r.revoked_at).length,completed:rows.filter(r=>r.testing_completed_at&&!r.excluded&&!r.revoked_at).length}};});res.json({data});});
 router.get('/invitations/export.csv',async(req,res)=>{const dataset=mode.parse(req.query.mode);const rows=await invitationAdmin(res.locals.user.id,db=>invitationReport(db,dataset));const safe=rows.filter(row=>!row.excluded&&!row.revoked_at).map(row=>({participant_id:row.participant_id,email:maskEmail(row.email),language:row.language??'',invited_at:row.invited_at,invite_opened_at:row.invite_opened_at,accepted_at:row.accepted_at,testing_started_at:row.testing_started_at,testing_completed_at:row.testing_completed_at,voice_attempts:row.voice_attempts,natlas_success:row.natlas_success,natlas_failed:row.natlas_failed,retries:row.retries,result_edited:row.result_edited,edited_fields:row.edited_fields??'',workflows:row.workflows??''}));res.set({'Content-Type':'text/csv; charset=utf-8','Content-Disposition':`attachment; filename="beta-invitation-evidence-${dataset}.csv"`}).send(csv(safe,['participant_id','email','language','invited_at','invite_opened_at','accepted_at','testing_started_at','testing_completed_at','voice_attempts','natlas_success','natlas_failed','retries','result_edited','edited_fields','workflows']));});return router;
}
